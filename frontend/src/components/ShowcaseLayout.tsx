import React, { useEffect, useState, useRef, useReducer } from "react";
import {
  usePipecatClient,
  usePipecatClientMediaTrack,
} from "@pipecat-ai/client-react";
import {HighlightOverlay } from "@pipecat-ai/voice-ui-kit";
import type { PipecatBaseChildProps } from "@pipecat-ai/voice-ui-kit";
import {
  CONVERSATION_INFO_DISPLAYED,
  type TopicInfo,
} from "../conversationInfoDisplayed";
import { WelcomeHero } from "./WelcomeHero";
import { appStateReducer } from "../state/appStateReducer";
import { Header } from "./layout/Header";
import { VisualizerPanel } from "./VisualizerPanel";
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
  const [transcriptHistory, setTranscriptHistory] = useState<
    TranscriptMessage[]
  >([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const client = usePipecatClient();
  const transportState = client?.state ?? "disconnected";
  const botAudioTrack = usePipecatClientMediaTrack("audio", "bot");

  const [appState, dispatch] = useReducer(appStateReducer, "disconnected");

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
    if (transcripts.user && transcripts.user.trim() && !isUserSpeaking) {
      setTranscriptHistory((prev) => {
        const lastUserMsg = [...prev]
          .reverse()
          .find((m) => m.speaker === "user");
        if (!lastUserMsg || lastUserMsg.text !== transcripts.user) {
          return [
            ...prev,
            { speaker: "user", text: transcripts.user, timestamp: Date.now() },
          ];
        }
        return prev;
      });
    }
  }, [transcripts.user, isUserSpeaking]);

  // Add bot transcripts to history
  const lastProcessedTts = useRef("");
  useEffect(() => {
    if (
      transcripts.bot &&
      transcripts.bot.trim() &&
      transcripts.bot !== lastProcessedTts.current
    ) {
      lastProcessedTts.current = transcripts.bot;
      setTranscriptHistory((prev) => {
        const lastBotMsg = [...prev].reverse().find((m) => m.speaker === "bot");
        if (lastBotMsg && lastBotMsg.text === transcripts.bot) return prev;
        return [
          ...prev,
          { speaker: "bot", text: transcripts.bot, timestamp: Date.now() },
        ];
      });
    }
  }, [transcripts.bot]);

  // Auto-scroll conversation
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [transcriptHistory]);

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
      setTranscriptHistory([]);
      lastProcessedTts.current = "";
    }
  }, [transportState]);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Header />

      {/* Main Content */}

      <div className="lg:col-span-6 space-y-6 flex flex-col items-center">
        {/* Welcome Hero with connect button - only when disconnected */}
        {!isConnected && (
          <div className="flex flex-col items-center gap-4">
            {/* Logo with Introductory text */}
            <WelcomeHero />
            <button
              onClick={onConnectClick}
              className="flex px-4 py-3 bg-white border border-green-500  hover:bg-neutral-200  text-gray-700 rounded-xl transition-all transform hover:scale-105 font-bold shadow-md"
            >
              Start Interaction
            </button>
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
          
          {/* Left - Visualizer Plasma */}
          <div className="lg:col-span-3">
            <VisualizerPanel
            transportState = {transportState}
            appState = {appState}
            botAudioTrack = {botAudioTrack}
            visualizerType = {CONVERSATION_INFO_DISPLAYED.visualizerType}/>
          </div>

          {/* Middle - Controls + Topics + Current Turn */}
          <div className="lg:col-span-6 space-y-6">
            {/* Course Topics */}
            <div className="bg-white backdrop-blur-sm rounded-lg p-4 border border-indigo-300 shadow-lg">
              <h2 className="text-lg font-bold mb-1 text-center text-indigo-900">
                {courseState.current_node === "questions"
                  ? "Course Info - Q&A Mode"
                  : "Ask about Course Topics"}
              </h2>
              <p className="text-xs text-gray-600 text-center mb-4">
                {courseState.current_node === "questions"
                  ? "Ask me anything about the course!"
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

            {/* Current Turn */}
            <div className="bg-white backdrop-blur-sm rounded-lg p-6 border border-[#4e008e]/20 shadow-lg">
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

          {/* Right - Conversation History */}
          <div className="lg:col-span-3">
            <div className="bg-white backdrop-blur-sm rounded-lg p-4 border border-[#4e008e]/20 shadow-lg h-full">
              <h2 className="text-lg font-bold mb-3 text-[#4e008e] text-center">
                Conversation
              </h2>
              {isConnected ? (
                <div
                  className="h-[600px] overflow-y-auto"
                  ref={scrollContainerRef}
                >
                  {transcriptHistory.length === 0 ? (
                    <div className="text-sm text-gray-600">
                      <div className="mb-2 font-semibold">Session Active</div>
                      <div className="text-xs text-gray-500">
                        Waiting for conversation...
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {[...transcriptHistory].reverse().map((msg, idx) => (
                        <div
                          key={idx}
                          className={`flex ${msg.speaker === "user" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[90%] p-2 rounded-lg ${
                              msg.speaker === "user"
                                ? "bg-blue-50 border border-blue-300"
                                : "bg-gray-50 border border-gray-300"
                            }`}
                          >
                            <div className="text-xs text-gray-600 font-semibold">
                              {msg.speaker === "user" ? "You" : "Assistant"}
                            </div>
                            <div className="text-sm text-black">{msg.text}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-400 text-sm">Connect to start</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {isConnected && <HighlightOverlay />}
    </div>
  );
};

export default ShowcaseLayout;
