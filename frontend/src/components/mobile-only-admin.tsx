import React from "react";
import { View, Text, StyleSheet, Pressable, Platform, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useI18n } from "@/src/i18n";
import { theme } from "@/src/theme";

/**
 * Full-screen placeholder shown when an admin/loyalty management route is
 * opened from a web browser. The loyalty admin panel is intentionally
 * restricted to the native Android / iOS application so that QR scanning and
 * staff workflows stay offline-friendly and table-side. The customer-facing
 * web experience never exposes these features.
 */
export default function MobileOnlyAdmin() {
  const router = useRouter();
  const { lang } = useI18n();
  if (Platform.OS !== "web") return null;
  return (
    <View testID="mobile-only-screen" style={styles.container}>
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28 }}>
        <View style={styles.iconCircle}>
          <Feather name="smartphone" size={28} color={theme.color.brand} />
        </View>
        <Text style={styles.eyebrow}>— {lang === "fr" ? "APPLICATION MOBILE" : "MOBILE APP"}</Text>
        <Text style={styles.title}>
          {lang === "fr" ? "Gestion fidélité\nréservée à l'app mobile" : "Loyalty management\nis mobile-only"}
        </Text>
        <Text style={styles.body}>
          {lang === "fr"
            ? "Pour scanner les codes QR, ajouter / retirer des points et gérer l'équipe, ouvrez Pizza Denfert sur l'application Android."
            : "To scan QR codes, add / remove points and manage your team, open Pizza Denfert on the Android app."}
        </Text>
        <Pressable testID="back-home-btn" onPress={() => router.replace("/")} style={styles.cta}>
          <Feather name="arrow-left" size={14} color={theme.color.onBrandPrimary} />
          <Text style={styles.ctaTxt}>{lang === "fr" ? "Retour à l'accueil" : "Back to home"}</Text>
        </Pressable>
        <Pressable
          testID="play-store-btn"
          onPress={() => Linking.openURL("https://play.google.com/store/search?q=Pizza+Denfert&c=apps")}
          style={styles.ghost}
        >
          <Feather name="download" size={13} color={theme.color.brand} />
          <Text style={styles.ghostTxt}>{lang === "fr" ? "Télécharger l'app" : "Get the app"}</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  iconCircle: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: theme.color.brand, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(212,175,55,0.08)", marginBottom: 22 },
  eyebrow: { color: theme.color.brand, letterSpacing: 3, fontSize: 11, fontWeight: "700", marginBottom: 8 },
  title: { color: theme.color.onSurface, fontSize: 26, lineHeight: 32, fontWeight: "300", textAlign: "center", letterSpacing: -0.4, marginBottom: 16 },
  body: { color: theme.color.onSurfaceTertiary, fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 380, marginBottom: 28, fontStyle: "italic" },
  cta: { flexDirection: "row", gap: 10, paddingHorizontal: 24, height: 50, borderRadius: theme.radius.md, backgroundColor: theme.color.brand, alignItems: "center", justifyContent: "center" },
  ctaTxt: { color: theme.color.onBrandPrimary, fontWeight: "700", letterSpacing: 1, fontSize: 13 },
  ghost: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 12, paddingVertical: 10 },
  ghostTxt: { color: theme.color.brand, fontWeight: "600", letterSpacing: 0.8, fontSize: 12 },
});
