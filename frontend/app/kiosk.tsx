import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Image, ActivityIndicator, Platform, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter, Redirect } from "expo-router";
import { theme } from "@/src/theme";
import { api, BASE } from "@/src/api";
import { isLoyaltyApp } from "@/src/appMode";

type Slide = {
  id: string; section: string; order: number; title: string; subtitle: string;
  image_url: string; duration_ms: number; active: boolean;
};
type KioskSettings = { idle_seconds: number; loop: boolean; default_duration_ms: number; show_section_titles: boolean };

const SECTION_LABELS: Record<string, string> = {
  loyalty: "Club Fidélité", experience: "Notre Expérience", ingredients: "Nos Ingrédients",
};

// Page-level guard: the kiosk slideshow is reserved for the loyalty tablet
// APK / loyalty subdomain. On the main customer app, redirect to home.
export default function KioskRoute() {
  if (!isLoyaltyApp()) return <Redirect href={"/" as any} />;
  return <Kiosk />;
}

function Kiosk() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [slides, setSlides] = useState<Slide[]>([]);
  const [settings, setSettings] = useState<KioskSettings | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${BASE}/api/ads/slides`);
        const d = await r.json();
        setSlides((d.slides || []).filter((s: Slide) => s.active));
        setSettings(d.settings);
      } catch (e: any) {
        setError(e?.message || "Erreur de chargement");
      }
    })();
  }, []);

  useEffect(() => {
    if (!slides.length || !settings) return;
    const dur = slides[index]?.duration_ms || settings.default_duration_ms || 5000;
    timer.current = setTimeout(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, dur);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [index, slides, settings]);

  if (error) return <View style={s.center}><Text style={s.errorTxt}>{error}</Text></View>;
  if (!slides.length) return <View style={s.center}><ActivityIndicator color={theme.color.brand} size="large" /></View>;

  const cur = slides[index];

  return (
    <Pressable testID="kiosk-screen" onPress={() => router.replace("/account" as any)} style={[s.screen, { width, height }]}>
      {/* Background image or gradient */}
      {cur.image_url ? (
        <Image source={{ uri: cur.image_url }} style={s.bgImage} resizeMode="cover" />
      ) : (
        <View style={[s.bgImage, { backgroundColor: "#0F0A05" }]} />
      )}
      <View style={s.overlay} />

      {settings?.show_section_titles && (
        <Text style={s.section}>{SECTION_LABELS[cur.section] || cur.section}</Text>
      )}
      <Text style={s.title} numberOfLines={3}>{cur.title}</Text>
      {cur.subtitle ? <Text style={s.subtitle} numberOfLines={3}>{cur.subtitle}</Text> : null}

      {/* Progress bar */}
      <View style={s.progressRow}>
        {slides.map((_, i) => (
          <View key={i} style={[s.dot, i === index && s.dotActive]} />
        ))}
      </View>

      {/* Tap-to-exit hint, top-right */}
      <View style={s.exitHint}>
        <Feather name="chevrons-left" size={14} color={"#fff8"} />
        <Text style={s.exitHintTxt}>Touchez pour revenir</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  bgImage: { ...StyleSheet.absoluteFillObject },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" },
  errorTxt: { color: "#fff", fontSize: 18 },
  section: { color: theme.color.brand, fontSize: 18, letterSpacing: 4, fontWeight: "600", textTransform: "uppercase", marginBottom: 24, textAlign: "center" },
  title: { color: "#fff", fontSize: 64, fontWeight: "800", textAlign: "center", paddingHorizontal: 40, lineHeight: 72, fontFamily: theme.font.display },
  subtitle: { color: "rgba(255,255,255,0.85)", fontSize: 28, marginTop: 24, textAlign: "center", paddingHorizontal: 60, lineHeight: 36 },
  progressRow: { flexDirection: "row", gap: 6, position: "absolute", bottom: 40 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.3)" },
  dotActive: { backgroundColor: theme.color.brand, width: 24 },
  exitHint: { position: "absolute", top: 24, right: 24, flexDirection: "row", alignItems: "center", gap: 6, padding: 8 },
  exitHintTxt: { color: "#fff8", fontSize: 11, letterSpacing: 0.5 },
});
