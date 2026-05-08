type Speaker = "user" | "bot";
type MessageStatus = "streaming" | "final";

type ChatTranscriptAction =
  | { type: "USER_TRANSCRIPT_UPDATED"; text: string }
  | { type: "BOT_TRANSCRIPT_UPDATED"; text: string }
  | { type: "USER_MESSAGE_FINALIZED" }
  | { type: "BOT_MESSAGE_FINALIZED" }
  | { type: "BOT_MESSAGE_RESET" }
  | { type: "RESET_CHAT" };

interface ChatMessage {
  id: string;
  speaker: Speaker;
  text: string;
  status: MessageStatus;
  timestamp: number;
}

interface ChatTranscriptState {
  messages: ChatMessage[];
  liveUserMessage: ChatMessage | null;
  liveBotMessage: ChatMessage | null;
}

const initialChatTranscriptState: ChatTranscriptState = {
  messages: [
    {
      id: "initial-greeting",
      speaker: "bot",
      text: "Hi! I'm your AI Nutrition Expert. I can help you with diet recommendations or specific food nutrition data. Would you like to start with some diet recommendations, like the Mediterranean diet?",
      status: "final",
      timestamp: Date.now(),
    },
  ],
  liveUserMessage: null,
  liveBotMessage: null,
};

const mergeUserText = (existingText: string, newText: string): string => {
  const existing = existingText.trim();
  const incoming = newText.trim();

  if (!incoming) return existing;
  if (!existing) return incoming;
  if (existing === incoming) return existing;

  if (incoming.startsWith(existing)) return incoming;
  if (existing.startsWith(incoming)) return existing;

  const maxOverlap = Math.min(existing.length, incoming.length);

  for (let i = maxOverlap; i > 0; i--) {
    if (existing.slice(-i) === incoming.slice(0, i)) {
      return existing + incoming.slice(i);
    }
  }

  return `${existing} ${incoming}`;
};

const stripStructuredTail = (text: string): string => {
  // Cut at the first structured marker and drop the marker itself.
  const markerMatch = text.match(/^(.*?)(?:-{2,3}\s*JSON(?:-+)?|```json)\b/is);
  return markerMatch ? markerMatch[1].trim() : text.trim();
};

const mergeBotText = (existingText: string, newText: string): string => {
  const existing = existingText.trim();
  const incoming = stripStructuredTail(newText);

  // If the total text now looks identical or smaller, keep the existing text
  if (!incoming && existing) return existing;
  if (!incoming) return "";
  if (!existing) return incoming;
  
  // If incoming is a full replacement stream update, keep it sanitized.
  if (incoming.startsWith(existing)) {
    return incoming;
  }
  
  if (existing.startsWith(incoming)) return existing;

  return incoming;
};

const chatTranscriptReducer = (
  state: ChatTranscriptState,
  action: ChatTranscriptAction,
): ChatTranscriptState => {
  switch (action.type) {
    case "USER_TRANSCRIPT_UPDATED": {
      const text = action.text.trim();
      if (!text) return state;

      if (!state.liveUserMessage) {
        const now = Date.now();

        return {
          ...state,
          liveUserMessage: {
            id: `user-${now}`,
            speaker: "user",
            text,
            status: "streaming",
            timestamp: now,
          },
        };
      }

      const mergedText = mergeUserText(state.liveUserMessage.text, text);

      if (mergedText === state.liveUserMessage.text) {
        return state;
      }

      return {
        ...state,
        liveUserMessage: {
          ...state.liveUserMessage,
          text: mergedText,
        },
      };
    }

    case "BOT_TRANSCRIPT_UPDATED": {
      const text = stripStructuredTail(action.text);
      if (!text) return state;

      // If text is now empty but we are in the middle of a message,
      // we might have hit the structured block. Keep existing text.
      if (!text && state.liveBotMessage) {
        return state;
      }

      if (!state.liveBotMessage) {
        const now = Date.now();

        return {
          ...state,
          liveBotMessage: {
            id: `bot-${now}`,
            speaker: "bot",
            text,
            status: "streaming",
            timestamp: now,
          },
        };
      }

      const mergedText = mergeBotText(state.liveBotMessage.text, text);

      if (mergedText === state.liveBotMessage.text) {
        return state;
      }

      return {
        ...state,
        liveBotMessage: {
          ...state.liveBotMessage,
          text: mergedText,
        },
      };
    }

    case "USER_MESSAGE_FINALIZED": {
      if (!state.liveUserMessage || !state.liveUserMessage.text.trim()) {
        return state;
      }

      return {
        ...state,
        messages: [
          ...state.messages,
          {
            ...state.liveUserMessage,
            status: "final",
          },
        ],
        liveUserMessage: null,
      };
    }

    case "BOT_MESSAGE_FINALIZED": {
      if (!state.liveBotMessage || !state.liveBotMessage.text.trim()) {
        return state;
      }

      return {
        ...state,
        messages: [
          ...state.messages,
          {
            ...state.liveBotMessage,
            status: "final",
          },
        ],
        liveBotMessage: null,
      };
    }

    case "BOT_MESSAGE_RESET": {
      return {
        ...state,
        liveBotMessage: null,
      };
    }

    case "RESET_CHAT": {
      return initialChatTranscriptState;
    }

    default:
      return state;
  }
};

export type {
  Speaker,
  MessageStatus,
  ChatTranscriptAction,
  ChatMessage,
  ChatTranscriptState,
};

export {
  initialChatTranscriptState,
  chatTranscriptReducer,
  mergeUserText,
  mergeBotText,
};