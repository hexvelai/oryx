import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, Check, Clock3, MessageSquareText, Mic, MoreHorizontal, PencilLine, Plus, Sparkles, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type KeyProvider = "openrouter" | "gemini" | "openai" | "claude";
type ModelTab = "favorites" | KeyProvider;

const COMPANIES: Array<{
  id: KeyProvider;
  name: string;
  logoUrl: string;
}> = [
  { id: "openrouter", name: "OpenRouter", logoUrl: "https://openrouter.ai/favicon.ico" },
  { id: "openai", name: "OpenAI", logoUrl: "https://openai.com/favicon.ico" },
  { id: "claude", name: "Claude", logoUrl: "https://claude.ai/favicon.ico" },
  { id: "gemini", name: "Gemini", logoUrl: "https://ai.google.dev/static/site-assets/images/favicon.ico" },
];

const MODEL_TAGS: Partial<Record<AIProvider, Array<"fast" | "cheap" | "thinking">>> = {
  "glm-air": ["fast", "cheap"],
  "step-flash": ["fast", "cheap"],
  "gemini-3-flash": ["fast", "cheap"],
  "gemini-2-flash": ["fast", "cheap"],
  "qwen-plus": ["thinking", "cheap"],
  "qwen-coder": ["thinking"],
  dolphin: ["cheap"],
  nemotron: ["thinking"],
  "trinity-mini": ["cheap"],
};

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

function CompanyLogo({ name, logoUrl }: { name: string; logoUrl: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-accent text-[10px] font-semibold text-foreground">
        {name.slice(0, 1)}
      </span>
    );
  }
  return <img src={logoUrl} alt="" className="h-5 w-5 rounded-sm" onError={() => setFailed(true)} />;
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
  const appSettings = useConvexQuery(convexApi.settings.get, {});
  const addApiKey = useConvexMutation(convexApi.settings.addApiKey);
  const deleteApiKey = useConvexMutation(convexApi.settings.deleteApiKey);

  const [open, setOpen] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const fallbackProvider = availableProviders[0] ?? "nemotron";
  const [selectedProviders, setSelectedProviders] = useState<AIProvider[]>(availableProviders.length ? availableProviders : [fallbackProvider]);
  const [creating, setCreating] = useState(false);
  const [activeCompany, setActiveCompany] = useState<ModelTab>("favorites");
  const [newKeyProvider, setNewKeyProvider] = useState<KeyProvider>("openrouter");
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDiveId, setRenameDiveId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [savingRename, setSavingRename] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [heroQuery, setHeroQuery] = useState("");

  const onNew = () => {
    setOpen(true);
    setProjectTitle("");
    setSelectedProviders(availableProviders.length ? availableProviders : [fallbackProvider]);
    setActiveCompany("favorites");
    setKeyError(null);
  };
  const onClose = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setProjectTitle("");
      setHeroQuery("");
      setSelectedProviders(availableProviders.length ? availableProviders : [fallbackProvider]);
      setActiveCompany("favorites");
      setKeyError(null);
    }
  };

  const accept = async (token: string) => {
    const r = await acceptInvite({ token });
    navigate(`/dive/${r.deepDiveId}`);
  };
  const decline = async (token: string) => {
    await declineInvite({ token });
  };
  const openRename = (d: { id: string; title: string }) => {
    setRenameDiveId(d.id);
    setRenameTitle(d.title);
    setRenameError(null);
    setRenameOpen(true);
  };
  const submitRename = async () => {
    if (!renameDiveId) return;
    setRenameError(null);
    setSavingRename(true);
    try {
      await updateDeepDiveTitle({ deepDiveId: renameDiveId, title: renameTitle });
      setRenameOpen(false);
      setRenameDiveId(null);
      setRenameTitle("");
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : "Could not rename");
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
      setDeleteError(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setDeleting(false);
    }
  };

  const keys = (appSettings as any)?.apiKeys ?? [];
  const openRouterConfigured = Boolean((appSettings as any)?.openRouter?.configured) || keys.some((k: any) => k.provider === "openrouter");
  const companyHasKey = (id: KeyProvider) => {
    if (id === "openrouter") return openRouterConfigured;
    return keys.some((k: any) => k.provider === id);
  };
  const anyKeys = keys.length > 0 || openRouterConfigured;
  const companyForModel = (provider: AIProvider): KeyProvider => {
    if (provider.startsWith("gemini-")) return "gemini";
    return "openrouter";
  };
  const providerSelectable = (provider: AIProvider) => {
    const company = companyForModel(provider);
    if (company === "openrouter") return companyHasKey("openrouter");
    if (company === "gemini") return companyHasKey("gemini");
    return false;
  };
  const selectedSelectableProviders = selectedProviders.filter(providerSelectable);
  const canCreate = selectedSelectableProviders.length > 0;

  const favoriteGroups: Array<{ label: string; tag: "fast" | "cheap" | "thinking" }> = [
    { label: "Fast", tag: "fast" },
    { label: "Cheap", tag: "cheap" },
    { label: "Thinking", tag: "thinking" },
  ];
  const groupsToRender =
    activeCompany === "favorites"
      ? favoriteGroups
      : ([{ label: "Models", tag: "fast" as const }]);

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

        {/* Hero prompt — above projects */}
        <section className="mx-auto mb-10 max-w-2xl text-center sm:mb-12">
          <h2 className="font-display text-xl font-medium tracking-tight text-foreground sm:text-2xl">
            What are you working on?
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Start in your own words — we&apos;ll open a new project you can shape from there.
          </p>
          <div className="mt-6 flex items-center gap-0.5 rounded-full border border-border/80 bg-card/90 px-1.5 py-1 shadow-sm ring-1 ring-black/[0.03] backdrop-blur-sm dark:bg-card/70 dark:ring-white/[0.06] sm:gap-1 sm:px-2 sm:py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => {
                setHeroQuery("");
                onNew();
              }}
              aria-label="New project"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <input
              type="text"
              value={heroQuery}
              onChange={(e) => setHeroQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void openNewFromHero();
                }
              }}
              placeholder="Ask anything"
              className="min-w-0 flex-1 border-0 bg-transparent px-2 py-2.5 text-left text-sm text-foreground outline-none placeholder:text-muted-foreground/80"
              aria-label="What do you want to work on?"
            />
            <span
              className="hidden h-9 w-9 shrink-0 items-center justify-center text-muted-foreground/50 sm:flex"
              aria-hidden
            >
              <Mic className="h-4 w-4" />
            </span>
            <Button
              type="button"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full bg-foreground text-background shadow-sm hover:bg-foreground/90 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
              onClick={() => openNewFromHero()}
              aria-label="Start project from prompt"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </section>

        {/* Projects */}
        {deepDives.length === 0 ? (
          <div className="flex flex-col items-center pt-4 text-center animate-fade-up">
            <p className="text-sm text-muted-foreground">No projects yet — use the field above or create one here.</p>
            <button type="button" onClick={onNew} className="mt-4 btn-gradient rounded-xl px-5 py-2.5 text-sm font-medium">
              New project
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
        <DialogContent className="border-border/50 bg-card sm:max-w-5xl w-full">
          <DialogHeader><DialogTitle className="font-display text-lg">New project</DialogTitle></DialogHeader>
          <div className="mt-2 grid min-h-[420px] grid-cols-1 gap-4 sm:grid-cols-[220px_1fr_320px]">
            {/* Left: companies */}
            <aside className="rounded-xl border border-border/50 bg-background/40 p-3">
              <p className="px-1 pt-1 text-[10px] uppercase tracking-widest text-muted-foreground/70">Catalog</p>
              <div className="mt-2 space-y-1">
                <button
                  type="button"
                  onClick={() => setActiveCompany("favorites")}
                  className={[
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                    activeCompany === "favorites" ? "bg-accent text-foreground" : "hover:bg-accent/40 text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  <Sparkles className="h-5 w-5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">Favorites</div>
                    <div className="text-[11px] text-muted-foreground">Fast · Cheap · Thinking</div>
                  </div>
                </button>
                {COMPANIES.map((c) => {
                  const enabled = companyHasKey(c.id);
                  const active = activeCompany === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setActiveCompany(c.id)}
                      className={[
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                        active ? "bg-accent text-foreground" : "hover:bg-accent/40 text-muted-foreground hover:text-foreground",
                        enabled ? "" : "opacity-50",
                      ].join(" ")}
                    >
                      <CompanyLogo name={c.name} logoUrl={c.logoUrl} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {enabled ? "Key available" : "No key"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {!anyKeys ? (
                <div className="mt-3 rounded-lg border border-dashed border-border/60 bg-card/30 p-3 text-xs text-muted-foreground">
                  Add a key on the right to unlock models.
                </div>
              ) : null}
            </aside>

            {/* Center: favorites */}
            <section className="rounded-xl border border-border/50 bg-background/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    {activeCompany === "favorites" ? "Favorites" : `${COMPANIES.find((c) => c.id === activeCompany)?.name ?? "Models"}`}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {activeCompany === "favorites"
                      ? "Pick your default models for this project."
                      : "Showing models for the selected company."}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedSelectableProviders.length} active
                </div>
              </div>

              <div className="mt-4 space-y-5">
                {groupsToRender.map((group) => {
                  const models = availableProviders.filter((p) => {
                    if (activeCompany !== "favorites" && companyForModel(p) !== activeCompany) return false;
                    if (activeCompany === "favorites") return (MODEL_TAGS[p] ?? []).includes(group.tag);
                    return true;
                  });
                  if (models.length === 0) return null;
                  return (
                    <div key={group.tag}>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
                        {activeCompany === "favorites" ? group.label : "Models"}
                      </p>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {models.map((provider) => {
                          const model = AI_MODELS[provider];
                          const selected = selectedProviders.includes(provider);
                          const selectable = providerSelectable(provider);
                          const canToggle = selected || selectable;
                          return (
                            <button
                              key={provider}
                              type="button"
                              onClick={() => (canToggle ? toggleProvider(provider) : null)}
                              className={[
                                "group flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                                selected ? "border-primary/30 bg-primary/[0.04]" : "border-border/40 hover:bg-accent/40",
                                canToggle ? "" : "opacity-50 cursor-not-allowed",
                              ].join(" ")}
                            >
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `hsl(var(--${model.color}))` }} />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-foreground" title={model.name}>{model.name}</div>
                                <div className="truncate text-[11px] text-muted-foreground" title={model.fullName}>{model.fullName}</div>
                              </div>
                              <div className={`flex h-5 w-5 items-center justify-center rounded-md border ${selected ? "border-primary/40 bg-primary/10" : "border-border/50"}`}>
                                {selected ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {activeCompany !== "favorites" && availableProviders.filter((p) => companyForModel(p) === activeCompany).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/60 bg-card/30 p-3 text-xs text-muted-foreground">
                    No models configured for this provider yet.
                  </div>
                ) : null}
              </div>

              {!canCreate ? (
                <div className="mt-4 rounded-lg border border-dashed border-border/60 bg-card/30 p-3 text-xs text-muted-foreground">
                  Add an API key to unlock at least one model.
                </div>
              ) : null}
            </section>

            {/* Right: keys */}
            <aside className="rounded-xl border border-border/50 bg-background/40 p-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">API keys</p>
              <div className="mt-3 space-y-2">
                <Select value={newKeyProvider} onValueChange={(v) => {
                  if (v === "openrouter" || v === "gemini" || v === "openai" || v === "claude") setNewKeyProvider(v);
                }}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openrouter">OpenRouter</SelectItem>
                    <SelectItem value="gemini">Gemini</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="claude">Claude</SelectItem>
                  </SelectContent>
                </Select>
                <Input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="Key name" />
                <Input value={newKeyValue} onChange={(e) => setNewKeyValue(e.target.value)} placeholder="API key" type="password" />
                <Button
                  size="sm"
                  disabled={!newKeyValue.trim() || savingKey}
                  onClick={async () => {
                    setKeyError(null);
                    setSavingKey(true);
                    try {
                      await addApiKey({ provider: newKeyProvider, name: newKeyName, apiKey: newKeyValue });
                      setNewKeyValue("");
                      setNewKeyName("");
                    } catch (e) {
                      setKeyError(e instanceof Error ? e.message : "Failed to save key");
                    } finally {
                      setSavingKey(false);
                    }
                  }}
                >
                  Save key
                </Button>
                {keyError ? <p className="text-sm text-destructive">{keyError}</p> : null}

                <div className="mt-2 space-y-2">
                  {keys.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No keys saved yet.</p>
                  ) : (
                    keys.map((k: any) => (
                      <div key={k.id} className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-foreground">{k.name}</p>
                          <p className="text-xs text-muted-foreground">{k.provider} {k.lastFour ? `· ****${k.lastFour}` : ""}</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => void deleteApiKey({ id: k.id })}>
                          Delete
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </aside>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => onClose(false)}>Cancel</Button>
            <Button onClick={() => void createProject()} disabled={!canCreate || creating}>
              Create
            </Button>
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
