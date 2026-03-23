import { useChatContext } from "@/context/ChatContext";
import { AI_MODELS } from "@/types/ai";
import { Vote, ThumbsUp, Trophy } from "lucide-react";

export function VotingView() {
  const { voteResults } = useChatContext();

  const winner = voteResults.length > 0
    ? [...voteResults].sort((a, b) => b.votes.length - a.votes.length)[0]
    : null;

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
        <Vote className="w-4 h-4 text-primary" />
        <span className="font-medium text-sm">Voting Mode</span>
        <span className="text-xs text-muted-foreground">— AIs propose and vote on solutions</span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-4">
        {voteResults.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            <div className="flex items-center gap-1.5">
              <div className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              <div className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              <div className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              <span className="ml-2">AIs are deliberating...</span>
            </div>
          </div>
        )}
        {voteResults.map((result, i) => {
          const model = AI_MODELS[result.provider];
          const isWinner = winner?.provider === result.provider;
          return (
            <div
              key={result.provider}
              className="animate-fade-up"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div
                className={`p-4 rounded-xl border transition-shadow ${
                  isWinner ? "border-primary/30 bg-primary/5 shadow-sm" : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-semibold"
                      style={{
                        backgroundColor: `hsl(var(--${model.color}) / 0.12)`,
                        color: `hsl(var(--${model.color}))`,
                      }}
                    >
                      {model.name[0]}
                    </div>
                    <span className="font-medium text-sm" style={{ color: `hsl(var(--${model.color}))` }}>
                      {model.name}
                    </span>
                    {isWinner && (
                      <div className="flex items-center gap-1 text-primary text-xs font-medium">
                        <Trophy className="w-3 h-3" /> Winner
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ThumbsUp className="w-3 h-3" />
                    {result.votes.length} votes
                  </div>
                </div>
                <p className="text-sm text-foreground leading-relaxed mb-2 text-pretty">{result.response}</p>
                {result.votes.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="text-xs text-muted-foreground">Voted by:</span>
                    {result.votes.map(v => (
                      <span
                        key={v}
                        className="text-xs px-1.5 py-0.5 rounded-md"
                        style={{
                          backgroundColor: `hsl(var(--${AI_MODELS[v].color}) / 0.1)`,
                          color: `hsl(var(--${AI_MODELS[v].color}))`,
                        }}
                      >
                        {AI_MODELS[v].name}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground italic mt-2">{result.reasoning}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
