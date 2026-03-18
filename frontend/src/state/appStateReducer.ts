export type AppState =
  | "disconnected"
  | "connecting"
  | "ready_idle"
  | "ready_user_listening"
  | "ready_bot_thinking"
  | "ready_bot_speaking"
  | "error";

export type Action =
  | { type: "CONNECT_REQUEST" }
  | { type: "CONNECT_SUCCESS" }
  | { type: "CONNECT_FAILURE" }
  | { type: "DISCONNECT" }
  | { type: "USER_STARTED_SPEAKING" }
  | { type: "USER_STOPPED_SPEAKING" }
  | { type: "BOT_STARTED_SPEAKING" }
  | { type: "BOT_FINISHED_SPEAKING" };

  
export function appStateReducer(state: AppState, action: Action): AppState {
  if (action.type === "DISCONNECT") return "disconnected";

  switch (state) {
    case "disconnected":
      if (action.type === "CONNECT_REQUEST") return "connecting";
      return state;

    case "connecting":
      if (action.type === "CONNECT_SUCCESS") return "ready_idle";
      if (action.type === "CONNECT_FAILURE") return "error";
      return state;

    case "ready_idle":
      if (action.type === "USER_STARTED_SPEAKING")
        return "ready_user_listening";
      if (action.type === "BOT_STARTED_SPEAKING")
        return "ready_bot_speaking";
      return state;

    case "ready_user_listening":
      if (action.type === "USER_STOPPED_SPEAKING") return "ready_bot_thinking";
      return state;

    case "ready_bot_thinking":
      if (action.type === "BOT_STARTED_SPEAKING") return "ready_bot_speaking";
      return state;

    case "ready_bot_speaking":
      if (action.type === "BOT_FINISHED_SPEAKING") return "ready_idle";
      if (action.type === "USER_STARTED_SPEAKING")
        return "ready_user_listening"; // interruption
      return state;

    case "error":
      if (action.type === "CONNECT_REQUEST") return "connecting";
      return state;

    default:
      return state;
  }
}
