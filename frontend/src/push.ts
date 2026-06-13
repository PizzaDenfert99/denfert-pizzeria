// Web push subscription helper — runs only on web (Service Worker + PushManager).
// Native push (iOS/Android) is wired separately in app/_layout.tsx via expo-notifications.
import { Platform } from "react-native";
import { api } from "./api";

const isWeb = Platform.OS === "web";
const isSupported = isWeb && typeof window !== "undefined"
  && "serviceWorker" in (typeof navigator !== "undefined" ? navigator : ({} as any))
  && "PushManager" in (typeof window !== "undefined" ? window : ({} as any));

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export const webpush = {
  supported: () => isSupported,

  async permission(): Promise<NotificationPermission | "unsupported"> {
    if (!isSupported) return "unsupported";
    return Notification.permission;
  },

  async ensureRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (!isSupported) return null;
    try {
      const existing = await navigator.serviceWorker.getRegistration("/sw.js");
      if (existing) return existing;
      return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    } catch (e) {
      console.warn("[push] SW register failed", e);
      return null;
    }
  },

  async subscribe(): Promise<{ ok: boolean; reason?: string }> {
    if (!isSupported) return { ok: false, reason: "unsupported" };
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return { ok: false, reason: perm };
      const reg = await this.ensureRegistration();
      if (!reg) return { ok: false, reason: "no-registration" };

      // Fetch VAPID public key
      const { public_key } = await api.pushPublicKey();
      if (!public_key) return { ok: false, reason: "no-vapid-key" };

      // Reuse existing subscription if any
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(public_key),
        });
      }
      const json = sub.toJSON() as any;
      if (!json.endpoint || !json.keys) return { ok: false, reason: "no-keys" };
      await api.pushSubscribe({ endpoint: json.endpoint, keys: json.keys });
      return { ok: true };
    } catch (e: any) {
      console.warn("[push] subscribe failed", e);
      return { ok: false, reason: e?.message || "failed" };
    }
  },

  async unsubscribe(): Promise<boolean> {
    if (!isSupported) return false;
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!reg) return false;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return false;
      const json = sub.toJSON() as any;
      try { await api.pushUnsubscribe({ endpoint: json.endpoint, keys: json.keys || {} }); } catch {}
      await sub.unsubscribe();
      return true;
    } catch (e) {
      console.warn("[push] unsubscribe failed", e);
      return false;
    }
  },

  async isSubscribed(): Promise<boolean> {
    if (!isSupported) return false;
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!reg) return false;
      const sub = await reg.pushManager.getSubscription();
      return !!sub;
    } catch { return false; }
  },
};
