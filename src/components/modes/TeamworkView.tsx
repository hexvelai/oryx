import { useChatContext } from "@/context/ChatContext";
import { AI_MODELS } from "@/types/ai";
import { Network, ArrowRight } from "lucide-react";

export function TeamworkView() {
  const { teamworkMessages, masterMessages } = useChatContext();

  const finalMsg = masterMessages.find(m => m.provider === "master" && m.content.includes("Team Consensus"));

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
        <Network className="w-4 h-4 text-primary" />
        <span className="font-medium text-sm">Teamwork Mode</span>
        <span className="text-xs text-muted-foreground">— AIs collaborate in real-time</span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-4">
        {teamworkMessages.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            AIs are thinking together...
          </div>
        )}
        {teamworkMessages.map((msg, i) => {
          const fromModel = AI_MODELS[msg.from];
          const toLabel = msg.to === "all" ? "everyone" : AI_MODELS[msg.to as keyof typeof AI_MODELS]?.name;
          return (
            <div key={msg.id} className="animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5"
                  style={{
                    backgroundColor: `hsl(var(--${fromModel.color}) / 0.12)`,
                    color: `hsl(var(--${fromModel.color}))`,
                  }}
                >
                  {fromModel.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium" style={{ color: `hsl(var(--${fromModel.color}))` }}>
                      {fromModel.name}
                    </span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{toLabel}</span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed text-pretty">{msg.content}</p>
                </div>
              </div>
            </div>
          );
        })}

        {finalMsg && (
          <div className="animate-fade-up mt-6 p-4 rounded-xl border border-primary/20 bg-primary/5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-xs font-medium text-primary">Final Consensus</span>
            </div>
            <p className="text-sm text-foreground leading-relaxed text-pretty">
              {finalMsg.content.replace("**Team Consensus:** ", "")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
