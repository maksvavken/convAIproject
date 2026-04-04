import { Mic, MicOff, Send } from "lucide-react";

interface ChatInputProps {
  onMicToggle: () => void;
  isMicEnabled: boolean;
  disabled?: boolean;
}

export function ChatInput({
  onMicToggle,
  isMicEnabled,
  disabled = false,
}: ChatInputProps) {
  return (
    <div className="flex items-center gap-2 px-1 mb-4 h-12 rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-100">
      <button
        onClick={onMicToggle}
        disabled={disabled}
        className="w-10 h-10 rounded-full border flex items-center justify-center transition-all duration-150 hover:scale-105 hover:bg-gray-300 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label={isMicEnabled ? "Mute microphone" : "Unmute microphone"}
        type="button"
      >
        {isMicEnabled ? (
          <Mic className="w-5 h-5" />
        ) : (
          <MicOff className="w-5 h-5" />
        )}
      </button>

      <input
        type="text"
        placeholder="Ask me about nutrition..."
        className="flex-1 h-full bg-transparent focus:outline-none"
      />

      <button className="w-10 h-10 rounded-full bg-green-200 text-white border flex items-center justify-center transition-all duration-150 hover:scale-105 hover:bg-green-400 active:scale-95">
        <Send className="w-5 h-5" />
      </button>
    </div>
  );
}
