import { Apple, Carrot, Leaf, Salad } from "lucide-react";
import {
    CONVERSATION_INFO_DISPLAYED,
  } from "../conversationInfoDisplayed";

export function WelcomeHero() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center animate-fade-up">
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-full bg-green-500 shadow-lg flex items-center justify-center  animate-float">
          <Leaf className="w-12 h-12 text-white" />
        </div>
        <div className="absolute -top-2 -right-2 w-10 h-10 rounded-full bg-orange-400 shadow-lg flex items-center justify-center animate-float-fast">
          <Apple className="w-5 h-5 text-white" />
        </div>
        <div className="absolute -bottom-1 -left-3 w-8 h-8 rounded-full bg-gray-100 shadow-lg flex items-center justify-center">
          <Carrot className="w-4 h-4 text-green-600" />
        </div>
      </div>
      <h1 className="text-3xl md:text-4xl font-bold text-gray-700 mb-3">
        {CONVERSATION_INFO_DISPLAYED.pageTitle}
      </h1>
      <p className="text-lg text-gray-500 mb-8 max-w-md">
        {CONVERSATION_INFO_DISPLAYED.welcomeHeroDescription}
      </p>
    </div>
  );
}
