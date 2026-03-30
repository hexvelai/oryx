import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock3, MessageSquareText, MoreHorizontal, PencilLine, Plus, Trash2 } from "lucide-react";
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
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
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
  const createProject = async () => { if (selectedProviders.length === 0) return; setCreating(true); try { const id = await createDeepDive({ providers: selectedProviders, title: projectTitle.trim() || "New Project" }); onClose(false); navigate(`/dive/${id}`); } finally { setCreating(false); } };
  const accept = async (token: string) => { const r = await acceptInvite({ token }); navigate(`/dive/${r.deepDiveId}`); };
  const decline = async (token: string) => { await declineInvite({ token }); };
  const openRename = (d: { id: string; title: string }) => { setRenameDiveId(d.id); setRenameTitle(d.title); setRenameError(null); setRenameOpen(true); };
  const submitRename = async () => { if (!renameDiveId) return; setRenameError(null); setSavingRename(true); try { await updateDeepDiveTitle({ deepDiveId: renameDiveId, title: renameTitle }); setRenameOpen(false); setRenameDiveId(null); setRenameTitle(""); } catch (e) { setRenameError(e instanceof Error ? e.message : "Could not rename"); } finally { setSavingRename(false); } };
  const confirmDelete = async () => { if (!deleteTarget) return; setDeleteError(null); setDeleting(true); try { await deleteDeepDive({ deepDiveId: deleteTarget.id }); setDeleteTarget(null); } catch (e) { setDeleteError(e instanceof Error ? e.message : "Could not delete"); } finally { setDeleting(false); } };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6">
        {/* Invitations — only if pending */}
        {myInvites.length > 0 && (
          <section className="mb-6">
            {myInvites.map((invite) => (
              <div key={invite.token} className="flex items-center justify-between gap-4 rounded-xl border border-primary/15 bg-primary/[0.03] px-4 py-3">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-foreground">{invite.title}</span>
                  <span className="ml-2 text-xs text-muted-foreground">· {invite.role}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void accept(invite.token)}>Accept</Button>
                  <Button size="sm" variant="ghost" onClick={() => void decline(invite.token)}>Decline</Button>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Projects — immediately */}
        {deepDives.length === 0 ? (
          <div className="flex flex-col items-center pt-24 text-center animate-fade-up">
            <p className="text-sm text-muted-foreground">No projects yet</p>
            <button onClick={onNew} className="mt-4 btn-gradient rounded-xl px-5 py-2.5 text-sm font-medium">
              Create a project
            </button>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {/* New project tile */}
            <button onClick={onNew} className="group flex items-center gap-3 rounded-xl border border-dashed border-border/60 px-4 py-4 text-left transition-colors hover:border-primary/25 hover:bg-accent/30">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary transition-colors group-hover:bg-primary/12">
                <Plus className="h-4 w-4" />
              </div>
              <span className="text-sm text-muted-foreground group-hover:text-foreground">New project</span>
            </button>

            {deepDives.map((dive) => {
              const lastThread = dive.threads.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
              const preview = lastThread ? lastMessagePreview(lastThread.messages) : "No messages yet";
              const canRename = dive.myRole === "owner" || dive.myRole === "editor";
              const canDelete = dive.myRole === "owner";

              return (
                <div key={dive.id} className="group relative rounded-xl border border-border/40 bg-card transition-colors hover:border-border/70">
                  <button type="button" onClick={() => navigate(`/dive/${dive.id}`)} className="w-full px-4 py-4 text-left">
                    <div className="flex items-center gap-2">
                      {dive.providers.map((p) => (
                        <span key={p} className="h-2 w-2 rounded-full" title={AI_MODELS[p].name} style={{ backgroundColor: `hsl(var(--${AI_MODELS[p].color}))` }} />
                      ))}
                      <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{formatRelative(dive.updatedAt)}</span>
                    </div>
                    <h3 className="mt-3 truncate text-sm font-medium text-foreground">{dive.title}</h3>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{preview}</p>
                    <div className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <MessageSquareText className="h-3 w-3" />
                      {dive.threads.length}
                    </div>
                  </button>

                  {(canRename || canDelete) && (
                    <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent" onClick={(e) => e.stopPropagation()}>
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          {canRename && <DropdownMenuItem onClick={(e) => { e.preventDefault(); openRename(dive); }}><PencilLine className="mr-2 h-3.5 w-3.5" />Rename</DropdownMenuItem>}
                          {canDelete && <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => { e.preventDefault(); setDeleteError(null); setDeleteTarget({ id: dive.id, title: dive.title }); }}><Trash2 className="mr-2 h-3.5 w-3.5" />Delete</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* New project dialog */}
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-display text-lg">New project</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} placeholder="Project name" />
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Models</p>
              {availableProviders.map((provider) => {
                const model = AI_MODELS[provider];
                const checked = selectedProviders.includes(provider);
                return (
                  <label key={provider} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${checked ? "border-primary/25 bg-primary/[0.03]" : "border-border/40 hover:bg-accent/40"}`}>
                    <Checkbox checked={checked} onCheckedChange={() => toggleProvider(provider)} />
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `hsl(var(--${model.color}))` }} />
                    <span className="text-foreground">{model.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{model.fullName}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => onClose(false)}>Cancel</Button>
            <Button onClick={() => void createProject()} disabled={selectedProviders.length === 0 || creating}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={(v) => { setRenameOpen(v); if (!v) { setRenameDiveId(null); setRenameTitle(""); setRenameError(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="font-display text-lg">Rename</DialogTitle></DialogHeader>
          <Input value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)} placeholder="Project name" onKeyDown={(e) => { if (e.key === "Enter") void submitRename(); }} />
          {renameError && <p className="text-sm text-destructive">{renameError}</p>}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setRenameOpen(false)} disabled={savingRename}>Cancel</Button>
            <Button onClick={() => void submitRename()} disabled={savingRename || !renameTitle.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(v) => { if (!v) { setDeleteTarget(null); setDeleteError(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes <strong>{deleteTarget?.title}</strong> and all its data.</AlertDialogDescription>
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
