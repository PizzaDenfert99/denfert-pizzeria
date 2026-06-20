// Global idle-watcher for the in-restaurant tablet kiosk experience.
//
// Behaviour:
//   * Activates only on the loyalty subdomain (so the main customer site is
//     never hijacked).
//   * Watches for ANY user interaction (touch, click, key, scroll, mouse move)
//     and any expo-router pathname change — each resets the timer.
//   * After `idle_seconds` of true inactivity, navigates to `/kiosk` which
//     boots the auto-rotating promotional slideshow.
//   * Does NOT fire when the user is already on `/kiosk` or on any admin
//     screen (so staff using the QR scanner aren't yanked away).
//   * Fetches the configured `idle_seconds` from the public kiosk endpoint;
//     falls back to 30s if the call fails.
//
// Note: this runs web-only. Native build will be the standalone tablet APK
// where the kiosk lifecycle is identical but driven by AppState.

import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { isLoyaltyApp } from "./appMode";
import { BASE } from "./api";

const DEFAULT_IDLE_SECONDS = 30;
// Routes where the watcher must remain dormant. Admin staff need an
// uninterrupted UI while scanning loyalty QR codes or editing ads.
const EXEMPT_PREFIXES = ["/kiosk", "/admin"];

function isExempt(pathname: string | null): boolean {
  if (!pathname) return false;
  return EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}?`));
}

export function useIdleKiosk() {
  const router = useRouter();
  const pathname = usePathname();
  const idleSecondsRef = useRef<number>(DEFAULT_IDLE_SECONDS);
  const timerRef = useRef<any>(null);
  const pathRef = useRef<string | null>(pathname);

  // keep latest pathname accessible inside event listeners without re-binding them
  useEffect(() => { pathRef.current = pathname; }, [pathname]);

  // Pull configured idle time once on mount (public endpoint, no auth needed).
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (!isLoyaltyApp()) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${BASE}/api/ads/slides`);
        const d = await r.json();
        const s = d?.settings?.idle_seconds;
        if (!cancelled && typeof s === "number" && s >= 5 && s <= 3600) {
          idleSecondsRef.current = s;
        }
      } catch {
        // keep default
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Arm / disarm the watcher.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (!isLoyaltyApp()) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const arm = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        // Re-check exemption at fire time — user may have navigated meanwhile.
        if (!isExempt(pathRef.current)) {
          try { router.replace("/kiosk" as any); } catch {}
        }
      }, idleSecondsRef.current * 1000);
    };

    const reset = () => {
      if (isExempt(pathRef.current)) {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        return;
      }
      arm();
    };

    const events: (keyof DocumentEventMap)[] = [
      "mousedown",
      "mousemove",
      "touchstart",
      "keydown",
      "scroll",
      "wheel",
    ];

    events.forEach((e) => document.addEventListener(e, reset, { passive: true } as any));
    // Initial arm (or no-op on exempt routes).
    reset();

    return () => {
      events.forEach((e) => document.removeEventListener(e, reset as any));
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
    // We intentionally re-bind on pathname change so the exemption check
    // re-evaluates synchronously and clears the timer when entering /admin or /kiosk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
}
