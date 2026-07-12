// Fetches one of the admin-configurable per-screen background image URLs
// (restaurant_settings.bg_*_url) from the public settings endpoint. Purely
// decorative — failures are silent, the screen just renders without a
// background layer.
//
// The last successfully-fetched URL per field is cached locally and read
// back immediately on the next mount (before the network call resolves) —
// same fix as the home hero's flash: without it, the screen briefly renders
// with no background/scrim at all, then "flashes" once the fetch completes
// and the image + dim layer appear on top.
import { useEffect, useState } from "react";
import { api } from "@/src/api";
import { storage } from "@/src/utils/storage";

type BgField = "bg_home_url" | "bg_reservations_url" | "bg_account_url" | "bg_menu_url";

export function useBackgroundImage(field: BgField): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const cacheKey = `@last_${field}`;
    (async () => {
      const cached = await storage.getItem<string>(cacheKey, "");
      if (!cancelled && cached) setUrl(cached);
      try {
        const s = await api.publicRestaurantSettings();
        if (!cancelled && s && s[field]) {
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
