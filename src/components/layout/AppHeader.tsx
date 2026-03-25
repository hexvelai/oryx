import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus, Presentation, Boxes } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useChatContext } from "@/context/ChatContext";
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
  const navigate = useNavigate();
  const location = useLocation();
  const [openParallel, setOpenParallel] = useState(false);
  const [openProviders, setOpenProviders] = useState(false);

  const allProviders = useMemo(() => Object.keys(AI_MODELS) as AIProvider[], []);
  const deepDivesActive = location.pathname === "/" || location.pathname.startsWith("/dive/");
  const slideActive = location.pathname === "/playground" && mode === "slideshow";
  const parallelActive = location.pathname === "/playground" && mode === "parallel";

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-background/80 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="flex items-center gap-2 px-2"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-foreground ring-1 ring-border">
            M
          </div>
          <div className="text-sm font-semibold tracking-tight">mozaic</div>
        </Button>

        <nav className="flex items-center gap-1">
          <Button
            variant={deepDivesActive ? "secondary" : "ghost"}
            size="sm"
            onClick={() => navigate("/")}
          >
            Deep Dives
          </Button>
          <Button
            variant={slideActive ? "secondary" : "ghost"}
            size="sm"
            onClick={() => { setMode("slideshow"); navigate("/playground"); }}
          >
            <Presentation className="h-4 w-4" />
            Slide
          </Button>
          <Button
            variant={parallelActive ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setOpenParallel(true)}
          >
            <Boxes className="h-4 w-4" />
            Parallel Mode
          </Button>
        </nav>

        <div className="flex items-center gap-2">
          <Separator orientation="vertical" className="h-6" />
          <Button variant="outline" size="sm" onClick={() => setOpenProviders(true)}>
            <Plus className="h-4 w-4" />
            Add AIs
          </Button>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>AI Access</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Enable AIs and add API keys (stored locally in your browser).
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
