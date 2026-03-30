import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Clock3, Layers, MessageSquareText, MoreHorizontal, PencilLine, Plus, Trash2 } from "lucide-react";
import { useMutation as useConvexMutation, useQuery as useConvexQuery } from "convex/react";
import { AI_MODELS } from "@/types/ai";
import type { AIProvider } from "@/types/ai";
import { convexApi } from "@/lib/convex-api";
import { DEEP_DIVE_PROVIDERS, type DeepDiveUIMessage } from "@/lib/deep-dive-types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
  const text = last?.parts?.filter((p) => p.type === "text" || p.type === "reasoning").map((p) => p.text).join("\n") ?? "";
  return text.split("\n")[0]?.trim() || "No messages yet";
}

export default function DeepDives() {
  const navigate = useNavigate();
  const deepDives = useConvexQuery(convexApi.deepDives.list, {}) ?? [];
  const myInvites = useConvexQuery(convexApi.deepDives.listMyInvites, {}) ?? [];
  const createDeepDive = useConvexMutation(convexApi.deepDives.createDeepDive);
  const acceptInvite = useConvexMutation(convexApi.deepDives.acceptInvite);
  const declineInvite = useConvexMutation(convexApi.deepDives.declineInvite);
  const updateDeepDiveTitle = useConvexMutation(convexApi.deepDives.updateDeepDiveTitle);
  const deleteDeepDive = useConvexMutation(convexApi.deepDives.deleteDeepDive);
  const availableProviders = DEEP_DIVE_PROVIDERS;

  const [open, setOpen] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<AIProvider[]>(availableProviders.length ? availableProviders : ["gpt"]);
  const [creating, setCreating] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDiveId, setRenameDiveId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [savingRename, setSavingRename] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const onNew = () => { setOpen(true); setProjectTitle(""); setSelectedProviders(availableProviders.length ? availableProviders : ["gpt"]); };
  const onClose = (v: boolean) => { setOpen(v); if (!v) { setProjectTitle(""); setSelectedProviders(availableProviders.length ? availableProviders : ["gpt"]); } };
  const toggleProvider = (p: AIProvider) => setSelectedProviders((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const createProject = async () => {
    if (selectedProviders.length === 0) return;
    setCreating(true);
    try { const id = await createDeepDive({ providers: selectedProviders, title: projectTitle.trim() || "New Project" }); onClose(false); navigate(`/dive/${id}`); } finally { setCreating(false); }
  };
  const accept = async (token: string) => { const r = await acceptInvite({ token }); navigate(`/dive/${r.deepDiveId}`); };
  const decline = async (token: string) => { await declineInvite({ token }); };
  const openRename = (d: { id: string; title: string }) => { setRenameDiveId(d.id); setRenameTitle(d.title); setRenameError(null); setRenameOpen(true); };
  const submitRename = async () => {
    if (!renameDiveId) return; setRenameError(null); setSavingRename(true);
    try { await updateDeepDiveTitle({ deepDiveId: renameDiveId, title: renameTitle }); setRenameOpen(false); setRenameDiveId(null); setRenameTitle(""); } catch (e) { setRenameError(e instanceof Error ? e.message : "Could not rename"); } finally { setSavingRename(false); }
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return; setDeleteError(null); setDeleting(true);
    try { await deleteDeepDive({ deepDiveId: deleteTarget.id }); setDeleteTarget(null); } catch (e) { setDeleteError(e instanceof Error ? e.message : "Could not delete"); } finally { setDeleting(false); }
  };

  return (
    <div className="min-h-screen gradient-bg-subtle">
      <AppHeader />

      {/* Hero section with floating orbs */}
      <div className="relative overflow-hidden">
        <div className="absolute -top-32 left-1/4 h-64 w-64 rounded-full bg-[hsl(var(--gradient-from)/0.06)] blur-[80px] animate-orb" />
        <div className="absolute -top-20 right-1/4 h-48 w-48 rounded-full bg-[hsl(var(--gradient-via)/0.05)] blur-[60px] animate-orb" style={{ animationDelay: "-4s" }} />
        <div className="absolute top-10 left-1/2 h-32 w-32 rounded-full bg-[hsl(var(--gradient-to)/0.04)] blur-[50px] animate-orb" style={{ animationDelay: "-8s" }} />

        <main className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-24 pt-16 sm:px-6">
          {/* Hero */}
          <header className="animate-fade-up text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/80 px-4 py-1.5 text-xs text-muted-foreground">
              <div className="gradient-dot" />
              <span>{deepDives.length} project{deepDives.length === 1 ? "" : "s"}</span>
            </div>
            <h1 className="mt-6 font-display text-4xl tracking-tight text-foreground sm:text-5xl">
              Your <span className="gradient-text">workspace</span>
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
              Organize threads, compare models side by side, and keep every branch of your thinking in one place.
            </p>
            <div className="mt-8">
              <button onClick={onNew} className="btn-gradient inline-flex items-center gap-2.5 rounded-2xl px-7 py-3.5 text-sm font-medium shadow-lg gradient-glow">
                <Plus className="h-4 w-4" />
                New project
              </button>
            </div>
          </header>

          {/* Gradient separator line */}
          <div className="mx-auto mt-16 max-w-xs gradient-line opacity-40" />

          {/* Invitations */}
          {myInvites.length > 0 && (
            <section className="mt-12 animate-fade-up stagger-1">
              <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Invitations</h2>
              <div className="mt-4 space-y-2">
                {myInvites.map((invite) => (
                  <div key={invite.token} className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/[0.03] p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{invite.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Invited as {invite.role}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => void accept(invite.token)} className="btn-gradient rounded-xl px-5 py-2 text-sm font-medium">Accept</button>
                      <Button size="sm" variant="ghost" onClick={() => void decline(invite.token)}>Decline</Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Projects grid */}
          <section className="mt-12">
            {deepDives.length === 0 ? (
              <div className="animate-fade-up stagger-2 flex flex-col items-center rounded-3xl border border-dashed border-border/50 px-8 py-20 text-center">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-[hsl(var(--gradient-from)/0.15)] blur-xl" />
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--gradient-from)/0.15)] to-[hsl(var(--gradient-via)/0.08)]">
                    <Layers className="h-7 w-7 text-primary" />
                  </div>
                </div>
                <h3 className="mt-6 text-lg font-medium text-foreground">Create your first project</h3>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  Projects organize your AI conversations into threads. Compare models, vote on approaches, and keep everything together.
                </p>
                <button onClick={onNew} className="btn-gradient mt-8 rounded-2xl px-6 py-3 text-sm font-medium gradient-glow">
                  Get started
                </button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {/* New project card */}
                <button
                  onClick={onNew}
                  className="group flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 px-6 py-10 text-center transition-all duration-300 hover:border-primary/30 hover:bg-primary/[0.02] animate-fade-up"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 transition-transform duration-300 group-hover:scale-110">
                    <Plus className="h-5 w-5 text-primary" />
                  </div>
                  <span className="mt-3 text-sm font-medium text-muted-foreground group-hover:text-foreground">New project</span>
                </button>

                {deepDives.map((dive, i) => {
                  const lastThread = dive.threads.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
                  const preview = lastThread ? lastMessagePreview(lastThread.messages) : "No messages yet";
                  const canRename = dive.myRole === "owner" || dive.myRole === "editor";
                  const canDelete = dive.myRole === "owner";

                  return (
                    <div
                      key={dive.id}
                      className={`group relative rounded-2xl border border-border/40 bg-card card-hover-glow animate-fade-up stagger-${Math.min(i + 1, 5)}`}
                    >
                      {/* Subtle gradient top edge */}
                      <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-2xl bg-gradient-to-r from-transparent via-[hsl(var(--gradient-from)/0.3)] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                      <button
                        type="button"
                        onClick={() => navigate(`/dive/${dive.id}`)}
                        className="w-full px-5 pb-5 pt-5 text-left"
                      >
                        {/* Provider dots + meta */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {dive.providers.map((provider) => (
                              <span key={provider} className="h-2.5 w-2.5 rounded-full ring-2 ring-card" title={AI_MODELS[provider].name} style={{ backgroundColor: `hsl(var(--${AI_MODELS[provider].color}))` }} />
                            ))}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Clock3 className="h-3 w-3" />
                            {formatRelative(dive.updatedAt)}
                          </div>
                        </div>

                        {/* Title */}
                        <h3 className="mt-4 truncate text-base font-medium text-foreground">{dive.title}</h3>

                        {/* Preview */}
                        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{preview}</p>

                        {/* Thread count */}
                        <div className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <MessageSquareText className="h-3 w-3" />
                          {dive.threads.length} thread{dive.threads.length === 1 ? "" : "s"}
                        </div>
                      </button>

                      {(canRename || canDelete) && (
                        <div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button type="button" className="flex h-7 w-7 items-center justify-center rounded-lg bg-card/80 text-muted-foreground hover:text-foreground" onClick={(e) => e.stopPropagation()}>
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              {canRename && <DropdownMenuItem onClick={(e) => { e.preventDefault(); openRename(dive); }}><PencilLine className="mr-2 h-4 w-4" />Rename</DropdownMenuItem>}
                              {canDelete && <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => { e.preventDefault(); setDeleteError(null); setDeleteTarget({ id: dive.id, title: dive.title }); }}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </div>

      {/* New project dialog */}
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="border-border/50 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">New project</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="new-project-name" className="text-sm font-medium text-foreground">Name</label>
              <Input id="new-project-name" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} placeholder="e.g. Q1 research" />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Models</div>
              <div className="space-y-1.5">
                {availableProviders.map((provider) => {
                  const model = AI_MODELS[provider];
                  const checked = selectedProviders.includes(provider);
                  return (
                    <label key={provider} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${checked ? "border-primary/30 bg-primary/[0.04]" : "border-border/40 hover:bg-accent/50"}`}>
                      <Checkbox checked={checked} onCheckedChange={() => toggleProvider(provider)} />
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold" style={{ backgroundColor: `hsl(var(--${model.color}) / 0.12)`, color: `hsl(var(--${model.color}))` }}>
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
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => onClose(false)}>Cancel</Button>
            <button onClick={() => void createProject()} disabled={selectedProviders.length === 0 || creating} className="btn-gradient rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-50">Create</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={(v) => { setRenameOpen(v); if (!v) { setRenameDiveId(null); setRenameTitle(""); setRenameError(null); } }}>
        <DialogContent className="border-border/50 bg-card sm:max-w-md">
          <DialogHeader><DialogTitle className="font-display text-xl">Rename project</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Input value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)} placeholder="Project name" onKeyDown={(e) => { if (e.key === "Enter") void submitRename(); }} />
            {renameError && <p className="text-sm text-destructive">{renameError}</p>}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setRenameOpen(false)} disabled={savingRename}>Cancel</Button>
            <Button onClick={() => void submitRename()} disabled={savingRename || !renameTitle.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(v) => { if (!v) { setDeleteTarget(null); setDeleteError(null); } }}>
        <AlertDialogContent className="border-border/50 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes <span className="font-medium text-foreground">{deleteTarget?.title}</span> and all its data.</AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleting} onClick={(e) => { e.preventDefault(); void confirmDelete(); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
