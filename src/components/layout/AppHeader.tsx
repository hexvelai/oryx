import { useChatContext } from "@/context/ChatContext";
import { AI_MODELS } from "@/types/ai";
import type { AIProvider } from "@/types/ai";
import { Zap, Network, LayoutGrid, Presentation, Crown, Vote, CheckCircle2 } from "lucide-react";

export function AppHeader() {
  const { mode, setMode, activeProviders, toggleProvider } = useChatContext();

  const modes = [
    { id: "master" as const, label: "Nexus", icon: Crown, desc: "Smart router" },
    { id: "split" as const, label: "Split", icon: LayoutGrid, desc: "Side by side" },
    { id: "slideshow" as const, label: "Slide", icon: Presentation, desc: "One at a time" },
    { id: "teamwork" as const, label: "Teamwork", icon: Network, desc: "AI collab" },
    { id: "voting" as const, label: "Vote", icon: Vote, desc: "AI consensus" },
  ];

  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-card/30 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-ai-master" />
          <h1 className="font-semibold text-base tracking-tight text-foreground">
            Synapse
          </h1>
        </div>
        <span className="text-xs text-muted-foreground hidden sm:block">AI Orchestrator</span>
      </div>

      {/* Mode switcher */}
      <nav className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
        {modes.map(m => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 active:scale-95 ${
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title={m.desc}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{m.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Active AI toggles */}
      <div className="flex items-center gap-1.5">
        {(Object.keys(AI_MODELS) as AIProvider[]).map(p => {
          const model = AI_MODELS[p];
          const active = activeProviders.includes(p);
          return (
            <button
              key={p}
              onClick={() => toggleProvider(p)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200 active:scale-95 border ${
                active
                  ? "border-border bg-card"
                  : "border-transparent opacity-40 hover:opacity-70"
              }`}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: `hsl(var(--${model.color}))` }}
              />
              <span className="hidden lg:inline">{model.name}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
}
