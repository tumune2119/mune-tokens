import "server-only";
import type { TokenSet } from "../tokens/schema";

export type FontStatus = "google" | "missing" | "unknown";

const cache = new Map<string, { at: number; ok: boolean | null }>();
const TTL = 6 * 60 * 60_000;

const familyParam = (family: string) => family.trim().replace(/\s+/g, "+");

export function googleCssUrl(family: string, weights?: number[]) {
  const w = weights?.length ? `:wght@${[...new Set(weights)].sort((a, b) => a - b).join(";")}` : "";
  return `https://fonts.googleapis.com/css2?family=${familyParam(family)}${w}&display=swap`;
}

/** true = loads, false = Google Fonts rejects it, null = couldn't check (offline). */
async function loads(url: string): Promise<boolean | null> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.ok;
  let ok: boolean | null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { "User-Agent": "Mozilla/5.0" } });
    ok = res.ok;
  } catch {
    ok = null;
  }
  // Don't remember network failures for long.
  cache.set(url, { at: ok === null ? Date.now() - TTL + 60_000 : Date.now(), ok });
  return ok;
}

export async function checkFont(family: string): Promise<FontStatus> {
  const ok = await loads(googleCssUrl(family));
  return ok === null ? "unknown" : ok ? "google" : "missing";
}

/**
 * Stylesheet links for every font in the set, with the weights its text styles use. If a family
 * doesn't offer one of those weights, fall back to the plain family; families Google doesn't have
 * are left to the system.
 */
export async function fontLinksFor(set: TokenSet): Promise<string[]> {
  const out = await Promise.all(
    set.fonts.map(async (f) => {
      const weights = set.typeScale.filter((t) => t.font === f.key).map((t) => t.weight);
      const withWeights = googleCssUrl(f.family, weights.length ? weights : [400]);
      const first = await loads(withWeights);
      if (first !== false) return withWeights;
      const plain = googleCssUrl(f.family);
      return (await loads(plain)) === false ? null : plain;
    }),
  );
  return out.filter((x): x is string => !!x);
}
