"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/system-browser";
import { StylePicker } from "@/components/style-picker";
import { nearestStep, restepSet } from "@/lib/tokens/defaults";
import type { SystemSettings, TokenSet } from "@/lib/tokens/schema";

/** Per-system settings: brief, ramp steps, modes, contrast target, UI-CONFIG contents, Figma link. */
export function SystemSettingsDialog({
  open,
  onOpenChange,
  brief,
  settings,
  tokens,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  brief: string;
  settings: SystemSettings;
  tokens: TokenSet;
  onApply: (next: { brief: string; settings: SystemSettings; tokens: TokenSet }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-xl">
        {open && <SettingsBody brief={brief} settings={settings} tokens={tokens} onApply={onApply} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

/** Mounted on open, so the form starts from the current draft each time. */
function SettingsBody({
  brief,
  settings,
  tokens,
  onApply,
  onClose,
}: {
  brief: string;
  settings: SystemSettings;
  tokens: TokenSet;
  onApply: (next: { brief: string; settings: SystemSettings; tokens: TokenSet }) => void;
  onClose: () => void;
}) {
  const [b, setB] = useState(brief);
  const [s, setS] = useState(settings);
  const set = <K extends keyof SystemSettings>(k: K, v: SystemSettings[K]) => setS((p) => ({ ...p, [k]: v }));

  const apply = () => {
    let next = tokens;
    if (s.steps !== settings.steps) {
      // Rebuild ramps for the new step set and move references to the nearest step that exists.
      const remap = (ref: string) => {
        const [root, ramp, step] = ref.split("/");
        return root === "color" && ramp && /^\d+$/.test(step) ? `color/${ramp}/${nearestStep(Number(step), s.steps)}` : ref;
      };
      next = { ...restepSet(tokens, s.steps), semantic: tokens.semantic.map((t) => ({ ...t, light: remap(t.light), dark: remap(t.dark) })) };
    }
    onApply({ brief: b, settings: s, tokens: next });
    onClose();
  };

  return (
    <>
        <DialogHeader>
          <DialogTitle>System settings</DialogTitle>
          <DialogDescription>Changes apply to the draft; save to keep them.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="sys-brief">Brief</Label>
            <Textarea id="sys-brief" rows={4} value={b} onChange={(e) => setB(e.target.value)} className="rounded-xl bg-surface-2" />
            <p className="text-xs text-subtle-foreground">Used as context when regenerating groups, and quoted in UI-CONFIG.md.</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Visual style</p>
            <StylePicker value={s.style} onChange={(v) => set("style", v)} distinctive={s.distinctive} onDistinctive={(v) => set("distinctive", v)} />
            <p className="text-xs text-subtle-foreground">Steers Regenerate, component specs and UI-CONFIG.md. Existing tokens don&apos;t change until you regenerate them.</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Ramp steps</p>
              <Segmented value={s.steps} onChange={(v) => set("steps", v)} options={[{ value: "11", label: "50–950" }, { value: "9", label: "100–900" }]} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Modes</p>
              <Segmented value={s.modes} onChange={(v) => set("modes", v)} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "both", label: "Both" }]} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Contrast</p>
              <Segmented value={s.contrast} onChange={(v) => set("contrast", v)} options={[{ value: "AA", label: "AA" }, { value: "AAA", label: "AAA" }]} />
            </div>
          </div>
          {s.steps !== settings.steps && (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
              Changing steps rebuilds every ramp from its base (hand-edited steps are reset) and moves references to the nearest step.
            </p>
          )}
          <div className="space-y-2">
            <p className="text-sm font-medium">UI-CONFIG.md includes</p>
            <Segmented
              value={s.uiConfig}
              onChange={(v) => set("uiConfig", v)}
              options={[
                { value: "tokens", label: "Tokens only" },
                { value: "tokens+rules", label: "Tokens + do/don't rules" },
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sys-figma">Figma file link</Label>
            <Input id="sys-figma" value={s.figmaUrl} onChange={(e) => set("figmaUrl", e.target.value)} placeholder="https://www.figma.com/design/…" className="rounded-xl bg-surface-2" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={apply}>Apply</Button>
        </DialogFooter>
    </>
  );
}
