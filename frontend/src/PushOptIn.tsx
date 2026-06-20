import React, { useEffect, useState, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, Platform, ActivityIndicator, Linking } from "react-native";
import { Feather } from "@expo/vector-icons";
import { webpush } from "./push";
import { nativePush, NativePermStatus } from "./nativePush";
import { useAuth } from "./auth-context";
import { theme } from "./theme";

export function PushOptIn({ lang }: { lang: "fr" | "en" }) {
  // --- WEB BRANCH STATE -------------------------------------------------
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [subscribed, setSubscribed] = useState(false);

  // --- NATIVE BRANCH STATE ----------------------------------------------
  const { user } = useAuth();
  const [nativeStatus, setNativeStatus] = useState<NativePermStatus>("undetermined");
  const [nativeCanAsk, setNativeCanAsk] = useState(true);
  const [nativeRegistered, setNativeRegistered] = useState(false);
  const [showRationale, setShowRationale] = useState(false);

  // --- SHARED -----------------------------------------------------------
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (Platform.OS === "web") {
      const sup = webpush.supported();
      setSupported(sup);
      if (!sup) { setPermission("unsupported"); return; }
      setPermission(await webpush.permission() as NotificationPermission);
      setSubscribed(await webpush.isSubscribed());
    } else {
      const sup = nativePush.supported();
      setSupported(sup);
      if (!sup) return;
      const p = await nativePush.permission();
      setNativeStatus(p.status);
      setNativeCanAsk(p.canAskAgain);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // =====================================================================
  // WEB UNSUPPORTED / WEB BRANCH (unchanged behaviour)
  // =====================================================================
  if (Platform.OS === "web") {
    if (!supported) {
      return (
        <View style={s.banner}>
          <Feather name="bell-off" size={14} color={theme.color.muted} />
          <Text style={s.bannerTxt}>
            {lang === "fr" ? "Notifications non supportées par ce navigateur." : "Notifications not supported by this browser."}
          </Text>
        </View>
      );
    }

    const handleEnable = async () => {
      setBusy(true); setMsg(null);
      const r = await webpush.subscribe();
      if (r.ok) { setMsg(lang === "fr" ? "Notifications activées ✓" : "Notifications enabled ✓"); }
      else if (r.reason === "denied") setMsg(lang === "fr" ? "Refusé — autorisez les notifications dans les réglages du navigateur." : "Denied — please allow notifications in your browser settings.");
      else setMsg(lang === "fr" ? `Échec : ${r.reason}` : `Failed: ${r.reason}`);
      await refresh();
      setBusy(false);
    };

    const handleDisable = async () => {
      setBusy(true); setMsg(null);
      await webpush.unsubscribe();
      setMsg(lang === "fr" ? "Désactivé" : "Disabled");
      await refresh();
      setBusy(false);
    };

    if (subscribed && permission === "granted") {
      return (
        <View style={[s.banner, s.bannerOk]}>
          <Feather name="bell" size={14} color={theme.color.brand} />
          <Text style={[s.bannerTxt, { flex: 1 }]} numberOfLines={2}>
            {lang === "fr" ? "Notifications activées sur ce navigateur" : "Notifications active on this browser"}
            {msg ? ` · ${msg}` : ""}
          </Text>
          <Pressable testID="push-disable-btn" onPress={handleDisable} disabled={busy} style={s.btn}>
            {busy ? <ActivityIndicator size="small" color={theme.color.muted} /> : <Text style={s.btnTxt}>{lang === "fr" ? "Désactiver" : "Disable"}</Text>}
          </Pressable>
        </View>
      );
    }

    return (
      <View style={s.banner}>
        <Feather name="bell" size={14} color={theme.color.brand} />
        <Text style={[s.bannerTxt, { flex: 1 }]} numberOfLines={2}>
          {permission === "denied"
            ? (lang === "fr" ? "Notifications bloquées — autorisez-les dans les réglages du navigateur." : "Notifications blocked — enable them in browser settings.")
            : (lang === "fr" ? "Recevoir une alerte à chaque nouvelle réservation" : "Get an alert when reservations come in")}
          {msg ? ` · ${msg}` : ""}
        </Text>
        {permission !== "denied" && (
          <Pressable testID="push-enable-btn" onPress={handleEnable} disabled={busy} style={[s.btn, s.btnPrimary]}>
            {busy ? <ActivityIndicator size="small" color={theme.color.onBrandPrimary} />
                  : <Text style={[s.btnTxt, { color: theme.color.onBrandPrimary, fontWeight: "700" }]}>{lang === "fr" ? "Activer" : "Enable"}</Text>}
          </Pressable>
        )}
      </View>
    );
  }

  // =====================================================================
  // NATIVE BRANCH (iOS / Android) — handle-permissions-contract compliant
  // =====================================================================
  if (!supported) {
    // Simulator / emulator — push tokens are not provisioned.
    return (
      <View style={s.banner}>
        <Feather name="bell-off" size={14} color={theme.color.muted} />
        <Text style={s.bannerTxt}>
          {lang === "fr" ? "Notifications disponibles uniquement sur un appareil réel." : "Notifications only available on a physical device."}
        </Text>
      </View>
    );
  }

  const enableNative = async () => {
    setBusy(true); setMsg(null);
    try {
      // Re-check permission status immediately before requesting — the OS state
      // may have changed since mount (user toggled in Settings).
      const cur = await nativePush.permission();
      setNativeStatus(cur.status);
      setNativeCanAsk(cur.canAskAgain);

      if (cur.status === "denied" && !cur.canAskAgain) {
        // The OS will silently no-op requestPermissionsAsync — direct user to
        // app settings to flip the toggle manually.
        setMsg(lang === "fr" ? "Notifications bloquées par le système." : "System notifications are blocked.");
        return;
      }

      const r = await nativePush.register(user?.user_id || "");
      if (r.ok) {
        setNativeRegistered(true);
        setNativeStatus("granted");
        setMsg(lang === "fr" ? "Notifications activées ✓" : "Notifications enabled ✓");
      } else if (r.reason === "denied" || r.reason === "undetermined") {
        setMsg(lang === "fr" ? "Permission refusée." : "Permission denied.");
      } else if (r.reason === "no-user") {
        setMsg(lang === "fr" ? "Connectez-vous d'abord." : "Sign in first.");
      } else {
        setMsg(lang === "fr" ? `Échec : ${r.reason}` : `Failed: ${r.reason}`);
      }
      await refresh();
    } finally {
      setBusy(false);
      setShowRationale(false);
    }
  };

  // Granted + registered → confirmation banner.
  if (nativeRegistered || nativeStatus === "granted") {
    return (
      <View style={[s.banner, s.bannerOk]}>
        <Feather name="bell" size={14} color={theme.color.brand} />
        <Text style={[s.bannerTxt, { flex: 1 }]} numberOfLines={2}>
          {lang === "fr" ? "Notifications activées sur cet appareil" : "Notifications active on this device"}
          {msg ? ` · ${msg}` : ""}
        </Text>
      </View>
    );
  }

  // Permanently denied → only path is OS settings.
  if (nativeStatus === "denied" && !nativeCanAsk) {
    return (
      <View style={s.banner}>
        <Feather name="bell-off" size={14} color={"#E74C3C"} />
        <Text style={[s.bannerTxt, { flex: 1 }]} numberOfLines={3}>
          {lang === "fr"
            ? "Notifications bloquées. Ouvrez les réglages pour les autoriser."
            : "Notifications are blocked. Open Settings to enable them."}
        </Text>
        <Pressable testID="push-open-settings" onPress={() => Linking.openSettings()} style={[s.btn, s.btnPrimary]}>
          <Text style={[s.btnTxt, { color: theme.color.onBrandPrimary, fontWeight: "700" }]}>
            {lang === "fr" ? "Ouvrir réglages" : "Open Settings"}
          </Text>
        </Pressable>
      </View>
    );
  }

  // Show contextual rationale ONCE before triggering the OS prompt
  // (handle-permissions-contract rule #2).
  if (showRationale) {
    return (
      <View style={[s.banner, s.rationale]}>
        <Feather name="bell" size={16} color={theme.color.brand} />
        <View style={{ flex: 1 }}>
          <Text style={s.rationaleTitle}>
            {lang === "fr" ? "Alertes de réservation instantanées" : "Instant reservation alerts"}
          </Text>
          <Text style={s.rationaleBody}>
            {lang === "fr"
              ? "Recevez une notification dès qu'un client réserve une table, même quand l'app est fermée."
              : "Get notified the moment a customer books a table, even when the app is closed."}
          </Text>
          {msg ? <Text style={[s.bannerTxt, { marginTop: 4 }]}>{msg}</Text> : null}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <Pressable testID="push-rationale-confirm" disabled={busy} onPress={enableNative} style={[s.btn, s.btnPrimary, { flex: 1 }]}>
              {busy ? <ActivityIndicator size="small" color={theme.color.onBrandPrimary} />
                    : <Text style={[s.btnTxt, { color: theme.color.onBrandPrimary, fontWeight: "700" }]}>
                        {lang === "fr" ? "Continuer" : "Continue"}
                      </Text>}
            </Pressable>
            <Pressable disabled={busy} onPress={() => setShowRationale(false)} style={s.btn}>
              <Text style={s.btnTxt}>{lang === "fr" ? "Plus tard" : "Later"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // Initial / undetermined state — show CTA.
  return (
    <View style={s.banner}>
      <Feather name="bell" size={14} color={theme.color.brand} />
      <Text style={[s.bannerTxt, { flex: 1 }]} numberOfLines={2}>
        {lang === "fr" ? "Recevoir une alerte à chaque nouvelle réservation" : "Get an alert when reservations come in"}
        {msg ? ` · ${msg}` : ""}
      </Text>
      <Pressable testID="push-enable-btn" onPress={() => setShowRationale(true)} style={[s.btn, s.btnPrimary]}>
        <Text style={[s.btnTxt, { color: theme.color.onBrandPrimary, fontWeight: "700" }]}>
          {lang === "fr" ? "Activer" : "Enable"}
        </Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border,
    borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10, marginVertical: 8,
  },
  bannerOk: { borderColor: theme.color.brand },
  bannerTxt: { color: theme.color.onSurfaceSecondary, fontSize: 12 },
  rationale: { alignItems: "flex-start", paddingVertical: 14 },
  rationaleTitle: { color: theme.color.onSurface, fontSize: 13, fontWeight: "700", marginBottom: 4 },
  rationaleBody: { color: theme.color.onSurfaceSecondary, fontSize: 12, lineHeight: 17 },
  btn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.borderStrong, alignItems: "center", justifyContent: "center" },
  btnPrimary: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  btnTxt: { color: theme.color.brand, fontSize: 11, fontWeight: "600" },
});
