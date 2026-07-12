// Fetches one of the admin-configurable per-screen background image URLs
// (restaurant_settings.bg_*_url) from the public settings endpoint. Purely
// decorative — failures are silent, the screen just renders without a
// background layer.
import { useEffect, useState } from "react";
import { api } from "@/src/api";

type BgField = "bg_home_url" | "bg_reservations_url" | "bg_account_url" | "bg_menu_url";

export function useBackgroundImage(field: BgField): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.publicRestaurantSettings();
        if (!cancelled && s && s[field]) setUrl(s[field]);
      } catch {
        // silent — purely decorative, no error UI needed.
      }
    })();
    return () => { cancelled = true; };
  }, [field]);
  return url;
}
