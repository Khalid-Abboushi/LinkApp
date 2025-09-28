// utils/safeImage.ts
import { Image } from "react-native";

/** A tasteful, license-friendly fallback */
export const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1528605248644-14dd04022da1?q=80&w=1600&auto=format&fit=crop";

/**
 * Normalize possibly-weird image URLs coming from Yelp/AI:
 * - ensure https
 * - strip query junk (which sometimes breaks RN)
 * - fall back if empty
 */
export function normalizeImage(u?: string | null): string {
  if (!u || typeof u !== "string") return FALLBACK_IMG;

  let s = u.trim();

  // Some APIs return protocol-relative URLs
  if (s.startsWith("//")) s = "https:" + s;

  // Force https if missing scheme
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;

  // Remove query/hash (RN occasionally fails on long signed URLs)
  try {
    const url = new URL(s);
    url.search = "";
    url.hash = "";
    s = url.toString();
  } catch {
    // Fallback naive strip
    s = s.split("?")[0].split("#")[0];
  }

  // Very short or obviously broken? fallback.
  if (s.length < 10) return FALLBACK_IMG;

  return s || FALLBACK_IMG;
}

/**
 * Best-effort prefetch. Failures are ignored on purpose.
 * Use it to warm the cache before rendering cards.
 */
export async function prefetchImages(urls: string[]): Promise<void> {
  if (!urls?.length) return;
  const tasks = urls.map((u) => Image.prefetch(u).catch(() => false));
  try {
    await Promise.all(tasks);
  } catch {
    // ignore
  }
}