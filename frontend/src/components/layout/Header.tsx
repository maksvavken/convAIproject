import {Leaf} from "lucide-react";
import { CONVERSATION_INFO_DISPLAYED } from "../../conversationInfoDisplayed";
import { ClientStatus } from "@pipecat-ai/voice-ui-kit";
import type { ReactNode } from "react";

interface HeaderProps {
  rightAccessory?: ReactNode;
}

export function Header({ rightAccessory }: HeaderProps) {
    return (
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-card/80 backdrop-blur-xl">
        <div className="flex items-center gap-3 w-full">
          {/*Leaf Icon */}
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-sm">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <div className="relative z-10 flex items-center justify-between w-full">
            {/* Page Title and Title Description */}
            <div>
              <h1 className="font-semibold text-gray-700">
                {CONVERSATION_INFO_DISPLAYED.pageTitle}
              </h1>
              <p className="text-xs text-gray-500">
                {CONVERSATION_INFO_DISPLAYED.pageTitleDescription}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {rightAccessory}
              <ClientStatus />
            </div>
          </div>
        </div>
      </header>
    )
}
