import React, { useEffect, useRef, useState } from "react";
import { Animated, View, Text, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter, Redirect } from "expo-router";
import { theme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { isLoyaltyApp } from "@/src/appMode";
import { api } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { ParallaxBackground } from "@/src/ParallaxBackground";

// Baked-in hero: title text + FR/IT flag ribbons are already part of this image.
const HERO_SOURCE = require("../../assets/images/photo_2026-07-09_02-09-51.jpg");
// Last hero_image_url we successfully rendered — read back on the NEXT app
// open so the correct photo shows immediately instead of flashing the
// baked-in default while the settings request round-trips. expo-image keeps
// its own on-disk cache of the actual bytes, so once we know the URL again
// it typically renders instantly with no network wait either.
const HERO_CACHE_KEY = "@last_hero_image_url";

export default function HomeRoute() {
  // Loyalty APK / loyalty subdomain — the customer landing screen does not
  // exist here. Skip straight to the promotional kiosk.
  // Conditional MUST live in this wrapper so the heavy Home() component below
  // is unmounted entirely and react-hooks/rules-of-hooks is preserved.
  if (isLoyaltyApp()) {
    return <Redirect href={"/kiosk" as any} />;
  }
  return <Home />;
}

function Home() {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const [dynSettings, setDynSettings] = useState<{ phone?: string | null; address?: string | null; hero_image_url?: string | null; bg_home_url?: string | null } | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. Show the last-known hero immediately (fast local read, no network) so
      //    repeat app opens never flash the baked-in default first.
      const cachedHero = await storage.getItem<string>(HERO_CACHE_KEY, "");
      if (!cancelled && cachedHero) {
        setDynSettings((prev) => prev ?? { hero_image_url: cachedHero });
      }
      // 2. Fetch the live settings; update the screen (and the cache for next
      //    time) if the hero has actually changed since the cached value.
      try {
        const s = await api.publicRestaurantSettings();
        if (!cancelled && s) {
          setDynSettings({ phone: s.phone, address: s.address, hero_image_url: s.hero_image_url, bg_home_url: s.bg_home_url });
          if (s.hero_image_url) storage.setItem(HERO_CACHE_KEY, s.hero_image_url);
        }
      } catch {
        // silent — fall back to whatever we already have (cached or default hero).
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const heroSource = dynSettings?.hero_image_url ? { uri: dynSettings.hero_image_url } : HERO_SOURCE;

  // Split a free-form address into two display lines (street vs city/postcode).
  const addressLines = (() => {
    const raw = (dynSettings?.address || "").trim();
    if (!raw) return { l1: "61 Rue Denfert", l2: "Rochereau", postcode: "69004 Lyon, France" };
    // Heuristic: keep first comma chunk as street, rest as city/postcode.
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) return { l1: parts[0], l2: "", postcode: parts.slice(1).join(", ") };
    return { l1: parts[0], l2: "", postcode: "" };
  })();

  const pillars = [
    { icon: "feather", key: "flour" },
    { icon: "map-pin", key: "local" },
    { icon: "globe", key: "inspiration" },
    { icon: "star", key: "art" },
    { icon: "check-circle", key: "selected" },
    { icon: "heart", key: "quality" },
  ] as const;

  return (
    <View testID="home-screen" style={[styles.container, dynSettings?.bg_home_url ? { backgroundColor: "transparent" } : null]}>
      {/* Screen-fixed parallax layer, behind the ScrollView. The hero block
          below fully occludes it, so it only ever becomes visible starting
          where the hero ends — "below the hero", with no extra offset math
          needed since this shifts by a fraction of the same scroll position. */}
      {!!dynSettings?.bg_home_url && <ParallaxBackground imageUrl={dynSettings.bg_home_url} scrollY={scrollY} />}
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
      >
        {/* HERO — the admin-configurable background (below) never shows through
            here; the hero's own opaque photo/backdrop fully covers this block. */}
        <View style={styles.hero}>
          {dynSettings?.hero_image_url ? (
            // Admin-uploaded hero: never crop the actual photo. A blurred,
            // zoomed copy of the same image fills the banner edge-to-edge
            // behind it (Instagram/Spotify-style backdrop), while the real
            // image sits on top at contentFit="contain" so the whole photo
            // is always visible, unmodified, at full quality — no empty
            // letterbox bars, no visible crop/zoom on the primary image.
            <>
              <Image source={heroSource} style={StyleSheet.absoluteFillObject} contentFit="cover" blurRadius={45} />
              {/* Light edge-only fade (not a full dim) — just enough for the lang
                  toggle and the seam into the next section to read cleanly. Fully
                  transparent through the middle so the backdrop's true colour (and
                  the primary photo on top of it) stays visible, not darkened. */}
              <LinearGradient
                colors={["rgba(0,0,0,0.18)", "rgba(0,0,0,0)", "rgba(0,0,0,0)", "rgba(0,0,0,0.18)"]}
                locations={[0, 0.14, 0.86, 1]}
                style={StyleSheet.absoluteFillObject}
              />
              <Image source={heroSource} style={StyleSheet.absoluteFillObject} contentFit="contain" />
            </>
          ) : (
            <Image source={heroSource} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          )}
          <SafeAreaView edges={["top"]} style={{ flex: 1, paddingHorizontal: theme.space.lg, paddingTop: theme.space.md }}>
            <View style={styles.headerRow}>
              <View style={{ width: 1 }} />
              <Pressable testID="lang-toggle" onPress={() => setLang(lang === "fr" ? "en" : "fr")} style={styles.langBtn}>
                <Feather name="globe" size={13} color={theme.color.brand} />
                <Text style={styles.langTxt}>{lang.toUpperCase()}</Text>
              </Pressable>
            </View>
            <Pressable testID="hero-menu-btn" onPress={() => router.push("/(tabs)/menu")} style={styles.heroCenter} />
          </SafeAreaView>
        </View>

        {/* PRESENTATION */}
        <View style={{ padding: theme.space.xl, paddingTop: theme.space.xxxl }}>
          <Text style={styles.eyebrow}>— {lang === "fr" ? "NOTRE MAISON" : "OUR HOUSE"}</Text>
          <Text style={styles.body}>{t("presentation")}</Text>
        </View>

        {/* PILLARS */}
        <View style={{ paddingHorizontal: theme.space.xl }}>
          <Text style={styles.eyebrow}>— {lang === "fr" ? "NOS PILIERS" : "OUR PILLARS"}</Text>
          <View style={styles.pillarsGrid}>
            {pillars.map((p) => (
              <View key={p.key} testID={`pillar-${p.key}`} style={styles.pillarCard}>
                <Feather name={p.icon as any} size={20} color={theme.color.brand} />
                <Text style={styles.pillarTxt}>{t(`pillars.${p.key}`)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* INFO CARD */}
        <View style={{ padding: theme.space.xl }}>
          <View style={styles.infoCard}>
            <View style={{ padding: theme.space.xl }}>
              <Text style={styles.eyebrowGold}>— {lang === "fr" ? "VISITEZ-NOUS" : "VISIT US"}</Text>
              <Text style={styles.infoTitle}>{addressLines.l1}{addressLines.l2 ? `\n${addressLines.l2}` : ""}</Text>
              <Text style={styles.infoSub}>{addressLines.postcode || "69004 Lyon, France"}</Text>
              <View style={{ marginTop: theme.space.lg, gap: 8 }}>
                <View style={styles.infoRow}><Feather name="sun" size={14} color={theme.color.brand} /><Text style={styles.infoLine}>{t("hoursLunch")}</Text></View>
                <View style={styles.infoRow}><Feather name="moon" size={14} color={theme.color.brand} /><Text style={styles.infoLine}>{t("hoursDinner")}</Text></View>
              </View>
              <Pressable testID="info-reserve-btn" onPress={() => router.push("/(tabs)/reserve")} style={styles.ctaGhost}>
                <Text style={styles.ctaGhostTxt}>{t("bookTable")}</Text>
                <Feather name="arrow-right" size={14} color={theme.color.brand} />
              </Pressable>
            </View>
          </View>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface, overflow: "hidden" },
  hero: { width: "100%", height: 820 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cornerLogo: { width: 175, height: 175, marginTop: -8, marginLeft: -8 },
  brandLogo: { width: 260, height: 260, marginBottom: -6 },
  langBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 999, borderWidth: 1, borderColor: "rgba(212,175,55,0.55)", backgroundColor: "rgba(0,0,0,0.5)", marginTop: 16 },
  langTxt: { color: theme.color.brand, fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  heroCenter: { flex: 1, alignItems: "center", paddingHorizontal: theme.space.md, marginTop: 8 },
  cta: { flexDirection: "row", gap: 10, paddingHorizontal: 28, height: 52, borderRadius: theme.radius.md, backgroundColor: theme.color.brand, alignItems: "center", justifyContent: "center" },
  ctaTxt: { color: theme.color.onBrandPrimary, fontWeight: "700", letterSpacing: 1, fontSize: 13 },
  ctaGhost: { flexDirection: "row", gap: 8, alignSelf: "flex-start", paddingHorizontal: 20, height: 48, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.brand, alignItems: "center", marginTop: theme.space.xl },
  ctaGhostTxt: { color: theme.color.brand, fontWeight: "700", letterSpacing: 1, fontSize: 12 },
  eyebrow: { color: theme.color.brand, letterSpacing: 3, fontSize: 11, fontWeight: "700", marginBottom: 16 },
  eyebrowGold: { color: theme.color.brand, letterSpacing: 3, fontSize: 11, fontWeight: "700", marginBottom: 12 },
  body: { color: theme.color.onSurfaceSecondary, fontSize: 15, lineHeight: 24 },
  pillarsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  pillarCard: { flexBasis: "47%", flexGrow: 1, backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.md, padding: 16, borderWidth: 1, borderColor: theme.color.border, gap: 10, minHeight: 86 },
  pillarTxt: { color: theme.color.onSurfaceSecondary, fontSize: 12, fontWeight: "500", lineHeight: 16 },
  infoCard: { height: 360, borderRadius: theme.radius.lg, overflow: "hidden", marginTop: 16, backgroundColor: theme.color.surface },
  infoTitle: { color: theme.color.onSurface, fontSize: 32, lineHeight: 34, fontWeight: "300" },
  infoSub: { color: theme.color.onSurfaceTertiary, fontSize: 14, marginTop: 6 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoLine: { color: theme.color.onSurfaceSecondary, fontSize: 13 },
});
