import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, TextInput, Platform, KeyboardAvoidingView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth-context";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { theme } from "@/src/theme";

const ROLES = [
  { key: "owner", fr: "Propriétaire", en: "Owner", icon: "star" as const },
  { key: "manager", fr: "Manager", en: "Manager", icon: "briefcase" as const },
  { key: "cashier", fr: "Caisse", en: "Cashier", icon: "credit-card" as const },
  { key: "staff", fr: "Équipe", en: "Staff", icon: "user" as const },
];

export default function AdminStaff() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { lang } = useI18n();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"owner" | "manager" | "cashier" | "staff">("staff");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<any>(null);

  if (loading) {
    return <View style={styles.container}><ActivityIndicator color={theme.color.brand} style={{ flex: 1 }} /></View>;
  }

  if (!user || !user.is_admin) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Feather name="lock" size={28} color={theme.color.brand} />
          <Text style={{ color: theme.color.onSurface, marginTop: 12, fontSize: 16 }}>
            {lang === "fr" ? "Accès administrateur requis" : "Admin access required"}
          </Text>
          <Pressable onPress={() => router.replace("/admin")} style={[styles.btn, { marginTop: 20 }]}>
            <Text style={styles.btnTxt}>{lang === "fr" ? "Se connecter" : "Sign in"}</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  const onCreate = async () => {
    setErr(null);
    setCreated(null);
    const cleanPhone = phone.trim().replace(/\s+/g, "");
    if (!name.trim()) { setErr(lang === "fr" ? "Nom requis" : "Name required"); return; }
    if (cleanPhone.length < 6) { setErr(lang === "fr" ? "Téléphone invalide" : "Invalid phone"); return; }
    setBusy(true);
    try {
      const res = await api.adminCreateStaff(cleanPhone, name.trim(), role);
      setCreated(res.created);
      setName(""); setPhone("");
    } catch (e: any) {
      const m = e?.message || "";
      if (m.includes("400")) setErr(lang === "fr" ? "Numéro déjà utilisé" : "Phone already used");
      else if (m.includes("403")) setErr(lang === "fr" ? "Réservé au propriétaire / manager" : "Owner/manager only");
      else setErr(lang === "fr" ? "Erreur, réessayez" : "Error, retry");
    } finally { setBusy(false); }
  };

  return (
    <View testID="admin-staff-screen" style={styles.container}>
      <LinearGradient colors={["#0F0A05", "#050505"]} style={StyleSheet.absoluteFillObject} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <View style={styles.header}>
            <Pressable testID="staff-back-btn" onPress={() => router.back()} style={styles.iconBtn}>
              <Feather name="arrow-left" size={20} color={theme.color.onSurface} />
            </Pressable>
            <View>
              <Text style={styles.eyebrowSmall}>ADMIN · {lang === "fr" ? "PERSONNEL" : "STAFF"}</Text>
              <Text style={styles.title}>{lang === "fr" ? "Gestion équipe" : "Team management"}</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
            <View style={styles.infoBox}>
              <Feather name="info" size={13} color={theme.color.brand} />
              <Text style={styles.infoTxt}>
                {lang === "fr"
                  ? "Les membres se connectent ensuite avec leur téléphone + code OTP."
                  : "Members will sign in with their phone + OTP code."}
              </Text>
            </View>

            <Text style={styles.sectionLbl}>{lang === "fr" ? "NOUVEAU MEMBRE" : "NEW MEMBER"}</Text>

            <Text style={styles.fieldLbl}>{lang === "fr" ? "Nom complet" : "Full name"}</Text>
            <TextInput
              testID="staff-name-input"
              style={styles.input}
              placeholder={lang === "fr" ? "Ex: Marie Dupont" : "E.g. Marie Dupont"}
              placeholderTextColor={theme.color.muted}
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.fieldLbl}>{lang === "fr" ? "Téléphone" : "Phone"}</Text>
            <TextInput
              testID="staff-phone-input"
              style={styles.input}
              placeholder="+33 6 12 34 56 78"
              placeholderTextColor={theme.color.muted}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />

            <Text style={styles.fieldLbl}>{lang === "fr" ? "Rôle" : "Role"}</Text>
            <View style={styles.rolesRow}>
              {ROLES.map((r) => (
                <Pressable
                  key={r.key}
                  testID={`role-${r.key}`}
                  onPress={() => setRole(r.key as any)}
                  style={[styles.roleBtn, role === r.key && styles.roleBtnActive]}
                >
                  <Feather name={r.icon} size={14} color={role === r.key ? theme.color.onBrandPrimary : theme.color.brand} />
                  <Text style={[styles.roleTxt, role === r.key && styles.roleTxtActive]}>{lang === "fr" ? r.fr : r.en}</Text>
                </Pressable>
              ))}
            </View>

            {err && <Text testID="staff-error" style={styles.err}>{err}</Text>}

            <Pressable testID="create-staff-btn" onPress={onCreate} disabled={busy} style={styles.submit}>
              {busy ? <ActivityIndicator color={theme.color.onBrandPrimary} /> : (
                <>
                  <Feather name="user-plus" size={16} color={theme.color.onBrandPrimary} />
                  <Text style={[styles.submitTxt, { marginLeft: 8 }]}>{lang === "fr" ? "Créer le compte" : "Create account"}</Text>
                </>
              )}
            </Pressable>

            {created && (
              <View testID="staff-success" style={styles.successBox}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Feather name="check-circle" size={16} color={theme.color.success} />
                  <Text style={styles.successTitle}>{lang === "fr" ? "Compte créé" : "Account created"}</Text>
                </View>
                <Text style={styles.successLine}>{created.name} · {created.role}</Text>
                <Text style={styles.successLine}>{created.phone}</Text>
                <Text style={styles.successHint}>
                  {lang === "fr"
                    ? "Ce membre peut se connecter via le panneau admin avec son téléphone + OTP."
                    : "This member can sign in via the admin panel using phone + OTP."}
                </Text>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md, borderBottomWidth: 0.5, borderBottomColor: theme.color.border },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  eyebrowSmall: { color: theme.color.brand, fontSize: 9, letterSpacing: 2, fontWeight: "700", textAlign: "center" },
  title: { color: theme.color.onSurface, fontSize: 14, fontWeight: "500", textAlign: "center", marginTop: 2 },
  btn: { paddingHorizontal: 20, height: 44, borderRadius: theme.radius.md, backgroundColor: theme.color.brand, alignItems: "center", justifyContent: "center" },
  btnTxt: { color: theme.color.onBrandPrimary, fontWeight: "700", letterSpacing: 1, fontSize: 13 },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, marginBottom: theme.space.lg, borderRadius: theme.radius.md, backgroundColor: "rgba(212,175,55,0.08)", borderWidth: 1, borderColor: "rgba(212,175,55,0.3)" },
  infoTxt: { flex: 1, color: theme.color.onSurface, fontSize: 12, lineHeight: 16 },
  sectionLbl: { color: theme.color.brand, fontSize: 10, letterSpacing: 2.5, fontWeight: "700", marginBottom: theme.space.md },
  fieldLbl: { color: theme.color.onSurfaceTertiary, fontSize: 11, letterSpacing: 1.5, fontWeight: "600", marginBottom: 6, marginTop: 6 },
  input: { height: 54, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, paddingHorizontal: 16, color: theme.color.onSurface, marginBottom: theme.space.md, backgroundColor: "rgba(255,255,255,0.04)", fontSize: 15 },
  rolesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: theme.space.md },
  roleBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 40, borderRadius: 999, borderWidth: 1, borderColor: theme.color.brand, backgroundColor: "rgba(212,175,55,0.06)" },
  roleBtnActive: { backgroundColor: theme.color.brand },
  roleTxt: { color: theme.color.brand, fontSize: 12, fontWeight: "600" },
  roleTxtActive: { color: theme.color.onBrandPrimary },
  submit: { flexDirection: "row", height: 54, borderRadius: theme.radius.md, backgroundColor: theme.color.brand, alignItems: "center", justifyContent: "center", marginTop: theme.space.md },
  submitTxt: { color: theme.color.onBrandPrimary, fontSize: 14, fontWeight: "700", letterSpacing: 1 },
  err: { color: theme.color.error, fontSize: 13, marginBottom: theme.space.md, textAlign: "center" },
  successBox: { marginTop: theme.space.xl, padding: theme.space.lg, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.success, backgroundColor: "rgba(46,160,67,0.08)" },
  successTitle: { color: theme.color.success, fontSize: 14, fontWeight: "700", letterSpacing: 0.5 },
  successLine: { color: theme.color.onSurface, fontSize: 13, marginTop: 6 },
  successHint: { color: theme.color.onSurfaceTertiary, fontSize: 11, marginTop: 8, fontStyle: "italic", lineHeight: 15 },
});
