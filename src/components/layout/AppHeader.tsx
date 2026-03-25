import { useEffect, useMemo, useState } from "react";
import { useMutation as useConvexMutation, useQuery as useConvexQuery } from "convex/react";
import { useTheme } from "next-themes";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowUpRight, Boxes, MoonStar, Plus, Presentation, SunMedium } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useChatContext } from "@/context/ChatContext";
import { convexApi } from "@/lib/convex-api";
import { AI_MODELS } from "@/types/ai";
import type { AIProvider } from "@/types/ai";

export function AppHeader() {
  const {
    mode,
    setMode,
    availableProviders,
    providerApiKeys,
    setProviderApiKey,
    setProviderEnabled,
    parallelTargets,
    setParallelTargets,
  } = useChatContext();
  const { resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [openParallel, setOpenParallel] = useState(false);
  const [openProviders, setOpenProviders] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [serverKeyInput, setServerKeyInput] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingServerKey, setSavingServerKey] = useState(false);
  const [clearingServerKey, setClearingServerKey] = useState(false);

  const allProviders = useMemo(() => Object.keys(AI_MODELS) as AIProvider[], []);
  const deepDivesActive = location.pathname === "/" || location.pathname.startsWith("/dive/");
  const slideActive = location.pathname === "/playground" && mode === "slideshow";
  const parallelActive = location.pathname === "/playground" && mode === "parallel";
  const playgroundActive = location.pathname === "/playground";
  const isDark = mounted && resolvedTheme === "dark";

  useEffect(() => {
    setMounted(true);
  }, []);

  const appSettings = useConvexQuery(convexApi.settings.get, {});
  const saveOpenRouterKey = useConvexMutation(convexApi.settings.setOpenRouterKey);
  const clearOpenRouterKey = useConvexMutation(convexApi.settings.clearOpenRouterKey);

  const openRouterStatus = appSettings?.openRouter;
  const openRouterLabel =
    openRouterStatus?.source === "frontend"
      ? "Saved in app"
      : "Not configured";

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

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/75 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="group flex min-w-0 items-center gap-3 text-left"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-white/70 text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground shadow-sm transition-transform duration-300 group-hover:-translate-y-0.5 dark:bg-white/[0.06] dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
              M
            </div>
            <div className="min-w-0">
              <div className="font-display text-xl leading-none text-foreground">mozaic</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {deepDivesActive ? "Deep Dives workspace" : "Conversation lab"}
              </div>
            </div>
          </button>

          <nav className="hidden items-center gap-2 md:flex">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className={`rounded-full px-4 ${deepDivesActive ? "bg-white/80 text-foreground shadow-sm dark:bg-white/[0.08] dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]" : "text-muted-foreground"}`}
            >
              Deep Dives
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setMode("slideshow"); navigate("/playground"); }}
              className={`rounded-full px-4 ${playgroundActive ? "bg-white/80 text-foreground shadow-sm dark:bg-white/[0.08] dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]" : "text-muted-foreground"}`}
            >
              <Presentation className="h-4 w-4" />
              Lab
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpenParallel(true)}
              className={`rounded-full px-4 ${parallelActive ? "bg-white/80 text-foreground shadow-sm dark:bg-white/[0.08] dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]" : "text-muted-foreground"}`}
            >
              <Boxes className="h-4 w-4" />
              Parallel
            </Button>
          </nav>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="h-10 w-10 rounded-full border border-border/70 bg-white/65 text-muted-foreground shadow-sm transition-colors hover:bg-white/85 hover:text-foreground dark:bg-white/[0.05] dark:text-muted-foreground dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] dark:hover:bg-white/[0.08] dark:hover:text-foreground"
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
            </Button>
            <Separator orientation="vertical" className="hidden h-6 md:block" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpenProviders(true)}
              className="rounded-full border-border/80 bg-white/75 px-4 dark:bg-white/[0.06]"
            >
              <span
                className={`h-2 w-2 rounded-full ${openRouterStatus?.configured ? "bg-[hsl(var(--ai-gpt))]" : "bg-destructive"}`}
              />
              AI Settings
            </Button>
          </div>
        </div>
      </header>

      <Dialog open={openParallel} onOpenChange={setOpenParallel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Parallel Mode</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Select which AIs to ask.
            </div>
            <div className="space-y-2">
              {availableProviders.map(p => {
                const model = AI_MODELS[p];
                const checked = parallelTargets.includes(p);
                return (
                  <label
                    key={p}
                    className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 cursor-pointer hover:bg-accent transition-colors"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => {
                        setParallelTargets(checked ? parallelTargets.filter(x => x !== p) : [...parallelTargets, p]);
                      }}
                    />
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
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setOpenParallel(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (parallelTargets.length === 0) return;
                  setMode("parallel");
                  navigate("/playground");
                  setOpenParallel(false);
                }}
              >
                Enter
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openProviders} onOpenChange={setOpenProviders}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>AI Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-[24px] border border-border/80 bg-card/70 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Deep Dives</div>
                  <div className="mt-2 text-lg text-foreground">Server OpenRouter key</div>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                    Deep Dives uses a server-side OpenRouter key. Saving it here stores it in the local app database on this machine and makes it available immediately.
                  </p>
                </div>
                <div className="rounded-full border border-border/80 bg-background/70 px-3 py-1 text-xs text-muted-foreground">
                  {appSettings === undefined ? "Checking..." : openRouterLabel}
                  {openRouterStatus?.lastFour ? ` • ••••${openRouterStatus.lastFour}` : ""}
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Input
                  value={serverKeyInput}
                  onChange={(e) => setServerKeyInput(e.target.value)}
                  placeholder="Paste your OpenRouter API key"
                  type="password"
                  className="flex-1"
                />
                <Button
                  onClick={saveServerKey}
                  disabled={!serverKeyInput.trim() || savingServerKey}
                  className="rounded-full"
                >
                  Save key
                </Button>
                {openRouterStatus?.source === "frontend" && (
                  <Button
                    variant="outline"
                    onClick={clearServerKey}
                    disabled={clearingServerKey}
                    className="rounded-full"
                  >
                    Clear saved key
                  </Button>
                )}
              </div>

              {settingsError && (
                <div className="mt-3 text-sm text-destructive">{settingsError}</div>
              )}

              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Manage keys in OpenRouter
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>

            {!deepDivesActive && (
              <div className="space-y-3 rounded-[24px] border border-border/80 bg-card/60 p-5">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Playground Only</div>
                  <div className="mt-2 text-lg text-foreground">Browser model keys</div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    These older playground modes still use browser-stored keys and per-model enablement.
                  </p>
                </div>
                <div className="space-y-2">
                  {allProviders.map(p => {
                    const model = AI_MODELS[p];
                    const enabled = availableProviders.includes(p);
                    const keyValue = providerApiKeys[p] ?? "";
                    return (
                      <div key={p} className="space-y-2 rounded-lg border bg-card p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="flex h-9 w-9 items-center justify-center rounded-md text-xs font-semibold"
                              style={{ backgroundColor: `hsl(var(--${model.color}) / 0.18)`, color: `hsl(var(--${model.color}))` }}
                            >
                              {model.name.slice(0, 1)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground">{model.name}</div>
                              <div className="text-xs text-muted-foreground truncate">{model.fullName}</div>
                            </div>
                          </div>
                          <label className="flex items-center gap-2 text-sm text-foreground">
                            <Checkbox checked={enabled} onCheckedChange={(v) => setProviderEnabled(p, Boolean(v))} />
                            Enabled
                          </label>
                        </div>
                        <Input
                          value={keyValue}
                          onChange={(e) => setProviderApiKey(p, e.target.value)}
                          placeholder="OpenRouter API key"
                          type="password"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button onClick={() => setOpenProviders(false)}>
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
