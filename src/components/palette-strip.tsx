import { cn } from "@/lib/utils";

export function PaletteStrip({ colors, className }: { colors: string[]; className?: string }) {
  if (!colors.length) return <div className={cn("h-2 rounded-full bg-surface-3", className)} />;
  return (
    <div className={cn("flex h-2 overflow-hidden rounded-full ring-1 ring-white/10", className)} aria-hidden>
      {colors.map((c, i) => (
        <span key={i} className="flex-1" style={{ background: c }} />
      ))}
    </div>
  );
}
