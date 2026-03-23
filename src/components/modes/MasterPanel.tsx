import { useChatContext } from "@/context/ChatContext";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { Crown } from "lucide-react";

export function MasterPanel() {
  const { masterMessages, sendMessage, startTeamwork, startVoting } = useChatContext();

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto w-full">
      {/* Hero area when empty */}
      {masterMessages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Crown className="w-7 h-7 text-primary" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-xl font-semibold text-foreground text-balance">
              What would you like to figure out?
            </h2>
            <p className="text-sm text-muted-foreground max-w-md text-pretty">
              Nexus routes your prompts to the best AI for the job. Or switch modes for collaborative problem-solving.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => startTeamwork("Help me design the architecture for a real-time collaboration app")}
              className="px-4 py-2 rounded-lg bg-card border border-border text-sm text-foreground hover:bg-accent transition-colors duration-200 active:scale-[0.97]"
            >
              🤝 Try Teamwork
            </button>
            <button
              onClick={() => startVoting("Which approach is best for handling state management in a large React app?")}
              className="px-4 py-2 rounded-lg bg-card border border-border text-sm text-foreground hover:bg-accent transition-colors duration-200 active:scale-[0.97]"
            >
              🗳️ Try Voting
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      {masterMessages.length > 0 && (
        <MessageList messages={masterMessages} showProviderBadge />
      )}

      {/* Input */}
      <ChatInput
        onSend={(msg) => sendMessage(msg, "master")}
        placeholder="Ask Nexus anything — it'll pick the best AI..."
      />
    </div>
  );
}
