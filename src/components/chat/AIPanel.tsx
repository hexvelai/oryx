import { AI_MODELS } from "@/types/ai";
import { useChatContext } from "@/context/ChatContext";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import type { AIProvider } from "@/types/ai";

interface AIPanelProps {
  provider: AIProvider;
  compact?: boolean;
}

export function AIPanel({ provider, compact }: AIPanelProps) {
  const { panels, sendMessage, sharedContext } = useChatContext();
  const model = AI_MODELS[provider];
  const panel = panels[provider];

  return (
    <div className={`flex flex-col h-full bg-background border border-border rounded-xl overflow-hidden ${compact ? "" : ""}`}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-card/50">
        <div
          className="w-2.5 h-2.5 rounded-full animate-pulse-glow"
          style={{ backgroundColor: `hsl(var(--${model.color}))` }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm" style={{ color: `hsl(var(--${model.color}))` }}>
              {model.name}
            </span>
            <span className="text-xs text-muted-foreground">{model.fullName}</span>
          </div>
          {!compact && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{model.description}</p>
          )}
        </div>
        {sharedContext.length > 0 && (
          <div className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {sharedContext.length} shared
          </div>
        )}
      </div>

      {/* Messages */}
      <MessageList messages={panel.messages} isTyping={panel.isTyping} />

      {/* Input */}
      <ChatInput
        onSend={(msg) => sendMessage(msg, provider)}
        placeholder={`Ask ${model.name}...`}
        accent={model.color}
        disabled={panel.isTyping}
      />
    </div>
  );
}
