// Native push (Android / iOS) wrapper around expo-notifications.
//
// Responsibilities:
//   * Check existing permission status (granted / denied / undetermined).
//   * Request runtime permission with a contextual pre-prompt rationale
//     (the actual rationale is rendered by the calling UI component — see
//     <handle_permissions_contract>).
//   * Provision an Android notification channel (REQUIRED for Android 8+
//     for headsup/sound/vibration) and ensure POST_NOTIFICATIONS is requested
//     on Android 13+.
//   * Fetch the platform-specific device push token via Emergent's relay and
//     register it with our backend so reservation alerts reach the device.
//
// The Expo dev / web preview cannot exercise this — a real native build is
// required to validate end-to-end push delivery.

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { BASE, loadToken } from "./api";

export type NativePermStatus = "granted" | "denied" | "undetermined" | "unsupported";

function isNative(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}

// In-foreground notifications should still alert the user (banner + sound).
// Setting the handler is idempotent and cheap to call multiple times.
let handlerInstalled = false;
function ensureHandler() {
  if (handlerInstalled || !isNative()) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      // legacy field still required for backwards compat with some plugin versions
      shouldShowAlert: true,
    } as any),
  });
  handlerInstalled = true;
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync("reservations", {
      name: "Réservations",
      description: "Alertes en temps réel pour les nouvelles réservations.",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#D4AF37",
      sound: "default",
      enableLights: true,
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch {
    // ignore — channel ops are best-effort
  }
}

export const nativePush = {
  supported(): boolean {
    return isNative() && Device.isDevice;
  },

  async permission(): Promise<{ status: NativePermStatus; canAskAgain: boolean }> {
    if (!isNative()) return { status: "unsupported", canAskAgain: false };
    try {
      const res = await Notifications.getPermissionsAsync();
      const granted = res.granted || res.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
      const status: NativePermStatus = granted ? "granted" : (res.canAskAgain ? "undetermined" : "denied");
      return { status, canAskAgain: !!res.canAskAgain };
    } catch {
      return { status: "denied", canAskAgain: false };
    }
  },

  /** Request native OS permission. UI must show the rationale BEFORE calling this. */
  async request(): Promise<{ status: NativePermStatus; canAskAgain: boolean }> {
    if (!isNative()) return { status: "unsupported", canAskAgain: false };
    ensureHandler();
    await ensureAndroidChannel();
    try {
      const res = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowAnnouncements: false,
        },
      });
      const granted = res.granted || res.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
      const status: NativePermStatus = granted ? "granted" : (res.canAskAgain ? "undetermined" : "denied");
      return { status, canAskAgain: !!res.canAskAgain };
    } catch {
      return { status: "denied", canAskAgain: false };
    }
  },

  /** Fetch device push token (Expo token) and register it with our backend.
   *  Caller must supply the authenticated `userId` (used by the backend to
   *  fan out reservation notifications to the right admin device). */
  async register(userId: string): Promise<{ ok: boolean; reason?: string; token?: string }> {
    if (!isNative()) return { ok: false, reason: "unsupported" };
    if (!Device.isDevice) return { ok: false, reason: "simulator" };
    if (!userId) return { ok: false, reason: "no-user" };
    ensureHandler();
    await ensureAndroidChannel();

    try {
      const perm = await this.request();
      if (perm.status !== "granted") return { ok: false, reason: perm.status };

      // expo-notifications returns an Expo Push Token when the app is built
      // with EAS; the backend relays through the Emergent push service.
      const tokenRes = await Notifications.getExpoPushTokenAsync();
      const token = tokenRes?.data;
      if (!token) return { ok: false, reason: "no-token" };

      // Inform backend so reservation events can fan out to this device.
      try {
        const tok = await loadToken();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (tok) headers["Authorization"] = `Bearer ${tok}`;
        const r = await fetch(`${BASE}/api/register-push`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            user_id: userId,
            platform: Platform.OS,
            device_token: token,
          }),
        });
        if (!r.ok && r.status !== 200 && r.status !== 201) {
          // Non-fatal — token is still valid, we just couldn't store it.
          return { ok: true, token, reason: `backend-${r.status}` };
        }
      } catch {
        // Non-fatal
      }
      return { ok: true, token };
    } catch (e: any) {
      return { ok: false, reason: e?.message || "failed" };
    }
  },
};
