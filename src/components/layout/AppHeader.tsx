import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation as useConvexMutation, useQuery as useConvexQuery } from "convex/react";
import { useTheme } from "next-themes";
import { useLocation, useNavigate } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { ArrowUpRight, Check, ChevronDown, KeyRound, MoonStar, Search, SunMedium } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useChatContext } from "@/context/ChatContext";
import { convexApi } from "@/lib/convex-api";
import { AI_MODELS } from "@/types/ai";
import type { AIProvider } from "@/types/ai";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";

type StoredApiKey = {
  id: string;
  provider: string;
  name: string;
  lastFour?: string | null;
  createdAt?: number;
};

type AppSettingsRecord = {
  openRouter?: { configured?: boolean; source?: string; lastFour?: string | null };
  apiKeys?: StoredApiKey[];
};

export type AppHeaderWorkspaceProps = {
  leading: ReactNode;
  beforeSystemControls?: ReactNode;
};

type AppHeaderProps = {
  workspace?: AppHeaderWorkspaceProps;
};

export function AppHeader({ workspace }: AppHeaderProps) {
  const {
    availableProviders,
    providerApiKeys,
    setProviderApiKey,
    setProviderEnabled,
  } = useChatContext();
  const { resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [openProviders, setOpenProviders] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [serverKeyInput, setServerKeyInput] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingServerKey, setSavingServerKey] = useState(false);
  const [clearingServerKey, setClearingServerKey] = useState(false);
  const [settingsStep, setSettingsStep] = useState<"choose" | "keys">("choose");
  const [legacyQuery, setLegacyQuery] = useState("");
  const [legacyDetailsProvider, setLegacyDetailsProvider] = useState<AIProvider | null>(null);
  const [newKeyProvider, setNewKeyProvider] = useState<"openrouter" | "gemini" | "openai" | "claude" | "deepseek">("openrouter");
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [savingVaultKey, setSavingVaultKey] = useState(false);
  const deleteApiKey = useConvexMutation(convexApi.settings.deleteApiKey);
  const addApiKey = useConvexMutation(convexApi.settings.addApiKey);

  const allProviders = useMemo(() => Object.keys(AI_MODELS) as AIProvider[], []);
  const legacyProviders = useMemo(() => {
    const q = legacyQuery.trim().toLowerCase();
    if (!q) return allProviders;
    return allProviders.filter((p) => {
      const model = AI_MODELS[p];
      const hay = `${model.name} ${model.fullName} ${model.description}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allProviders, legacyQuery]);
  const deepDivesActive =
    location.pathname === "/" || location.pathname.startsWith("/dive/");
  const isDark = mounted && resolvedTheme === "dark";

  useEffect(() => {
    setMounted(true);
  }, []);

  const appSettings = useConvexQuery(convexApi.settings.get, {}) as AppSettingsRecord | undefined;
  const saveOpenRouterKey = useConvexMutation(convexApi.settings.setOpenRouterKey);
  const clearOpenRouterKey = useConvexMutation(convexApi.settings.clearOpenRouterKey);

  const openRouterStatus = appSettings?.openRouter;
  const openRouterLabel =
    openRouterStatus?.source === "frontend"
      ? "Saved in app"
      : "Not configured";
  const serverKeysConfigured = Boolean(openRouterStatus?.configured);

  useEffect(() => {
    const handler = () => {
      setOpenProviders(true);
      setSettingsStep("choose");
    };
    window.addEventListener("oryx:open-ai-settings", handler as EventListener);
    return () => window.removeEventListener("oryx:open-ai-settings", handler as EventListener);
  }, []);

  const saveServerKey = async () => {
    const trimmed = serverKeyInput.trim();
    if (!trimmed) return;
    setSettingsError(null);
    setSavingServerKey(true);
    try {
      await saveOpenRouterKey({ apiKey: trimmed });
      setServerKeyInput("");
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Failed to save key");
    } finally {
      setSavingServerKey(false);
    }
  };

  const clearServerKey = async () => {
    setSettingsError(null);
    setClearingServerKey(true);
    try {
      await clearOpenRouterKey({});
      setServerKeyInput("");
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Failed to clear key");
    } finally {
      setClearingServerKey(false);
    }
  };

  const themeToggleButton = (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
    </button>
  );

  const aiSettingsButton = (
    <button
      type="button"
      onClick={() => setOpenProviders(true)}
      className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${serverKeysConfigured ? "bg-[hsl(var(--ai-nemotron))]" : "bg-destructive"}`}
      />
      <span className="hidden sm:inline">AI</span>
    </button>
  );

  const userAccountControl = (
    <div className="flex h-9 w-9 items-center justify-center rounded-lg">
      <UserButton
        afterSignOutUrl="/"
        appearance={{
          elements: {
            userButtonAvatarBox: "h-7 w-7 rounded-full sm:h-8 sm:w-8",
            userButtonTrigger: "focus:shadow-none focus:outline-none",
          },
        }}
      />
    </div>
  );

  const systemControls = (
    <div className="flex shrink-0 items-center gap-0.5">
      {themeToggleButton}
      {aiSettingsButton}
      {userAccountControl}
    </div>
  );

  const homeTrailingControls = (
    <div className="flex shrink-0 items-center gap-0.5">
      {themeToggleButton}
      {userAccountControl}
    </div>
  );

  return (
    <>
      <header className="sticky top-0 z-40 overflow-visible border-b border-border/50 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
        {workspace ? (
          <div className="mx-auto flex h-16 w-full max-w-none items-center gap-2 px-3 sm:gap-3 sm:px-4">
            <div className="min-w-0 flex-1">{workspace.leading}</div>
            {workspace.beforeSystemControls ? (
              <div className="flex shrink-0 items-center gap-0.5">{workspace.beforeSystemControls}</div>
            ) : null}
            {systemControls}
          </div>
        ) : (
          <div className="mx-auto grid h-16 w-full max-w-5xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center justify-self-start">{aiSettingsButton}</div>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="flex shrink-0 items-center justify-center justify-self-center rounded-full outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Home"
            >
              <BrandLogo large showLabel={false} className="gap-0" />
            </button>
            <div className="flex min-w-0 items-center justify-self-end">{homeTrailingControls}</div>
          </div>
        )}
      </header>

      <Dialog open={openProviders} onOpenChange={setOpenProviders}>
        <DialogContent className="border-border/50 bg-card sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-display">AI Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {settingsStep === "choose" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className="rounded-xl border border-border/50 bg-card p-5 text-left transition-colors hover:bg-accent/30"
                  onClick={() => setSettingsStep("keys")}
                >
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">Option</p>
                  <p className="mt-2 text-base font-medium text-foreground">Enter API keys</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add keys for providers like OpenRouter, Gemini, OpenAI, and Claude.
                  </p>
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-border/50 bg-card/50 p-5 text-left opacity-60"
                  disabled
                >
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">Option</p>
                  <p className="mt-2 text-base font-medium text-foreground">Subscribe to a plan</p>
                  <p className="mt-1 text-sm text-muted-foreground">Coming soon.</p>
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-3 rounded-xl border border-border/50 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">Key vault</p>
                      <p className="mt-1.5 text-base font-medium text-foreground">API keys</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Store named keys in the app. Keys are used to unlock models.
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSettingsStep("choose")}>
                      Back
                    </Button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <Select value={newKeyProvider} onValueChange={(v) => {
                      if (v === "openrouter" || v === "gemini" || v === "openai" || v === "claude" || v === "deepseek") setNewKeyProvider(v);
                    }}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openrouter">OpenRouter</SelectItem>
                        <SelectItem value="gemini">Gemini</SelectItem>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="claude">Claude</SelectItem>
                        <SelectItem value="deepseek">DeepSeek</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="Key name" />
                    <Input value={newKeyValue} onChange={(e) => setNewKeyValue(e.target.value)} placeholder="API key" type="password" />
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={!newKeyValue.trim() || savingVaultKey}
                      onClick={async () => {
                        setSettingsError(null);
                        setSavingVaultKey(true);
                        try {
                          await addApiKey({ provider: newKeyProvider, name: newKeyName, apiKey: newKeyValue });
                          setNewKeyValue("");
                          setNewKeyName("");
                        } catch (e) {
                          setSettingsError(e instanceof Error ? e.message : "Failed to save key");
                        } finally {
                          setSavingVaultKey(false);
                        }
                      }}
                    >
                      Save key
                    </Button>
                    {newKeyProvider === "openrouter" ? (
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Manage OpenRouter keys
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                    ) : newKeyProvider === "deepseek" ? (
                      <a
                        href="https://api.deepseek.com"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        DeepSeek API
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>

                  {settingsError ? <p className="text-sm text-destructive">{settingsError}</p> : null}

                  <div className="space-y-2">
                    {(appSettings?.apiKeys ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No keys saved yet.</p>
                    ) : (
                      (appSettings?.apiKeys ?? []).map((k) => (
                        <div key={k.id} className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm text-foreground">{k.name}</p>
                            <p className="text-xs text-muted-foreground">{k.provider} {k.lastFour ? `· ****${k.lastFour}` : ""}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              await deleteApiKey({ id: k.id });
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Legacy OpenRouter field (kept for compatibility) */}
                <div className="space-y-3 rounded-xl border border-border/50 p-5">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">Compatibility</p>
                    <p className="mt-1.5 text-base font-medium text-foreground">OpenRouter API Key (legacy)</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This app still uses OpenRouter as the primary backend. Adding an OpenRouter key above will sync this automatically.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={`h-1.5 w-1.5 rounded-full ${openRouterStatus?.configured ? "bg-[hsl(var(--ai-nemotron))]" : "bg-muted-foreground/30"}`} />
                    {appSettings === undefined ? "Checking..." : openRouterLabel}
                    {openRouterStatus?.lastFour ? ` · ****${openRouterStatus.lastFour}` : ""}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={serverKeyInput}
                      onChange={(e) => setServerKeyInput(e.target.value)}
                      placeholder="Paste OpenRouter API key"
                      type="password"
                      className="flex-1"
                    />
                    <Button
                      onClick={saveServerKey}
                      disabled={!serverKeyInput.trim() || savingServerKey}
                      size="sm"
                    >
                      Save
                    </Button>
                    {openRouterStatus?.source === "frontend" && (
                      <Button variant="ghost" size="sm" onClick={clearServerKey} disabled={clearingServerKey}>
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}

            {!deepDivesActive && (
              <div className="space-y-3 rounded-xl border border-border/50 p-5">
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">Playground</p>
                  <p className="mt-1.5 text-base font-medium text-foreground">Browser Model Keys</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Legacy playground modes use browser-stored keys and per-model toggles.
                  </p>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={legacyQuery}
                    onChange={(e) => setLegacyQuery(e.target.value)}
                    placeholder="Search models…"
                    className="h-9 pl-9"
                  />
                </div>
                <div className="rounded-xl border border-border/50 bg-background/40">
                  <ScrollArea className="h-[360px]">
                    <div className="divide-y divide-border/40">
                      {legacyProviders.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground">No models match your search.</div>
                      ) : null}
                      {legacyProviders.map((p) => {
                        const model = AI_MODELS[p];
                        const enabled = availableProviders.includes(p);
                        const keyValue = providerApiKeys[p] ?? "";
                        const hasKey = Boolean(keyValue.trim());
                        const open = legacyDetailsProvider === p;
                        return (
                          <Collapsible
                            key={p}
                            open={open}
                            onOpenChange={(next) => setLegacyDetailsProvider(next ? p : null)}
                          >
                            <div className={`relative flex items-start gap-3 px-4 py-3 transition-colors ${enabled ? "bg-primary/[0.04]" : "hover:bg-accent/30"}`}>
                              <div
                                className="absolute left-0 top-0 h-full w-[2px]"
                                style={{
                                  backgroundColor: enabled ? `hsl(var(--${model.color}))` : "transparent",
                                }}
                              />
                              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: `hsl(var(--${model.color}))` }} />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium leading-snug text-foreground break-words">{model.name}</div>
                                <div className="mt-1 text-xs leading-snug text-muted-foreground break-words">{model.description}</div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2 pt-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setProviderEnabled(p, !enabled);
                                  }}
                                  className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                    enabled ? "bg-primary/10 text-primary" : "bg-background/60 text-muted-foreground hover:bg-accent"
                                  }`}
                                >
                                  {enabled ? <Check className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                                  {enabled ? "Enabled" : "Enable"}
                                  <span className={`h-1.5 w-1.5 rounded-full ${hasKey ? "bg-emerald-400/80" : "bg-muted-foreground/30"}`} />
                                </button>
                                <CollapsibleTrigger asChild>
                                  <button
                                    type="button"
                                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                    aria-label="Details"
                                  >
                                    <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
                                  </button>
                                </CollapsibleTrigger>
                              </div>
                            </div>
                            <CollapsibleContent>
                              <div className="px-4 pb-4">
                                <div className="grid gap-2 rounded-lg bg-card/40 p-3">
                                  <div>
                                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">Model</div>
                                    <div className="mt-1 font-mono text-xs text-foreground break-all">{model.fullName}</div>
                                  </div>
                                  <Input
                                    value={keyValue}
                                    onChange={(e) => setProviderApiKey(p, e.target.value)}
                                    placeholder="API key (stored in browser)"
                                    type="password"
                                  />
                                </div>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <Button onClick={() => setOpenProviders(false)} size="sm">
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
