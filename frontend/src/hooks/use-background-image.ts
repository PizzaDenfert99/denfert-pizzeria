// Fetches one of the admin-configurable per-screen background image URLs
// (restaurant_settings.bg_*_url) from the public settings endpoint. Purely
// decorative — failures are silent, the screen just renders without a
// background layer.
//
// Two layers of caching, for two different flashes:
//  1. Module-scoped `memCache` — survives remounts within the same running
//     app session (e.g. a tab screen being torn down and rebuilt on
//     navigation). `useState`'s lazy initializer reads it SYNCHRONOUSLY on
//     the very first render, so once a field has been resolved once this
//     session, every later mount of that hook starts already-correct with
//     zero async wait — no flash/flicker when switching tabs.
//  2. `storage` (AsyncStorage-backed) — persists across app restarts, so the
//     very first mount after a cold start doesn't have to wait on the
//     network either (this is what memCache is empty for).
import { useEffect, useState } from "react";
import { api } from "@/src/api";
import { storage } from "@/src/utils/storage";

type BgField = "bg_home_url" | "bg_reservations_url" | "bg_account_url" | "bg_menu_url";

const memCache: Partial<Record<BgField, string>> = {};

export function useBackgroundImage(field: BgField): string | null {
  const [url, setUrl] = useState<string | null>(() => memCache[field] ?? null);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `@last_${field}`;
    (async () => {
      // Only fall back to the slower persistent cache if nothing is already
      // known for this field in this session.
      if (!memCache[field]) {
        const cached = await storage.getItem<string>(cacheKey, "");
        if (cached) {
          memCache[field] = cached;
          if (!cancelled) setUrl(cached);
        }
      }
      try {
        const s = await api.publicRestaurantSettings();
        if (!cancelled && s && s[field]) {
          memCache[field] = s[field];
          setUrl(s[field]);
          storage.setItem(cacheKey, s[field]);
        }
      } catch {
        // silent — purely decorative, no error UI needed.
      }
    })();
    return () => { cancelled = true; };
  }, [field]);

  return url;
}
