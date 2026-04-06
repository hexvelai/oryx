import { useMemo, useState } from "react";
import { Brain, Check, ChevronDown, Copy, Lock, Search, Tag, Zap, X } from "lucide-react";
import type { AIModel, AIProvider } from "@/types/ai";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type ModelTag = "fast" | "cheap" | "thinking";
type CategoryId = "all" | ModelTag;

const CATEGORY_META: Array<{
  id: CategoryId;
  label: string;
  icon: typeof Zap;
}> = [
  { id: "all", label: "All", icon: Search },
  { id: "fast", label: "Fast", icon: Zap },
  { id: "cheap", label: "Cheap", icon: Tag },
  { id: "thinking", label: "Thinking", icon: Brain },
];

export function ModelPicker({
  providers,
  orderProviders,
  selectedProviders,
  onSelectedProvidersChange,
  multiple = true,
  getModel,
  getTags,
  getGroupLabel,
  isSelectable,
  showCategories = true,
  showSearch = true,
  className,
  emptyHint = "No models match your filters.",
}: {
  providers: AIProvider[];
  orderProviders?: AIProvider[];
  selectedProviders: AIProvider[];
  onSelectedProvidersChange: (next: AIProvider[]) => void;
  multiple?: boolean;
  getModel: (provider: AIProvider) => AIModel | undefined;
  getTags?: (provider: AIProvider) => ModelTag[];
  getGroupLabel?: (provider: AIProvider) => string;
  isSelectable?: (provider: AIProvider) => boolean;
  showCategories?: boolean;
  showSearch?: boolean;
  className?: string;
  emptyHint?: string;
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryId>("all");
  const [expanded, setExpanded] = useState<Set<AIProvider>>(() => new Set());

  const selectionOrder = orderProviders ?? providers;
  const selectable = (provider: AIProvider) => (isSelectable ? isSelectable(provider) : true);
  const tagsFor = (provider: AIProvider) => (getTags ? getTags(provider) : []);

  const countsByCategory = useMemo(() => {
    const out: Record<CategoryId, number> = { all: 0, fast: 0, cheap: 0, thinking: 0 };
    for (const p of providers) {
      out.all += 1;
      const tags = getTags ? getTags(p) : [];
      if (tags.includes("fast")) out.fast += 1;
      if (tags.includes("cheap")) out.cheap += 1;
      if (tags.includes("thinking")) out.thinking += 1;
    }
    return out;
  }, [providers, getTags]);

  const filteredProviders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return providers.filter((p) => {
      if (activeCategory !== "all") {
        const tags = getTags ? getTags(p) : [];
        if (!tags.includes(activeCategory)) return false;
      }
      if (!q) return true;
      const model = getModel(p);
      const hay = `${model?.name ?? ""} ${model?.fullName ?? ""} ${model?.description ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [providers, query, activeCategory, getModel, getTags]);

  const grouped = useMemo(() => {
    const groups = new Map<string, AIProvider[]>();
    for (const p of filteredProviders) {
      const label = getGroupLabel ? getGroupLabel(p) : "Models";
      const list = groups.get(label) ?? [];
      list.push(p);
      groups.set(label, list);
    }
    return [...groups.entries()];
  }, [filteredProviders, getGroupLabel]);

  const setSelected = (next: AIProvider[]) => {
    const dedup = new Set<AIProvider>();
    for (const p of next) dedup.add(p);
    const ordered = selectionOrder.filter((p) => dedup.has(p));
    onSelectedProvidersChange(ordered);
  };

  const toggle = (provider: AIProvider) => {
    if (!selectable(provider)) return;
    if (multiple) {
      setSelected(selectedProviders.includes(provider) ? selectedProviders.filter((p) => p !== provider) : [...selectedProviders, provider]);
      return;
    }
    setSelected([provider]);
  };

  const removeSelected = (provider: AIProvider) => setSelected(selectedProviders.filter((p) => p !== provider));

  const toggleExpanded = (provider: AIProvider) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  };

  const copyText = async (text: string) => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-muted-foreground/70">Models</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the models you want available in this project.
          </p>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">{selectedProviders.length} selected</div>
      </div>

      {multiple && selectedProviders.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedProviders.map((p) => {
            const model = getModel(p);
            if (!model) return null;
            return (
              <button
                key={p}
                type="button"
                onClick={() => removeSelected(p)}
                className="group inline-flex items-center gap-2 rounded-md bg-accent/60 px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent"
                title="Remove"
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `hsl(var(--${model.color}))` }} />
                <span className="max-w-[16rem] truncate">{model.name}</span>
                <X className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
              </button>
            );
          })}
        </div>
      )}

      {showSearch && (
        <div className="mt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models…"
              className="h-9 pl-9"
            />
          </div>
        </div>
      )}

      <div className={cn("mt-4 flex min-h-0 gap-4", showCategories ? "flex-row" : "flex-col")}>
        {showCategories && (
          <div className="w-[180px] shrink-0">
            <p className="px-1 text-[10px] uppercase tracking-widest text-muted-foreground/70">Collections</p>
            <div className="mt-2 space-y-1">
              {CATEGORY_META.map((c) => {
                const Icon = c.icon;
                const active = activeCategory === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveCategory(c.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                      active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span className="text-sm font-medium">{c.label}</span>
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">{countsByCategory[c.id]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 rounded-xl border border-border/50 bg-background/40">
          <ScrollArea className="h-full">
            <div className="divide-y divide-border/40">
              {grouped.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground">{emptyHint}</div>
              )}

              {grouped.map(([groupLabel, list]) => {
                return (
                  <div key={groupLabel}>
                    {grouped.length > 1 && (
                      <div className="px-4 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/70">
                        {groupLabel}
                      </div>
                    )}
                    <div className="divide-y divide-border/40">
                      {list.map((provider) => {
                        const model = getModel(provider);
                        if (!model) return null;
                        const selected = selectedProviders.includes(provider);
                        const canPick = selectable(provider);
                        const open = expanded.has(provider);
                        const tags = tagsFor(provider);
                        return (
                          <Collapsible
                            key={provider}
                            open={open}
                            onOpenChange={() => toggleExpanded(provider)}
                          >
                            <div
                              className={cn(
                                "relative flex items-start gap-3 px-4 py-3 transition-colors",
                                selected ? "bg-primary/[0.05]" : "hover:bg-accent/30",
                                canPick ? "" : "opacity-50",
                              )}
                            >
                              <div
                                className="absolute left-0 top-0 h-full w-[2px]"
                                style={{
                                  backgroundColor: selected ? `hsl(var(--${model.color}))` : "transparent",
                                }}
                              />

                              <button
                                type="button"
                                onClick={() => toggle(provider)}
                                className="flex min-w-0 flex-1 items-start gap-3 text-left"
                              >
                                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: `hsl(var(--${model.color}))` }} />
                                <span className="min-w-0">
                                  <span className="block text-sm font-medium leading-snug text-foreground break-words">
                                    {model.name}
                                  </span>
                                  <span className="mt-1 block text-xs leading-snug text-muted-foreground line-clamp-2">
                                    {model.description}
                                  </span>
                                  {tags.length > 0 && (
                                    <span className="mt-2 flex flex-wrap gap-1.5">
                                      {tags.slice(0, 2).map((t) => (
                                        <span key={t} className="rounded-sm bg-muted/60 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                                          {t}
                                        </span>
                                      ))}
                                    </span>
                                  )}
                                </span>
                              </button>

                              <div className="flex shrink-0 items-center gap-2 pt-1">
                                {!canPick && <Lock className="h-4 w-4 text-muted-foreground" />}
                                {selected && <Check className="h-4 w-4 text-primary" />}
                                <CollapsibleTrigger asChild>
                                  <button
                                    type="button"
                                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                    aria-label="Details"
                                  >
                                    <ChevronDown className={cn("h-4 w-4 transition-transform", open ? "rotate-180" : "")} />
                                  </button>
                                </CollapsibleTrigger>
                              </div>
                            </div>

                            <CollapsibleContent>
                              <div className="px-4 pb-3">
                                <div className="grid gap-2 rounded-lg bg-card/40 p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">Model ID</div>
                                      <div className="mt-1 font-mono text-xs text-foreground break-all">{model.fullName}</div>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2"
                                      onClick={() => void copyText(model.fullName)}
                                    >
                                      <Copy className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
