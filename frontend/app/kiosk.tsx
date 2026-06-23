/**
 * kiosk.tsx — Nouveau screensaver Pizza Denfert
 *
 * ✅ Utilise l'API existante /api/ads/slides
 * ✅ Le panneau admin (admin-ads.tsx) continue de fonctionner
 * ✅ Design amélioré avec animations et overlays
 * ✅ Compatible avec isLoyaltyApp()
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, Image,
  Animated, ActivityIndicator, useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, Redirect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { api } from "@/src/api";
import { isLoyaltyApp } from "@/src/appMode";

// ── Types ─────────────────────────────────────────────────────────────────────
type Slide = {
  id: string;
  section: string;
  order: number;
  title: string;
  subtitle: string;
  image_url: string;
  duration_ms: number;
  active: boolean;
};

type KioskSettings = {
  idle_seconds: number;
  loop: boolean;
  default_duration_ms: number;
  show_section_titles: boolean;
};

// ── Section labels ─────────────────────────────────────────────────────────────
const SECTION_META: Record<string, { tag: string; overlay: boolean }> = {
  loyalty:     { tag: "Club Fidélité · Pizza Denfert",          overlay: false },
  experience:  { tag: "61 Rue Denfert-Rochereau, 69004 Lyon",   overlay: true  },
  ingredients: { tag: "Rhône-Alpes · Italie · Artisanat",       overlay: true  },
};

// ── Guard ─────────────────────────────────────────────────────────────────────
export default function KioskRoute() {
  if (!isLoyaltyApp()) return <Redirect href={"/" as any} />;
  return <Kiosk />;
}

// ── Main Kiosk ────────────────────────────────────────────────────────────────
function Kiosk() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const [slides, setSlides] = useState<Slide[]>([]);
  const [settings, setSettings] = useState<KioskSettings | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Animations
  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const slideAnim  = useRef(new Animated.Value(24)).current;
  const lineAnim   = useRef(new Animated.Value(0)).current;
  const imgOpacity = useRef(new Animated.Value(1)).current;

  const timer = useRef<any>(null);

  // ── Fetch slides ─────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const d = await api.publicAdSlides();
        const active = (d.slides || []).filter((s: Slide) => s.active);
        setSlides(active);
        setSettings(d.settings);
      } catch (e: any) {
        setError(e?.message || "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Animate text in ──────────────────────────────────────────────────────────
  const animIn = useCallback((sec: string) => {
    const meta = SECTION_META[sec] || { overlay: false };
    if (!meta.overlay) return;
    fadeAnim.setValue(0);
    slideAnim.setValue(24);
    lineAnim.setValue(0);
    Animated.sequence([
      Animated.delay(500),
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]),
    ]).start();
    Animated.sequence([
      Animated.delay(1400),
      Animated.timing(lineAnim, { toValue: 80, duration: 600, useNativeDriver: false }),
    ]).start();
  }, []);

  // ── Slide timer ──────────────────────────────────────────────────────────────
  const scheduleNext = useCallback((idx: number, dur: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = (idx + 1) % slides.length;
      // Cross-fade image
      Animated.timing(imgOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
        setIndex(next);
        animIn(slides[next]?.section || "");
        Animated.timing(imgOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
        scheduleNext(next, slides[next]?.duration_ms || settings?.default_duration_ms || 5000);
      });
    }, dur);
  }, [slides, settings, animIn]);

  useEffect(() => {
    if (!slides.length || !settings) return;
    animIn(slides[0]?.section || "");
    scheduleNext(0, slides[0]?.duration_ms || settings.default_duration_ms || 5000);
    return () => clearTimeout(timer.current);
  }, [slides, settings]);

  // ── Loading / error ──────────────────────────────────────────────────────────
  if (loading) return (
    <View style={[s.center, { width, height }]}>
      <ActivityIndicator color={theme.color.brand} size="large" />
      <Text style={s.loadTxt}>Chargement...</Text>
    </View>
  );

  if (error || !slides.length) return (
    <View style={[s.center, { width, height }]}>
      <Feather name="wifi-off" size={40} color={theme.color.brand} />
      <Text style={s.errorTxt}>{error || "Aucun contenu disponible"}</Text>
      <Text style={s.errorSub}>Vérifiez la connexion au serveur</Text>
    </View>
  );

  const cur = slides[index];
  const meta = SECTION_META[cur.section] || { tag: cur.section, overlay: true };
  const dur = cur.duration_ms || settings?.default_duration_ms || 5000;

  return (
    <Pressable
      testID="kiosk-screen"
      onPress={() => router.replace("/account" as any)}
      style={[s.screen, { width, height }]}
    >
      {/* Background image with cross-fade */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: imgOpacity }]}>
        {cur.image_url ? (
          <Image
            source={{ uri: cur.image_url }}
            style={StyleSheet.absoluteFill}
            resizeMode={cur.section === "loyalty" ? "contain" : "cover"}
          />
        ) : (
          // No image — show gradient background with big title
          <LinearGradient
            colors={["#0a0804", "#1a1208", "#0a0804"]}
            style={StyleSheet.absoluteFill}
          />
        )}
      </Animated.View>

      {/* Dark overlay for non-loyalty sections */}
      {meta.overlay && (
        <LinearGradient
          colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0.5)", "rgba(0,0,0,0.92)"]}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Logo watermark */}
      <Text style={s.logo}>PIZZA DENFERT</Text>

      {/* Caption — only for sections with overlay */}
      {meta.overlay && (
        <View style={s.caption}>
          {/* Tag / address */}
          <Animated.Text style={[s.tag, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {settings?.show_section_titles ? meta.tag : ""}
          </Animated.Text>

          {/* Title */}
          <Animated.Text style={[s.title, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
            numberOfLines={3}
          >
            {cur.title}
          </Animated.Text>

          {/* Divider line */}
          <Animated.View style={[s.line, { width: lineAnim }]} />

          {/* Subtitle */}
          {!!cur.subtitle && (
            <Animated.Text style={[s.subtitle, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
              numberOfLines={3}
            >
              {cur.subtitle}
            </Animated.Text>
          )}
        </View>
      )}

      {/* For loyalty section (promos) — show centered title if no image */}
      {!meta.overlay && !cur.image_url && (
        <View style={s.promoCenter}>
          <Text style={s.promoTitle}>{cur.title}</Text>
          {!!cur.subtitle && <Text style={s.promoSub}>{cur.subtitle}</Text>}
        </View>
      )}

      {/* Progress dots */}
      <View style={s.dotsRow}>
        {slides.map((_, i) => (
          <View key={i} style={[s.dot, i === index && s.dotActive]} />
        ))}
      </View>

      {/* Progress bar */}
      <View style={s.progressBg}>
        <ProgressBar key={`${index}`} duration={dur} />
      </View>

      {/* Tap hint */}
      <View style={s.tapHint}>
        <Feather name="chevrons-left" size={12} color="rgba(255,255,255,0.4)" />
        <Text style={s.tapHintTxt}>Touchez pour revenir</Text>
      </View>
    </Pressable>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ duration }: { duration: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration, useNativeDriver: false }).start();
  }, []);
  return (
    <Animated.View style={[s.progressFill, { width: anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: {
    backgroundColor: "#080604",
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#080604",
    gap: 16,
  },
  loadTxt: {
    color: theme.color.brand,
    fontSize: 13,
    letterSpacing: 2,
    marginTop: 8,
  },
  errorTxt: {
    color: "#fff",
    fontSize: 18,
    textAlign: "center",
    marginTop: 16,
    paddingHorizontal: 40,
  },
  errorSub: {
    color: theme.color.muted,
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
  },
  logo: {
    position: "absolute",
    top: 36,
    left: 40,
    color: "rgba(200,169,110,0.7)",
    fontSize: 13,
    letterSpacing: 3,
    fontFamily: theme.font.display,
    fontWeight: "600",
    zIndex: 5,
  },
  caption: {
    position: "absolute",
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 40,
    zIndex: 5,
  },
  tag: {
    fontSize: 11,
    letterSpacing: 6,
    color: "#e8c98e",
    textTransform: "uppercase",
    marginBottom: 14,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,1)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  title: {
    fontFamily: theme.font.display,
    fontSize: 52,
    color: "#ffffff",
    lineHeight: 58,
    textAlign: "center",
    marginBottom: 16,
    textShadowColor: "rgba(0,0,0,1)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 20,
  },
  line: {
    height: 2,
    backgroundColor: theme.color.brand,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 18,
    color: "rgba(255,255,255,0.9)",
    textAlign: "center",
    lineHeight: 28,
    textShadowColor: "rgba(0,0,0,1)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 12,
  },
  promoCenter: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    zIndex: 5,
  } as any,
  promoTitle: {
    fontFamily: theme.font.display,
    fontSize: 64,
    color: theme.color.brand,
    textAlign: "center",
    lineHeight: 72,
    fontWeight: "700",
  },
  promoSub: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 24,
    textAlign: "center",
    marginTop: 20,
    lineHeight: 32,
  },
  dotsRow: {
    position: "absolute",
    bottom: 36,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    zIndex: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  dotActive: {
    backgroundColor: theme.color.brand,
    width: 20,
  },
  progressBg: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(200,169,110,0.1)",
    zIndex: 10,
  },
  progressFill: {
    height: "100%",
    backgroundColor: theme.color.brand,
  },
  tapHint: {
    position: "absolute",
    top: 40,
    right: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    zIndex: 10,
  },
  tapHintTxt: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 11,
    letterSpacing: 0.5,
  },
});
