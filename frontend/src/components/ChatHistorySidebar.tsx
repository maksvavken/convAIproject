import { useEffect, useRef, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import type { ChatMessage } from "../state/chatTranscript";

interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}

interface ChatHistorySidebarProps {
  messages: ChatMessage[];
  selectedSessionId?: string;
  onSelectSession: (sessionId: string, messages: ChatMessage[]) => void;
  onNewChat: () => void;
}

const STORAGE_KEY = "convai-chat-history";

const loadSessions = (): ChatSession[] => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveSessions = (sessions: ChatSession[]) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 10)));
};

const getSessionTitle = (messages: ChatMessage[]) => {
  const firstUserMessage = messages.find((message) => message.speaker === "user");
  return firstUserMessage?.text.slice(0, 48) || "New chat";
};

export function ChatHistorySidebar({
  messages,
  selectedSessionId,
  onSelectSession,
  onNewChat,
}: ChatHistorySidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const sessionIdRef = useRef(`chat-${Date.now()}`);
  const previousMessageCountRef = useRef(0);

  const resetSessionId = () => {
    sessionIdRef.current = `chat-${Date.now()}`;
  };

  useEffect(() => {
    setSessions(loadSessions());
  }, []);

  useEffect(() => {
    if (previousMessageCountRef.current > 0 && messages.length === 0) {
      resetSessionId();
    }
    previousMessageCountRef.current = messages.length;

    if (!messages.length) return;

    const updatedSession: ChatSession = {
      id: sessionIdRef.current,
      title: getSessionTitle(messages),
      updatedAt: Date.now(),
      messages,
    };

    setSessions((currentSessions) => {
      const nextSessions = [
        updatedSession,
        ...currentSessions.filter((session) => session.id !== updatedSession.id),
      ];
      saveSessions(nextSessions);
      return nextSessions.slice(0, 10);
    });
  }, [messages]);

  const handleNewChatClick = () => {
    resetSessionId();
    onNewChat();
  };

  return (
    <aside
      className={`fixed left-0 top-20 z-20 flex h-[calc(100vh-5rem)] transition-transform duration-200 ${
        isOpen ? "translate-x-0" : "-translate-x-72"
      }`}
    >
      <div className="w-72 border-r border-green-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-green-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-green-900">Chat History</h2>
          <button
            type="button"
            onClick={handleNewChatClick}
            className="flex items-center gap-1 rounded-full bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
          >
            <Plus className="h-3.5 w-3.5" />
            New chat
          </button>
        </div>
        <div className="h-[calc(100%-3.25rem)] overflow-y-auto p-3">
          {sessions.length ? (
            <div className="space-y-2">
              {sessions.map((session) => (
                <button
                  type="button"
                  key={session.id}
                  onClick={() => onSelectSession(session.id, session.messages)}
                  className={`w-full rounded-lg border p-3 text-left ${
                    selectedSessionId === session.id
                      ? "border-green-500 bg-green-100"
                      : "border-green-100 bg-green-50/60 hover:bg-green-50"
                  }`}
                >
                  <div className="truncate text-sm font-medium text-green-900">
                    {session.title}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {new Date(session.updatedAt).toLocaleString()}
                  </div>
                  <div className="mt-2 space-y-1">
                    {session.messages.slice(-3).map((message) => (
                      <p
                        key={message.id}
                        className="line-clamp-2 text-xs text-gray-600"
                      >
                        {message.speaker === "user" ? "You: " : "Bot: "}
                        {message.text}
                      </p>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-green-200 p-4 text-sm text-gray-500">
              No historical chats yet.
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="mt-3 h-10 rounded-r-lg border border-l-0 border-green-200 bg-white px-2 text-green-700 shadow hover:bg-green-50"
        aria-label={isOpen ? "Close chat history" : "Open chat history"}
      >
        {isOpen ? (
          <PanelLeftClose className="h-5 w-5" />
        ) : (
          <PanelLeftOpen className="h-5 w-5" />
        )}
      </button>
    </aside>
  );
}
