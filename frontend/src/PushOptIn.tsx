import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { webpush } from "./push";
import { theme } from "./theme";

export function PushOptIn({ lang }: { lang: "fr" | "en" }) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    const sup = webpush.supported();
    setSupported(sup);
    if (!sup) { setPermission("unsupported"); return; }
    setPermission(await webpush.permission() as NotificationPermission);
    setSubscribed(await webpush.isSubscribed());
  };

  useEffect(() => { refresh(); }, []);

  if (Platform.OS !== "web") return null;
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

const s = StyleSheet.create({
  banner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border,
    borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10, marginVertical: 8,
  },
  bannerOk: { borderColor: theme.color.brand },
  bannerTxt: { color: theme.color.onSurfaceSecondary, fontSize: 12 },
  btn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.borderStrong },
  btnPrimary: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  btnTxt: { color: theme.color.brand, fontSize: 11, fontWeight: "600" },
});
