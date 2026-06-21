import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, TextInput, Platform, KeyboardAvoidingView, Modal, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter, Redirect } from "expo-router";
import { useAuth } from "@/src/auth-context";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { theme } from "@/src/theme";
import { isLoyaltyApp } from "@/src/appMode";

const ROLES = [
  { key: "owner", fr: "Propriétaire", en: "Owner", icon: "star" as const },
  { key: "manager", fr: "Manager", en: "Manager", icon: "briefcase" as const },
  { key: "cashier", fr: "Caisse", en: "Cashier", icon: "credit-card" as const },
  { key: "staff", fr: "Équipe", en: "Staff", icon: "user" as const },
];

type StaffMember = {
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  disabled: boolean;
  is_self: boolean;
  created_at: string | null;
};

export default function AdminStaffRoute() {
  if (!isLoyaltyApp()) return <Redirect href={"/" as any} />;
  return <AdminStaff />;
}

function AdminStaff() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { lang } = useI18n();

  const [tab, setTab] = useState<"list" | "create">("list");

  // ---- LIST STATE ----
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listErr, setListErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // ---- CREATE STATE ----
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"owner" | "manager" | "cashier" | "staff">("staff");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<any>(null);

  const loadStaff = useCallback(async () => {
    try {
      setListErr(null);
      const data = await api.adminListStaff();
      setStaff(data);
    } catch (e: any) {
      setListErr(e?.message?.includes("403") ? (lang === "fr" ? "Accès refusé" : "Access denied") : (lang === "fr" ? "Erreur de chargement" : "Failed to load"));
    } finally {
      setListLoading(false);
      setRefreshing(false);
    }
  }, [lang]);

  useEffect(() => {
    if (user && user.is_admin) loadStaff();
  }, [user, loadStaff]);

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

  // ---- ACTIONS ----
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
      // Refresh the list in the background so the new member appears.
      loadStaff();
    } catch (e: any) {
      const m = e?.message || "";
      if (m.includes("400")) setErr(lang === "fr" ? "Numéro déjà utilisé" : "Phone already used");
      else if (m.includes("403")) setErr(lang === "fr" ? "Réservé au propriétaire / manager" : "Owner/manager only");
      else setErr(lang === "fr" ? "Erreur, réessayez" : "Error, retry");
    } finally { setBusy(false); }
  };

  const performRoleChange = async (s: StaffMember, newRole: string) => {
    setActionBusy(true);
    try {
      await api.adminUpdateRole(s.user_id, newRole);
      await loadStaff();
      setEditing(null);
    } catch (e: any) {
      const m = e?.message || "";
      Alert.alert(
        lang === "fr" ? "Erreur" : "Error",
        m.includes("400") ? (lang === "fr" ? "Impossible de rétrograder le dernier propriétaire" : "Cannot demote the last owner")
        : m.includes("403") ? (lang === "fr" ? "Réservé au propriétaire / manager" : "Owner/manager only")
        : (lang === "fr" ? "Réessayez" : "Try again"),
      );
    } finally { setActionBusy(false); }
  };

  const performToggleDisabled = async (s: StaffMember) => {
    const willDisable = !s.disabled;
    const confirmTxt = willDisable
      ? (lang === "fr" ? `Désactiver ${s.name} ?` : `Disable ${s.name}?`)
      : (lang === "fr" ? `Réactiver ${s.name} ?` : `Re-enable ${s.name}?`);
    Alert.alert(
      lang === "fr" ? "Confirmation" : "Confirm",
      confirmTxt,
      [
        { text: lang === "fr" ? "Annuler" : "Cancel", style: "cancel" },
        {
          text: willDisable ? (lang === "fr" ? "Désactiver" : "Disable") : (lang === "fr" ? "Réactiver" : "Re-enable"),
          style: willDisable ? "destructive" : "default",
          onPress: async () => {
            setActionBusy(true);
            try {
              await api.adminToggleDisabled(s.user_id, willDisable);
              await loadStaff();
            } catch (e: any) {
              const m = e?.message || "";
              Alert.alert(lang === "fr" ? "Erreur" : "Error", m.includes("400")
                ? (lang === "fr" ? "Impossible de désactiver le dernier propriétaire actif" : "Cannot disable the last active owner")
                : (lang === "fr" ? "Réessayez" : "Try again"));
            } finally { setActionBusy(false); }
          },
        },
      ],
    );
  };

  const performDelete = (s: StaffMember) => {
    Alert.alert(
      lang === "fr" ? "Supprimer ce compte ?" : "Delete this account?",
      lang === "fr" ? `${s.name} sera supprimé définitivement.` : `${s.name} will be permanently removed.`,
      [
        { text: lang === "fr" ? "Annuler" : "Cancel", style: "cancel" },
        {
          text: lang === "fr" ? "Supprimer" : "Delete",
          style: "destructive",
          onPress: async () => {
            setActionBusy(true);
            try {
              await api.adminDeleteStaff(s.user_id);
              await loadStaff();
              setEditing(null);
            } catch (e: any) {
              const m = e?.message || "";
              Alert.alert(lang === "fr" ? "Erreur" : "Error", m.includes("400")
                ? (lang === "fr" ? "Impossible de supprimer le dernier propriétaire" : "Cannot delete the last owner")
                : (lang === "fr" ? "Réessayez" : "Try again"));
            } finally { setActionBusy(false); }
          },
        },
      ],
    );
  };

  const roleMeta = (k: string) => ROLES.find((r) => r.key === k) || ROLES[3];

  return (
    <View testID="admin-staff-screen" style={styles.container}>
      <LinearGradient colors={["#0F0A05", "#050505"]} style={StyleSheet.absoluteFillObject} />
      <SafeAreaView style={{ flex: 1 }}>
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

        {/* Segmented control */}
        <View style={styles.segmentRow}>
          <Pressable testID="seg-list" onPress={() => setTab("list")} style={[styles.segment, tab === "list" && styles.segmentActive]}>
            <Feather name="users" size={13} color={tab === "list" ? theme.color.brand : theme.color.onSurfaceTertiary} />
            <Text style={[styles.segmentTxt, tab === "list" && styles.segmentTxtActive]}>
              {lang === "fr" ? `Liste (${staff.length})` : `List (${staff.length})`}
            </Text>
          </Pressable>
          <Pressable testID="seg-create" onPress={() => setTab("create")} style={[styles.segment, tab === "create" && styles.segmentActive]}>
            <Feather name="user-plus" size={13} color={tab === "create" ? theme.color.brand : theme.color.onSurfaceTertiary} />
            <Text style={[styles.segmentTxt, tab === "create" && styles.segmentTxtActive]}>
              {lang === "fr" ? "Créer" : "Create"}
            </Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          {tab === "list" ? (
            <ScrollView
              contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 80 }}
              refreshControl={<RefreshControl refreshing={refreshing} tintColor={theme.color.brand} onRefresh={async () => { setRefreshing(true); await loadStaff(); }} />}
            >
              {listLoading ? (
                <ActivityIndicator color={theme.color.brand} style={{ marginTop: 40 }} />
              ) : listErr ? (
                <View style={styles.errBoxRow}>
                  <Feather name="alert-circle" size={14} color={theme.color.error} />
                  <Text style={[styles.err, { marginBottom: 0 }]}>{listErr}</Text>
                </View>
              ) : staff.length === 0 ? (
                <Text style={styles.empty}>{lang === "fr" ? "Aucun membre" : "No staff yet"}</Text>
              ) : (
                staff.map((s) => {
                  const meta = roleMeta(s.role);
                  return (
                    <View key={s.user_id} testID={`staff-row-${s.user_id}`} style={[styles.staffCard, s.disabled && styles.staffCardDisabled]}>
                      <View style={styles.staffHead}>
                        <View style={[styles.avatar, s.disabled && { opacity: 0.4 }]}>
                          <Text style={styles.avatarTxt}>{s.name?.[0]?.toUpperCase() || "?"}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <Text style={[styles.staffName, s.disabled && styles.dimText]}>{s.name}</Text>
                            {s.is_self && <View style={styles.youTag}><Text style={styles.youTagTxt}>{lang === "fr" ? "Vous" : "You"}</Text></View>}
                            {s.disabled && <View style={styles.disabledTag}><Text style={styles.disabledTagTxt}>{lang === "fr" ? "Désactivé" : "Disabled"}</Text></View>}
                          </View>
                          <Text style={[styles.staffSub, s.disabled && styles.dimText]}>{s.phone || s.email || "—"}</Text>
                          <View style={styles.roleBadge}>
                            <Feather name={meta.icon} size={11} color={theme.color.brand} />
                            <Text style={styles.roleBadgeTxt}>{lang === "fr" ? meta.fr : meta.en}</Text>
                          </View>
                        </View>
                        {!s.is_self && (
                          <Pressable
                            testID={`staff-actions-${s.user_id}`}
                            onPress={() => setEditing(s)}
                            style={styles.iconBtnBorder}
                          >
                            <Feather name="more-vertical" size={16} color={theme.color.onSurface} />
                          </Pressable>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
              <View style={styles.infoBox}>
                <Feather name="info" size={13} color={theme.color.brand} />
                <Text style={styles.infoTxt}>
                  {lang === "fr"
                    ? "Les membres se connectent ensuite avec leur téléphone + code OTP."
                    : "Members will sign in with their phone + OTP code."}
                </Text>
              </View>

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
                </View>
              )}
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* ACTION SHEET MODAL */}
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable onPress={() => setEditing(null)} style={styles.modalBackdrop}>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.modalCard}>
            {editing && (
              <>
                <View style={styles.modalHead}>
                  <Text style={styles.modalTitle}>{editing.name}</Text>
                  <Text style={styles.modalSub}>{editing.phone || editing.email || "—"}</Text>
                </View>

                <Text style={styles.modalSectionLbl}>{lang === "fr" ? "RÔLE" : "ROLE"}</Text>
                <View style={styles.rolesRow}>
                  {ROLES.map((r) => (
                    <Pressable
                      key={r.key}
                      testID={`modal-role-${r.key}`}
                      onPress={() => performRoleChange(editing, r.key)}
                      disabled={actionBusy || editing.role === r.key}
                      style={[styles.roleBtn, editing.role === r.key && styles.roleBtnActive, actionBusy && { opacity: 0.6 }]}
                    >
                      <Feather name={r.icon} size={14} color={editing.role === r.key ? theme.color.onBrandPrimary : theme.color.brand} />
                      <Text style={[styles.roleTxt, editing.role === r.key && styles.roleTxtActive]}>{lang === "fr" ? r.fr : r.en}</Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable
                  testID={`modal-toggle-${editing.user_id}`}
                  onPress={() => performToggleDisabled(editing)}
                  disabled={actionBusy}
                  style={[styles.modalAction, { borderColor: editing.disabled ? theme.color.success : theme.color.brand }]}
                >
                  <Feather name={editing.disabled ? "user-check" : "user-x"} size={16} color={editing.disabled ? theme.color.success : theme.color.brand} />
                  <Text style={[styles.modalActionTxt, { color: editing.disabled ? theme.color.success : theme.color.brand }]}>
                    {editing.disabled
                      ? (lang === "fr" ? "Réactiver" : "Re-enable")
                      : (lang === "fr" ? "Désactiver" : "Disable")}
                  </Text>
                </Pressable>

                <Pressable
                  testID={`modal-delete-${editing.user_id}`}
                  onPress={() => performDelete(editing)}
                  disabled={actionBusy}
                  style={[styles.modalAction, { borderColor: theme.color.error }]}
                >
                  <Feather name="trash-2" size={16} color={theme.color.error} />
                  <Text style={[styles.modalActionTxt, { color: theme.color.error }]}>{lang === "fr" ? "Supprimer le compte" : "Delete account"}</Text>
                </Pressable>

                <Pressable testID="modal-close-btn" onPress={() => setEditing(null)} style={styles.modalCancel}>
                  <Text style={styles.modalCancelTxt}>{lang === "fr" ? "Fermer" : "Close"}</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md, borderBottomWidth: 0.5, borderBottomColor: theme.color.border },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  iconBtnBorder: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.color.border },
  eyebrowSmall: { color: theme.color.brand, fontSize: 9, letterSpacing: 2, fontWeight: "700", textAlign: "center" },
  title: { color: theme.color.onSurface, fontSize: 14, fontWeight: "500", textAlign: "center", marginTop: 2 },
  btn: { paddingHorizontal: 20, height: 44, borderRadius: theme.radius.md, backgroundColor: theme.color.brand, alignItems: "center", justifyContent: "center" },
  btnTxt: { color: theme.color.onBrandPrimary, fontWeight: "700", letterSpacing: 1, fontSize: 13 },
  segmentRow: { flexDirection: "row", gap: 6, marginHorizontal: theme.space.lg, marginTop: theme.space.md, marginBottom: theme.space.sm },
  segment: { flex: 1, height: 40, borderRadius: 999, borderWidth: 1, borderColor: theme.color.border, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  segmentActive: { backgroundColor: "rgba(212,175,55,0.1)", borderColor: theme.color.brand },
  segmentTxt: { color: theme.color.onSurfaceTertiary, fontSize: 12, fontWeight: "600" },
  segmentTxtActive: { color: theme.color.brand },
  empty: { color: theme.color.muted, textAlign: "center", padding: theme.space.xl, fontSize: 13, fontStyle: "italic" },
  staffCard: { padding: theme.space.lg, borderRadius: theme.radius.md, backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, marginBottom: theme.space.md },
  staffCardDisabled: { borderColor: "rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.02)" },
  staffHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.color.brand, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: theme.color.onBrandPrimary, fontSize: 18, fontWeight: "700" },
  staffName: { color: theme.color.onSurface, fontSize: 15, fontWeight: "500" },
  staffSub: { color: theme.color.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  dimText: { color: theme.color.muted },
  roleBadge: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: theme.color.brand, alignSelf: "flex-start", backgroundColor: "rgba(212,175,55,0.06)" },
  roleBadgeTxt: { color: theme.color.brand, fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  youTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: theme.color.brand },
  youTagTxt: { color: theme.color.onBrandPrimary, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  disabledTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: theme.color.error },
  disabledTagTxt: { color: theme.color.error, fontSize: 9, fontWeight: "700", letterSpacing: 1 },

  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, marginBottom: theme.space.lg, borderRadius: theme.radius.md, backgroundColor: "rgba(212,175,55,0.08)", borderWidth: 1, borderColor: "rgba(212,175,55,0.3)" },
  infoTxt: { flex: 1, color: theme.color.onSurface, fontSize: 12, lineHeight: 16 },
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
  errBoxRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.error, backgroundColor: "rgba(198,40,40,0.08)", marginBottom: theme.space.lg },
  successBox: { marginTop: theme.space.xl, padding: theme.space.lg, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.success, backgroundColor: "rgba(46,160,67,0.08)" },
  successTitle: { color: theme.color.success, fontSize: 14, fontWeight: "700", letterSpacing: 0.5 },
  successLine: { color: theme.color.onSurface, fontSize: 13, marginTop: 6 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: theme.color.surfaceSecondary, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: theme.space.xl, borderTopWidth: 1, borderTopColor: theme.color.brand },
  modalHead: { marginBottom: theme.space.lg },
  modalTitle: { color: theme.color.onSurface, fontSize: 20, fontWeight: "500" },
  modalSub: { color: theme.color.onSurfaceTertiary, fontSize: 13, marginTop: 4 },
  modalSectionLbl: { color: theme.color.brand, fontSize: 10, letterSpacing: 2.5, fontWeight: "700", marginBottom: theme.space.md },
  modalAction: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 52, borderRadius: theme.radius.md, borderWidth: 1, marginTop: theme.space.md },
  modalActionTxt: { fontSize: 14, fontWeight: "700", letterSpacing: 0.5 },
  modalCancel: { paddingVertical: 14, alignItems: "center", marginTop: theme.space.md },
  modalCancelTxt: { color: theme.color.onSurfaceTertiary, fontSize: 13 },
});
