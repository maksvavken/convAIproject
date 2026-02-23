# Pipecat-based conversational speech interface template

**HTI.560 Conversational Interaction with AI** (Tampere University)

![Python](https://img.shields.io/badge/Python-3.11+-blue?logo=python&logoColor=white)
![Node](https://img.shields.io/badge/Node.js-18+-green?logo=node.js&logoColor=white)
![pipecat-ai](https://img.shields.io/badge/pipecat--ai-0.0.86-7c3aed?logo=python&logoColor=white)
![pipecat-ai-flows](https://img.shields.io/badge/pipecat--ai--flows-0.0.22-7c3aed?logo=python&logoColor=white)

A minimal voice conversation template demonstrating Pipecat Flows, WebRTC, and real-time UI state management. Students working on projects, who are interested in trying out a Pipecat-based solution, can adapt this for any domain (cooking, shopping, healthcare, etc.) by editing config files. No code changes needed.

Requires API keys: [OpenAI](https://platform.openai.com/api-keys) (for the LLM) and a speech provider for voice input (STT/ASR) and output (TTS). You can use API keys from any service provider directly, eg. [Azure](https://portal.azure.com), [Deepgram](https://console.deepgram.com), or [OpenAI](https://platform.openai.com/api-keys).

## Structure

**Backend (using [Pipecat](https://docs.pipecat.ai/) + [Pipecat Flows](https://docs.pipecat.ai/guides/features/pipecat-flows)):**
- Conversation state machines with LLM function calling
- Real-time audio streaming via WebRTC (STT/TTS)
- Backend-to-frontend state sync via RTVI protocol

**Frontend (React + TypeScript + [Pipecat Client SDK](https://www.npmjs.com/package/@pipecat-ai/client-react)):**
- Real-time state management with WebRTC events
- Audio visualization (Web Audio API, waveform rendering)
- Responsive UI driven by conversation state

## How It Works

```
Browser (React)  ←── WebRTC audio + RTVI messages ──→  Backend (Pipecat)

Frontend receives state:                 Backend sends state:
onServerMessage callback                 RTVIServerMessageFrame
  ↓                                        ↑
Updates topic cards,                     FlowManager transitions between nodes:
transcript, visualizer                   initial → questions → back/exit
```

**The conversation has two nodes:**
1. **initial** — Bot greets user, waits for topic selection. When user asks about a topic, `record_topic_interest` fires → transitions to questions node
2. **questions** — Bot answers detailed questions about that topic. User can `go_back_to_topics` or `exit_conversation`

**Backend → frontend sync** (the part not well documented elsewhere):
- Backend pushes conversation state via [`RTVIServerMessageFrame`](https://docs.pipecat.ai/server/frameworks/rtvi/rtvi-processor) in `webrtc_server.py`
- Frontend receives it via [`onServerMessage`](https://docs.pipecat.ai/client/js/api-reference/callbacks) callback
- This is how topic cards update from ⭕ → ✅ in real time without page reloads
- See `ConversationStateProcessor` in `backend/webrtc_server.py` for the implementation

> [!WARNING]
> **Key constraint:** Topic names must match **exactly** between `backend/conversation_config.py` and `frontend/src/conversationInfoDisplayed.tsx` — they're connected through these state messages.

## Quick Start

```bash
# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # Then edit .env with your API keys
python webrtc_server.py

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

> [!NOTE]
> **Configure API keys as needed (see `backend/.env.example`).** At minimum, an OpenAI key (for LLM) and a speech provider key for STT/TTS.

> [!TIP]
> **No provider access?** Free options: Azure Speech (5 hrs/month free), Deepgram ($200 credit), OpenAI Whisper ($0.006/min).

## Adapt for your conversational task

| I want to...                          | File                                         | Look for                        |
|---------------------------------------|----------------------------------------------|---------------------------------|
| Change topics (e.g. cooking, shopping)| `backend/conversation_config.py`             | `TOPICS`, `TOPIC_KEYWORDS`      |
| Change what the bot knows             | `backend/conversation_config.py`             | `QUESTIONS_COURSE_DETAILS`      |
| Change the welcome message            | `backend/conversation_config.py`             | `INITIAL_TASK_PROMPT`           |
| Change UI text, images, links         | `frontend/src/conversationInfoDisplayed.tsx`  | `topics` object                 |
| Switch visualizer style               | `frontend/src/conversationInfoDisplayed.tsx`  | `visualizerType`                |
| Switch STT/TTS provider or voice      | `backend/.env`                               | `STT_PROVIDER`, `TTS_PROVIDER`  |
| Change colors, header, card styling   | `frontend/src/components/ShowcaseLayout.tsx`  |                                 |
| Add a new conversation node           | `backend/webrtc_server.py`                   | See Pipecat Flows docs below    |

> [!TIP]
> Both config files have extensive comments explaining each section.

## Pipecat Documentation

**Understand the conversation flow (backend):**
- [Pipecat Flows guide](https://docs.pipecat.ai/guides/features/pipecat-flows) — nodes, functions, transitions. This is what `webrtc_server.py` is built on
- [Flows examples](https://github.com/pipecat-ai/pipecat-flows/tree/main/examples) — `food_ordering.py` and `patient_intake.py` are closest to this project
- [Flows visual editor](https://flows.pipecat.ai/) — design flows in the browser, export Python code
- [Flows API reference](https://reference-flows.pipecat.ai/) — FlowManager, NodeConfig, FlowsFunctionSchema

**Understand the frontend connection:**
- [RTVIProcessor docs](https://docs.pipecat.ai/server/frameworks/rtvi/rtvi-processor) — how backend sends state to frontend
- [Client callbacks reference](https://docs.pipecat.ai/client/js/api-reference/callbacks) — `onServerMessage` and other events
- [Client React SDK](https://www.npmjs.com/package/@pipecat-ai/client-react) — hooks and providers used in the frontend

**Learn Pipecat from scratch:**
- [Pipecat introduction](https://docs.pipecat.ai/getting-started/introduction) — pipeline concept, how audio flows through STT → LLM → TTS
- [Example apps](https://github.com/pipecat-ai/pipecat-examples) — `simple-chatbot` and `push-to-talk` have React frontends
- [Quickstart client-server](https://github.com/pipecat-ai/pipecat-quickstart-client-server) — minimal React + Pipecat setup
- [AWS blog: voice agents with Pipecat](https://aws.amazon.com/blogs/machine-learning/building-intelligent-ai-voice-agents-with-pipecat-and-amazon-bedrock-part-1/) — detailed third-party walkthrough
