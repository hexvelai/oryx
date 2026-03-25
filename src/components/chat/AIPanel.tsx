import { AI_MODELS } from "@/types/ai";
import { useChatContext } from "@/context/ChatContext";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import type { AIProvider } from "@/types/ai";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AIPanelProps {
  provider: AIProvider;
  compact?: boolean;
}

export function AIPanel({ provider, compact }: AIPanelProps) {
  const { getProviderMessages, providerIsTyping, sendMessage, sharedContext } = useChatContext();
  const model = AI_MODELS[provider];
  const messages = getProviderMessages(provider);
  const isTyping = providerIsTyping[provider];

  return (
    <Card className="flex flex-col h-full overflow-hidden shadow-sm">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-background">
        <div
          className="h-2 w-2 rounded-full"
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
          <Badge variant="secondary" className="rounded-md">
            {sharedContext.length} shared
          </Badge>
        )}
      </div>

      <MessageList messages={messages} isTyping={isTyping} />

      <ChatInput
        onSend={(msg) => sendMessage(msg, provider)}
        placeholder={`Ask ${model.name}...`}
        disabled={isTyping}
      />
    </Card>
  );
}
