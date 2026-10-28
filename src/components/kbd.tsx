import { cn } from "@/lib/utils";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border bg-muted px-1 font-sans text-[0.65rem] font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
