/**
 * Brand registry: the single source of truth for site identities.
 * Every StarIntel web property renders its wordmark from here so the
 * stated name is templated, never hardcoded.
 *
 *   starintel -> (starintel(λx.xx))   compact: starintel (λ)
 *   symbolics -> (symbolics(λx.xx))   compact: symbolics (λ)
 */

export type Brand = "starintel" | "symbolics";

export interface BrandTheme {
  /** Wordmark inner name (the lambda form stays constant). */
  name: string;
  /** Full wordmark string. */
  wordmark: string;
  /** Compact wordmark string. */
  compact: string;
  /** Organization display name for titles/SEO. */
  orgName: string;
  /** Footer tagline. */
  tagline: string;
}

export const BRANDS: Record<Brand, BrandTheme> = {
  starintel: {
    name: "starintel",
    wordmark: "(starintel(λx.xx))",
    compact: "starintel (λ)",
    orgName: "StarIntel",
    tagline: "symbolic systems, structurally.",
  },
  symbolics: {
    name: "symbolics",
    wordmark: "(symbolics(λx.xx))",
    compact: "symbolics (λ)",
    orgName: "Symbolics",
    tagline: "agents with a full Linux computer.",
  },
};

export const DEFAULT_BRAND: Brand = "starintel";

export function brandTheme(brand: Brand | string | undefined): BrandTheme {
  if (brand && brand in BRANDS) return BRANDS[brand as Brand];
  return BRANDS[DEFAULT_BRAND];
}

/** Aria label for a wordmark, e.g. "starintel lambda x dot x x". */
export function wordmarkAria(theme: BrandTheme): string {
  return `${theme.name} lambda x dot x x`;
}
