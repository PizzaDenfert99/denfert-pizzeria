import React, { useEffect, useState, useCallback, useRef }from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, ScrollView, Platform, KeyboardAvoidingView, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter, Redirect } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useAuth } from "@/src/auth-context";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { theme } from "@/src/theme";
import { PushOptIn } from "@/src/PushOptIn";
import { isLoyaltyApp } from "@/src/appMode";

const REWARDS = [
  { key: "coffee", fr: "Café offert", en: "Free coffee", count: 3, icon: "coffee" as const },
  { key: "dessert", fr: "Dessert offert", en: "Free dessert", count: 5, icon: "gift" as const },
  { key: "margherita", fr: "Margherita offerte", en: "Free Margherita", count: 10, icon: "award" as const },
];

// Top-level route guard: the admin dashboard now lives EXCLUSIVELY in the
// loyalty/admin app. On the customer Pizza Denfert app (main subdomain or
// main APK) any visit to `/admin` is bounced back to home — staff use the
// loyalty subdomain (loyalty.pizzadenfert.fr) or the dedicated staff APK.
export default function AdminPanelRoute() {
  if (!isLoyaltyApp()) return <Redirect href={"/" as any} />;
  return <AdminPanel />;
}

function AdminPanel() {
  const router = useRouter();
  const { user, loading, signInEmail, signOut } = useAuth();
  const { t, lang } = useI18n();

  // Admin login form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authErr, setAuthErr] = useState<string | null>(null);

  // Scanner state
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [permissionRequested, setPermissionRequested] = useState(false);
  const lastScanRef = useRef<{ data: string; at: number } | null>(null);

  // Customer payload after scan
  const [customer, setCustomer] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [pendingQty, setPendingQty] = useState<number>(1);     // staff dials this up/down then confirms
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Optional pizza selector for popular-pizza analytics
  const [pizzaMenu, setPizzaMenu] = useState<{ id: string; name: string }[]>([]);
  const [selectedPizzaId, setSelectedPizzaId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !user.is_admin) return;
    (async () => {
      try {
        const items = await api.menu();
        const onlyPizzas = (items || []).filter((m: any) => m.category === "pizzas").map((m: any) => ({ id: m.id, name: m.name }));
        setPizzaMenu(onlyPizzas);
      } catch {}
    })();
  }, [user]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Auto-open the camera when admin lands on the screen (native only)
  useEffect(() => {
    if (!user || !user.is_admin) return;
    if (Platform.OS === "web") return; // web preview cannot use the native camera
    if (customer) return; // already viewing a customer
    if (permissionRequested) return;
    setPermissionRequested(true);
    (async () => {
      try {
        if (permission?.granted) {
          setScanning(true);
          return;
        }
        if (permission?.canAskAgain ?? true) {
          const r = await requestPermission();
          if (r.granted) setScanning(true);
        }
      } catch {}
    })();
  }, [user, permission?.granted, permission?.canAskAgain, permissionRequested, customer]);

  const submitLogin = async () => {
    setAuthErr(null);
    setAuthLoading(true);
    try {
      await signInEmail(email.trim(), password);
    } catch {
      setAuthErr(lang === "fr" ? "Identifiants invalides" : "Invalid credentials");
    } finally {
      setAuthLoading(false);
    }
  };

  const processQR = useCallback(async (qr: string) => {
    setError(null);
    setBusy(true);
    setScanning(false);
    setPendingQty(1);
    try {
      const c = await api.adminScan(qr);
      setCustomer(c);
      showToast(lang === "fr" ? `Client : ${c.name}` : `Customer: ${c.name}`);
    } catch (e: any) {
      const msg = e?.message?.includes("404") ? (lang === "fr" ? "Client introuvable" : "Customer not found") :
        e?.message?.includes("400") ? (lang === "fr" ? "QR invalide" : "Invalid QR") :
        (lang === "fr" ? "Erreur" : "Error");
      setError(msg);
    } finally {
      setBusy(false);
    }
  }, [lang]);

  const handleBarcode = (event: { data: string }) => {
    const now = Date.now();
    if (lastScanRef.current && lastScanRef.current.data === event.data && (now - lastScanRef.current.at) < 3000) return;
    lastScanRef.current = { data: event.data, at: now };
    processQR(event.data);
  };

  const claimReward = async (reward: string) => {
    if (!customer) return;
    setBusy(true);
    try {
      const c = await api.adminRedeem(customer.user_id, customer.qr_token || "", reward);
      setCustomer(c);
      const r = REWARDS.find((x) => x.key === reward);
      showToast(lang === "fr" ? `${r?.fr} validé` : `${r?.en} validated`);
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  const addPizzas = async (n: number) => {
    if (!customer) return;
    setBusy(true);
    setError(null);
    try {
      const c = await api.adminAddPizza(customer.user_id, customer.qr_token || "", n, selectedPizzaId);
      setCustomer(c);
      showToast(`+${n} ${lang === "fr" ? "pizza" + (n > 1 ? "s" : "") + " ajoutée" + (n > 1 ? "s" : "") : "pizza" + (n > 1 ? "s" : "") + " added"}`);
    } catch {
      setError(lang === "fr" ? "Erreur" : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const onSearchPress = async () => {
    const q = searchInput.trim();
    if (!q) return;
    if (q.includes("PIZZA-DENFERT:")) {
      processQR(q);
      setSearchInput("");
      return;
    }
    setBusy(true); setError(null);
    try {
      const results = await api.adminSearch(q);
      if (results.length === 0) {
        setError(lang === "fr" ? "Aucun client trouvé" : "No customer found");
      } else if (results.length === 1) {
        setCustomer(results[0]);
        setSearchInput("");
        setScanning(false);
      } else {
        setSearchResults(results);
      }
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  const startScan = async () => {
    if (Platform.OS === "web") {
      setError(lang === "fr" ? "Caméra non disponible sur le web. Utilisez l'app mobile." : "Camera unavailable on web. Use the mobile app.");
      return;
    }
    if (permission?.granted) { setScanning(true); return; }
    if (permission?.canAskAgain ?? true) {
      const r = await requestPermission();
      if (r.granted) setScanning(true);
      else if (!r.canAskAgain) setError(lang === "fr" ? "Accès caméra bloqué. Ouvrez les réglages." : "Camera blocked. Open settings.");
    } else {
      setError(lang === "fr" ? "Accès caméra bloqué. Ouvrez les réglages." : "Camera blocked. Open settings.");
    }
  };

  // ===== Not logged in or not admin: show admin login =====
  if (loading) {
    return <View style={styles.container}><ActivityIndicator color={theme.color.brand} style={{ flex: 1 }} /></View>;
  }
  if (!user || !user.is_admin) {
    return (
      <View testID="admin-login-screen" style={styles.container}>
        <LinearGradient colors={["#0F0A05", "#050505"]} style={StyleSheet.absoluteFillObject} />
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <Pressable testID="admin-back-btn" onPress={() => router.back()} style={styles.backBtn}>
              <Feather name="arrow-left" size={20} color={theme.color.onSurface} />
            </Pressable>
            <ScrollView contentContainerStyle={{ padding: theme.space.xl, paddingTop: 80, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
              <View style={styles.shieldCircle}>
                <Feather name="shield" size={28} color={theme.color.brand} />
              </View>
              <Text style={styles.eyebrow}>— ADMINISTRATION</Text>
              <Text style={styles.bigTitle}>{lang === "fr" ? "Espace\nrestaurant" : "Restaurant\nspace"}</Text>
              <Text style={styles.subTxt}>{lang === "fr" ? "Connexion administrateur requise" : "Administrator login required"}</Text>

              {user && !user.is_admin && (
                <View style={styles.warnBox}>
                  <Feather name="alert-triangle" size={14} color={theme.color.error} />
                  <Text style={styles.warnTxt}>{lang === "fr" ? "Compte non-administrateur" : "Non-admin account"}</Text>
                </View>
              )}

              <TextInput testID="admin-email-input" style={styles.input} placeholder={t("email")} placeholderTextColor={theme.color.muted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
              <TextInput testID="admin-password-input" style={styles.input} placeholder={t("password")} placeholderTextColor={theme.color.muted} secureTextEntry value={password} onChangeText={setPassword} />
              {authErr && <Text style={styles.err}>{authErr}</Text>}
              <Pressable testID="admin-login-btn" onPress={submitLogin} disabled={authLoading} style={styles.submit}>
                {authLoading ? <ActivityIndicator color={theme.color.onBrandPrimary} /> : (
                  <Text style={styles.submitTxt}>{lang === "fr" ? "Connexion sécurisée" : "Secure login"}</Text>
                )}
              </Pressable>
              {user && !user.is_admin && (
                <Pressable testID="admin-logout-btn" onPress={signOut} style={{ marginTop: theme.space.lg }}>
                  <Text style={[styles.toggle, { color: theme.color.error }]}>{t("logout")}</Text>
                </Pressable>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  // ===== Admin logged in: scanner + customer panel =====
  const permanentlyBlocked = permission && !permission.granted && !permission.canAskAgain;

  return (
    <View testID="admin-panel" style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable testID="admin-back-btn" onPress={() => router.back()} style={styles.iconBtn}>
            <Feather name="arrow-left" size={20} color={theme.color.onSurface} />
          </Pressable>
          <View>
            <Text style={styles.eyebrowSmall}>ADMIN · {user.name}</Text>
            <Text style={styles.adminTitle}>{lang === "fr" ? "Panneau de gestion" : "Management panel"}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {/* SCANNER + SEARCH SECTION — only on the loyalty app domain. The main admin keeps this surface free of loyalty tools. */}
          {!customer && (
            <View>
              {isLoyaltyApp() && (
                <>
                  <Text style={styles.sectionLbl}>{lang === "fr" ? "SCANNER QR CLIENT" : "SCAN CUSTOMER QR"}</Text>
                  {scanning && Platform.OS !== "web" && permission?.granted ? (
                <View style={styles.cameraWrap}>
                  <CameraView
                    style={StyleSheet.absoluteFillObject}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                    onBarcodeScanned={handleBarcode}
                  />
                  <View style={styles.scanFrame} />
                  <Text style={styles.scanHint}>{lang === "fr" ? "Pointez vers le QR du client" : "Point at the customer's QR"}</Text>
                  <Pressable testID="stop-scan-btn" onPress={() => setScanning(false)} style={styles.stopScanBtn}>
                    <Feather name="x" size={18} color={theme.color.onBrandPrimary} />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.scanPlaceholder}>
                  <Feather name="camera" size={40} color={theme.color.brand} />
                  <Text style={styles.placeholderTxt}>
                    {Platform.OS === "web"
                      ? (lang === "fr" ? "Le scanner caméra n'est disponible que sur l'app mobile" : "QR scanner is only available on the mobile app")
                      : permanentlyBlocked
                        ? (lang === "fr" ? "Caméra bloquée. Activez l'accès dans les réglages." : "Camera blocked. Enable access in settings.")
                        : (lang === "fr" ? "Scannez le QR de fidélité du client" : "Scan the customer's loyalty QR")}
                  </Text>
                  {Platform.OS !== "web" && !permanentlyBlocked && (
                    <Pressable testID="start-scan-btn" onPress={startScan} style={styles.scanCta}>
                      <Feather name="maximize" size={16} color={theme.color.onBrandPrimary} />
                      <Text style={styles.scanCtaTxt}>{lang === "fr" ? "Ouvrir le scanner" : "Open scanner"}</Text>
                    </Pressable>
                  )}
                  {Platform.OS !== "web" && permanentlyBlocked && (
                    <Pressable testID="open-settings-btn" onPress={() => Linking.openSettings()} style={styles.scanCta}>
                      <Feather name="settings" size={16} color={theme.color.onBrandPrimary} />
                      <Text style={styles.scanCtaTxt}>{lang === "fr" ? "Ouvrir les réglages" : "Open settings"}</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {/* Fallback: manual search by phone/name (secondary option) */}
              <Text style={[styles.sectionLbl, { marginTop: theme.space.xl }]}>{lang === "fr" ? "OU RECHERCHE MANUELLE" : "OR MANUAL SEARCH"}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: theme.space.lg }}>
                <TextInput
                  testID="search-input"
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder={lang === "fr" ? "Téléphone, nom ou QR" : "Phone, name or QR"}
                  placeholderTextColor={theme.color.muted}
                  value={searchInput}
                  onChangeText={setSearchInput}
                  autoCapitalize="none"
                  returnKeyType="search"
                  onSubmitEditing={onSearchPress}
                />
                <Pressable
                  testID="search-btn"
                  onPress={onSearchPress}
                  disabled={busy}
                  style={styles.manualBtn}
                >
                  {busy ? <ActivityIndicator color={theme.color.onBrandPrimary} size="small" /> : <Feather name="search" size={18} color={theme.color.onBrandPrimary} />}
                </Pressable>
              </View>

              {searchResults.length > 0 && (
                <View style={{ marginBottom: theme.space.lg }}>
                  {searchResults.map((c: any) => (
                    <Pressable
                      key={c.user_id}
                      testID={`search-result-${c.user_id}`}
                      onPress={() => { setCustomer(c); setSearchResults([]); setSearchInput(""); setScanning(false); setPendingQty(1); }}
                      style={styles.searchRow}
                    >
                      <View style={styles.avatar}><Text style={styles.avatarTxt}>{c.name?.[0]?.toUpperCase() || "?"}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.customerName}>{c.name}</Text>
                        <Text style={styles.customerEmail}>{c.phone || c.email || "—"} · {c.pizza_count} 🍕 · {c.available_rewards?.length || 0} 🎁</Text>
                      </View>
                      <Feather name="chevron-right" size={18} color={theme.color.brand} />
                    </Pressable>
                  ))}
                  <Pressable testID="close-results-btn" onPress={() => setSearchResults([])} style={{ paddingVertical: 8 }}>
                    <Text style={{ color: theme.color.muted, fontSize: 12, textAlign: "center" }}>
                      {lang === "fr" ? "Fermer les résultats" : "Close results"}
                    </Text>
                  </Pressable>
                </View>
              )}
                </>
              )}

              {/* Bottom quick-actions — different sets depending on which app this is */}
              <Text style={[styles.sectionLbl, { marginTop: theme.space.xl }]}>{lang === "fr" ? "RACCOURCIS" : "QUICK ACTIONS"}</Text>
              <PushOptIn lang={lang as "fr" | "en"} />
              <View style={styles.quickGrid}>
                {/* The /admin route only renders on the loyalty/admin variant
                    (top-level Redirect kicks main visitors back to /).
                    These shortcuts give staff one-tap access to every
                    management surface from the tablet dashboard. */}
                <Pressable testID="open-reservations-btn" onPress={() => router.push("/admin-reservations" as any)} style={styles.quickBtn}>
                  <Feather name="calendar" size={16} color={theme.color.brand} />
                  <Text style={styles.quickTxt} numberOfLines={1}>{lang === "fr" ? "Réservations" : "Reservations"}</Text>
                </Pressable>
                <Pressable testID="open-cms-btn" onPress={() => router.push("/admin-cms")} style={styles.quickBtn}>
                  <Feather name="grid" size={16} color={theme.color.brand} />
                  <Text style={styles.quickTxt} numberOfLines={1}>{lang === "fr" ? "Menu" : "Menu"}</Text>
                </Pressable>
                <Pressable testID="open-settings-btn" onPress={() => router.push("/admin-settings")} style={styles.quickBtn}>
                  <Feather name="sliders" size={16} color={theme.color.brand} />
                  <Text style={styles.quickTxt} numberOfLines={1}>{lang === "fr" ? "Paramètres" : "Settings"}</Text>
                </Pressable>
                <Pressable testID="open-stats-btn" onPress={() => router.push("/admin-stats")} style={styles.quickBtn}>
                  <Feather name="bar-chart-2" size={16} color={theme.color.brand} />
                  <Text style={styles.quickTxt} numberOfLines={1}>{lang === "fr" ? "Statistiques" : "Statistics"}</Text>
                </Pressable>
                <Pressable testID="open-staff-btn" onPress={() => router.push("/admin-staff")} style={styles.quickBtn}>
                  <Feather name="users" size={16} color={theme.color.brand} />
                  <Text style={styles.quickTxt} numberOfLines={1}>{lang === "fr" ? "Personnel" : "Staff"}</Text>
                </Pressable>
                <Pressable testID="open-ads-btn" onPress={() => router.push("/admin-ads" as any)} style={styles.quickBtn}>
                  <Feather name="image" size={16} color={theme.color.brand} />
                  <Text style={styles.quickTxt} numberOfLines={1}>{lang === "fr" ? "Publicités" : "Slideshow"}</Text>
                </Pressable>
                <Pressable testID="open-kiosk-btn" onPress={() => router.push("/kiosk" as any)} style={styles.quickBtn}>
                  <Feather name="monitor" size={16} color={theme.color.brand} />
                  <Text style={styles.quickTxt} numberOfLines={1}>{lang === "fr" ? "Mode Kiosque" : "Kiosk Mode"}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* CUSTOMER CARD */}
          {customer && (
            <View testID="customer-card">
              <View style={styles.customerHead}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarTxt}>{customer.name?.[0]?.toUpperCase() || "?"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.customerName}>{customer.name}</Text>
                  <Text style={styles.customerEmail}>{customer.phone || customer.email || "—"}</Text>
                </View>
                <Pressable
                  testID="clear-customer-btn"
                  onPress={() => { setCustomer(null); setError(null); setPermissionRequested(false); lastScanRef.current = null; if (Platform.OS !== "web" && permission?.granted) setScanning(true); }}
                  style={styles.iconBtn}
                >
                  <Feather name="x" size={18} color={theme.color.onSurfaceTertiary} />
                </Pressable>
              </View>

              <View style={styles.countCard}>
                <LinearGradient colors={["#1A1410", "#0A0805"]} style={StyleSheet.absoluteFillObject} />
                <Text style={styles.countLbl}>{lang === "fr" ? "PIZZAS ACHETÉES" : "PIZZAS PURCHASED"}</Text>
                <Text style={styles.countBig}>{customer.pizza_count}</Text>

                {pizzaMenu.length > 0 && (
                  <View style={{ width: "100%", marginTop: 8 }}>
                    <Text style={styles.pickerLbl}>
                      {lang === "fr" ? "PIZZA (OPTIONNEL · POUR STATS)" : "PIZZA (OPTIONAL · FOR STATS)"}
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 6 }}>
                      <Pressable
                        testID="pizza-pick-none"
                        onPress={() => setSelectedPizzaId(null)}
                        style={[styles.pizzaChip, !selectedPizzaId && styles.pizzaChipActive]}
                      >
                        <Text style={[styles.pizzaChipTxt, !selectedPizzaId && styles.pizzaChipTxtActive]}>{lang === "fr" ? "—" : "—"}</Text>
                      </Pressable>
                      {pizzaMenu.map((p) => (
                        <Pressable
                          key={p.id}
                          testID={`pizza-pick-${p.id}`}
                          onPress={() => setSelectedPizzaId(p.id)}
                          style={[styles.pizzaChip, selectedPizzaId === p.id && styles.pizzaChipActive]}
                        >
                          <Text style={[styles.pizzaChipTxt, selectedPizzaId === p.id && styles.pizzaChipTxtActive]}>{p.name}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* ASK: how many pizzas did the customer buy? */}
                <Text style={styles.askQ}>{lang === "fr" ? "Combien de pizzas le client a-t-il prises ?" : "How many pizzas did the customer buy?"}</Text>

                <View style={styles.stepperRow}>
                  <Pressable
                    testID="stepper-minus"
                    disabled={pendingQty <= 1 || busy}
                    onPress={() => setPendingQty((q) => Math.max(1, q - 1))}
                    style={[styles.stepperBtn, (pendingQty <= 1 || busy) && { opacity: 0.35 }]}
                  >
                    <Feather name="minus" size={22} color={theme.color.brand} />
                  </Pressable>
                  <View style={styles.stepperValue}>
                    <Text testID="stepper-value" style={styles.stepperValueTxt}>{pendingQty}</Text>
                    <Text style={styles.stepperValueLbl}>{lang === "fr" ? (pendingQty > 1 ? "pizzas" : "pizza") : (pendingQty > 1 ? "pizzas" : "pizza")}</Text>
                  </View>
                  <Pressable
                    testID="stepper-plus"
                    disabled={pendingQty >= 20 || busy}
                    onPress={() => setPendingQty((q) => Math.min(20, q + 1))}
                    style={[styles.stepperBtn, (pendingQty >= 20 || busy) && { opacity: 0.35 }]}
                  >
                    <Feather name="plus" size={22} color={theme.color.brand} />
                  </Pressable>
                </View>

                <Pressable
                  testID="confirm-pizzas-btn"
                  disabled={busy}
                  onPress={() => addPizzas(pendingQty)}
                  style={[styles.confirmBtn, busy && { opacity: 0.6 }]}
                >
                  {busy ? <ActivityIndicator color={theme.color.onBrandPrimary} /> : (
                    <>
                      <Feather name="check" size={18} color={theme.color.onBrandPrimary} />
                      <Text style={styles.confirmTxt}>
                        {lang === "fr" ? `Confirmer +${pendingQty} pizza${pendingQty > 1 ? "s" : ""}` : `Confirm +${pendingQty} pizza${pendingQty > 1 ? "s" : ""}`}
                      </Text>
                    </>
                  )}
                </Pressable>

                {/* Correction control — small minus to fix a mistake */}
                {customer.pizza_count > 0 && (
                  <Pressable
                    testID="remove-pizza-1"
                    disabled={busy}
                    onPress={() => addPizzas(-1)}
                    style={styles.undoBtn}
                  >
                    <Feather name="rotate-ccw" size={12} color={theme.color.error} />
                    <Text style={styles.undoTxt}>{lang === "fr" ? "Retirer 1 pizza (correction)" : "Remove 1 pizza (undo)"}</Text>
                  </Pressable>
                )}
              </View>

              <Text style={[styles.sectionLbl, { marginTop: theme.space.xl }]}>{lang === "fr" ? "RÉCOMPENSES" : "REWARDS"}</Text>
              {REWARDS.map((r) => {
                const av = customer.available_rewards?.find((a: any) => a.reward === r.key);
                const has = !!av;
                const pc = customer.pizza_count;
                const rem = pc % r.count;
                const next = rem === 0 ? (pc === 0 ? r.count : 0) : (r.count - rem);
                return (
                  <View key={r.key} testID={`reward-${r.key}`} style={styles.rewardRow}>
                    <View style={[styles.rewardIcon, has && styles.rewardIconActive]}>
                      <Feather name={r.icon} size={18} color={has ? theme.color.onBrandPrimary : theme.color.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rewardName}>{lang === "fr" ? r.fr : r.en}</Text>
                      <Text style={styles.rewardSub}>
                        {has ? (lang === "fr" ? `${av.available} disponible(s)` : `${av.available} available`)
                             : (lang === "fr" ? `Encore ${next} / ${r.count}` : `${next} more / ${r.count}`)}
                      </Text>
                    </View>
                    {has ? (
                      <Pressable testID={`validate-${r.key}`} onPress={() => claimReward(r.key)} disabled={busy} style={styles.validateBtn}>
                        <Text style={styles.validateTxt}>{lang === "fr" ? "Valider" : "Validate"}</Text>
                      </Pressable>
                    ) : (
                      <View style={styles.lockedTag}>
                        <Feather name="lock" size={11} color={theme.color.muted} />
                      </View>
                    )}
                  </View>
                );
              })}

              {customer.history && customer.history.length > 0 && (
                <>
                  <Text style={[styles.sectionLbl, { marginTop: theme.space.xl }]}>{lang === "fr" ? "HISTORIQUE" : "HISTORY"}</Text>
                  <View style={styles.historyList}>
                    {customer.history.slice().reverse().slice(0, 10).map((h: any, i: number) => {
                      const rwd = REWARDS.find((r) => r.key === h.reward);
                      const d = h.redeemed_at ? new Date(h.redeemed_at) : null;
                      const dateStr = d ? `${d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "2-digit", month: "short" })} · ${d.toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}` : "—";
                      return (
                        <View key={`hist-${i}`} style={styles.historyRow}>
                          <View style={[styles.rewardIcon, styles.rewardIconActive, { width: 32, height: 32 }]}>
                            <Feather name={(rwd?.icon || "gift") as any} size={14} color={theme.color.onBrandPrimary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.historyName}>{lang === "fr" ? (rwd?.fr || h.reward) : (rwd?.en || h.reward)}</Text>
                            <Text style={styles.historySub}>{dateStr}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
            </View>
          )}

          {error && <View style={styles.errBox}><Feather name="alert-circle" size={14} color={theme.color.error} /><Text style={[styles.err, { marginBottom: 0 }]}>{error}</Text></View>}
        </ScrollView>

        {toast && (
          <View style={styles.toast}>
            <Feather name="check-circle" size={14} color={theme.color.brand} />
            <Text style={styles.toastTxt}>{toast}</Text>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  backBtn: { position: "absolute", top: 50, left: 16, width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", zIndex: 10 },
  shieldCircle: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: theme.color.brand, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(212,175,55,0.08)", marginBottom: theme.space.xl },
  eyebrow: { color: theme.color.brand, letterSpacing: 3, fontSize: 11, fontWeight: "700", marginBottom: 6 },
  bigTitle: { color: theme.color.onSurface, fontSize: 36, fontWeight: "300", letterSpacing: -1, lineHeight: 40 },
  subTxt: { color: theme.color.onSurfaceTertiary, fontSize: 14, marginTop: theme.space.md, fontStyle: "italic", marginBottom: theme.space.xl },
  warnBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.error, marginBottom: theme.space.lg, backgroundColor: "rgba(198,40,40,0.08)" },
  warnTxt: { color: theme.color.error, fontSize: 12 },
  input: { height: 54, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, paddingHorizontal: 16, color: theme.color.onSurface, marginBottom: theme.space.md, backgroundColor: "rgba(255,255,255,0.04)", fontSize: 15 },
  submit: { height: 54, borderRadius: theme.radius.md, backgroundColor: theme.color.brand, alignItems: "center", justifyContent: "center", marginTop: theme.space.md },
  submitTxt: { color: theme.color.onBrandPrimary, fontSize: 14, fontWeight: "700", letterSpacing: 1 },
  err: { color: theme.color.error, fontSize: 13, marginBottom: theme.space.md, textAlign: "center" },
  toggle: { color: theme.color.brand, textAlign: "center", fontSize: 13 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md, borderBottomWidth: 0.5, borderBottomColor: theme.color.border },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  eyebrowSmall: { color: theme.color.brand, fontSize: 9, letterSpacing: 2, fontWeight: "700", textAlign: "center" },
  adminTitle: { color: theme.color.onSurface, fontSize: 14, fontWeight: "500", textAlign: "center", marginTop: 2 },
  sectionLbl: { color: theme.color.brand, fontSize: 10, letterSpacing: 2.5, fontWeight: "700", marginBottom: theme.space.md },
  scanPlaceholder: { padding: theme.space.xxxl, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border, borderStyle: "dashed", alignItems: "center", gap: theme.space.md, backgroundColor: theme.color.surfaceSecondary },
  placeholderTxt: { color: theme.color.onSurfaceTertiary, fontSize: 13, textAlign: "center", lineHeight: 18 },
  scanCta: { flexDirection: "row", gap: 8, paddingHorizontal: 22, height: 48, borderRadius: theme.radius.md, backgroundColor: theme.color.brand, alignItems: "center", justifyContent: "center", marginTop: theme.space.md },
  scanCtaTxt: { color: theme.color.onBrandPrimary, fontWeight: "700", letterSpacing: 1, fontSize: 13 },
  cameraWrap: { width: "100%", height: 340, borderRadius: theme.radius.lg, overflow: "hidden", backgroundColor: "#000" },
  scanFrame: { position: "absolute", top: "18%", left: "12%", right: "12%", bottom: "22%", borderWidth: 2, borderColor: theme.color.brand, borderRadius: 12 },
  scanHint: { position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center", color: theme.color.onSurface, fontSize: 12, backgroundColor: "rgba(0,0,0,0.5)", paddingVertical: 6 },
  stopScanBtn: { position: "absolute", top: 12, right: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.brand, alignItems: "center", justifyContent: "center" },
  manualBtn: { width: 54, height: 54, borderRadius: theme.radius.md, backgroundColor: theme.color.brand, alignItems: "center", justifyContent: "center" },
  customerHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: theme.space.lg },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.color.brand, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: theme.color.onBrandPrimary, fontSize: 22, fontWeight: "700" },
  customerName: { color: theme.color.onSurface, fontSize: 18, fontWeight: "500" },
  customerEmail: { color: theme.color.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  countCard: { padding: theme.space.xl, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: "rgba(212,175,55,0.4)", overflow: "hidden", alignItems: "center" },
  countLbl: { color: theme.color.brand, fontSize: 10, letterSpacing: 2.5, fontWeight: "700" },
  countBig: { color: theme.color.brand, fontSize: 72, fontWeight: "300", lineHeight: 80 },
  qtyRow: { flexDirection: "row", gap: 6, marginTop: theme.space.md, width: "100%" },
  qtyBtn: { flex: 1, height: 48, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.brand, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(212,175,55,0.1)" },
  qtyBtnMinus: { width: 48, height: 48, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.error, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(198,40,40,0.08)" },
  qtyTxt: { color: theme.color.brand, fontSize: 16, fontWeight: "700" },
  // ===== NEW: stepper + confirm flow (primary fast-tap workflow) =====
  askQ: { color: theme.color.onSurface, fontSize: 15, fontWeight: "500", textAlign: "center", marginTop: theme.space.lg, marginBottom: theme.space.md, paddingHorizontal: 8 },
  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18, marginBottom: theme.space.md, width: "100%" },
  stepperBtn: { width: 60, height: 60, borderRadius: 30, borderWidth: 1.5, borderColor: theme.color.brand, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(212,175,55,0.08)" },
  stepperValue: { minWidth: 110, alignItems: "center", justifyContent: "center" },
  stepperValueTxt: { color: theme.color.brand, fontSize: 54, fontWeight: "300", lineHeight: 60 },
  stepperValueLbl: { color: theme.color.onSurfaceTertiary, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", marginTop: -2 },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", height: 56, borderRadius: theme.radius.md, backgroundColor: theme.color.brand, marginTop: 4 },
  confirmTxt: { color: theme.color.onBrandPrimary, fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },
  undoBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12, paddingVertical: 8 },
  undoTxt: { color: theme.color.error, fontSize: 11, fontStyle: "italic" },
  // ===== NEW: 2×2 quick-actions grid (replaces overflowing flexWrap row) =====
  quickGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8, columnGap: 8 },
  quickBtn: { flexBasis: "48%", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingVertical: 14, paddingHorizontal: 8, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surfaceSecondary, minHeight: 50 },
  quickTxt: { color: theme.color.brand, fontSize: 13, fontWeight: "600", letterSpacing: 0.5, flexShrink: 1 },
  pickerLbl: { color: theme.color.onSurfaceTertiary, fontSize: 9, letterSpacing: 1.5, fontWeight: "700", marginBottom: 2 },
  pizzaChip: { paddingHorizontal: 12, height: 32, borderRadius: 999, borderWidth: 1, borderColor: theme.color.border, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)" },
  pizzaChipActive: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  pizzaChipTxt: { color: theme.color.onSurfaceTertiary, fontSize: 11, fontWeight: "600" },
  pizzaChipTxtActive: { color: theme.color.onBrandPrimary },
  secondaryBtn: { flex: 1, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surfaceSecondary },
  secondaryTxt: { color: theme.color.brand, fontSize: 12, fontWeight: "600", letterSpacing: 0.8 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: theme.radius.md, backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, marginBottom: 8 },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: theme.space.md, borderBottomWidth: 0.5, borderBottomColor: theme.color.divider },
  rewardIcon: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: theme.color.brand, alignItems: "center", justifyContent: "center" },
  rewardIconActive: { backgroundColor: theme.color.brand },
  rewardName: { color: theme.color.onSurface, fontSize: 14, fontWeight: "500" },
  rewardSub: { color: theme.color.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  historyList: { padding: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surfaceSecondary },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  historyName: { color: theme.color.onSurface, fontSize: 13, fontWeight: "500" },
  historySub: { color: theme.color.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  validateBtn: { paddingHorizontal: 16, height: 36, borderRadius: 999, backgroundColor: theme.color.brand, alignItems: "center", justifyContent: "center" },
  validateTxt: { color: theme.color.onBrandPrimary, fontSize: 12, fontWeight: "700", letterSpacing: 0.8 },
  lockedTag: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: theme.color.border, alignItems: "center", justifyContent: "center" },
  errBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, marginTop: theme.space.lg, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.error, backgroundColor: "rgba(198,40,40,0.08)" },
  toast: { position: "absolute", bottom: 30, left: 20, right: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: theme.radius.md, backgroundColor: theme.color.surfaceTertiary, borderWidth: 1, borderColor: theme.color.brand },
  toastTxt: { color: theme.color.onSurface, fontSize: 13, fontWeight: "500" },
});
