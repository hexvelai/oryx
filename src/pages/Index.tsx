import { useChatContext } from "@/context/ChatContext";
import { AppHeader } from "@/components/layout/AppHeader";
import { AIPanel } from "@/components/chat/AIPanel";
import { TeamworkView } from "@/components/modes/TeamworkView";
import { VotingView } from "@/components/modes/VotingView";
import { SlideshowView } from "@/components/modes/SlideshowView";
import { ParallelView } from "@/components/modes/ParallelView";

function AppContent() {
  const { mode, activeProviders } = useChatContext();

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <AppHeader />
      <main className="flex-1 overflow-hidden">
        {mode === "split" && (
          <div
            className="grid h-full gap-3 p-3"
            style={{
              gridTemplateColumns: activeProviders.length <= 2
                ? `repeat(${activeProviders.length}, 1fr)`
                : "repeat(2, 1fr)",
              gridTemplateRows: activeProviders.length > 2 ? "repeat(2, 1fr)" : "1fr",
            }}
          >
            {activeProviders.map(p => (
              <AIPanel key={p} provider={p} compact={activeProviders.length > 2} />
            ))}
          </div>
        )}

        {mode === "slideshow" && <SlideshowView />}
        {mode === "parallel" && <ParallelView />}
        {mode === "teamwork" && <TeamworkView />}
        {mode === "voting" && <VotingView />}
      </main>
    </div>
  );
}

export default function Index() {
  return <AppContent />;
}
