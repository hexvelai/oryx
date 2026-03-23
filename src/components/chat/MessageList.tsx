import { useRef, useEffect } from "react";
import type { ChatMessage, AIProvider } from "@/types/ai";
import { AI_MODELS } from "@/types/ai";

interface MessageListProps {
  messages: ChatMessage[];
  isTyping?: boolean;
  showProviderBadge?: boolean;
}

export function MessageList({ messages, isTyping, showProviderBadge }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
      {messages.length === 0 && !isTyping && (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Start a conversation...
        </div>
      )}
      {messages.map((msg, i) => (
        <div
          key={msg.id}
          className="animate-fade-up"
          style={{ animationDelay: `${Math.min(i * 40, 200)}ms` }}
        >
          <MessageBubble message={msg} showProviderBadge={showProviderBadge} />
        </div>
      ))}
      {isTyping && (
        <div className="animate-fade-up flex items-center gap-1 px-3 py-2">
          <div className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
          <div className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
          <div className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

function MessageBubble({ message, showProviderBadge }: { message: ChatMessage; showProviderBadge?: boolean }) {
  const isUser = message.role === "user";
  const provider = message.provider as AIProvider | "master" | undefined;
  const model = provider && provider !== "master" ? AI_MODELS[provider] : null;
  const colorVar = provider === "master" ? "ai-master" : model?.color;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-secondary text-foreground"
            : "bg-card border border-border text-foreground"
        }`}
      >
        {!isUser && showProviderBadge && provider && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: colorVar ? `hsl(var(--${colorVar}))` : undefined }}
            />
            <span
              className="text-xs font-medium"
              style={{ color: colorVar ? `hsl(var(--${colorVar}))` : undefined }}
            >
              {provider === "master" ? "Nexus" : model?.name}
            </span>
          </div>
        )}
        <div className="whitespace-pre-wrap break-words text-pretty">
          {message.content.split("**").map((part, i) =>
            i % 2 === 1 ? (
              <strong key={i} className="font-semibold">{part}</strong>
            ) : (
              <span key={i}>{part}</span>
            )
          )}
        </div>
      </div>
    </div>
  );
}
