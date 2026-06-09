import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth-context";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { theme } from "@/src/theme";

type Period = "today" | "week" | "month" | "all";

export default function AdminStats() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { lang } = useI18n();

  const [period, setPeriod] = useState<Period>("all");
  const [data, setData] = useState<any>(null);
  const [fetching, setFetching] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const periodLabel: Record<Period, { fr: string; en: string }> = {
    today: { fr: "Aujourd'hui", en: "Today" },
    week: { fr: "7 jours", en: "7 days" },
    month: { fr: "30 jours", en: "30 days" },
    all: { fr: "Tout", en: "Lifetime" },
  };

  const load = useCallback(async (p: Period) => {
    try {
      setErr(null);
      const d = await api.adminDashboard(p);
      setData(d);
    } catch (e: any) {
      setErr(e?.message?.includes("403") ? (lang === "fr" ? "Accès refusé" : "Access denied") : (lang === "fr" ? "Erreur de chargement" : "Failed to load"));
    } finally {
      setFetching(false);
      setRefreshing(false);
    }
  }, [lang]);

  useEffect(() => { if (user && user.is_admin) { setFetching(true); load(period); } }, [user, period, load]);

  if (loading || (fetching && !data)) {
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

  return (
    <View testID="admin-stats-screen" style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable testID="stats-back-btn" onPress={() => router.back()} style={styles.iconBtn}>
            <Feather name="arrow-left" size={20} color={theme.color.onSurface} />
          </Pressable>
          <View>
            <Text style={styles.eyebrowSmall}>ADMIN · {lang === "fr" ? "ANALYTIQUE" : "ANALYTICS"}</Text>
            <Text style={styles.title}>{lang === "fr" ? "Statistiques" : "Statistics"}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Period selector */}
        <View style={styles.periodRow}>
          {(["today", "week", "month", "all"] as Period[]).map((p) => (
            <Pressable
              key={p}
              testID={`period-${p}`}
              onPress={() => setPeriod(p)}
              style={[styles.periodChip, period === p && styles.periodChipActive]}
            >
              <Text style={[styles.periodTxt, period === p && styles.periodTxtActive]}>
                {lang === "fr" ? periodLabel[p].fr : periodLabel[p].en}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView
          contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={theme.color.brand} onRefresh={async () => { setRefreshing(true); await load(period); }} />}
        >
          {err && <View style={styles.errBox}><Feather name="alert-circle" size={14} color={theme.color.error} /><Text style={styles.errTxt}>{err}</Text></View>}

          {data && (
            <>
              {/* HERO KPI */}
              <View style={styles.heroCard}>
                <LinearGradient colors={["#1A1410", "#0A0805"]} style={StyleSheet.absoluteFillObject} />
                <Text style={styles.heroLbl}>{lang === "fr" ? "PIZZAS VENDUES" : "PIZZAS SOLD"}</Text>
                <Text style={styles.heroBig}>{data.total_pizzas_sold}</Text>
                <Text style={styles.heroSub}>
                  {lang === "fr" ? `Période · ${periodLabel[period].fr}` : `Period · ${periodLabel[period].en}`}
                </Text>
              </View>

              {/* KPI ROW */}
              <View style={styles.kpiRow}>
                <View style={styles.kpiCard}>
                  <Feather name="users" size={18} color={theme.color.brand} />
                  <Text style={styles.kpiBig}>{data.loyalty_members}</Text>
                  <Text style={styles.kpiLbl}>{lang === "fr" ? "Membres fidélité" : "Loyalty members"}</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Feather name="star" size={18} color={theme.color.brand} />
                  <Text style={styles.kpiBig}>{data.vip_customers}</Text>
                  <Text style={styles.kpiLbl}>{lang === "fr" ? "Clients VIP (≥10)" : "VIP customers (≥10)"}</Text>
                </View>
              </View>

              {/* RESERVATIONS */}
              <Text style={styles.sectionLbl}>{lang === "fr" ? "RÉSERVATIONS" : "RESERVATIONS"}</Text>
              <View style={styles.reservationHero}>
                <Text style={styles.reservationBig}>{data.reservations_in_period ?? data.reservations.total}</Text>
                <Text style={styles.reservationSub}>
                  {lang === "fr" ? `réservation(s) · ${periodLabel[period].fr.toLowerCase()}` : `reservations · ${periodLabel[period].en.toLowerCase()}`}
                </Text>
              </View>
              <View style={styles.kpiRow}>
                <View style={styles.smallKpi}>
                  <Text style={styles.smallKpiBig}>{data.reservations.today}</Text>
                  <Text style={styles.smallKpiLbl}>{lang === "fr" ? "Aujourd'hui" : "Today"}</Text>
                </View>
                <View style={styles.smallKpi}>
                  <Text style={styles.smallKpiBig}>{data.reservations.week}</Text>
                  <Text style={styles.smallKpiLbl}>{lang === "fr" ? "7 jours" : "7 days"}</Text>
                </View>
                <View style={styles.smallKpi}>
                  <Text style={styles.smallKpiBig}>{data.reservations.month}</Text>
                  <Text style={styles.smallKpiLbl}>{lang === "fr" ? "30 jours" : "30 days"}</Text>
                </View>
                <View style={styles.smallKpi}>
                  <Text style={styles.smallKpiBig}>{data.reservations.total}</Text>
                  <Text style={styles.smallKpiLbl}>{lang === "fr" ? "Total" : "Total"}</Text>
                </View>
              </View>

              {/* REWARDS */}
              <Text style={styles.sectionLbl}>{lang === "fr" ? "RÉCOMPENSES VALIDÉES" : "REWARDS REDEEMED"}</Text>
              <View style={styles.rewardsList}>
                {[{k: "coffee", fr: "Cafés offerts", en: "Free coffees", icon: "coffee"},
                  {k: "dessert", fr: "Desserts offerts", en: "Free desserts", icon: "gift"},
                  {k: "margherita", fr: "Margheritas offertes", en: "Free Margheritas", icon: "award"}].map((r) => (
                  <View key={r.k} style={styles.rewardRow}>
                    <View style={styles.rewardIcon}><Feather name={r.icon as any} size={16} color={theme.color.brand} /></View>
                    <Text style={styles.rewardName}>{lang === "fr" ? r.fr : r.en}</Text>
                    <Text style={styles.rewardCount}>{data.rewards_redeemed[r.k] || 0}</Text>
                  </View>
                ))}
                <View style={[styles.rewardRow, { borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: theme.color.brand, marginTop: 4 }]}>
                  <Text style={[styles.rewardName, { color: theme.color.brand, fontWeight: "700" }]}>{lang === "fr" ? "Total" : "Total"}</Text>
                  <Text style={[styles.rewardCount, { color: theme.color.brand }]}>{data.rewards_redeemed.total || 0}</Text>
                </View>
              </View>

              {/* TOP PIZZAS */}
              <Text style={styles.sectionLbl}>{lang === "fr" ? "PIZZAS LES PLUS POPULAIRES" : "MOST POPULAR PIZZAS"}</Text>
              {(!data.top_pizzas || data.top_pizzas.length === 0) ? (
                <View style={styles.hintBox}>
                  <Feather name="info" size={13} color={theme.color.brand} />
                  <Text style={styles.hintTxt}>
                    {lang === "fr"
                      ? "Sélectionnez la pizza dans le panneau client pour activer ce classement."
                      : "Pick the pizza in the customer panel to populate this ranking."}
                  </Text>
                </View>
              ) : (
                data.top_pizzas.map((p: any, i: number) => (
                  <View key={p.pizza_id} style={styles.pizzaRow}>
                    <View style={[styles.rank, i === 0 && styles.rankGold]}><Text style={[styles.rankTxt, i === 0 && styles.rankGoldTxt]}>{i + 1}</Text></View>
                    {p.image ? (
                      <Image source={p.image} style={styles.pizzaImg} contentFit="cover" />
                    ) : (
                      <View style={[styles.pizzaImg, { alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surfaceSecondary }]}>
                        <Feather name="image" size={16} color={theme.color.muted} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pizzaName}>{p.name}</Text>
                      <Text style={styles.pizzaSub}>{lang === "fr" ? `${p.count} pizzas` : `${p.count} pizzas`}</Text>
                    </View>
                    <Text style={styles.pizzaCount}>{p.count}</Text>
                  </View>
                ))
              )}

              {/* TOP CUSTOMERS */}
              <Text style={styles.sectionLbl}>{lang === "fr" ? "TOP CLIENTS" : "TOP CUSTOMERS"}</Text>
              {data.top_customers.length === 0 ? (
                <Text style={styles.empty}>{lang === "fr" ? "Aucun client" : "No customers"}</Text>
              ) : (
                data.top_customers.map((c: any, i: number) => (
                  <View key={i} style={styles.customerRow}>
                    <View style={[styles.rank, i === 0 && styles.rankGold]}><Text style={[styles.rankTxt, i === 0 && styles.rankGoldTxt]}>{i + 1}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.custName}>{c.name}</Text>
                      <Text style={styles.custSub}>{c.phone || "—"}</Text>
                    </View>
                    <Text style={styles.custPizzas}>{c.pizzas} 🍕</Text>
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
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

  periodRow: { flexDirection: "row", gap: 6, paddingHorizontal: theme.space.lg, paddingTop: theme.space.md, paddingBottom: theme.space.sm },
  periodChip: { flex: 1, height: 34, borderRadius: 999, borderWidth: 1, borderColor: theme.color.border, alignItems: "center", justifyContent: "center" },
  periodChipActive: { backgroundColor: "rgba(212,175,55,0.12)", borderColor: theme.color.brand },
  periodTxt: { color: theme.color.onSurfaceTertiary, fontSize: 11, fontWeight: "600" },
  periodTxtActive: { color: theme.color.brand },

  heroCard: { padding: theme.space.xl, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: "rgba(212,175,55,0.4)", overflow: "hidden", alignItems: "center", marginBottom: theme.space.lg },
  heroLbl: { color: theme.color.brand, fontSize: 10, letterSpacing: 2.5, fontWeight: "700" },
  heroBig: { color: theme.color.brand, fontSize: 64, fontWeight: "300", lineHeight: 70, marginVertical: 4 },
  heroSub: { color: theme.color.onSurfaceTertiary, fontSize: 12, fontStyle: "italic" },
  kpiRow: { flexDirection: "row", gap: 8, marginBottom: theme.space.lg, flexWrap: "wrap" },
  kpiCard: { flex: 1, minWidth: 140, padding: theme.space.lg, borderRadius: theme.radius.md, backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, gap: 4 },
  kpiBig: { color: theme.color.onSurface, fontSize: 26, fontWeight: "600", marginTop: 6 },
  kpiLbl: { color: theme.color.onSurfaceTertiary, fontSize: 11 },
  smallKpi: { flex: 1, minWidth: 70, padding: 12, borderRadius: theme.radius.md, backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, alignItems: "center" },
  smallKpiBig: { color: theme.color.brand, fontSize: 22, fontWeight: "600" },
  smallKpiLbl: { color: theme.color.onSurfaceTertiary, fontSize: 10, marginTop: 2, textAlign: "center" },
  sectionLbl: { color: theme.color.brand, fontSize: 10, letterSpacing: 2.5, fontWeight: "700", marginBottom: theme.space.md, marginTop: theme.space.md },

  reservationHero: { padding: theme.space.lg, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.brand, backgroundColor: "rgba(212,175,55,0.06)", alignItems: "center", marginBottom: theme.space.md },
  reservationBig: { color: theme.color.brand, fontSize: 36, fontWeight: "300" },
  reservationSub: { color: theme.color.onSurfaceTertiary, fontSize: 12, marginTop: 2 },

  rewardsList: { padding: theme.space.lg, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surfaceSecondary, marginBottom: theme.space.lg },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: theme.color.divider },
  rewardIcon: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: theme.color.brand, alignItems: "center", justifyContent: "center" },
  rewardName: { flex: 1, color: theme.color.onSurface, fontSize: 13 },
  rewardCount: { color: theme.color.onSurface, fontSize: 16, fontWeight: "600" },

  hintBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surfaceSecondary },
  hintTxt: { flex: 1, color: theme.color.onSurfaceTertiary, fontSize: 12, lineHeight: 16 },

  pizzaRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: theme.radius.md, backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, marginBottom: 8 },
  pizzaImg: { width: 46, height: 46, borderRadius: 23 },
  pizzaName: { color: theme.color.onSurface, fontSize: 14, fontWeight: "500" },
  pizzaSub: { color: theme.color.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  pizzaCount: { color: theme.color.brand, fontSize: 18, fontWeight: "600" },

  customerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: theme.color.divider },
  rank: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: theme.color.border, alignItems: "center", justifyContent: "center" },
  rankGold: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  rankTxt: { color: theme.color.onSurface, fontSize: 12, fontWeight: "700" },
  rankGoldTxt: { color: theme.color.onBrandPrimary },
  custName: { color: theme.color.onSurface, fontSize: 14, fontWeight: "500" },
  custSub: { color: theme.color.onSurfaceTertiary, fontSize: 11, marginTop: 1 },
  custPizzas: { color: theme.color.brand, fontSize: 15, fontWeight: "600" },
  empty: { color: theme.color.muted, textAlign: "center", padding: theme.space.lg, fontStyle: "italic", fontSize: 13 },
  errBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, marginBottom: theme.space.lg, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.error, backgroundColor: "rgba(198,40,40,0.08)" },
  errTxt: { color: theme.color.error, fontSize: 13 },
});
