import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Clock3, MoreHorizontal, PencilLine, Plus, Trash2 } from "lucide-react";
import { useMutation as useConvexMutation, useQuery as useConvexQuery } from "convex/react";
import { AI_MODELS } from "@/types/ai";
import type { AIProvider } from "@/types/ai";
import { convexApi } from "@/lib/convex-api";
import { DEEP_DIVE_PROVIDERS, type DeepDiveUIMessage } from "@/lib/deep-dive-types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
  const text =
    last?.parts
      ?.filter((part) => part.type === "text" || part.type === "reasoning")
      .map((part) => part.text)
      .join("\n") ?? "";
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  return firstLine || "No messages yet";
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
  const [selectedProviders, setSelectedProviders] = useState<AIProvider[]>(
    availableProviders.length ? availableProviders : ["gpt"],
  );
  const [creating, setCreating] = useState(false);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDiveId, setRenameDiveId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [savingRename, setSavingRename] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const onNew = () => {
    setOpen(true);
    setProjectTitle("");
    setSelectedProviders(availableProviders.length ? availableProviders : ["gpt"]);
  };

  const onClose = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setProjectTitle("");
      setSelectedProviders(availableProviders.length ? availableProviders : ["gpt"]);
    }
  };

  const toggleProvider = (provider: AIProvider) => {
    setSelectedProviders((prev) =>
      prev.includes(provider) ? prev.filter((value) => value !== provider) : [...prev, provider],
    );
  };

  const createProject = async () => {
    if (selectedProviders.length === 0) return;
    setCreating(true);
    try {
      const deepDiveId = await createDeepDive({
        providers: selectedProviders,
        title: projectTitle.trim() || "New Project",
      });
      onClose(false);
      navigate(`/dive/${deepDiveId}`);
    } finally {
      setCreating(false);
    }
  };

  const accept = async (token: string) => {
    const result = await acceptInvite({ token });
    navigate(`/dive/${result.deepDiveId}`);
  };

  const decline = async (token: string) => {
    await declineInvite({ token });
  };

  const openRename = (dive: { id: string; title: string }) => {
    setRenameDiveId(dive.id);
    setRenameTitle(dive.title);
    setRenameError(null);
    setRenameOpen(true);
  };

  const submitRename = async () => {
    if (!renameDiveId) return;
    setRenameError(null);
    setSavingRename(true);
    try {
      await updateDeepDiveTitle({
        deepDiveId: renameDiveId,
        title: renameTitle,
      });
      setRenameOpen(false);
      setRenameDiveId(null);
      setRenameTitle("");
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : "Could not rename project");
    } finally {
      setSavingRename(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteDeepDive({ deepDiveId: deleteTarget.id });
      setDeleteTarget(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Could not delete project");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto w-full max-w-2xl px-4 pb-20 pt-12 sm:px-6">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl tracking-tight text-foreground">Projects</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Each project holds threads, notes, and shared context.
            </p>
          </div>
          <button
            onClick={onNew}
            className="btn-gradient flex h-10 shrink-0 items-center gap-2 rounded-xl px-5 text-sm font-medium shadow-md gradient-glow"
          >
            <Plus className="h-4 w-4" />
            New project
          </button>
        </header>

        {myInvites.length ? (
          <section className="mt-10 space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Invitations</h2>
            <div className="space-y-2">
              {myInvites.map((invite) => (
                <div
                  key={invite.token}
                  className="flex flex-col gap-3 rounded-xl border border-border/50 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{invite.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Role: {invite.role}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void accept(invite.token)}>
                      Accept
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void decline(invite.token)}>
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-10">
          <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Your projects</h2>

          {deepDives.length === 0 ? (
            <div className="mt-6 flex flex-col items-center rounded-xl border border-dashed border-border/50 px-8 py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <p className="mt-4 text-sm font-medium text-foreground">No projects yet</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Create your first project to start chatting with AI models.
              </p>
              <button
                onClick={onNew}
                className="btn-gradient mt-6 rounded-xl px-5 py-2.5 text-sm font-medium gradient-glow"
              >
                Create project
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {deepDives.map((dive) => {
                const lastThread = dive.threads.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
                const preview = lastThread ? lastMessagePreview(lastThread.messages) : "No messages yet";
                const canRename = dive.myRole === "owner" || dive.myRole === "editor";
                const canDelete = dive.myRole === "owner";

                return (
                  <div
                    key={dive.id}
                    className="group flex items-stretch rounded-xl border border-border/40 bg-card transition-colors hover:border-border/80"
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/dive/${dive.id}`)}
                      className="min-w-0 flex-1 px-5 py-4 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          {dive.providers.map((provider) => (
                            <span
                              key={provider}
                              className="h-2 w-2 rounded-full"
                              title={AI_MODELS[provider].name}
                              style={{ backgroundColor: `hsl(var(--${AI_MODELS[provider].color}))` }}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock3 className="h-3 w-3" />
                          {formatRelative(dive.updatedAt)}
                        </span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">
                          {dive.threads.length} thread{dive.threads.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <h3 className="mt-2 truncate text-base font-medium text-foreground">{dive.title}</h3>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{preview}</p>
                    </button>

                    {canRename || canDelete ? (
                      <div className="flex shrink-0 items-center pr-3 opacity-0 transition-opacity group-hover:opacity-100">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground"
                              aria-label="Project actions"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            {canRename ? (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.preventDefault();
                                  openRename(dive);
                                }}
                              >
                                <PencilLine className="mr-2 h-4 w-4" />
                                Rename
                              </DropdownMenuItem>
                            ) : null}
                            {canDelete ? (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setDeleteError(null);
                                  setDeleteTarget({ id: dive.id, title: dive.title });
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="border-border/50 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">New project</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="new-project-name" className="text-sm font-medium text-foreground">
                Name
              </label>
              <Input
                id="new-project-name"
                value={projectTitle}
                onChange={(event) => setProjectTitle(event.target.value)}
                placeholder="e.g. Q1 research"
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Models</div>
              <div className="space-y-1.5">
                {availableProviders.map((provider) => {
                  const model = AI_MODELS[provider];
                  const checked = selectedProviders.includes(provider);
                  return (
                    <label
                      key={provider}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/40 px-3 py-2.5 transition-colors hover:bg-accent/50"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleProvider(provider)} />
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
                        style={{
                          backgroundColor: `hsl(var(--${model.color}) / 0.12)`,
                          color: `hsl(var(--${model.color}))`,
                        }}
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
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => onClose(false)}>
              Cancel
            </Button>
            <Button onClick={() => void createProject()} disabled={selectedProviders.length === 0 || creating}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameOpen}
        onOpenChange={(next) => {
          setRenameOpen(next);
          if (!next) {
            setRenameDiveId(null);
            setRenameTitle("");
            setRenameError(null);
          }
        }}
      >
        <DialogContent className="border-border/50 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Rename project</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              placeholder="Project name"
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitRename();
              }}
            />
            {renameError ? <p className="text-sm text-destructive">{renameError}</p> : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setRenameOpen(false)} disabled={savingRename}>
              Cancel
            </Button>
            <Button onClick={() => void submitRename()} disabled={savingRename || !renameTitle.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent className="border-border/50 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <span className="font-medium text-foreground">{deleteTarget?.title}</span> and all threads,
              files, invites, and notes in it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
