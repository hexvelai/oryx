import { useChatContext } from "@/context/ChatContext";
import { AIPanel } from "@/components/chat/AIPanel";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AI_MODELS } from "@/types/ai";

export function SlideshowView() {
  const { activeProviders, currentSlide, setCurrentSlide } = useChatContext();

  if (activeProviders.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Enable at least one AI model
      </div>
    );
  }

  const current = activeProviders[currentSlide % activeProviders.length];

  return (
    <div className="flex flex-col h-full relative">
      {/* Navigation dots */}
      <div className="flex items-center justify-center gap-2 py-2">
        {activeProviders.map((p, i) => {
          const model = AI_MODELS[p];
          return (
            <button
              key={p}
              onClick={() => setCurrentSlide(i)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all active:scale-[0.97] ${
                i === currentSlide % activeProviders.length
                  ? "bg-card border border-border shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: `hsl(var(--${model.color}))` }}
              />
              {model.name}
            </button>
          );
        })}
      </div>

      {/* Panel */}
      <div className="flex-1 px-4 pb-4">
        <AIPanel provider={current} />
      </div>

      {/* Arrow navigation */}
      {activeProviders.length > 1 && (
        <>
          <button
            onClick={() => setCurrentSlide((currentSlide - 1 + activeProviders.length) % activeProviders.length)}
            className="absolute left-1 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground transition-colors active:scale-95 shadow-sm"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentSlide((currentSlide + 1) % activeProviders.length)}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground transition-colors active:scale-95 shadow-sm"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}
