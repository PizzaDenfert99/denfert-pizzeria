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
  Animated, Easing, ActivityIndicator, useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, Redirect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "@/src/safeVideo";
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
  media_type?: "image" | "video";
  duration_ms: number;
  active: boolean;
  // Optional per-slide style — unset on the original 14 seeded slides, which keep
  // rendering with the defaults below (no motion, no tint, no font override).
  background_color?: string;
  font_family?: string;
  font_color?: string;
  // effect_type is ignored for video slides (media_type === "video") — the
  // video already has its own motion, so we don't wrap it in a competing
  // Ken Burns/wave/rotate/slide transform. See effectImageStyle below.
  effect_type?: "kenburns" | "wave" | "rotate" | "slide" | "fade" | "none";
};

// Looping, muted, autoplay background video for a kiosk slide. Deliberately
// NOT wrapped in the effectImageStyle() transform used for images — a
// looping video already has motion, so we don't compete with a Ken Burns/
// wave/etc. transform on top of it (see the "video slides skip effect_type"
// decision above).
//
// `width`/`height` are passed down as explicit numeric pixels (from the
// kiosk's own useWindowDimensions()) rather than relying on
// StyleSheet.absoluteFill alone. expo-video's VideoView renders a native
// SurfaceView/TextureView-backed layer (a real HTML <video> on web too), and
// those don't reliably pick up a percentage/inset-only ("position:absolute,
// top/left/right/bottom:0") box the way a plain Image/View does — nested
// several Animated.View layers deep, that was producing a video surface
// measured/sized far smaller than its container, which cropped it down to
// what looked like only a corner of the frame being visible. Explicit
// pixel width/height avoids that measurement gap.
function KioskVideoBackground({ uri, resizeMode, width, height }: {
  uri: string; resizeMode: "cover" | "contain"; width: number; height: number;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={{ position: "absolute", top: 0, left: 0, width, height }}
      contentFit={resizeMode}
      nativeControls={false}
      pointerEvents="none"
    />
  );
}

// ── Per-slide motion effects ─────────────────────────────────────────────────
// `progress` is an Animated.Value driven linearly from 0 -> 1 over the slide's
// display duration. Unset / unknown effect_type => no transform (today's look).
function effectImageStyle(effect: Slide["effect_type"], progress: Animated.Value): any {
  switch (effect) {
    case "kenburns":
      return { transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1.14] }) }] };
    case "wave":
      return {
        transform: [
          { scale: 1.06 },
          { translateX: progress.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 10, 0, -10, 0] }) },
        ],
      };
    case "rotate":
      return {
        transform: [
          { scale: 1.08 },
          { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ["-2deg", "2deg"] }) },
        ],
      };
    case "slide":
      return {
        transform: [
          { scale: 1.15 },
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-40, 40] }) },
        ],
      };
    case "fade":
    case "none":
    default:
      return {};
  }
}

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
  const effectProgress = useRef(new Animated.Value(0)).current;
  const effectRun = useRef<Animated.CompositeAnimation | null>(null);

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

  // ── Prefetch every slide image up front ──────────────────────────────────────
  // The crossfade below swaps a single <Image>'s `source` mid-transition rather
  // than mounting a second layer, so if the next slide's image hasn't finished
  // loading/decoding by the time the fade-in starts, the still-loading (or
  // stale, not-yet-replaced) frame briefly shows through — the "flash of wrong
  // content" bug. There's a small, fixed, looping set of slides, so warming the
  // image cache for all of them once, as soon as the list loads, means every
  // future transition swaps to an already-decoded image with nothing to wait
  // on. (Video slides aren't prefetchable the same way — no-op for those.)
  useEffect(() => {
    const urls = Array.from(new Set(
      slides.filter((sl) => sl.media_type !== "video" && sl.image_url).map((sl) => sl.image_url)
    ));
    urls.forEach((u) => { Image.prefetch(u).catch(() => {}); });
  }, [slides]);

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
      // Slow cross-fade: fade the current slide fully out, swap the source
      // while nothing is visible (imgOpacity === 0), then fade the next
      // slide in. The brief hold at zero opacity is a small extra safety
      // margin on top of the prefetching above — it gives the swapped
      // <Image> a moment to actually apply the new (already-cached) source
      // before anything starts becoming visible again.
      Animated.timing(imgOpacity, { toValue: 0, duration: 900, useNativeDriver: true }).start(() => {
        setIndex(next);
        animIn(slides[next]?.section || "");
        Animated.sequence([
          Animated.delay(80),
          Animated.timing(imgOpacity, { toValue: 1, duration: 900, useNativeDriver: true }),
        ]).start();
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

  // ── Per-slide motion effect ──────────────────────────────────────────────────
  // Re-armed every time the visible slide changes, running over that slide's own
  // display duration. Unset effect_type resolves to no-op (today's static look).
  useEffect(() => {
    if (!slides.length) return;
    effectRun.current?.stop();
    // Video slides never apply effect_type (see KioskVideoBackground) — skip
    // running the progress animation for them entirely.
    if (slides[index]?.media_type === "video") return;
    const dur = slides[index]?.duration_ms || settings?.default_duration_ms || 5000;
    effectProgress.setValue(0);
    effectRun.current = Animated.timing(effectProgress, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true });
    effectRun.current.start();
    return () => effectRun.current?.stop();
  }, [index, slides, settings]);

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
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: imgOpacity, overflow: "hidden" }]}>
        {cur.image_url ? (
          <>
            {/* Base tone behind the image — shows in the contain-mode letterbox area
                (loyalty section) and briefly while the image loads. No-op when unset. */}
            {!!cur.background_color && (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: cur.background_color }]} />
            )}
            {cur.media_type === "video" ? (
              <KioskVideoBackground
                uri={cur.image_url}
                resizeMode={cur.section === "loyalty" ? "contain" : "cover"}
                width={width}
                height={height}
              />
            ) : (
              <Animated.View style={[StyleSheet.absoluteFill, effectImageStyle(cur.effect_type, effectProgress)]}>
                <Image
                  source={{ uri: cur.image_url }}
                  style={StyleSheet.absoluteFill}
                  resizeMode={cur.section === "loyalty" ? "contain" : "cover"}
                />
              </Animated.View>
            )}
            {/* Subtle color wash tying the photo to the chosen background_color */}
            {!!cur.background_color && (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: cur.background_color, opacity: 0.12 }]} />
            )}
          </>
        ) : cur.background_color ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: cur.background_color }]} />
        ) : (
          // No image, no custom color — default gradient background with big title
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
          <Animated.Text style={[
            s.title,
            !!cur.font_family && { fontFamily: cur.font_family },
            !!cur.font_color && { color: cur.font_color },
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
            numberOfLines={3}
          >
            {cur.title}
          </Animated.Text>

          {/* Divider line */}
          <Animated.View style={[s.line, { width: lineAnim }]} />

          {/* Subtitle */}
          {!!cur.subtitle && (
            <Animated.Text style={[
              s.subtitle,
              !!cur.font_family && { fontFamily: cur.font_family },
              !!cur.font_color && { color: cur.font_color },
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
              numberOfLines={3}
            >
              {cur.subtitle}
            </Animated.Text>
          )}
        </View>
      )}

      {/* For loyalty section (promos) — centered title/subtitle, styled with the
          slide's font_family/font_color. Previously gated behind `!cur.image_url`,
          which meant ANY loyalty slide with a background image never showed its
          caption (or any font/color styling) at all — the realistic case, since
          admins normally attach an image. Now always shown for this section,
          with a scrim behind the text when there's a background image so it
          stays legible over a bright photo. */}
      {!meta.overlay && (
        <View style={s.promoCenter}>
          {!!cur.image_url && (
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.7)"]}
              locations={[0, 0.55, 1]}
              style={StyleSheet.absoluteFill}
            />
          )}
          <Text style={[s.promoTitle, !!cur.font_family && { fontFamily: cur.font_family }, !!cur.font_color && { color: cur.font_color }]}>
            {cur.title}
          </Text>
          {!!cur.subtitle && (
            <Text style={[s.promoSub, !!cur.font_family && { fontFamily: cur.font_family }, !!cur.font_color && { color: cur.font_color }]}>
              {cur.subtitle}
            </Text>
          )}
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
