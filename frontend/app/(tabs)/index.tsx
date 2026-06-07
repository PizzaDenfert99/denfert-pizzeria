import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Image as RNImage } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme } from "@/src/theme";
import { useI18n } from "@/src/i18n";

const HERO = "https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=1200&q=80";
const RESTAURANT = "https://images.pexels.com/photos/4997894/pexels-photo-4997894.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=1200";
const LOGO = "https://customer-assets.emergentagent.com/job_denfert-pizzeria/artifacts/nwj3edom_file_00000000005c71f489c484606f9b5e35.png";

export default function Home() {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();

  const pillars = [
    { icon: "feather", key: "flour" },
    { icon: "map-pin", key: "local" },
    { icon: "globe", key: "inspiration" },
    { icon: "star", key: "art" },
    { icon: "check-circle", key: "selected" },
    { icon: "heart", key: "quality" },
  ] as const;

  return (
    <View testID="home-screen" style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
        {/* HERO */}
        <View style={styles.hero}>
          <Image source={HERO} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          <LinearGradient colors={["rgba(5,5,5,0.4)", "rgba(5,5,5,0.6)", "rgba(5,5,5,1)"]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFillObject} />
          <SafeAreaView edges={["top"]} style={{ flex: 1, padding: theme.space.xl, justifyContent: "space-between" }}>
            <View style={styles.headerRow}>
              <RNImage source={{ uri: LOGO }} style={styles.cornerLogo} resizeMode="contain" />
              <Pressable testID="lang-toggle" onPress={() => setLang(lang === "fr" ? "en" : "fr")} style={styles.langBtn}>
                <Feather name="globe" size={12} color={theme.color.brand} />
                <Text style={styles.langTxt}>{lang.toUpperCase()}</Text>
              </Pressable>
            </View>
            <View>
              <Text style={styles.lyon}>LYON · 4ᵉ ARRONDISSEMENT</Text>
              <Text style={styles.heroTitle}>Pizza{"\n"}Denfert</Text>
              <Text style={styles.heroTag}>{t("tagline")}</Text>
              <Pressable testID="hero-menu-btn" onPress={() => router.push("/(tabs)/menu")} style={styles.cta}>
                <Feather name="book-open" size={16} color={theme.color.onBrandPrimary} />
                <Text style={styles.ctaTxt}>{t("seeMenu")}</Text>
              </Pressable>
            </View>
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
            <Image source={RESTAURANT} style={StyleSheet.absoluteFillObject} contentFit="cover" />
            <LinearGradient colors={["rgba(5,5,5,0.3)", "rgba(5,5,5,0.95)"]} style={StyleSheet.absoluteFillObject} />
            <View style={{ padding: theme.space.xl }}>
              <Text style={styles.eyebrowGold}>— {lang === "fr" ? "VISITEZ-NOUS" : "VISIT US"}</Text>
              <Text style={styles.infoTitle}>61 Rue Denfert{"\n"}Rochereau</Text>
              <Text style={styles.infoSub}>69004 Lyon, France</Text>
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  hero: { width: "100%", height: 640 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brandLogo: { width: 260, height: 260, marginBottom: -6 },
  cornerLogo: { width: 56, height: 56 },
  langBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 999, borderWidth: 1, borderColor: theme.color.borderStrong, backgroundColor: "rgba(0,0,0,0.4)" },
  langTxt: { color: theme.color.brand, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  lyon: { color: theme.color.brand, letterSpacing: 3, fontSize: 11, fontWeight: "700", marginBottom: 12 },
  heroTitle: { color: theme.color.onSurface, fontSize: 72, lineHeight: 72, fontWeight: "300", letterSpacing: -2 },
  heroTag: { color: theme.color.onSurfaceTertiary, fontSize: 15, marginTop: 8, fontStyle: "italic" },
  cta: { flexDirection: "row", gap: 10, alignSelf: "flex-start", paddingHorizontal: 24, height: 54, borderRadius: theme.radius.md, backgroundColor: theme.color.brand, alignItems: "center", justifyContent: "center", marginTop: theme.space.xl },
  ctaTxt: { color: theme.color.onBrandPrimary, fontWeight: "700", letterSpacing: 1, fontSize: 13 },
  ctaGhost: { flexDirection: "row", gap: 8, alignSelf: "flex-start", paddingHorizontal: 20, height: 48, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.brand, alignItems: "center", marginTop: theme.space.xl },
  ctaGhostTxt: { color: theme.color.brand, fontWeight: "700", letterSpacing: 1, fontSize: 12 },
  eyebrow: { color: theme.color.brand, letterSpacing: 3, fontSize: 11, fontWeight: "700", marginBottom: 16 },
  eyebrowGold: { color: theme.color.brand, letterSpacing: 3, fontSize: 11, fontWeight: "700", marginBottom: 12 },
  body: { color: theme.color.onSurfaceSecondary, fontSize: 15, lineHeight: 24 },
  pillarsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  pillarCard: { flexBasis: "47%", flexGrow: 1, backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.md, padding: 16, borderWidth: 1, borderColor: theme.color.border, gap: 10, minHeight: 86 },
  pillarTxt: { color: theme.color.onSurfaceSecondary, fontSize: 12, fontWeight: "500", lineHeight: 16 },
  infoCard: { height: 360, borderRadius: theme.radius.lg, overflow: "hidden", marginTop: 16 },
  infoTitle: { color: theme.color.onSurface, fontSize: 32, lineHeight: 34, fontWeight: "300" },
  infoSub: { color: theme.color.onSurfaceTertiary, fontSize: 14, marginTop: 6 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoLine: { color: theme.color.onSurfaceSecondary, fontSize: 13 },
});
