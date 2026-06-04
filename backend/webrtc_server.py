#!/usr/bin/env python3
"""HTI.560 Course Assistant - Pipecat Flows + WebRTC.

Stripped-down version for local development.
"""

import os
from typing import Any, Dict, Mapping, Optional
import chromadb
from chromadb.utils import embedding_functions
import re
from pipecat.utils.text.base_text_filter import BaseTextFilter
from pipecat.utils.text.base_text_aggregator import BaseTextAggregator
import json

from dotenv import load_dotenv
from conversation_config import CONVERSATION_CONFIG
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

# Pipecat imports
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import (
    Frame,
    FunctionCallResultFrame,
    LLMFullResponseEndFrame,
    TranscriptionFrame,
    LLMFullResponseStartFrame, 
    TextFrame
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.processors.filters.stt_mute_filter import (
    STTMuteConfig,
    STTMuteFilter,
    STTMuteStrategy,
)
from pipecat.processors.frameworks.rtvi import (
    RTVIProcessor,
    RTVIConfig,
    RTVIObserver,
    RTVIServerMessageFrame,
)
from pipecat.runner.types import SmallWebRTCRunnerArguments
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.azure.llm import AzureLLMService
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport
from pipecat.utils.text.markdown_text_filter import MarkdownTextFilter

# Pipecat Flows
from pipecat_flows import (
    FlowArgs,
    FlowManager,
    FlowsFunctionSchema,
    NodeConfig,
)

# Load environment variables from .env next to this script (not cwd)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"), override=True)

# embedding function for chroma
emb_fn = embedding_functions.OpenAIEmbeddingFunction(
    api_key=os.getenv("OPENAI_API_KEY"),
    model_name="text-embedding-3-small"
)

WORD_TO_NUM = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "twenty": 20
}

# Keywords that signal a recipe-type query regardless of current_topics state.
# Used by NutritionRAGProcessor to pick the right database BEFORE topic routing
# has updated current_topics (which happens later, inside process_topic_interest).
RECIPE_INTENT_KEYWORDS = (
    "recipe", "recipes", "meal plan", "meal ideas",
    "cook", "cooking", "dish", "dishes",
    "breakfast", "lunch", "dinner", "snack",
    "shopping list", "ingredients for",
)

def extract_requested_count(text: str, default: int = 10) -> int:
    text_lower = text.lower()

    if re.search(r'\bhow (much|many)\b|\bnutrients? (of|in)\b|\bwhat.*contain', text_lower):
        return 3

    if re.search(r'\brecipe\b|\bmeal\b|\bdinner\b|\blunch\b|\bbreakfast\b', text_lower):
        return 15

    match = re.search(r'\b(\d+)\b', text_lower)
    if match:
        n = int(match.group(1))
        if 1 <= n <= 50:
            return n

    for word, num in WORD_TO_NUM.items():
        if re.search(rf'\b{word}\b', text_lower):
            return num

    return default

class StructuredDataProcessor(FrameProcessor):
    """
    Intercepts LLM text output, extracts any ---JSON--- block,
    forwards it to the frontend via RTVI, and strips it from the TTS stream.
    """

    def __init__(self):
        super().__init__()
        self._buffer = ""
        self._capturing = False

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, LLMFullResponseStartFrame):
            self._buffer = ""
            self._capturing = True
            await self.push_frame(frame, direction)
            return

        if isinstance(frame, LLMFullResponseEndFrame):
            self._capturing = False
            logger.info(f"StructuredData RAW BUFFER: {repr(self._buffer)}")

            # Parse out the JSON block if present
            if "---JSON---" in self._buffer:
                spoken_part, _, json_part = self._buffer.partition("---JSON---")
                json_str = json_part.strip()
                try:
                    data = json.loads(json_str)
                    await self.push_frame(
                        RTVIServerMessageFrame(data={
                            "type": "structured_data",
                            "payload": data
                        }),
                        direction
                    )
                    logger.info(f"StructuredData: emitted {data.get('type')}")
                except json.JSONDecodeError as e:
                    logger.warning(f"StructuredData: JSON parse failed: {e}")
            self._buffer = ""
            await self.push_frame(frame, direction)
            return

        # Accumulate text; also suppress TextFrames that are pure JSON noise
        if isinstance(frame, TextFrame) and self._capturing:
            self._buffer += frame.text
            # If we've hit the separator, stop forwarding downstream (TTS)
            if "---JSON---" in self._buffer:
                return   # drop this frame — TTS won't see it
            # Otherwise pass the clean spoken text through
            await self.push_frame(frame, direction)
            return

        await self.push_frame(frame, direction)

class BotStreamingTextProcessor(FrameProcessor):
    def __init__(self):
        super().__init__()
        self._buffer = ""

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, LLMFullResponseStartFrame):
            self._buffer = ""
            await self.push_frame(frame, direction)
            return

        if isinstance(frame, TextFrame):
            if frame.text:
                self._buffer += frame.text
                await self.push_frame(
                    RTVIServerMessageFrame(
                        data={
                            "type": "bot_streaming_text",
                            "text": self._buffer,
                        }
                    ),
                    direction,
                )
            await self.push_frame(frame, direction)
            return

        if isinstance(frame, LLMFullResponseEndFrame):
            await self.push_frame(
                RTVIServerMessageFrame(
                    data={
                        "type": "bot_streaming_text_final",
                        "text": self._buffer,
                    }
                ),
                direction,
            )
            await self.push_frame(frame, direction)
            return

        await self.push_frame(frame, direction)

class DecimalSafeAggregator(BaseTextAggregator):
    
    def __init__(self):
        self._text = ""
    
    @property
    def text(self) -> str:
        return self._text
    
    async def aggregate(self, text: str) -> Optional[str]:
        self._text += text
        # Only split on sentence-ending punctuation NOT between two digits
        if re.search(r'(?<!\d)[.!?](?!\d)', self._text):
            result = self._text
            self._text = ""
            return result
        return None
    
    async def handle_interruption(self):
        self._text = ""
    
    async def reset(self):
        self._text = ""

# Store active peer connections
pcs_map: Dict[str, Any] = {}

class NutritionRAGProcessor(FrameProcessor):
    def __init__(self, context: LLMContext):
        super().__init__()
        self._context = context
        self.last_retrieval_type = "nutrition"
        self.last_retrieved_context = "No nutrition data retrieved yet."

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame):
            user_text = frame.text
            text_lower = user_text.lower()

            # Detect recipe intent from the user's actual words rather than
            # current_topics, because current_topics is updated AFTER this
            # frame is processed (inside process_topic_interest). On the first
            # query for a new topic, current_topics still reflects the previous
            # topic, so checking it here would route to the wrong database.
            #
            # Two-part check:
            #   1. keyword match on the current utterance  (catches first query)
            #   2. already in Recipe Generation topic      (catches follow-up questions)
            is_recipe_request = (
                any(kw in text_lower for kw in RECIPE_INTENT_KEYWORDS)
                or course_data.get("current_topics") == ["Recipe Generation"]
            )

            if is_recipe_request:
                self.last_retrieval_type = "recipe"
                retrieved_context = query_recipe_data(
                    query_text=user_text,
                    n_results=15,
                )
                logger.info(f"RAG: recipe query, retrieved {len(retrieved_context)} chars")
            else:
                self.last_retrieval_type = "nutrition"
                n = extract_requested_count(user_text)
                retrieved_context = query_nutrition_data(
                    query_text=user_text,
                    n_results=n,
                )
                logger.info(f"RAG: nutrition query (n={n}), retrieved {len(retrieved_context)} chars")

            self.last_retrieved_context = retrieved_context

        await self.push_frame(frame, direction)

# ============= STT/TTS Service Factories =============

def create_llm_service():
    """Create LLM service based on LLM_PROVIDER env var. Default: openai."""
    provider = os.getenv("LLM_PROVIDER", "openai").lower()

    if provider == "azure":
        return AzureLLMService(
            api_key=os.getenv("AZURE_OPENAI_API_KEY"),
            endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
            model=os.getenv("AZURE_OPENAI_MODEL", "gpt-4o-mini"),
            api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-10-01-preview"),
        )

    elif provider == "openai":
        return OpenAILLMService(
            api_key=os.getenv("OPENAI_API_KEY"),
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        )

    else:
        raise ValueError(f"Unsupported LLM provider: {provider}. Supported: openai, azure")


def create_stt_service():
    """Create STT service based on STT_PROVIDER env var."""
    provider = os.getenv("STT_PROVIDER", "deepgram").lower()

    if provider == "azure":
        from pipecat.services.azure.stt import AzureSTTService
        return AzureSTTService(
            api_key=os.getenv("AZURE_SPEECH_API_KEY"),
            region=os.getenv("AZURE_SPEECH_REGION"),
        )

    elif provider == "deepgram":
        from pipecat.services.deepgram.stt import DeepgramSTTService
        return DeepgramSTTService(
            api_key=os.getenv("DEEPGRAM_API_KEY"),
        )

    elif provider == "openai":
        from pipecat.services.openai.stt import OpenAISTTService
        return OpenAISTTService(
            api_key=os.getenv("OPENAI_API_KEY"),
        )

    else:
        raise ValueError(f"Unsupported STT provider: {provider}. Supported: azure, deepgram, openai")


def create_tts_service():
    """Create TTS service based on TTS_PROVIDER env var."""
    provider = os.getenv("TTS_PROVIDER", "deepgram").lower()
    markdown_filter = MarkdownTextFilter()

    if provider == "azure":
        from pipecat.services.azure.tts import AzureTTSService
        return AzureTTSService(
            api_key=os.getenv("AZURE_SPEECH_API_KEY"),
            region=os.getenv("AZURE_SPEECH_REGION"),
            voice=os.getenv("AZURE_TTS_VOICE", "en-US-GuyNeural"),
            text_filters=[MarkdownTextFilter()],
            sample_rate=16000,
        )

    elif provider == "deepgram":
        from pipecat.services.deepgram.tts import DeepgramTTSService
        return DeepgramTTSService(
            api_key=os.getenv("DEEPGRAM_API_KEY"),
            voice=os.getenv("DEEPGRAM_TTS_VOICE", "aura-asteria-en"),
            text_filters=[markdown_filter],
        )

    elif provider == "openai":
        from pipecat.services.openai.tts import OpenAITTSService
        return OpenAITTSService(
            api_key=os.getenv("OPENAI_API_KEY"),
            voice=os.getenv("OPENAI_TTS_VOICE", "alloy"),
            text_filters=[markdown_filter],
            text_aggregator=DecimalSafeAggregator(),
        )

    elif provider == "elevenlabs":
        from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
        return ElevenLabsTTSService(
            api_key=os.getenv("ELEVENLABS_API_KEY"),
            voice_id=os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM"),
            text_filters=[markdown_filter],
        )

    else:
        raise ValueError(f"Unsupported TTS provider: {provider}. Supported: azure, deepgram, openai, elevenlabs")

# ============= Conversation Configuration =============
user_profile = {
    "allergies": [],
    "diet": None,
    "goal": None,
    "dislikes": [],
    "medical_conditions": [],
    "calorie_target": None,

    "profile_complete": False,
    "current_question": 0
}

# Conversation state storage (topic list comes from conversation_config.py)
course_data = {
    "all_topics": CONVERSATION_CONFIG["topics"],
    "discussed_topics": [],
    "responses": {},
    "current_topics": [],
    "current_node": "initial",
    "rag_processor": None,
    "user_profile": user_profile
}

# ============= Profile Helper =============

def build_profile_context_string() -> str:
    """Build a human-readable profile summary to inject into LLM system prompts.
    
    Returns an empty string if no profile data has been collected yet,
    so nodes are not polluted with empty/useless context.
    """
    profile = course_data["user_profile"]

    parts = []

    if profile.get("allergies"):
        allergies = profile["allergies"]
        if isinstance(allergies, list):
            parts.append(f"- Allergies: {', '.join(allergies)}")
        else:
            parts.append(f"- Allergies: {allergies}")

    if profile.get("diet"):
        parts.append(f"- Diet: {profile['diet']}")

    if profile.get("goal"):
        parts.append(f"- Nutrition goal: {profile['goal']}")

    if profile.get("dislikes"):
        dislikes = profile["dislikes"]
        if isinstance(dislikes, list):
            parts.append(f"- Dislikes / foods to avoid: {', '.join(dislikes)}")
        else:
            parts.append(f"- Dislikes / foods to avoid: {dislikes}")

    if profile.get("medical_conditions"):
        conditions = profile["medical_conditions"]
        if isinstance(conditions, list) and conditions:
            parts.append(f"- Medical conditions: {', '.join(conditions)}")
        elif isinstance(conditions, str) and conditions:
            parts.append(f"- Medical conditions: {conditions}")

    if profile.get("calorie_target"):
        parts.append(f"- Daily calorie target: {profile['calorie_target']} kcal")

    if not parts:
        return ""

    header = "### USER PROFILE (use this to personalise every recommendation, if the user asks for a different preference in the main question, ignore the preference from their profile):\n"
    return header + "\n".join(parts) + "\n"


# ============= Custom Frame Processors =============


class ConversationStateProcessor(FrameProcessor):
    """Sends conversation state updates to the frontend via RTVI messages."""

    def __init__(self, course_data: dict):
        super().__init__()
        self.course_data = course_data
        self.last_sent_state: Dict[str, Any] = {}

    async def send_state_update(self):
        """Send course state update via RTVIServerMessageFrame."""
        remaining = [
            t
            for t in self.course_data["all_topics"]
            if t not in self.course_data["discussed_topics"]
        ]

        current_state = {
            "type": "conversation_state_update",
            "all_topics": self.course_data["all_topics"],
            "discussed_topics": self.course_data["discussed_topics"],
            "remaining_topics": remaining,
            "current_topics": self.course_data.get("current_topics", []),
            "responses": self.course_data["responses"],
            "current_node": self.course_data.get("current_node", "initial"),
            "progress": f"{len(self.course_data['discussed_topics'])}/{len(self.course_data['all_topics'])}",
            "profile_complete": self.course_data["user_profile"].get("profile_complete", False),
        }

        state_changed = current_state != self.last_sent_state or current_state.get(
            "current_node"
        ) != self.last_sent_state.get("current_node")

        if state_changed:
            await self.push_frame(RTVIServerMessageFrame(data=current_state))
            self.last_sent_state = current_state.copy()

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, (LLMFullResponseEndFrame, FunctionCallResultFrame)):
            await self.send_state_update()

        await self.push_frame(frame, direction)


# ============= Flow Node Definitions =============


def create_go_back_function() -> FlowsFunctionSchema:
    """Create a function to go back to topic selection."""

    async def handle_go_back(
        args: FlowArgs, flow_manager: FlowManager
    ) -> tuple[str | None, NodeConfig]:
        course_data["current_node"] = "initial"

        if hasattr(flow_manager, "_task") and flow_manager._task:
            frame = RTVIServerMessageFrame(
                data={
                    "type": "conversation_state_update",
                    "all_topics": course_data["all_topics"],
                    "discussed_topics": course_data["discussed_topics"],
                    "responses": course_data["responses"],
                    "remaining_topics": [
                        t
                        for t in course_data["all_topics"]
                        if t not in course_data["discussed_topics"]
                    ],
                    "current_topics": [],
                    "current_node": "initial",
                    "progress": f"{len(course_data['discussed_topics'])}/{len(course_data['all_topics'])}",
                    "profile_complete": course_data["user_profile"].get("profile_complete", False),
                }
            )
            await flow_manager._task.queue_frame(frame)

        return None, create_initial_node()

    return FlowsFunctionSchema(
        name="go_back_to_topics",
        description="""Use when user wants to go back to topic selection or ask about a different topic.

        Triggers: "go back", "different topic", "other topics", "start over", "back to menu" """,
        handler=handle_go_back,
        properties={},
        required=[],
    )


def create_exit_function() -> FlowsFunctionSchema:
    """Create a function that allows users to exit the conversation at any point."""

    async def handle_exit_conversation(
        args: FlowArgs, flow_manager: FlowManager
    ) -> tuple[str | None, NodeConfig]:
        count_discussed = len(course_data.get("discussed_topics", []))
        logger.info(
            f"User exiting conversation after discussing {count_discussed} course topics"
        )

        return None, {
            "name": "exit_conversation",
            "task_messages": [
                {
                    "role": "system",
                    "content": CONVERSATION_CONFIG["functions"]["exit_prompt"],
                }
            ],
            "post_actions": [{"type": "end_conversation"}],
        }

    return FlowsFunctionSchema(
        name="exit_conversation",
        description="""Use ONLY when user EXPLICITLY wants to quit/exit/end the conversation.

        IMPORTANT: "skip that topic" = skip current topic, NOT exit!

        ONLY exit for CLEAR exit signals:
        - "I want to quit/exit/stop"
        - "Goodbye" / "I'm done"
        - "That's all I need"

        When uncertain, ASK: "Do you want to end the conversation, or just move to another topic?" """,
        handler=handle_exit_conversation,
        properties={},
        required=[],
    )


def create_dynamic_topic_function() -> FlowsFunctionSchema:
    """Generate function with dynamic enum based on remaining topics."""
    remaining = course_data["all_topics"]

    if not remaining:
        return None

    description_generator = CONVERSATION_CONFIG["functions"]["topic_function_description"]
    description = description_generator(remaining)

    return FlowsFunctionSchema(
        name="record_topic_interest",
        description=description,
        required=["topics"],
        handler=process_topic_interest,
        properties={
            "topics": {
                "type": "array",
                "items": {"type": "string", "enum": remaining},
                "description": f"Topic discussed. Pick ONE at a time. Available: {', '.join(remaining)}",
            }
        },
    )


def create_save_profile_answer_function() -> FlowsFunctionSchema:
    """Create a function for the profile node to save a single answer and advance."""

    async def handle_save_profile_answer(
        args: FlowArgs, flow_manager: FlowManager
    ) -> tuple[str | None, NodeConfig]:
        field = args.get("field")
        value = args.get("value")
        profile = course_data["user_profile"]
        profile_config = CONVERSATION_CONFIG["profile_node"]

        # --- Persist the answer ---
        if field and value is not None:
            if field in ("allergies", "dislikes", "medical_conditions"):
                if isinstance(value, list):
                    profile[field] = value
                elif isinstance(value, str) and value.lower() not in ("none", "no", "n/a", ""):
                    profile[field] = [v.strip() for v in value.split(",") if v.strip()]
                else:
                    profile[field] = []
            else:
                profile[field] = value if str(value).lower() not in ("none", "no", "n/a", "") else None

            logger.info(f"Profile: saved {field} = {profile[field]}")

        # --- Advance the question pointer ---
        questions = profile_config["questions"]
        current_q = profile.get("current_question", 0)
        next_q = current_q + 1
        profile["current_question"] = next_q

        # --- Check if all questions are answered ---
        if next_q >= len(questions):
            profile["profile_complete"] = True
            logger.info(f"Profile complete: {profile}")

            if hasattr(flow_manager, "_task") and flow_manager._task:
                frame = RTVIServerMessageFrame(
                    data={
                        "type": "profile_complete",
                        "profile": {k: v for k, v in profile.items() if k not in ("current_question",)},
                    }
                )
                await flow_manager._task.queue_frame(frame)

            course_data["current_node"] = "questions"
            rag = course_data.get("rag_processor")
            return None, create_questions_node(rag, post_profile=True)

        # --- Stay in profile node, ask next question ---
        next_question_text = questions[next_q]["question"]
        next_field = questions[next_q]["field"]
        course_data["current_node"] = "profile"

        return None, create_profile_node(
            question_override=next_question_text,
            current_field=next_field,
        )

    return FlowsFunctionSchema(
        name="save_profile_answer",
        description="""Call this IMMEDIATELY after the user answers the current profile question.
        
        - field: the profile field being answered (matches current question)
        - value: the user's answer as a string. Use "none" if the user has no preference / no allergy / etc.
        
        Do NOT wait for confirmation. Save the answer and move on.""",
        required=["field", "value"],
        handler=handle_save_profile_answer,
        properties={
            "field": {
                "type": "string",
                "description": "Profile field name, e.g. 'allergies', 'diet', 'goal', 'dislikes'",
            },
            "value": {
                "type": "string",
                "description": "The user's answer. Use 'none' when there is nothing to record.",
            },
        },
    )


def create_initial_node() -> NodeConfig:
    """Create the initial node - welcome, then go to Q&A."""
    config = CONVERSATION_CONFIG["initial_node"]

    return {
        "name": "initial",
        "role_messages": [
            {
                "role": "system",
                "content": config["role_prompt"],
            }
        ],
        "task_messages": [
            {
                "role": "system",
                "content": config["task_prompt"],
            }
        ],
        "functions": [create_dynamic_topic_function()],
        "respond_immediately": True,
    }


async def process_topic_interest(
    args: FlowArgs, flow_manager: FlowManager
) -> tuple[str | None, NodeConfig]:
    """Mark topic as discussed and route to the correct node."""
    topic = args["topics"][0]

    course_data["responses"][topic] = {"interested": True}
    if topic not in course_data["discussed_topics"]:
        course_data["discussed_topics"].append(topic)

    course_data["current_topics"] = [topic]

    remaining = [
        m for m in course_data["all_topics"] if m not in course_data["discussed_topics"]
    ]

    # --- Route: Personal Profile vs normal Q&A ---
    if topic == "Personal Profile":
        course_data["current_node"] = "profile"
        course_data["user_profile"]["current_question"] = 0

        if hasattr(flow_manager, "_task") and flow_manager._task:
            frame = RTVIServerMessageFrame(
                data={
                    "type": "conversation_state_update",
                    "all_topics": course_data["all_topics"],
                    "discussed_topics": course_data["discussed_topics"],
                    "responses": course_data["responses"],
                    "remaining_topics": remaining,
                    "current_topics": [topic],
                    "current_node": "profile",
                    "progress": f"{len(course_data['discussed_topics'])}/{len(course_data['all_topics'])}",
                    "profile_complete": course_data["user_profile"].get("profile_complete", False),
                }
            )
            await flow_manager._task.queue_frame(frame)
            logger.info("Profile: starting profile builder flow")

        profile_config = CONVERSATION_CONFIG["profile_node"]
        first_question = profile_config["questions"][0]["question"]
        first_field = profile_config["questions"][0]["field"]
        return None, create_profile_node(
            question_override=first_question,
            current_field=first_field,
        )

    # --- Normal Q&A route ---
    course_data["current_node"] = "questions"

    if hasattr(flow_manager, "_task") and flow_manager._task:
        frame = RTVIServerMessageFrame(
            data={
                "type": "conversation_state_update",
                "all_topics": course_data["all_topics"],
                "discussed_topics": course_data["discussed_topics"],
                "responses": course_data["responses"],
                "remaining_topics": remaining,
                "current_topics": [topic],
                "current_node": "questions",
                "progress": f"{len(course_data['discussed_topics'])}/{len(course_data['all_topics'])}",
                "profile_complete": course_data["user_profile"].get("profile_complete", False),
            }
        )
        await flow_manager._task.queue_frame(frame)
        logger.info(f"Course: Marked {topic} as discussed, going to Q&A")

    rag = course_data.get("rag_processor")
    return None, create_questions_node(rag)


def create_profile_node(
    question_override: str = None,
    current_field: str = None,
) -> NodeConfig:
    """Create the profile-builder node."""
    profile_config = CONVERSATION_CONFIG["profile_node"]

    if question_override:
        task_content = (
            f"Ask the user exactly this question and wait for their answer:\n"
            f'"{question_override}"\n\n'
            f"The answer should be saved to the field: '{current_field}'.\n"
            f"Once they answer, immediately call save_profile_answer with "
            f"field='{current_field}' and the user's answer as value."
        )
    else:
        task_content = profile_config["task_prompt"]

    return {
        "name": "profile",
        "role_messages": [
            {
                "role": "system",
                "content": profile_config["role_prompt"],
            }
        ],
        "task_messages": [
            {
                "role": "system",
                "content": task_content,
            }
        ],
        "functions": [
            create_save_profile_answer_function(),
            create_go_back_function(),
            create_dynamic_topic_function(),
            create_exit_function(),
        ],
        "respond_immediately": True,
    }


def create_questions_node(
    rag_processor: NutritionRAGProcessor = None,
    post_profile: bool = False,
) -> NodeConfig:
    """Q&A node where users can ask detailed questions."""
    config = CONVERSATION_CONFIG["questions_node"]

    retrieval_type = "nutrition"
    retrieved = ""

    if rag_processor:
        retrieval_type = rag_processor.last_retrieval_type
        retrieved = rag_processor.last_retrieved_context

    # Inject user profile context
    profile_context = build_profile_context_string()
    profile_section = f"\n\n{profile_context}" if profile_context else ""

    if retrieval_type == "recipe":
        knowledge_base = config["recipe_details"]
        retrieved_section = f"\n\n### RETRIEVED RECIPES:\n{retrieved}"
    else:
        knowledge_base = config["course_details"]
        retrieved_section = f"\n\n### RETRIEVED FOOD DATA:\n{retrieved}"

    full_prompt = (
        f"{config['role_prompt']}"
        f"{profile_section}"
        f"\n\nKNOWLEDGE BASE:\n\n"
        f"{knowledge_base}"
        f"{retrieved_section}"
    )

    if post_profile:
        profile_config = CONVERSATION_CONFIG["profile_node"]
        task_content = profile_config["complete_prompt"]
    else:
        task_content = config["task_prompt"]

    return {
        "name": "questions",
        "role_messages": [
            {
                "role": "system",
                "content": full_prompt,
            }
        ],
        "task_messages": [
            {
                "role": "system",
                "content": task_content,
            }
        ],
        "functions": [
            create_go_back_function(),
            create_exit_function(),
            create_dynamic_topic_function(),
        ],
        "respond_immediately": True,
    }


# ============= Bot Pipeline =============


async def run_bot(runner_args: SmallWebRTCRunnerArguments):
    """Set up and run the Pipecat pipeline with WebRTC transport."""
    webrtc_connection = runner_args.webrtc_connection

    transport = SmallWebRTCTransport(
        webrtc_connection=webrtc_connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_analyzer=SileroVADAnalyzer(),
        ),
    )

    stt = create_stt_service()
    tts = create_tts_service()
    llm = create_llm_service()

    context = LLMContext()
    context_aggregator = LLMContextAggregatorPair(context)

    stt_mute_filter = STTMuteFilter(
        config=STTMuteConfig(
            strategies={STTMuteStrategy.ALWAYS, STTMuteStrategy.FUNCTION_CALL}
        )
    )

    rag_processor = NutritionRAGProcessor(context)
    course_data["rag_processor"] = rag_processor

    rtvi = RTVIProcessor(config=RTVIConfig(config=[]), transport=transport)
    course_state_processor = ConversationStateProcessor(course_data)
    structured_data_processor = StructuredDataProcessor()
    bot_streaming_processor = BotStreamingTextProcessor()

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            stt_mute_filter,
            rag_processor,
            context_aggregator.user(),
            rtvi,
            llm,
            structured_data_processor,
            bot_streaming_processor,
            course_state_processor,
            tts,
            transport.output(),
            context_aggregator.assistant(),
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(allow_interruptions=True),
        observers=[RTVIObserver(rtvi)],
    )

    flow_manager = FlowManager(
        task=task,
        llm=llm,
        context_aggregator=context_aggregator,
        transport=transport,
    )

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, _client):
        logger.info("Client connected - starting course flow")
        course_data["discussed_topics"] = []
        course_data["responses"] = {}
        course_data["current_topics"] = []
        course_data["current_node"] = "initial"
        course_data["user_profile"] = {
            "allergies": [],
            "diet": None,
            "goal": None,
            "dislikes": [],
            "medical_conditions": [],
            "calorie_target": None,
            "profile_complete": False,
            "current_question": 0,
        }
        await flow_manager.initialize(create_initial_node())

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, _client):
        logger.info("Client disconnected")

    @rtvi.event_handler("on_client_ready")
    async def on_client_ready(rtvi):
        logger.info("RTVI client ready")
        await rtvi.set_bot_ready()
        await course_state_processor.send_state_update()

    runner = PipelineRunner()
    await runner.run(task)

# ============= ChromaDB Utils ==========

def query_nutrition_data(query_text: str, n_results: int = 10):
    try:
        client = chromadb.PersistentClient(path="./chroma_db")
        collection = client.get_collection(name="nutrition_data", embedding_function=emb_fn)
        
        count = collection.count()
        n_results = min(n_results, count)
        
        results = collection.query(
            query_texts=[query_text],
            n_results=n_results
        )        
        context_block = "\n".join(results['documents'][0])
        return context_block
    except Exception as e:
        logger.error(f"ChromaDB Query Error: {e}")
        return "No specific food data found."

def query_recipe_data(query_text: str, n_results: int = 15):
    try:
        client = chromadb.PersistentClient(path="./recipe_chroma_db")
        collection = client.get_collection(
            name="recipes",
            embedding_function=emb_fn
        )
        count = collection.count()
        n_results = min(n_results, count)
        results = collection.query(
            query_texts=[query_text],
            n_results=n_results
        )
        return "\n\n".join(results["documents"][0])
    except Exception as e:
        logger.error(f"Recipe ChromaDB Query Error: {e}")
        return "No recipe data found."


# ============= FastAPI App =============

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Health check."""
    return {"status": "healthy", "service": "HTI.560 Course Assistant"}


@app.post("/api/start")
async def start(request: dict, background_tasks: BackgroundTasks):
    return {"webrtcUrl": "/api/offer"}


@app.post("/api/offer")
async def offer(request: dict, background_tasks: BackgroundTasks):
    """Handle WebRTC offer and start the bot pipeline."""
    pc_id = request.get("pc_id")

    if pc_id and pc_id in pcs_map:
        pipecat_connection = pcs_map[pc_id]
        await pipecat_connection.renegotiate(
            sdp=request["sdp"],
            type=request["type"],
            restart_pc=request.get("restart_pc", False),
        )
    else:
        pipecat_connection = SmallWebRTCConnection()
        await pipecat_connection.initialize(sdp=request["sdp"], type=request["type"])

        @pipecat_connection.event_handler("closed")
        async def handle_disconnected(webrtc_connection: SmallWebRTCConnection):
            logger.info(f"Peer connection closed: {webrtc_connection.pc_id}")
            pcs_map.pop(webrtc_connection.pc_id, None)

        runner_args = SmallWebRTCRunnerArguments(webrtc_connection=pipecat_connection)
        background_tasks.add_task(run_bot, runner_args)

    answer = pipecat_connection.get_answer()
    pcs_map[answer["pc_id"]] = pipecat_connection
    return answer


# Serve built frontend static files if they exist (Docker mode)
if os.path.exists("/app/static/index.html"):
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory="/app/static", html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    logger.info(f"Starting server on http://0.0.0.0:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
