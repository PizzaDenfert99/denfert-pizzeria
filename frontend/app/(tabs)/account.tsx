import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Platform, KeyboardAvoidingView, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { Image as RNImage } from "react-native";
import { useAuth } from "@/src/auth-context";
import { useI18n } from "@/src/i18n";
import { api, setToken } from "@/src/api";
import { theme } from "@/src/theme";
import { PushOptIn } from "@/src/PushOptIn";
import { isLoyaltyApp } from "@/src/appMode";

// Discreet lock icon only shown on the loyalty-tablet APK when the user is
// already signed in. The unauthenticated /account view already exposes a
// pre-existing "Accès admin / Staff" button visible to all visitors. This
// loyalty-only icon covers the logged-in case so staff can dive straight
// into the QR scanner / loyalty admin without signing out.
function LoyaltyStaffIcon() {
  const router = useRouter();
  if (!isLoyaltyApp()) return null;
  return (
    <Pressable
      testID="loyalty-staff-icon"
      onPress={() => router.push("/admin" as any)}
      hitSlop={12}
      style={({ pressed }) => [
        {
          width: 36, height: 36, borderRadius: 18,
          borderWidth: 1, borderColor: "rgba(212,175,55,0.35)",
          alignItems: "center", justifyContent: "center",
          backgroundColor: pressed ? "rgba(212,175,55,0.18)" : "rgba(0,0,0,0.4)",
        },
      ]}
    >
      <Feather name="lock" size={14} color={theme.color.brand} />
    </Pressable>
  );
}

const HERO = "https://images.pexels.com/photos/33593005/pexels-photo-33593005.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=1200";
const LOGO = "https://customer-assets.emergentagent.com/job_denfert-pizzeria/artifacts/nwj3edom_file_00000000005c71f489c484606f9b5e35.png";

const REWARD_INFO: Record<string, { fr: string; en: string; threshold: number; icon: any }> = {
  coffee: { fr: "Café offert", en: "Free coffee", threshold: 3, icon: "coffee" },
  dessert: { fr: "Dessert offert", en: "Free dessert", threshold: 5, icon: "gift" },
  margherita: { fr: "Margherita offerte", en: "Free Margherita", threshold: 10, icon: "award" },
};

export default function Account() {
  const { user, loading, signInGoogleSession, signOut, refresh } = useAuth();
  const { t, lang, setLang } = useI18n();
  const router = useRouter();

  // Phone OTP state
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Account state
  const [loyalty, setLoyalty] = useState<any>(null);
  const [reservations, setReservations] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"rewards" | "history" | "reservations">("rewards");

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [l, r] = await Promise.all([api.loyalty(), api.myReservations()]);
      setLoyalty(l);
      setReservations(r);
    } catch {}
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const requestOtp = async () => {
    setErr(null);
    if (phone.trim().length < 6) { setErr(lang === "fr" ? "Numéro invalide" : "Invalid number"); return; }
    setAuthLoading(true);
    try {
      const r = await api.otpRequest(phone.trim(), name.trim() || undefined);
      setDevCode(r.dev_code);
      setStep("code");
    } catch {
      setErr(lang === "fr" ? "Erreur, réessayez" : "Error, retry");
    } finally { setAuthLoading(false); }
  };

  const verifyOtp = async () => {
    setErr(null);
    if (code.trim().length !== 6) { setErr(lang === "fr" ? "Code à 6 chiffres" : "6-digit code"); return; }
    setAuthLoading(true);
    try {
      const res = await api.otpVerify(phone.trim(), code.trim(), name.trim() || undefined);
      await setToken(res.token);
      await refresh();
    } catch (e: any) {
      setErr(e?.message?.includes("401") ? (lang === "fr" ? "Code invalide" : "Invalid code") : (lang === "fr" ? "Erreur, réessayez" : "Error, retry"));
    } finally { setAuthLoading(false); }
  };

  const google = async () => {
    setErr(null);
    setAuthLoading(true);
    try {
      const redirect = Platform.OS === "web" ? (window.location.origin + "/") : Linking.createURL("auth");
      const url = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
      if (Platform.OS === "web") { window.location.href = url; return; }
      const result = await WebBrowser.openAuthSessionAsync(url, redirect);
      if (result.type === "success" && result.url) {
        const m = result.url.match(/session_id=([^&]+)/);
        if (m) await signInGoogleSession(decodeURIComponent(m[1]));
      }
    } catch {
      setErr(lang === "fr" ? "Connexion Google échouée" : "Google sign-in failed");
    } finally { setAuthLoading(false); }
  };

  const claim = async (reward: string) => {
    try {
      await api.redeem(reward);
      await load();
    } catch {}
  };

  if (loading) {
    return <View style={styles.container}><ActivityIndicator color={theme.color.brand} style={{ flex: 1 }} /></View>;
  }

  // ============== AUTH VIEW (Phone + OTP) ==============
  if (!user) {
    return (
      <View testID="auth-view" style={styles.container}>
        <Image source={HERO} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        <LinearGradient colors={["rgba(5,5,5,0.55)", "rgba(5,5,5,0.96)"]} locations={[0, 0.55]} style={StyleSheet.absoluteFillObject} />
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: theme.space.xl, paddingBottom: 140, flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Pressable testID="lang-toggle" onPress={() => setLang(lang === "fr" ? "en" : "fr")} style={styles.langBtn}>
                <Feather name="globe" size={12} color={theme.color.brand} />
                <Text style={styles.langTxt}>{lang.toUpperCase()}</Text>
              </Pressable>
              <View style={{ marginTop: theme.space.xxl, marginBottom: theme.space.xl, alignItems: "center" }}>
                <Text style={styles.eyebrow}>— {lang === "fr" ? "FIDÉLITÉ CLIENT" : "CUSTOMER LOYALTY"}</Text>
                <Text style={[styles.bigTitle, { textAlign: "center" }]}>{lang === "fr" ? "Carte\nfidélité VIP" : "VIP\nLoyalty card"}</Text>
                <Text style={[styles.subTxt, { textAlign: "center" }]}>{t("pointsHint")}</Text>
              </View>

              {step === "phone" ? (
                <>
                  <Text style={styles.fieldLbl}>{lang === "fr" ? "Numéro de téléphone" : "Phone number"}</Text>
                  <TextInput
                    testID="phone-input"
                    style={styles.input}
                    placeholder="+33 6 12 34 56 78"
                    placeholderTextColor={theme.color.muted}
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    autoFocus
                  />
                  <Text style={styles.fieldLbl}>{lang === "fr" ? "Prénom (optionnel)" : "First name (optional)"}</Text>
                  <TextInput
                    testID="name-input"
                    style={styles.input}
                    placeholder={lang === "fr" ? "Marie" : "Marie"}
                    placeholderTextColor={theme.color.muted}
                    value={name}
                    onChangeText={setName}
                  />
                  {err && <Text testID="auth-error" style={styles.err}>{err}</Text>}
                  <Pressable testID="request-otp-btn" onPress={requestOtp} disabled={authLoading} style={styles.submit}>
                    {authLoading ? <ActivityIndicator color={theme.color.onBrandPrimary} /> : (
                      <>
                        <Feather name="send" size={16} color={theme.color.onBrandPrimary} />
                        <Text style={[styles.submitTxt, { marginLeft: 8 }]}>{lang === "fr" ? "Recevoir le code" : "Send code"}</Text>
                      </>
                    )}
                  </Pressable>
                  <View style={styles.dividerRow}>
                    <View style={styles.line} /><Text style={styles.lineTxt}>{lang === "fr" ? "OU" : "OR"}</Text><View style={styles.line} />
                  </View>
                  <Pressable testID="google-signin-btn" onPress={google} style={styles.googleBtn} disabled={authLoading}>
                    <Feather name="chrome" size={16} color={theme.color.onSurface} />
                    <Text style={styles.googleTxt}>{t("signInGoogle")}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.fieldLbl}>{lang === "fr" ? `Code envoyé au ${phone}` : `Code sent to ${phone}`}</Text>
                  {devCode && (
                    <View style={styles.devBox}>
                      <Feather name="info" size={13} color={theme.color.brand} />
                      <Text style={styles.devTxt}>{lang === "fr" ? "Mode démo · Code : " : "Demo mode · Code: "}<Text style={styles.devCode}>{devCode}</Text></Text>
                    </View>
                  )}
                  <TextInput
                    testID="otp-input"
                    style={[styles.input, { fontSize: 24, letterSpacing: 8, textAlign: "center", fontWeight: "600" }]}
                    placeholder="000000"
                    placeholderTextColor={theme.color.muted}
                    keyboardType="number-pad"
                    maxLength={6}
                    value={code}
                    onChangeText={setCode}
                    autoFocus
                  />
                  {err && <Text testID="auth-error" style={styles.err}>{err}</Text>}
                  <Pressable testID="verify-otp-btn" onPress={verifyOtp} disabled={authLoading} style={styles.submit}>
                    {authLoading ? <ActivityIndicator color={theme.color.onBrandPrimary} /> : (
                      <Text style={styles.submitTxt}>{lang === "fr" ? "Valider" : "Verify"}</Text>
                    )}
                  </Pressable>
                  <Pressable testID="back-phone-btn" onPress={() => { setStep("phone"); setCode(""); setDevCode(null); setErr(null); }} style={{ marginTop: theme.space.lg }}>
                    <Text style={styles.toggle}>{lang === "fr" ? "← Modifier le numéro" : "← Change number"}</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  // ============== ACCOUNT VIEW ==============
  const pc = loyalty?.pizza_count ?? user.pizza_count ?? 0;
  const qrData = loyalty?.qr_data || `PIZZA-DENFERT:${user.user_id}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrData)}&size=260x260&bgcolor=050505&color=D4AF37&qzone=2`;
  const available = loyalty?.available_rewards || [];
  const history = loyalty?.history || [];

  const rewardTiers = [
    { key: "coffee", count: 3 },
    { key: "dessert", count: 5 },
    { key: "margherita", count: 10 },
  ];

  return (
    <View testID="account-screen" style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={theme.color.brand} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <SafeAreaView edges={["top"]} style={{ padding: theme.space.xl }}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.eyebrow}>— BIENVENUE</Text>
              <Text style={styles.title}>{user.name}</Text>
              <Text style={styles.subtxt}>{user.email}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pressable testID="lang-toggle" onPress={() => setLang(lang === "fr" ? "en" : "fr")} style={styles.langBtnRound}>
                <Text style={styles.langTxt}>{lang.toUpperCase()}</Text>
              </Pressable>
              <LoyaltyStaffIcon />
            </View>
          </View>

          {/* LOYALTY CARD */}
          <View testID="loyalty-card" style={styles.loyaltyCard}>
            <LinearGradient colors={["#1A1410", "#0A0805"]} style={StyleSheet.absoluteFillObject} />
            <View style={styles.cardHead}>
              <Text style={styles.cardEyebrow}>VIP MEMBER</Text>
              <Feather name="award" size={18} color={theme.color.brand} />
            </View>
            <Text style={styles.cardTitle}>{t("loyaltyCard")}</Text>
            <View style={styles.qrWrap}>
              <Image source={qrUrl} style={styles.qr} contentFit="contain" />
            </View>
            <Text style={styles.qrHint}>{t("yourQR")}</Text>
            <View style={styles.pizzaCountRow}>
              <Text style={styles.bigCount}>{pc}</Text>
              <Text style={styles.bigCountLbl}>{lang === "fr" ? "pizzas achetées" : "pizzas purchased"}</Text>
            </View>
            {user.is_admin && (
              <Pressable testID="admin-panel-btn" onPress={() => router.push("/admin")} style={styles.adminBtn}>
                <Feather name="shield" size={14} color={theme.color.brand} />
                <Text style={styles.adminBtnTxt}>{lang === "fr" ? "Panneau admin" : "Admin panel"}</Text>
              </Pressable>
            )}
          </View>

          {/* SEGMENT TABS */}
          <View style={styles.segmentRow}>
            <Pressable testID="tab-rewards" onPress={() => setTab("rewards")} style={[styles.segment, tab === "rewards" && styles.segmentActive]}>
              <Text style={[styles.segmentTxt, tab === "rewards" && styles.segmentTxtActive]}>{lang === "fr" ? "Récompenses" : "Rewards"}</Text>
            </Pressable>
            <Pressable testID="tab-history" onPress={() => setTab("history")} style={[styles.segment, tab === "history" && styles.segmentActive]}>
              <Text style={[styles.segmentTxt, tab === "history" && styles.segmentTxtActive]}>{lang === "fr" ? "Historique" : "History"}</Text>
            </Pressable>
            <Pressable testID="tab-reservations" onPress={() => setTab("reservations")} style={[styles.segment, tab === "reservations" && styles.segmentActive]}>
              <Text style={[styles.segmentTxt, tab === "reservations" && styles.segmentTxtActive]}>{t("reserve")}</Text>
            </Pressable>
          </View>

          {tab === "rewards" && (
            <View>
              {rewardTiers.map((r) => {
                const info = REWARD_INFO[r.key];
                const has = available.find((a: any) => a.reward === r.key);
                const remaining = pc % r.count;
                const progress = pc >= r.count ? 1 : remaining / r.count;
                const next = (r.count - remaining) % r.count || (pc < r.count ? r.count - remaining : 0);
                return (
                  <View key={r.key} testID={`reward-${r.key}`} style={styles.rewardCard}>
                    <View style={styles.rewardHead}>
                      <View style={styles.rewardIconWrap}>
                        <Feather name={info.icon} size={18} color={theme.color.brand} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rewardName}>{lang === "fr" ? info.fr : info.en}</Text>
                        <Text style={styles.rewardSub}>{lang === "fr" ? `Tous les ${r.count} pizzas` : `Every ${r.count} pizzas`}</Text>
                      </View>
                      {has ? (
                        <Pressable testID={`claim-${r.key}`} onPress={() => claim(r.key)} style={styles.claimBtn}>
                          <Text style={styles.claimTxt}>{lang === "fr" ? "Réclamer" : "Claim"}</Text>
                        </Pressable>
                      ) : (
                        <Text style={styles.nextTxt}>{lang === "fr" ? `Encore ${next}` : `${next} to go`}</Text>
                      )}
                    </View>
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {tab === "history" && (
            history.length === 0 ? <Text style={styles.empty}>{lang === "fr" ? "Aucune récompense réclamée" : "No rewards claimed yet"}</Text> :
            history.slice().reverse().map((h: any, i: number) => {
              const info = REWARD_INFO[h.reward];
              return (
                <View key={i} testID={`history-${i}`} style={styles.row}>
                  <Feather name={info?.icon || "gift"} size={16} color={theme.color.brand} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{info ? (lang === "fr" ? info.fr : info.en) : h.reward}</Text>
                    <Text style={styles.rowSub}>{h.redeemed_at?.slice(0, 10)}</Text>
                  </View>
                  <Feather name="check-circle" size={16} color={theme.color.success} />
                </View>
              );
            })
          )}

          {tab === "reservations" && (
            reservations.length === 0 ? <Text style={styles.empty}>{t("noReservations")}</Text> :
            reservations.map((r) => (
              <View key={r.id} testID={`res-${r.id}`} style={styles.row}>
                <Feather name="calendar" size={16} color={theme.color.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{r.date} · {r.time}</Text>
                  <Text style={styles.rowSub}>{r.guests} {lang === "fr" ? "convives" : "guests"}</Text>
                </View>
                <Feather name="check-circle" size={16} color={theme.color.success} />
              </View>
            ))
          )}

          <PushOptIn lang={lang as "fr" | "en"} />

          <Pressable testID="logout-btn" onPress={signOut} style={styles.logout}>
            <Feather name="log-out" size={16} color={theme.color.error} />
            <Text style={styles.logoutTxt}>{t("logout")}</Text>
          </Pressable>
        </SafeAreaView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  eyebrow: { color: theme.color.brand, letterSpacing: 3, fontSize: 10, fontWeight: "700", marginBottom: 6 },
  bigTitle: { color: theme.color.onSurface, fontSize: 44, fontWeight: "300", letterSpacing: -1, lineHeight: 46 },
  subTxt: { color: theme.color.onSurfaceTertiary, fontSize: 14, marginTop: theme.space.md, fontStyle: "italic" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { color: theme.color.onSurface, fontSize: 30, fontWeight: "300", letterSpacing: -1 },
  subtxt: { color: theme.color.onSurfaceTertiary, fontSize: 13, marginTop: 4 },
  langBtn: { alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 999, borderWidth: 1, borderColor: theme.color.borderStrong, backgroundColor: "rgba(0,0,0,0.5)" },
  langBtnRound: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: theme.color.borderStrong, alignItems: "center", justifyContent: "center" },
  langTxt: { color: theme.color.brand, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  googleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 54, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.borderStrong, backgroundColor: "rgba(255,255,255,0.04)" },
  staffAccessBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: theme.space.lg, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: "rgba(212,175,55,0.35)", backgroundColor: "rgba(212,175,55,0.05)", alignSelf: "center" },
  staffAccessTxt: { color: theme.color.brand, fontSize: 12, fontWeight: "600", letterSpacing: 1.5 },
  googleTxt: { color: theme.color.onSurface, fontSize: 15, fontWeight: "500" },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: theme.space.xl, gap: 12 },
  line: { flex: 1, height: 1, backgroundColor: theme.color.border },
  lineTxt: { color: theme.color.muted, fontSize: 11, letterSpacing: 2 },
  input: { height: 54, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, paddingHorizontal: theme.space.lg, color: theme.color.onSurface, marginBottom: theme.space.md, backgroundColor: "rgba(255,255,255,0.04)", fontSize: 15 },
  err: { color: theme.color.error, fontSize: 13, marginBottom: theme.space.md, textAlign: "center" },
  submit: { flexDirection: "row", height: 54, borderRadius: theme.radius.md, backgroundColor: theme.color.brand, alignItems: "center", justifyContent: "center", marginTop: theme.space.md },
  submitTxt: { color: theme.color.onBrandPrimary, fontSize: 14, fontWeight: "700", letterSpacing: 1 },
  toggle: { color: theme.color.brand, textAlign: "center", fontSize: 13 },
  fieldLbl: { color: theme.color.onSurfaceTertiary, fontSize: 11, letterSpacing: 1.5, fontWeight: "600", marginBottom: 6, marginTop: theme.space.md },
  devBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, marginBottom: theme.space.md, borderRadius: theme.radius.md, backgroundColor: "rgba(212,175,55,0.12)", borderWidth: 1, borderColor: "rgba(212,175,55,0.4)" },
  devTxt: { color: theme.color.onSurface, fontSize: 12 },
  devCode: { color: theme.color.brand, fontWeight: "700", letterSpacing: 2 },
  loyaltyCard: { marginTop: theme.space.xl, borderRadius: theme.radius.lg, padding: theme.space.xl, borderWidth: 1, borderColor: "rgba(212,175,55,0.4)", overflow: "hidden" },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardEyebrow: { color: theme.color.brand, fontSize: 10, letterSpacing: 3, fontWeight: "700" },
  cardTitle: { color: theme.color.onSurface, fontSize: 24, fontWeight: "300", marginTop: 6 },
  qrWrap: { alignSelf: "center", padding: 12, backgroundColor: "#050505", borderRadius: theme.radius.md, marginTop: theme.space.lg, borderWidth: 1, borderColor: theme.color.brand },
  qr: { width: 200, height: 200 },
  qrHint: { color: theme.color.onSurfaceTertiary, fontSize: 11, textAlign: "center", marginTop: theme.space.md, fontStyle: "italic" },
  pizzaCountRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", marginTop: theme.space.lg, gap: 8 },
  bigCount: { color: theme.color.brand, fontSize: 48, fontWeight: "300" },
  bigCountLbl: { color: theme.color.onSurfaceTertiary, fontSize: 13 },
  simulateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, marginTop: theme.space.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, borderStyle: "dashed" },
  simulateTxt: { color: theme.color.brand, fontSize: 12, fontWeight: "600" },
  adminBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, marginTop: theme.space.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.brand, backgroundColor: "rgba(212,175,55,0.08)" },
  adminBtnTxt: { color: theme.color.brand, fontSize: 12, fontWeight: "700", letterSpacing: 1.5 },
  segmentRow: { flexDirection: "row", gap: 6, marginTop: theme.space.xxl, marginBottom: theme.space.lg },
  segment: { flex: 1, height: 38, borderRadius: 999, borderWidth: 1, borderColor: theme.color.border, alignItems: "center", justifyContent: "center" },
  segmentActive: { backgroundColor: "rgba(212,175,55,0.1)", borderColor: theme.color.brand },
  segmentTxt: { color: theme.color.onSurfaceTertiary, fontSize: 11, fontWeight: "600", letterSpacing: 0.8 },
  segmentTxtActive: { color: theme.color.brand },
  rewardCard: { padding: theme.space.lg, borderRadius: theme.radius.md, backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, marginBottom: theme.space.md },
  rewardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  rewardIconWrap: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: theme.color.brand, alignItems: "center", justifyContent: "center" },
  rewardName: { color: theme.color.onSurface, fontSize: 15, fontWeight: "500" },
  rewardSub: { color: theme.color.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  nextTxt: { color: theme.color.muted, fontSize: 12, fontStyle: "italic" },
  claimBtn: { paddingHorizontal: 14, height: 32, borderRadius: 999, backgroundColor: theme.color.brand, alignItems: "center", justifyContent: "center" },
  claimTxt: { color: theme.color.onBrandPrimary, fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
  progressBar: { marginTop: theme.space.md, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: theme.color.brand },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: theme.space.md, borderBottomWidth: 0.5, borderBottomColor: theme.color.divider, gap: 12 },
  rowTitle: { color: theme.color.onSurface, fontSize: 14, fontWeight: "500" },
  rowSub: { color: theme.color.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  empty: { color: theme.color.muted, textAlign: "center", padding: theme.space.xl, fontSize: 13, fontStyle: "italic" },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: theme.space.xl, paddingVertical: theme.space.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.error },
  logoutTxt: { color: theme.color.error, fontSize: 13, fontWeight: "600", letterSpacing: 1 },
});
