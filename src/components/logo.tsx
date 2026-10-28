import { cn } from "@/lib/utils";

/** MUNE TOKENS mark: a black "M" on a white tile (the inverse of MUNE TASKS). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8", className)} aria-hidden>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="#fff" />
      <path d="M16 45V20l16 17 16-17v25" stroke="#000" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Two-tone wordmark: MUNE in white, TOKENS in grey. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-semibold tracking-[0.14em] whitespace-nowrap", className)}>
      MUNE <span className="text-[#737373]">TOKENS</span>
    </span>
  );
}
