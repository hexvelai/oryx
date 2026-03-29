import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Clock3 } from "lucide-react";
import { useMutation as useConvexMutation, useQuery as useConvexQuery } from "convex/react";
import { AI_MODELS } from "@/types/ai";
import type { AIProvider } from "@/types/ai";
import { convexApi } from "@/lib/convex-api";
import { DEEP_DIVE_PROVIDERS, type DeepDiveUIMessage } from "@/lib/deep-dive-types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";

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

function lastMessagePreview(messages: DeepDiveUIMessage[]) {
  const last = messages[messages.length - 1];
  const text = last?.parts
    ?.filter(part => part.type === "text" || part.type === "reasoning")
    .map(part => part.text)
    .join("\n") ?? "";
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  return firstLine || "No messages yet";
}

export default function DeepDives() {
  const navigate = useNavigate();
  const deepDives = useConvexQuery(convexApi.deepDives.list, {}) ?? [];
  const myInvites = useConvexQuery(convexApi.deepDives.listMyInvites, {}) ?? [];
  const createDeepDive = useConvexMutation(convexApi.deepDives.createDeepDive);
  const createInvite = useConvexMutation(convexApi.deepDives.createInvite);
  const acceptInvite = useConvexMutation(convexApi.deepDives.acceptInvite);
  const declineInvite = useConvexMutation(convexApi.deepDives.declineInvite);
  const availableProviders = DEEP_DIVE_PROVIDERS;

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedProviders, setSelectedProviders] = useState<AIProvider[]>(availableProviders.length ? availableProviders : ["gpt"]);
  const [inviteText, setInviteText] = useState("");
  const [pendingDeepDiveId, setPendingDeepDiveId] = useState<string | null>(null);
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [sendingInvites, setSendingInvites] = useState(false);

  const shareLink = useMemo(() => {
    if (!pendingInviteToken) return "";
    return `${window.location.origin}/invite/${pendingInviteToken}`;
  }, [pendingInviteToken]);

  const onNew = () => {
    setOpen(true);
    setStep(1);
    setInviteText("");
    setPendingDeepDiveId(null);
    setPendingInviteToken(null);
    setSelectedProviders(availableProviders.length ? availableProviders : ["gpt"]);
  };

  const onClose = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setStep(1);
      setInviteText("");
      setPendingDeepDiveId(null);
      setPendingInviteToken(null);
      setSelectedProviders(availableProviders.length ? availableProviders : ["gpt"]);
    }
  };

  const toggleProvider = (p: AIProvider) => {
    setSelectedProviders(prev => (prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]));
  };

  const goStep2 = async () => {
    setCreating(true);
    try {
      const deepDiveId = await createDeepDive({ providers: selectedProviders, title: "New Deep Dive" });
      if (!deepDiveId) return;
      setPendingDeepDiveId(String(deepDiveId));
      const invite = await createInvite({ deepDiveId: String(deepDiveId), role: "editor" });
      setPendingInviteToken(invite.token);
      setStep(2);
    } finally {
      setCreating(false);
    }
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

  const sendEmailInvites = async () => {
    if (!pendingDeepDiveId) return;
    const emails = inviteText
      .split(/[,\s]+/g)
      .map((value) => value.trim())
      .filter(Boolean)
      .filter((value) => value.includes("@"));
    if (emails.length === 0) return;

    setSendingInvites(true);
    try {
      await Promise.all(
        emails.map((email) =>
          createInvite({
            deepDiveId: pendingDeepDiveId,
            email,
            role: "editor",
          }),
        ),
      );
      setInviteText("");
    } finally {
      setSendingInvites(false);
    }
  };

  const accept = async (token: string) => {
    const result = await acceptInvite({ token });
    navigate(`/dive/${result.deepDiveId}`);
  };

  const decline = async (token: string) => {
    await declineInvite({ token });
  };

  return (
    <div className="app-canvas min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 pb-12 pt-8 sm:px-6">
        {myInvites.length ? (
          <section className="space-y-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Invitations</div>
              <h2 className="mt-2 text-2xl text-foreground">Join a workspace</h2>
            </div>
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {myInvites.map((invite) => (
                <div
                  key={invite.token}
                  className="surface-panel rounded-[24px] p-4"
                >
                  <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Deep Dive</div>
                  <div className="mt-2 truncate text-[22px] leading-none text-foreground">{invite.title}</div>
                  <div className="mt-3 text-sm text-muted-foreground">Role: <span className="text-foreground">{invite.role}</span></div>
                  <div className="mt-4 flex gap-2">
                    <Button className="h-10 flex-1 rounded-full" onClick={() => void accept(invite.token)}>
                      Accept invite
                    </Button>
                    <Button variant="outline" className="h-10 flex-1 rounded-full" onClick={() => void decline(invite.token)}>
                      Deny
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="relative space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Open work</div>
              <h1 className="mt-2 text-3xl text-foreground sm:text-4xl">Recent projects</h1>
            </div>
            {deepDives.length > 0 ? (
              <Button
                onClick={onNew}
                className="h-11 rounded-full bg-primary px-5 text-sm text-primary-foreground shadow-sm"
              >
                Create Deep Dive
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : null}
          </div>

          {deepDives.length === 0 ? (
            <div className="relative min-h-[340px] rounded-[28px] border border-dashed border-border/70 bg-white/40 p-8 dark:bg-white/[0.03]">
              <div className="absolute right-6 top-6 z-10 hidden sm:block">
                <Button
                  onClick={onNew}
                  className="h-11 rounded-full bg-primary px-5 text-sm text-primary-foreground shadow-sm"
                >
                  Create Deep Dive
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="pointer-events-none absolute inset-0 grid place-items-center px-8">
                <div className="max-w-md text-center">
                  <div className="text-2xl text-foreground">Click here to start your first project</div>
                  <div className="mt-2 text-sm leading-7 text-muted-foreground">Create a Deep Dive to start chatting and collaborating.</div>
                </div>
              </div>
              <div className="pointer-events-none absolute right-20 top-14 hidden text-foreground/60 sm:block">
                <svg width="260" height="140" viewBox="0 0 260 140" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <marker id="empty-state-arrowhead" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto" markerUnits="strokeWidth">
                      <path
                        d="M1 1 L10 6 L1 11"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </marker>
                  </defs>
                  <path
                    d="M16 128 C 86 152, 150 132, 196 98 C 224 76, 236 56, 244 38"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray="2 8"
                    markerEnd="url(#empty-state-arrowhead)"
                  />
                </svg>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {deepDives.map(dive => {
              const lastThread = dive.threads.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
              const preview = lastThread ? lastMessagePreview(lastThread.messages) : "No messages yet";
              return (
                <button
                  key={dive.id}
                  type="button"
                  onClick={() => navigate(`/dive/${dive.id}`)}
                  className="surface-panel group rounded-[24px] p-4 text-left transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(58,43,31,0.08)] dark:hover:shadow-[0_20px_48px_rgba(0,0,0,0.34)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Project</div>
                      <h3 className="mt-2 truncate text-[24px] leading-none text-foreground">{dive.title}</h3>
                    </div>
                    <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[11px] text-muted-foreground dark:bg-white/[0.06]">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatRelative(dive.updatedAt)}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {dive.providers.map(provider => (
                      <div
                        key={provider}
                        className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/70 px-2.5 py-1 text-[11px] dark:bg-white/[0.05]"
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: `hsl(var(--${AI_MODELS[provider].color}))` }}
                        />
                        <span className="text-foreground">{AI_MODELS[provider].name}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Threads</div>
                    <div className="text-sm font-medium text-foreground">{dive.threads.length}</div>
                  </div>

                  <div className="mt-4 rounded-[20px] border border-border/70 bg-white/55 px-4 py-3.5 dark:bg-white/[0.04]">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Latest thread</div>
                    <div className="mt-2 truncate text-sm font-medium text-foreground">
                      {lastThread?.title ?? "Thread 1"}
                    </div>
                    <p className="mt-1.5 truncate text-sm text-muted-foreground">
                      {preview}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </main>

      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="border-border/70 bg-[rgba(255,255,255,0.92)] backdrop-blur-xl dark:bg-[rgba(18,22,30,0.94)] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {step === 1 ? "New Deep Dive" : "Share this workspace"}
            </DialogTitle>
          </DialogHeader>

          {step === 1 && (
            <div className="space-y-4">
              <div className="text-sm leading-6 text-muted-foreground">
                Pick the models you want in the project from the beginning. You can branch conversations later without
                losing the original thread.
              </div>
              <div className="space-y-2">
                {availableProviders.map(provider => {
                  const model = AI_MODELS[provider];
                  const checked = selectedProviders.includes(provider);
                  return (
                    <label
                      key={provider}
                      className="flex items-center gap-3 rounded-2xl border border-border/80 bg-white/80 px-4 py-3 transition-colors hover:bg-accent/70 dark:bg-white/[0.05]"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleProvider(provider)} />
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold"
                        style={{ backgroundColor: `hsl(var(--${model.color}) / 0.14)`, color: `hsl(var(--${model.color}))` }}
                      >
                        {model.name.slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">{model.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{model.fullName}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="text-sm leading-6 text-muted-foreground">
                Invite collaborators by email or share the link below. Anyone with the link can join with the configured
                access level.
              </div>
              <Input
                value={inviteText}
                onChange={(e) => setInviteText(e.target.value)}
                placeholder="Emails (comma-separated)"
                className="rounded-2xl bg-white/80 dark:bg-white/[0.05]"
              />
              <Button
                variant="outline"
                onClick={sendEmailInvites}
                disabled={!pendingDeepDiveId || sendingInvites || inviteText.trim().length === 0}
                className="w-full rounded-full"
              >
                Create invites
              </Button>
              <div className="rounded-2xl border border-border/80 bg-white/75 px-4 py-3 dark:bg-white/[0.05]">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Share link</div>
                <div className="mt-2 break-all text-sm text-foreground">{shareLink}</div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {step === 1 && (
              <>
                <Button variant="outline" onClick={() => onClose(false)} className="rounded-full">
                  Cancel
                </Button>
                <Button onClick={goStep2} disabled={selectedProviders.length === 0 || creating} className="rounded-full">
                  Continue
                </Button>
              </>
            )}

            {step === 2 && (
              <>
                <Button variant="outline" onClick={copyLink} className="rounded-full">
                  Copy link
                </Button>
                <Button onClick={openDive} className="rounded-full">
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
