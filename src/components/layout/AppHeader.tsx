import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation as useConvexMutation, useQuery as useConvexQuery } from "convex/react";
import { useTheme } from "next-themes";
import { useLocation, useNavigate } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { ArrowUpRight, MoonStar, SunMedium } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useChatContext } from "@/context/ChatContext";
import { convexApi } from "@/lib/convex-api";
import { AI_MODELS } from "@/types/ai";
import type { AIProvider } from "@/types/ai";

export type AppHeaderWorkspaceProps = {
  /** Replaces the default logo + tagline block */
  leading: ReactNode;
  /** Shown after leading, before theme / AI / account (e.g. panel toggles) */
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
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingServerKey, setSavingServerKey] = useState(false);
  const [clearingServerKey, setClearingServerKey] = useState(false);
  const [savingGeminiKey, setSavingGeminiKey] = useState(false);
  const [clearingGeminiKey, setClearingGeminiKey] = useState(false);

  const allProviders = useMemo(() => Object.keys(AI_MODELS) as AIProvider[], []);
  const deepDivesActive =
    location.pathname === "/" || location.pathname.startsWith("/dive/");
  const isDark = mounted && resolvedTheme === "dark";

  useEffect(() => {
    setMounted(true);
  }, []);

  const appSettings = useConvexQuery(convexApi.settings.get, {});
  const saveOpenRouterKey = useConvexMutation(convexApi.settings.setOpenRouterKey);
  const clearOpenRouterKey = useConvexMutation(convexApi.settings.clearOpenRouterKey);
  const saveGeminiKey = useConvexMutation(convexApi.settings.setGeminiKey);
  const clearGeminiKey = useConvexMutation(convexApi.settings.clearGeminiKey);

  const openRouterStatus = appSettings?.openRouter;
  const geminiStatus = appSettings?.gemini;
  const openRouterLabel =
    openRouterStatus?.source === "frontend"
      ? "Saved in app"
      : "Not configured";
  const geminiLabel =
    geminiStatus?.source === "frontend"
      ? "Saved in app"
      : "Not configured";
  const serverKeysConfigured = Boolean(openRouterStatus?.configured || geminiStatus?.configured);

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

  const saveGeminiServerKey = async () => {
    const trimmed = geminiKeyInput.trim();
    if (!trimmed) return;
    setSettingsError(null);
    setSavingGeminiKey(true);
    try {
      await saveGeminiKey({ apiKey: trimmed });
      setGeminiKeyInput("");
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Failed to save key");
    } finally {
      setSavingGeminiKey(false);
    }
  };

  const clearGeminiServerKey = async () => {
    setSettingsError(null);
    setClearingGeminiKey(true);
    try {
      await clearGeminiKey({});
      setGeminiKeyInput("");
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Failed to clear key");
    } finally {
      setClearingGeminiKey(false);
    }
  };

  const themeToggleButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="h-9 w-9 rounded-full border border-border/70 bg-white/65 text-muted-foreground shadow-sm transition-colors hover:bg-white/85 hover:text-foreground dark:bg-white/[0.05] dark:text-muted-foreground dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] dark:hover:bg-white/[0.08] dark:hover:text-foreground sm:h-10 sm:w-10"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
    </Button>
  );

  const aiSettingsButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setOpenProviders(true)}
      className="rounded-full border-border/80 bg-white/75 px-2.5 text-xs dark:bg-white/[0.06] sm:px-4 sm:text-sm"
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${serverKeysConfigured ? "bg-[hsl(var(--ai-gpt))]" : "bg-destructive"}`}
      />
      <span className="hidden sm:inline">AI Settings</span>
      <span className="sm:hidden">AI</span>
    </Button>
  );

  const userAccountControl = (
    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-white/65 shadow-sm dark:bg-white/[0.05] sm:h-10 sm:w-10">
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
    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      {themeToggleButton}
      <Separator orientation="vertical" className="hidden h-6 sm:block" />
      {aiSettingsButton}
      <Separator orientation="vertical" className="mx-0.5 h-6" />
      {userAccountControl}
    </div>
  );

  const homeTrailingControls = (
    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      {themeToggleButton}
      <Separator orientation="vertical" className="mx-0.5 h-6" />
      {userAccountControl}
    </div>
  );

  return (
    <>
      <header
        className={`sticky z-40 overflow-visible border-b border-border/70 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 ${
          workspace
            ? "top-0 shadow-sm shadow-black/[0.03] dark:shadow-black/20"
            : "top-2 mt-2 sm:top-3 sm:mt-3"
        }`}
      >
        {workspace ? (
          <div className="mx-auto flex min-h-12 w-full max-w-none items-center gap-2 px-3 py-1.5 sm:min-h-[52px] sm:gap-3 sm:px-4 sm:py-2">
            <div className="min-w-0 flex-1">{workspace.leading}</div>
            {workspace.beforeSystemControls ? (
              <div className="flex shrink-0 items-center gap-1">{workspace.beforeSystemControls}</div>
            ) : null}
            {systemControls}
          </div>
        ) : (
          <div className="mx-auto grid w-full max-w-[1600px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3.5 sm:px-6 sm:py-4">
            <div className="flex min-w-0 justify-self-start">{aiSettingsButton}</div>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="group flex justify-center justify-self-center overflow-visible text-center transition-transform duration-300 hover:-translate-y-0.5"
              aria-label="Home"
            >
              <BrandLogo large showLabel={false} className="gap-0" />
            </button>
            <div className="flex min-w-0 justify-self-end">{homeTrailingControls}</div>
          </div>
        )}
      </header>

      <Dialog open={openProviders} onOpenChange={setOpenProviders}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>AI Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-[24px] border border-border/80 bg-card/70 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Projects</div>
                  <div className="mt-2 text-lg text-foreground">Server Gemini key</div>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                    Projects can use Google Gemini directly. Saving it here stores it in the local app database on this machine.
                  </p>
                </div>
                <div className="rounded-full border border-border/80 bg-background/70 px-3 py-1 text-xs text-muted-foreground">
                  {appSettings === undefined ? "Checking..." : geminiLabel}
                  {geminiStatus?.lastFour ? ` • ••••${geminiStatus.lastFour}` : ""}
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Input
                  value={geminiKeyInput}
                  onChange={(e) => setGeminiKeyInput(e.target.value)}
                  placeholder="Paste your Gemini API key"
                  type="password"
                  className="flex-1"
                />
                <Button
                  onClick={saveGeminiServerKey}
                  disabled={!geminiKeyInput.trim() || savingGeminiKey}
                  className="rounded-full"
                >
                  Save key
                </Button>
                {geminiStatus?.source === "frontend" && (
                  <Button
                    variant="outline"
                    onClick={clearGeminiServerKey}
                    disabled={clearingGeminiKey}
                    className="rounded-full"
                  >
                    Clear saved key
                  </Button>
                )}
              </div>

              {settingsError && (
                <div className="mt-3 text-sm text-destructive">{settingsError}</div>
              )}
            </div>

            <div className="rounded-[24px] border border-border/80 bg-card/70 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Projects</div>
                  <div className="mt-2 text-lg text-foreground">Server OpenRouter key</div>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                    Projects use a server-side OpenRouter key. Saving it here stores it in the local app database on this machine and makes it available immediately.
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
