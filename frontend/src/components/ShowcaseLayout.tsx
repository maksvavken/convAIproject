import React, { useEffect, useRef, useReducer, useState } from "react";
import { Bot, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import {
  usePipecatClient,
  usePipecatClientMediaTrack,
  usePipecatClientMicControl,
} from "@pipecat-ai/client-react";
import { HighlightOverlay } from "@pipecat-ai/voice-ui-kit";
import type { PipecatBaseChildProps } from "@pipecat-ai/voice-ui-kit";
import {
  CONVERSATION_INFO_DISPLAYED,
  type TopicInfo,
} from "../conversationInfoDisplayed";
import { WelcomeHero } from "./WelcomeHero";
import { appStateReducer } from "../state/appStateReducer";
import { Header } from "./layout/Header";
import { VisualizerPanel } from "./VisualizerPanel";
import { ChatInput } from "./ChatInput";
import { ChatHistorySidebar } from "./ChatHistorySidebar";
import {
  chatTranscriptReducer,
  initialChatTranscriptState,
  type ChatMessage,
} from "../state/chatTranscript";


interface CourseState {
  all_topics: string[];
  discussed_topics: string[];
  responses: Record<string, { interested: boolean }>;
  remaining_topics: string[];
  current_topics: string[];
  current_node: string;
  progress: string;
}

const getTopicInfo = (topic: string): TopicInfo => {
  return (
    CONVERSATION_INFO_DISPLAYED.topics[topic] || {
      description: "Nutrional information",
      details: [],
      link: "",
      image: "",
    }
  );
};

interface ShowcaseLayoutProps extends Partial<PipecatBaseChildProps> {
  courseState?: CourseState;
  transcripts?: { user: string; bot: string };
  isBotSpeaking?: boolean;
  streamingBotText?: string;
  streamingUserText?: string;
  isUserSpeaking?: boolean;
  handleConnect?: () => Promise<void>;
}

const ShowcaseLayout: React.FC<ShowcaseLayoutProps> = ({
  handleConnect,
  courseState = {
    all_topics: [],
    discussed_topics: [],
    responses: {},
    remaining_topics: [],
    current_topics: [],
    current_node: "initial",
    progress: "0/3",
  },
  transcripts = { user: "", bot: "" },
  isBotSpeaking = false,
  streamingUserText = "",
  streamingBotText = "",
  isUserSpeaking = false,
}) => {
  const currentBotText = streamingBotText?.trim() || "";

  const currentUserText =
    streamingUserText?.trim() || transcripts.user?.trim() || "";

  const [chatState, chatDispatch] = useReducer(
    chatTranscriptReducer,
    initialChatTranscriptState,
  );
  const [selectedHistorySessionId, setSelectedHistorySessionId] = useState<
    string | undefined
  >();
  const [selectedHistoryMessages, setSelectedHistoryMessages] = useState<
    ChatMessage[]
  >([]);

  const isViewingHistory = !!selectedHistorySessionId;
  const liveDisplayedMessages = [
    ...chatState.messages,
    ...(chatState.liveUserMessage ? [chatState.liveUserMessage] : []),
    ...(chatState.liveBotMessage ? [chatState.liveBotMessage] : []),
  ].sort((a, b) => a.timestamp - b.timestamp);
  const displayedMessages = isViewingHistory
    ? selectedHistoryMessages
    : liveDisplayedMessages;

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const client = usePipecatClient();
  const transportState = client?.state ?? "disconnected";
  const botAudioTrack = usePipecatClientMediaTrack("audio", "bot");
  const { enableMic, isMicEnabled } = usePipecatClientMicControl();

  const [appState, dispatch] = useReducer(appStateReducer, "disconnected");

  const handleMicToggle = () => {
    if (isViewingHistory) return;
    enableMic(!isMicEnabled);
  };

  const handleTextSubmit = async (text: string) => {
    if (isViewingHistory) return;
    if (!client || client.state !== "ready") return;

    await client.sendText(text, {
      run_immediately: true,
      audio_response: true,
    });

    chatDispatch({
      type: "USER_TRANSCRIPT_UPDATED",
      text,
    });
    chatDispatch({ type: "USER_MESSAGE_FINALIZED" });
  };

  const handleSelectHistorySession = (
    sessionId: string,
    messages: ChatMessage[],
  ) => {
    setSelectedHistorySessionId(sessionId);
    setSelectedHistoryMessages([...messages].sort((a, b) => a.timestamp - b.timestamp));
  };

  const handleNewChat = () => {
    setSelectedHistorySessionId(undefined);
    setSelectedHistoryMessages([]);
    chatDispatch({ type: "RESET_CHAT" });
  };

  const onConnectClick = async () => {
    dispatch({ type: "CONNECT_REQUEST" });
    console.log("DISPATCH CONNECT_REQUEST");

    try {
      await handleConnect?.();
    } catch (error) {
      dispatch({ type: "CONNECT_FAILURE" });
      console.error("Connect failed:", error);
    }
  };

  const isConnected =
    appState !== "disconnected" &&
    appState !== "connecting" &&
    appState !== "error";

  const prevIsUserSpeaking = useRef(false);
  const prevIsBotSpeaking = useRef(false);

  const botFinalizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearBotFinalizeTimeout = () => {
    if (botFinalizeTimeoutRef.current) {
      clearTimeout(botFinalizeTimeoutRef.current);
      botFinalizeTimeoutRef.current = null;
    }
  };

  const userFinalizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearUserFinalizeTimeout = () => {
    if (userFinalizeTimeoutRef.current) {
      clearTimeout(userFinalizeTimeoutRef.current);
      userFinalizeTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    if (!prevIsUserSpeaking.current && isUserSpeaking) {
      dispatch({ type: "USER_STARTED_SPEAKING" });
      clearUserFinalizeTimeout();
    } else if (prevIsUserSpeaking.current && !isUserSpeaking) {
      dispatch({ type: "USER_STOPPED_SPEAKING" });
    }

    prevIsUserSpeaking.current = isUserSpeaking;
  }, [isUserSpeaking]);

  useEffect(() => {
    if (!prevIsBotSpeaking.current && isBotSpeaking) {
      dispatch({ type: "BOT_STARTED_SPEAKING" });
      clearBotFinalizeTimeout();

      chatDispatch({ type: "USER_MESSAGE_FINALIZED" });
    } else if (prevIsBotSpeaking.current && !isBotSpeaking) {
      dispatch({ type: "BOT_FINISHED_SPEAKING" });

      clearBotFinalizeTimeout();
      botFinalizeTimeoutRef.current = setTimeout(() => {
        chatDispatch({ type: "BOT_MESSAGE_FINALIZED" });
        botFinalizeTimeoutRef.current = null;
      }, 1000);
    }

    prevIsBotSpeaking.current = isBotSpeaking;
  }, [isBotSpeaking]);

  // Auto-scroll conversation
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayedMessages]);

  useEffect(() => {
    if (currentUserText) {
      clearUserFinalizeTimeout();

      chatDispatch({
        type: "USER_TRANSCRIPT_UPDATED",
        text: currentUserText,
      });
    }
  }, [currentUserText]);

  const botUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    if (!currentBotText) return;

    clearBotFinalizeTimeout();

    if (botUpdateTimeoutRef.current) {
      clearTimeout(botUpdateTimeoutRef.current);
    }

    botUpdateTimeoutRef.current = setTimeout(() => {
      chatDispatch({
        type: "BOT_TRANSCRIPT_UPDATED",
        text: currentBotText,
      });
    }, 200); 

    return () => {
      if (botUpdateTimeoutRef.current) {
        clearTimeout(botUpdateTimeoutRef.current);
      }
    };
  }, [currentBotText]);

  useEffect(() => {
    if (transportState === "connecting") {
      dispatch({ type: "CONNECT_REQUEST" });
    } else if (transportState === "ready") {
      dispatch({ type: "CONNECT_SUCCESS" });
    } else if (transportState === "disconnected") {
      dispatch({ type: "DISCONNECT" });
    }
  }, [transportState]);

  useEffect(() => {
    console.log("appState changed →", appState);
  }, [appState]);

  useEffect(() => {
    console.log("transportState:", transportState);
  }, [transportState]);

  // Old Plasma-Code TODO
  // Update plasma colors based on conversation state
  {
    /*useEffect(() => {
    if (plasmaRef.current && transportState === "ready") {
      if (conversationState === "listening") {
        plasmaRef.current.updateConfig({
          color1: "#9333ea",
          color2: "#7c3aed",
          color3: "#a855f7",
        });
      } else if (conversationState === "thinking") {
        plasmaRef.current.updateConfig({
          color1: "#22c55e",
          color2: "#16a34a",
          color3: "#4ade80",
        });
      } else {
        plasmaRef.current.updateConfig({
          color1: "#22d3ee",
          color2: "#34d399",
          color3: "#818cf8",
        });
      }
    }
  }, [conversationState, transportState]); */
  }

  // Reset history on new connection
  useEffect(() => {
    if (transportState === "ready") {
      chatDispatch({ type: "RESET_CHAT" });
    }
  }, [transportState]);

  return (
    <div className="h-screen bg-white text-gray-900 flex flex-col overflow-hidden">
      <Header
        rightAccessory={
          <VisualizerPanel
            transportState={transportState}
            botAudioTrack={botAudioTrack}
            visualizerType={CONVERSATION_INFO_DISPLAYED.visualizerType}
            compact
          />
        }
      />
      <ChatHistorySidebar
        messages={chatState.messages}
        selectedSessionId={selectedHistorySessionId}
        onSelectSession={handleSelectHistorySession}
        onNewChat={handleNewChat}
      />

      {/* Main Content */}

      {/* Welcome Hero with connect button - only when disconnected */}
      {!isConnected ? (
        <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8">
          {/* Logo with Introductory text */}
          <WelcomeHero />
          <button
            onClick={onConnectClick}
            className="flex px-4 py-3 bg-white border border-green-500  hover:bg-neutral-200  text-gray-700 rounded-xl transition-all transform hover:scale-105 font-bold shadow-md"
          >
            Start Interaction
          </button>
        </div>
      ) : (
        <div className="max-w-5xl mx-auto w-full flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Middle - Controls + Topics + Current Turn */}
          <div className="lg:col-span-6 space-y-6 max-h-[300px]">
            {/* Course Topics */}
            <div className="bg-white backdrop-blur-sm rounded-lg p-4 border border-green-300 shadow-lg">
              <h2 className="text-lg font-bold mb-1 text-center text-green-900">
                {courseState.current_node === "questions"
                  ? "Q&A Mode"
                  : "Ask about Nutrition"}
              </h2>
              <p className="text-xs text-gray-600 text-center mb-4">
                {courseState.current_node === "questions"
                  ? "Ask me anything about nutrion!"
                  : "What would you like to know about?"}
              </p>

              <div
                className={
                  courseState.current_node === "questions"
                    ? "w-full"
                    : "space-y-2"
                }
              >
                {courseState.current_node === "questions" ? (
                  courseState.current_topics.map((topic) => {
                    const topicInfo = getTopicInfo(topic);
                    return (
                      <div
                        key={topic}
                        className="w-full p-4 rounded-lg bg-white border-2 border-green-600"
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="font-semibold text-base text-green-700">
                            {topic}
                          </h3>
                        </div>
                        <p className="text-sm text-gray-700 mb-3">
                          {topicInfo.description}
                        </p>
                        {topicInfo.image && (
                          <img
                            src={topicInfo.image}
                            alt={topic}
                            className="w-full h-auto rounded-lg mb-3 max-h-64 object-cover"
                          />
                        )}
                        <ul className="text-sm text-gray-600 space-y-1 mb-3">
                          {topicInfo.details.map((detail, idx) => (
                            <li key={idx}>- {detail}</li>
                          ))}
                        </ul>
                        {topicInfo.link && (
                          <a
                            href={topicInfo.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block px-3 py-1 text-sm text-blue-600 hover:text-blue-800 bg-blue-50 rounded-lg border border-blue-200"
                          >
                            Open in Moodle
                          </a>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {courseState.all_topics.map((topic) => {
                      const isDiscussed =
                        courseState.discussed_topics.includes(topic);
                      const isInterested =
                        courseState.responses[topic]?.interested;

                      let bgClass = "bg-purple-50 border border-purple-300";
                      let textColor = "text-gray-800";
                      let icon = "o";

                      if (isDiscussed && isInterested) {
                        bgClass = "bg-green-50 border border-green-600";
                        textColor = "text-green-800";
                        icon = "v";
                      }

                      return (
                        <div
                          key={topic}
                          className={`p-3 rounded-lg transition-all ${bgClass}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold">{icon}</span>
                            <p className={`text-sm ${textColor}`}>{topic}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Conversation History */}
          <div className="bg-white rounded-lg p-4 mb-4 flex-1 min-h-0 flex flex-col">
            <div
              className="flex-1 min-h-0 overflow-y-auto"
              ref={scrollContainerRef}
            >
              <div className="flex flex-col justify-end min-h-full space-y-2">
                {displayedMessages.map((msg) =>
                  msg.speaker === "user" ? (
                    <div
                      key={msg.id}
                      className="grid w-full grid-cols-[1fr_auto] items-end gap-2"
                    >
                      <div className="flex justify-end">
                        <div className="max-w-[70%] p-2 rounded-lg bg-green-500 shadow">
                          <div className="text-sm text-white prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown>{msg.text}</ReactMarkdown>
                          </div>
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-full border border-green-300 bg-white flex items-center justify-center shrink-0">
                        <User className="w-5 h-5" />
                      </div>
                    </div>
                  ) : (
                    <div key={msg.id} className="flex justify-start">
                      <div className="flex items-end gap-2">
                        <div className="w-8 h-8 rounded-full border border-gray-300 bg-white flex items-center justify-center">
                          <Bot className="w-5 h-5" />
                        </div>
                        <div className="max-w-[70%] p-2 rounded-lg bg-gray-50 shadow">
                          <div className="text-sm text-black prose prose-sm max-w-none">
                            <ReactMarkdown>{msg.text}</ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    </div>
                  ),
                )}
                <div ref={bottomRef} />
              </div>
            </div>
          </div>
          {/* Chat Input */}
          <div className="shrink-0 sticky bottom-0">
            <ChatInput
              onMicToggle={handleMicToggle}
              isMicEnabled={isMicEnabled}
              onSubmit={handleTextSubmit}
              disabled={!isConnected || isViewingHistory}
            />
          </div>
        </div>
      )}

      {isConnected && <HighlightOverlay />}
    </div>
  );
};

export default ShowcaseLayout;
