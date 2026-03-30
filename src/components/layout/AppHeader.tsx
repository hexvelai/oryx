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
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useChatContext } from "@/context/ChatContext";
import { convexApi } from "@/lib/convex-api";
import { AI_MODELS } from "@/types/ai";
import type { AIProvider } from "@/types/ai";

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
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${serverKeysConfigured ? "bg-[hsl(var(--ai-gpt))]" : "bg-destructive"}`}
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
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background">
        {workspace ? (
          <div className="mx-auto flex h-14 w-full max-w-none items-center gap-2 px-3 sm:gap-3 sm:px-4">
            <div className="min-w-0 flex-1">{workspace.leading}</div>
            {workspace.beforeSystemControls ? (
              <div className="flex shrink-0 items-center gap-0.5">{workspace.beforeSystemControls}</div>
            ) : null}
            {systemControls}
          </div>
        ) : (
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
            <div className="flex min-w-0 items-center">{aiSettingsButton}</div>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="absolute left-1/2 -translate-x-1/2 transition-opacity hover:opacity-80"
              aria-label="Home"
            >
              <BrandLogo large showLabel={false} className="gap-0" />
            </button>
            <div className="flex min-w-0 items-center">{homeTrailingControls}</div>
          </div>
        )}
      </header>

      <Dialog open={openProviders} onOpenChange={setOpenProviders}>
        <DialogContent className="border-border/50 bg-card sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-display">AI Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3 rounded-xl border border-border/50 p-5">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Projects</p>
                <p className="mt-1.5 text-base font-medium text-foreground">Gemini API Key</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Google Gemini direct access for projects. Stored in app database.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${geminiStatus?.configured ? "bg-[hsl(var(--ai-gemini))]" : "bg-muted-foreground/30"}`} />
                {appSettings === undefined ? "Checking..." : geminiLabel}
                {geminiStatus?.lastFour ? ` · ****${geminiStatus.lastFour}` : ""}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={geminiKeyInput}
                  onChange={(e) => setGeminiKeyInput(e.target.value)}
                  placeholder="Paste Gemini API key"
                  type="password"
                  className="flex-1"
                />
                <Button
                  onClick={saveGeminiServerKey}
                  disabled={!geminiKeyInput.trim() || savingGeminiKey}
                  size="sm"
                >
                  Save
                </Button>
                {geminiStatus?.source === "frontend" && (
                  <Button variant="ghost" size="sm" onClick={clearGeminiServerKey} disabled={clearingGeminiKey}>
                    Clear
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border/50 p-5">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Projects</p>
                <p className="mt-1.5 text-base font-medium text-foreground">OpenRouter API Key</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Server-side OpenRouter key for project chat. Stored in app database.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${openRouterStatus?.configured ? "bg-[hsl(var(--ai-gpt))]" : "bg-muted-foreground/30"}`} />
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
              {settingsError && (
                <p className="text-sm text-destructive">{settingsError}</p>
              )}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Manage OpenRouter keys
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>

            {!deepDivesActive && (
              <div className="space-y-3 rounded-xl border border-border/50 p-5">
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">Playground</p>
                  <p className="mt-1.5 text-base font-medium text-foreground">Browser Model Keys</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Legacy playground modes use browser-stored keys and per-model toggles.
                  </p>
                </div>
                <div className="space-y-2">
                  {allProviders.map(p => {
                    const model = AI_MODELS[p];
                    const enabled = availableProviders.includes(p);
                    const keyValue = providerApiKeys[p] ?? "";
                    return (
                      <div key={p} className="space-y-2 rounded-lg border border-border/40 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold"
                              style={{ backgroundColor: `hsl(var(--${model.color}) / 0.12)`, color: `hsl(var(--${model.color}))` }}
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
                            On
                          </label>
                        </div>
                        <Input
                          value={keyValue}
                          onChange={(e) => setProviderApiKey(p, e.target.value)}
                          placeholder="API key"
                          type="password"
                        />
                      </div>
                    );
                  })}
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
