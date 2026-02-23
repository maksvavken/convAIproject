#!/usr/bin/env python3
"""HTI.560 Course Assistant - Pipecat Flows + WebRTC.

Stripped-down version for local development.
"""

import os
from typing import Any, Dict

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

# Store active peer connections
pcs_map: Dict[str, Any] = {}


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
    provider = os.getenv("STT_PROVIDER", "azure").lower()

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
    provider = os.getenv("TTS_PROVIDER", "azure").lower()

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
        )

    elif provider == "openai":
        from pipecat.services.openai.tts import OpenAITTSService
        return OpenAITTSService(
            api_key=os.getenv("OPENAI_API_KEY"),
            voice=os.getenv("OPENAI_TTS_VOICE", "alloy"),
        )

    elif provider == "elevenlabs":
        from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
        return ElevenLabsTTSService(
            api_key=os.getenv("ELEVENLABS_API_KEY"),
            voice_id=os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM"),
        )

    else:
        raise ValueError(f"Unsupported TTS provider: {provider}. Supported: azure, deepgram, openai, elevenlabs")

# Conversation state storage (topic list comes from conversation_config.py)
course_data = {
    "all_topics": CONVERSATION_CONFIG["topics"],
    "discussed_topics": [],
    "responses": {},
    "current_topics": [],
    "current_node": "initial",
}


# ============= Custom Frame Processors =============


class ConversationStateProcessor(FrameProcessor):
    """Sends conversation state updates to the frontend via RTVI messages.

    This processor keeps the React UI in sync with backend conversation state.
    It sends updates about what topics have been discussed, what's remaining,
    current progress, and which flow node the conversation is in.

    When a flow transition happens (e.g., user selects a topic), this processor
    pushes an RTVIServerMessageFrame that the frontend receives as an
    onServerMessage callback, triggering UI updates (topic cards ⭕ → ✅).
    """

    def __init__(self, course_data: dict):
        """Initialize the course state processor.

        Args:
            course_data: Dictionary containing course state (topics, responses, etc.).
        """
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
            # Message type identifier (used by frontend to route different message types)
            "type": "conversation_state_update",

            # All available topics (static list)
            "all_topics": self.course_data["all_topics"],

            # Topics user has already asked about
            "discussed_topics": self.course_data["discussed_topics"],

            # Topics not yet discussed
            "remaining_topics": remaining,

            # Topics currently being discussed (array, usually 1 item)
            "current_topics": self.course_data.get("current_topics", []),

            # User interaction metadata per topic (e.g., {topic_name: {interested: true}})
            "responses": self.course_data["responses"],

            # Current position in the conversation flow (e.g., "initial", "questions")
            "current_node": self.course_data.get("current_node", "initial"),

            # Progress indicator for UI (e.g., "2/3")
            "progress": f"{len(self.course_data['discussed_topics'])}/{len(self.course_data['all_topics'])}",
        }

        state_changed = current_state != self.last_sent_state or current_state.get(
            "current_node"
        ) != self.last_sent_state.get("current_node")

        if state_changed:
            await self.push_frame(RTVIServerMessageFrame(data=current_state))
            self.last_sent_state = current_state.copy()

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        """Process pipeline frames and send state updates to frontend.

        Monitors LLM responses and function call results, triggering course
        state updates to the React UI when flow transitions occur.

        Args:
            frame: The pipeline frame to process.
            direction: Frame direction (upstream/downstream).
        """
        await super().process_frame(frame, direction)

        # Send state update after LLM responses and function calls
        if isinstance(frame, (LLMFullResponseEndFrame, FunctionCallResultFrame)):
            await self.send_state_update()

        await self.push_frame(frame, direction)


# ============= Flow Node Definitions =============


def create_go_back_function() -> FlowsFunctionSchema:
    """Create a function to go back to topic selection."""

    async def handle_go_back(
        args: FlowArgs, flow_manager: FlowManager
    ) -> tuple[str | None, NodeConfig]:
        """Handle user wanting to go back to topic selection."""
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
        """Handle user wanting to exit the conversation."""
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
    remaining = [
        t for t in course_data["all_topics"] if t not in course_data["discussed_topics"]
    ]

    if not remaining:
        return None

    # Get description from config (dynamically generated with current topics)
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
    """Mark topic as discussed and go to Q&A mode."""
    topic = args["topics"][0]

    if topic not in course_data["discussed_topics"]:
        course_data["responses"][topic] = {"interested": True}
        course_data["discussed_topics"].append(topic)

    course_data["current_topics"] = [topic]
    course_data["current_node"] = "questions"

    remaining = [
        m for m in course_data["all_topics"] if m not in course_data["discussed_topics"]
    ]

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
            }
        )
        await flow_manager._task.queue_frame(frame)
        logger.info(f"Course: Marked {topic} as discussed, going to Q&A")

    return None, create_questions_node()


def create_questions_node() -> NodeConfig:
    """Q&A node where users can ask detailed questions."""
    config = CONVERSATION_CONFIG["questions_node"]

    # Combine role prompt with course details
    full_prompt = f"{config['role_prompt']}\n\nFULL COURSE DETAILS:\n\n{config['course_details']}"

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
                "content": config["task_prompt"],
            }
        ],
        "functions": [create_go_back_function(), create_exit_function()],
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

    # STT/TTS Services (configurable via .env)
    stt = create_stt_service()
    tts = create_tts_service()

    # LLM (configurable via LLM_PROVIDER env var, default: openai)
    llm = create_llm_service()

    context = LLMContext()
    context_aggregator = LLMContextAggregatorPair(context)

    # Polite mode: mute STT while bot is speaking (prevents echo/feedback)
    stt_mute_filter = STTMuteFilter(
        config=STTMuteConfig(
            strategies={STTMuteStrategy.ALWAYS, STTMuteStrategy.FUNCTION_CALL}
        )
    )

    # RTVI processor for frontend communication
    rtvi = RTVIProcessor(config=RTVIConfig(config=[]), transport=transport)

    # Course state processor — sends flow state to frontend
    course_state_processor = ConversationStateProcessor(course_data)

    # Pipeline: audio in -> STT -> mute filter -> LLM -> state updates -> TTS -> audio out
    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            stt_mute_filter,
            context_aggregator.user(),
            rtvi,
            llm,
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
    """Start endpoint — returns the WebRTC offer URL."""
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
        # Localhost: no TURN needed, direct connection works
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
