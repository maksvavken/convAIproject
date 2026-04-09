import React, { useEffect, useState, useRef, useReducer } from "react";
import { Bot, User } from "lucide-react";
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
interface CourseState {
  all_topics: string[];
  discussed_topics: string[];
  responses: Record<string, { interested: boolean }>;
  remaining_topics: string[];
  current_topics: string[];
  current_node: string;
  progress: string;
}

interface TranscriptMessage {
  speaker: "user" | "bot";
  text: string;
  timestamp: number;
}

interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  messages: TranscriptMessage[];
}

const CHAT_HISTORY_STORAGE_KEY = "convai-chat-history-v1";

const createNewChat = (): ChatSession => ({
  id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: "New chat",
  updatedAt: Date.now(),
  messages: [],
});

const getChatTitleFromMessages = (messages: TranscriptMessage[]): string => {
  const firstUserMessage = messages.find((m) => m.speaker === "user")?.text ?? "";
  const trimmed = firstUserMessage.trim();
  if (!trimmed) return "New chat";
  return trimmed.length > 24 ? `${trimmed.slice(0, 24)}...` : trimmed;
};

const getTopicInfo = (topic: string): TopicInfo => {
  return (
    CONVERSATION_INFO_DISPLAYED.topics[topic] || {
      description: "Course information",
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
  isUserSpeaking = false,
}) => {
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
      if (!raw) {
        return [createNewChat()];
      }
      const parsed = JSON.parse(raw) as ChatSession[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return [createNewChat()];
      }
      return parsed;
    } catch {
      return [createNewChat()];
    }
  });
  const [activeChatId, setActiveChatId] = useState<string>(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
      if (!raw) return "";
      const parsed = JSON.parse(raw) as ChatSession[];
      if (!Array.isArray(parsed) || parsed.length === 0) return "";
      return parsed[0].id;
    } catch {
      return "";
    }
  });
  const [liveChatId, setLiveChatId] = useState<string>(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
      if (!raw) return "";
      const parsed = JSON.parse(raw) as ChatSession[];
      if (!Array.isArray(parsed) || parsed.length === 0) return "";
      return parsed[0].id;
    } catch {
      return "";
    }
  });
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const client = usePipecatClient();
  const transportState = client?.state ?? "disconnected";
  const botAudioTrack = usePipecatClientMediaTrack("audio", "bot");
  const localAudioTrack = usePipecatClientMediaTrack("audio", "local");
  const { enableMic, isMicEnabled } = usePipecatClientMicControl();

  const [appState, dispatch] = useReducer(appStateReducer, "disconnected");
  const [hasStartedInteraction, setHasStartedInteraction] = useState(false);
  const lastProcessedUser = useRef("");
  const lastProcessedBot = useRef("");
  const isSwitchingChatRef = useRef(false);
  const activeChatIdRef = useRef(activeChatId);
  const liveChatIdRef = useRef(liveChatId);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    liveChatIdRef.current = liveChatId;
  }, [liveChatId]);

  const activeChat = chatSessions.find((chat) => chat.id === activeChatId) ?? chatSessions[0];
  const transcriptHistory = activeChat?.messages ?? [];
  const canTalkInActiveChat = !!activeChat && activeChat.id === liveChatId;

  useEffect(() => {
    if (chatSessions.length === 0) {
      const fallback = createNewChat();
      setChatSessions([fallback]);
      setActiveChatId(fallback.id);
      setLiveChatId(fallback.id);
      return;
    }
    if (!activeChatId || !chatSessions.some((chat) => chat.id === activeChatId)) {
      setActiveChatId(chatSessions[0].id);
    }
    if (!liveChatId || !chatSessions.some((chat) => chat.id === liveChatId)) {
      setLiveChatId(chatSessions[0].id);
    }
  }, [chatSessions, activeChatId, liveChatId]);

  useEffect(() => {
    window.localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(chatSessions));
  }, [chatSessions]);

  const createAndSelectNewChat = async () => {
    const newChat = createNewChat();
    isSwitchingChatRef.current = true;
    setChatSessions((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setLiveChatId(newChat.id);

    // Avoid replaying latest transcript values into the newly created chat.
    lastProcessedUser.current = transcripts.user;
    lastProcessedBot.current = transcripts.bot;

    try {
      setHasStartedInteraction(true);
      await handleConnect?.();
    } catch (error) {
      console.error("Failed to start a fresh chat session:", error);
    }

    isSwitchingChatRef.current = false;
  };

  const switchToChat = async (chatId: string) => {
    if (chatId === activeChatIdRef.current) return;

    isSwitchingChatRef.current = true;
    setActiveChatId(chatId);

    // Prevent adding stale transcript props when active chat changes.
    lastProcessedUser.current = transcripts.user;
    lastProcessedBot.current = transcripts.bot;

    isSwitchingChatRef.current = false;
  };

  const deleteOldChat = (chatId: string) => {
    if (chatId === liveChatId) return;

    setChatSessions((prev) => {
      const remaining = prev.filter((chat) => chat.id !== chatId);
      const nextSessions = remaining.length > 0 ? remaining : [createNewChat()];

      if (!nextSessions.some((chat) => chat.id === activeChatIdRef.current)) {
        const liveStillExists = nextSessions.some((chat) => chat.id === liveChatId);
        setActiveChatId(liveStillExists ? liveChatId : nextSessions[0].id);
      }

      return nextSessions;
    });
  };

  const addMessageToActiveChat = (speaker: "user" | "bot", text: string) => {
    if (!text.trim() || isSwitchingChatRef.current) return;

    setChatSessions((prev) => {
      if (prev.length === 0) {
        const created = createNewChat();
        const nextMessage: TranscriptMessage = { speaker, text, timestamp: Date.now() };
        const nextChat: ChatSession = {
          ...created,
          messages: [nextMessage],
          title: getChatTitleFromMessages([nextMessage]),
          updatedAt: Date.now(),
        };
        setActiveChatId(nextChat.id);
        return [nextChat];
      }

      const targetId = liveChatIdRef.current || prev[0].id;
      return prev.map((chat) => {
        if (chat.id !== targetId) return chat;

        const lastMessage = chat.messages[chat.messages.length - 1];
        if (lastMessage && lastMessage.speaker === speaker && lastMessage.text === text) {
          return chat;
        }

        const nextMessages = [
          ...chat.messages,
          { speaker, text, timestamp: Date.now() },
        ];
        return {
          ...chat,
          messages: nextMessages,
          updatedAt: Date.now(),
          title: getChatTitleFromMessages(nextMessages),
        };
      });
    });
  };

  const handleMicToggle = () => {
    enableMic(!isMicEnabled);
  };

  const onConnectClick = async () => {
    if (!canTalkInActiveChat) return;

    setHasStartedInteraction(true);
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

  useEffect(() => {
    if (!prevIsUserSpeaking.current && isUserSpeaking) {
      dispatch({ type: "USER_STARTED_SPEAKING" });
    } else if (prevIsUserSpeaking.current && !isUserSpeaking) {
      dispatch({ type: "USER_STOPPED_SPEAKING" });
    }
    prevIsUserSpeaking.current = isUserSpeaking;
  }, [isUserSpeaking]);

  useEffect(() => {
    if (!prevIsBotSpeaking.current && isBotSpeaking) {
      dispatch({ type: "BOT_STARTED_SPEAKING" });
    } else if (prevIsBotSpeaking.current && !isBotSpeaking) {
      dispatch({ type: "BOT_FINISHED_SPEAKING" });
    }

    prevIsBotSpeaking.current = isBotSpeaking;
  }, [isBotSpeaking]);

  // Add final user transcripts to history
  useEffect(() => {
    if (
      transcripts.user &&
      transcripts.user.trim() &&
      !isUserSpeaking &&
      transcripts.user !== lastProcessedUser.current
    ) {
      lastProcessedUser.current = transcripts.user;
      addMessageToActiveChat("user", transcripts.user);
    }
  }, [transcripts.user, isUserSpeaking]);

  // Add bot transcripts to history
  useEffect(() => {
    if (
      transcripts.bot &&
      transcripts.bot.trim() &&
      transcripts.bot !== lastProcessedBot.current
    ) {
      lastProcessedBot.current = transcripts.bot;
      addMessageToActiveChat("bot", transcripts.bot);
    }
  }, [transcripts.bot]);

  // Auto-scroll conversation
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcriptHistory]);

  useEffect(() => {
    if (transportState === "connecting") {
      dispatch({ type: "CONNECT_REQUEST" });
    } else if (transportState === "ready") {
      setHasStartedInteraction(true);
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

  return (
    <div className="h-screen bg-white text-gray-900 flex flex-col overflow-hidden">
      <Header />

      {/* Main Content */}

      {/* Welcome Hero with connect button - only when disconnected */}
      {!isConnected && !hasStartedInteraction ? (
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
        <div className="max-w-6xl mx-auto w-full flex-1 min-h-0 flex gap-4 overflow-hidden px-4">
          <aside className="w-64 shrink-0 border border-gray-200 rounded-lg p-3 bg-gray-50 hidden md:flex md:flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">Chats</h2>
              <button
                type="button"
                onClick={() => {
                  void createAndSelectNewChat();
                }}
                className="text-xs px-2 py-1 rounded-md border border-gray-300 hover:bg-white"
              >
                New
              </button>
            </div>
            <div className="overflow-y-auto space-y-2 min-h-0">
              {chatSessions
                .slice()
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((chat) => (
                  <div
                    key={chat.id}
                    className={`w-full p-2 rounded-md border text-sm transition-colors ${
                      chat.id === activeChatId
                        ? "border-green-500 bg-white"
                        : "border-transparent hover:border-gray-300 hover:bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        void switchToChat(chat.id);
                      }}
                      className="w-full text-left"
                    >
                      <div className="font-medium text-gray-800 truncate">{chat.title}</div>
                      <div className="text-xs text-gray-500">{chat.messages.length} messages</div>
                    </button>
                    {chat.id !== liveChatId && (
                      <div className="mt-1 flex justify-end">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteOldChat(chat.id);
                          }}
                          className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-red-50 hover:border-red-300 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </aside>

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Middle - Controls + Topics + Current Turn */}
            <div className="lg:col-span-6 space-y-6 max-h-[300px]">
              {/* Course Topics */}
              <div className="bg-white backdrop-blur-sm rounded-lg p-4 border border-indigo-300 shadow-lg">
              <h2 className="text-lg font-bold mb-1 text-center text-indigo-900">
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
                  {transcriptHistory.map((msg, idx) =>
                    msg.speaker === "user" ? (
                      <div key={idx} className="flex justify-end">
                        <div className="flex items-end gap-2">
                          <div className="max-w-[90%] p-2 rounded-lg bg-green-500 shadow">
                            <div className="text-sm text-white">{msg.text}</div>
                          </div>
                          <div className="w-8 h-8 rounded-full border border-green-300 bg-white flex items-center justify-center">
                            <User className="w-5 h-5" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div key={idx} className="flex justify-start">
                        <div className="flex items-end gap-2">
                          <div className="w-8 h-8 rounded-full border border-gray-300 bg-white flex items-center justify-center">
                            <Bot className="w-5 h-5" />
                          </div>
                          <div className="max-w-[90%] p-2 rounded-lg bg-gray-50 shadow">
                            <div className="text-sm text-black">{msg.text}</div>
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
                disabled={!isConnected || !canTalkInActiveChat}
              />
              {!isConnected && canTalkInActiveChat && (
                <div className="mb-3 flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      void onConnectClick();
                    }}
                    className="px-3 py-2 text-sm rounded-md border border-gray-300 bg-white hover:bg-gray-50"
                  >
                    Connect to this chat
                  </button>
                </div>
              )}
              {!canTalkInActiveChat && (
                <div className="mb-3 text-center text-xs text-gray-500">
                  This is history mode. Only the active live chat can keep talking.
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
                {/* Left - Visualizer Plasma */}
                <div className="lg:col-span-3">
                  <VisualizerPanel
                    transportState={transportState}
                    botAudioTrack={botAudioTrack}
                    visualizerType={CONVERSATION_INFO_DISPLAYED.visualizerType}
                  />
                </div>
                {/* Current Turn */}
                <div className="lg:col-span-9 bg-white backdrop-blur-sm rounded-lg p-6 border border-[#4e008e]/20 shadow-lg">
                  {isConnected ? (
                    <div className="space-y-4">
                      <div>
                        <div className="text-xs text-gray-600 mb-1">
                          Assistant (latest):
                        </div>
                        <div className="text-sm p-3 rounded-lg min-h-[40px] border-2 bg-white border-gray-300">
                          <span className="text-black">
                            {transcripts.bot || (
                              <span className="text-gray-400 italic">
                                Waiting for response...
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">
                          User (latest){isUserSpeaking ? " - Speaking..." : ""}:
                        </div>
                        <div className="text-sm p-3 rounded-lg min-h-[40px] border-2 bg-white border-gray-300">
                          <span className="text-black">
                            {transcripts.user || (
                              <span className="text-gray-400 italic">
                                Waiting for input...
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-400">Waiting for connection...</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isConnected && <HighlightOverlay />}
    </div>
  );
};

export default ShowcaseLayout;
