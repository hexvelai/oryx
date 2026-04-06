import { useChatContext } from "@/context/ChatContext";
import { AIPanel } from "@/components/chat/AIPanel";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AI_MODELS } from "@/types/ai";
import { Button } from "@/components/ui/button";

function groupLabel(updatedAt: number) {
  const startOfDay = (ms: number) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const now = Date.now();
  const diffDays = Math.floor((startOfDay(now) - startOfDay(updatedAt)) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return "Last 7 days";
}

export function SlideshowView() {
  const {
    activeProviders,
    currentSlide,
    setCurrentSlide,
    providerSessions,
    activeProviderSessionId,
    setActiveProviderSession,
    createProviderSession,
  } = useChatContext();

  if (activeProviders.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Enable at least one AI model
      </div>
    );
  }

  const current = activeProviders[currentSlide % activeProviders.length];
  const sessionsByGroup = providerSessions[current]
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .reduce<Record<string, typeof providerSessions[typeof current]>>((acc, s) => {
      const label = groupLabel(s.updatedAt);
      acc[label] = acc[label] ? [...acc[label], s] : [s];
      return acc;
    }, {});

  return (
    <div className="flex h-full w-full">
      <aside className="w-[240px] bg-muted/40 border-r border-border px-3 py-3 overflow-y-auto scrollbar-thin">
        <Button
          variant="outline"
          size="sm"
          onClick={() => createProviderSession(current)}
          className="w-full justify-start"
        >
          New chat
        </Button>

        <div className="mt-4 space-y-4">
          {Object.entries(sessionsByGroup).map(([label, sessions]) => (
            <div key={label}>
              <div className="text-[11px] tracking-wide text-muted-foreground uppercase mb-1.5">
                {label}
              </div>
              <div className="space-y-1">
                {sessions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setActiveProviderSession(current, s.id)}
                    className={`w-full text-left text-[13px] px-2 py-1.5 truncate rounded-md transition-colors ${
                      s.id === activeProviderSessionId[current]
                        ? "bg-background text-foreground"
                        : "text-foreground/80 hover:text-foreground hover:bg-accent/60"
                    }`}
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col relative">
        <div className="flex items-center justify-center gap-2 py-2">
          {activeProviders.map((p, i) => {
            const model = AI_MODELS[p];
            return (
              <Button
                key={p}
                onClick={() => setCurrentSlide(i)}
                variant={i === currentSlide % activeProviders.length ? "secondary" : "ghost"}
                size="sm"
                className="gap-1.5"
              >
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: `hsl(var(--${model.color}))` }}
                />
                {model.name}
              </Button>
            );
          })}
        </div>

        <div className="flex-1 px-4 pb-4">
          <AIPanel provider={current} />
        </div>

        {activeProviders.length > 1 && (
          <>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentSlide((currentSlide - 1 + activeProviders.length) % activeProviders.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground shadow-sm"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentSlide((currentSlide + 1) % activeProviders.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground shadow-sm"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
