import { createHash } from "node:crypto";

/** Case-, accent- and punctuation-insensitive key, so "LocalGlobe" matches "Local Globe". */
export function nameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** JSON with object keys sorted, so equal data always serialises to equal bytes. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : inner,
  );
}

export const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
