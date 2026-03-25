import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChatContext } from "@/context/ChatContext";
import { AI_MODELS } from "@/types/ai";
import type { AIProvider } from "@/types/ai";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function formatRelative(ts: number) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / (60 * 1000));
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function lastMessagePreview(messages: { content: string }[]) {
  const last = messages[messages.length - 1]?.content ?? "";
  const firstLine = last.split("\n")[0]?.trim() ?? "";
  return firstLine || "—";
}

export default function DeepDives() {
  const navigate = useNavigate();
  const { deepDives, createDeepDive, availableProviders } = useChatContext();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedProviders, setSelectedProviders] = useState<AIProvider[]>(availableProviders.length ? availableProviders : ["gpt"]);
  const [inviteText, setInviteText] = useState("");
  const [pendingDeepDiveId, setPendingDeepDiveId] = useState<string | null>(null);

  const shareLink = useMemo(() => {
    if (!pendingDeepDiveId) return "";
    return `${window.location.origin}/dive/${pendingDeepDiveId}`;
  }, [pendingDeepDiveId]);

  const onNew = () => {
    setOpen(true);
    setStep(1);
    setInviteText("");
    setPendingDeepDiveId(null);
    setSelectedProviders(availableProviders.length ? availableProviders : ["gpt"]);
  };

  const onClose = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setStep(1);
      setInviteText("");
      setPendingDeepDiveId(null);
      setSelectedProviders(availableProviders.length ? availableProviders : ["gpt"]);
    }
  };

  const toggleProvider = (p: AIProvider) => {
    setSelectedProviders(prev => (prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]));
  };

  const goStep2 = () => {
    const id = createDeepDive({ providers: selectedProviders, title: "New Deep Dive" });
    setPendingDeepDiveId(id);
    setStep(2);
  };

  const openDive = () => {
    if (!pendingDeepDiveId) return;
    onClose(false);
    navigate(`/dive/${pendingDeepDiveId}`);
  };

  const copyLink = async () => {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <AppHeader />

      <main className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6">
        <div className="mx-auto w-full max-w-6xl">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h1 className="font-semibold text-base tracking-tight text-foreground">Deep Dives</h1>
            <div className="text-xs text-muted-foreground hidden sm:block">Projects and threads</div>
          </div>
          <Button variant="outline" onClick={onNew}>
            New Deep Dive
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {deepDives.map(d => {
            const lastThread = d.threads.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
            const preview = lastThread ? lastMessagePreview(lastThread.messages) : "—";
            return (
              <Card key={d.id} className="p-0">
                <button
                  onClick={() => navigate(`/dive/${d.id}`)}
                  className="w-full text-left rounded-lg p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-sm text-foreground truncate">{d.title}</div>
                    <div className="text-xs text-muted-foreground shrink-0">{formatRelative(d.updatedAt)}</div>
                  </div>

                  <div className="mt-2 flex items-center gap-1.5">
                    {d.providers.map(p => (
                      <div
                        key={p}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-semibold text-foreground ring-1 ring-border"
                        style={{ backgroundColor: `hsl(var(--${AI_MODELS[p].color}) / 0.18)` }}
                        title={AI_MODELS[p].name}
                      >
                        {AI_MODELS[p].name.slice(0, 1)}
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 text-[13px] text-muted-foreground truncate">
                    {preview}
                  </div>
                </button>
              </Card>
            );
          })}
        </div>
        </div>
      </main>

      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {step === 1 ? "New Deep Dive" : "Invite humans (optional)"}
            </DialogTitle>
          </DialogHeader>

          {step === 1 && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Pick the AIs participating in this Deep Dive.
              </div>
              <div className="space-y-2">
                {availableProviders.map(p => {
                  const model = AI_MODELS[p];
                  const checked = selectedProviders.includes(p);
                  return (
                    <label
                      key={p}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 cursor-pointer hover:bg-accent transition-colors"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleProvider(p)} />
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold"
                        style={{ backgroundColor: `hsl(var(--${model.color}) / 0.18)`, color: `hsl(var(--${model.color}))` }}
                      >
                        {model.name.slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">{model.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{model.fullName}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Invite via email, or copy a link.
              </div>
              <Input
                value={inviteText}
                onChange={(e) => setInviteText(e.target.value)}
                placeholder="Emails (comma-separated)"
              />
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground truncate">{shareLink}</div>
                <Button variant="outline" size="sm" onClick={copyLink}>
                  Copy link
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {step === 1 && (
              <>
                <Button variant="outline" onClick={() => onClose(false)}>
                  Cancel
                </Button>
                <Button onClick={goStep2} disabled={selectedProviders.length === 0}>
                  Next
                </Button>
              </>
            )}

            {step === 2 && (
              <>
                <Button variant="outline" onClick={() => onClose(false)}>
                  Done
                </Button>
                <Button onClick={openDive}>
                  Open Deep Dive
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
