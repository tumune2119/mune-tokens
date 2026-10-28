"use client";

import { useRef, useState } from "react";
import { Check, Save, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { costLine } from "@/components/new-system/new-system";
import { streamAi } from "@/lib/client/ai-stream";
import { componentGridHtml } from "@/lib/components/render";
import { ComponentSpecSchema, specProblems, type ComponentSpec } from "@/lib/components/schema";
import { resolveSemantic } from "@/lib/tokens/color";
import type { Mode, TokenSet } from "@/lib/tokens/schema";
import type { UsageInfo } from "@/lib/ai/events";
import type { StoredComponentClient } from "./types";

/** "Add a destructive variant", "denser padding": a revised spec with its preview and cost, applied only on confirm. */
export function ReviseDialog({
  open,
  onOpenChange,
  systemId,
  item,
  tokens,
  mode,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  systemId: string;
  item: StoredComponentClient;
  tokens: TokenSet;
  mode: Mode;
  onApply: (spec: ComponentSpec) => Promise<void>;
}) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [chars, setChars] = useState(0);
  const [result, setResult] = useState<{ spec: ComponentSpec; usage: UsageInfo } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function run() {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setResult(null);
    setChars(0);
    try {
      const { data, usage } = await streamAi<ComponentSpec>(
        `/api/systems/${systemId}/components/${item.id}/revise`,
        { instruction },
        { onText: (d) => setChars((c) => c + d.length), onRetry: () => setChars(0) },
        ctrl.signal,
      );
      setResult({ spec: data, usage });
    } catch (err) {
      if (!ctrl.signal.aborted) toast.error((err as Error).message);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  const close = (o: boolean) => {
    if (o) return onOpenChange(true);
    abortRef.current?.abort();
    setResult(null);
    onOpenChange(false);
  };
  const canvas = {
    bg: resolveSemantic(tokens, "color/bg/default", mode) ?? "#ffffff",
    fg: resolveSemantic(tokens, "color/text/default", mode) ?? "#0a0a0a",
    muted: resolveSemantic(tokens, "color/text/muted", mode) ?? "#737373",
    border: resolveSemantic(tokens, "color/border/default", mode) ?? "#e5e5e5",
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-2xl sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Revise {item.name}</DialogTitle>
          <DialogDescription>Describe the change. You&apos;ll see the new variant grid and its cost before anything is saved.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && !busy && instruction.trim() && run()}
          rows={3}
          disabled={busy}
          placeholder="Add a destructive variant · denser padding · an icon-only size"
          className="rounded-xl bg-surface-2"
        />
        {busy && <p className="font-mono text-xs text-muted-foreground">Writing… {chars.toLocaleString()} chars</p>}
        {result && (
          <div className="space-y-2">
            <p className="font-mono text-xs text-muted-foreground">{costLine(result.usage)}</p>
            <div className="overflow-x-auto rounded-xl p-5" style={{ background: canvas.bg, color: canvas.fg }}>
              <div dangerouslySetInnerHTML={{ __html: componentGridHtml(result.spec, tokens, mode, canvas) }} />
            </div>
          </div>
        )}
        <DialogFooter>
          {busy ? (
            <Button variant="outline" onClick={() => abortRef.current?.abort()}>
              <Square className="fill-current" /> Cancel
            </Button>
          ) : result ? (
            <>
              <Button variant="outline" onClick={run}>
                <Sparkles /> Try again
              </Button>
              <Button
                onClick={async () => {
                  await onApply(result.spec);
                  close(false);
                }}
              >
                <Check /> Apply
              </Button>
            </>
          ) : (
            <Button onClick={run} disabled={!instruction.trim()}>
              <Sparkles /> Revise
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Hand-edit the spec as JSON; validated against the schema and the current tokens before saving. */
export function SpecJsonDialog({
  open,
  onOpenChange,
  spec,
  tokens,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  spec: ComponentSpec;
  tokens: TokenSet;
  onSave: (spec: ComponentSpec) => Promise<boolean>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] rounded-2xl sm:max-w-3xl">{open && <JsonBody spec={spec} tokens={tokens} onSave={onSave} onClose={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function JsonBody({ spec, tokens, onSave, onClose }: { spec: ComponentSpec; tokens: TokenSet; onSave: (s: ComponentSpec) => Promise<boolean>; onClose: () => void }) {
  const [text, setText] = useState(() => JSON.stringify(spec, null, 2));
  const [errors, setErrors] = useState<string[]>([]);
  const save = async () => {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      return setErrors([`Invalid JSON: ${(e as Error).message}`]);
    }
    const parsed = ComponentSpecSchema.safeParse(raw);
    if (!parsed.success) return setErrors(parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "spec"}: ${i.message}`));
    const problems = specProblems(parsed.data, tokens);
    if (problems.length) return setErrors(problems.slice(0, 6));
    setErrors([]);
    if (await onSave(parsed.data)) {
      toast("Spec saved.");
      onClose();
    }
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit spec</DialogTitle>
        <DialogDescription>Anatomy, props, states and token bindings. Token names must exist in this system.</DialogDescription>
      </DialogHeader>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && (e.preventDefault(), save())}
        spellCheck={false}
        className="h-[55dvh] resize-none rounded-xl bg-surface-2 font-mono text-xs"
      />
      {errors.length > 0 && (
        <ul className="space-y-0.5 rounded-xl bg-white px-3 py-2 font-mono text-xs text-black">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>
          <Save /> Save spec
        </Button>
      </DialogFooter>
    </>
  );
}
