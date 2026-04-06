import { useChatContext } from "@/context/ChatContext";
import { AI_MODELS } from "@/types/ai";
import type { AIProvider } from "@/types/ai";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { Badge } from "@/components/ui/badge";

export function ParallelView() {
  const { parallelMessages, sendParallelMessage, parallelTargets, providerIsTyping } = useChatContext();

  const isTyping = parallelTargets.some(p => providerIsTyping[p]);

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-background">
        <div className="min-w-0">
          <div className="font-medium text-sm text-foreground">Parallel Mode</div>
          <div className="text-xs text-muted-foreground">Same prompt to multiple AIs</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {parallelTargets.map((p: AIProvider) => {
            const model = AI_MODELS[p];
            return (
              <Badge
                key={p}
                variant="outline"
                className="rounded-md bg-card"
                style={{ color: `hsl(var(--${model.color}))` }}
              >
                {model.name}
              </Badge>
            );
          })}
        </div>
      </div>

      <MessageList messages={parallelMessages} isTyping={isTyping} showProviderBadge />

      <ChatInput
        onSend={(msg) => sendParallelMessage(msg)}
        placeholder="Ask the selected AIs…"
        disabled={false}
      />
    </div>
  );
}
