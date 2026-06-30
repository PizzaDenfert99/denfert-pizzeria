import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, FlatList, Pressable, RefreshControl, AppState } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { theme } from "@/src/theme";

const CATS = ["pizzas", "focaccias", "gratins", "salades", "desserts", "boissons", "vins"] as const;
type Cat = typeof CATS[number];

export default function MenuScreen() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  const [cat, setCat] = useState<Cat>("pizzas");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Tracks the menu revision (bumped by the loyalty backend on every CMS write).
  // Comparing this against the latest revision lets us skip the full /menu
  // refetch when nothing changed — cheap polling, zero visible flicker.
  const revRef = useRef<number | null>(null);

  // Pulls the menu from the shared loyalty backend (single source of truth).
  // `spinner` shows the centered loader only on the very first load; all
  // subsequent background refreshes update silently.
  const fetchMenu = useCallback(async (spinner = false) => {
    if (spinner) setLoading(true);
    try {
      setItems(await api.menu());
      try {
        const v = await api.menuVersion();
        if (v) revRef.current = (v as any).rev ?? null;
      } catch {
        // The backend may not expose /menu/version yet (older deploy). We
        // silently fall back to manual pull-to-refresh in that case.
      }
    } finally { if (spinner) setLoading(false); }
  }, []);

  // Lightweight sync probe — refetch the full menu only when the CMS revision
  // changed. Same call gracefully no-ops if the endpoint is missing.
  const refreshIfChanged = useCallback(async () => {
    try {
      const v = await api.menuVersion();
      if (v && (v as any).rev !== revRef.current) await fetchMenu(false);
    } catch {
      // ignore — keep the menu we already have
    }
  }, [fetchMenu]);

  // Initial load when the screen first mounts.
  useEffect(() => { fetchMenu(true); }, [fetchMenu]);

  // On focus (user navigates back to the tab) — refetch only if CMS changed.
  useFocusEffect(useCallback(() => { refreshIfChanged(); }, [refreshIfChanged]));

  // While the tab is focused, poll the version every 20 s. Cleared on blur.
  useFocusEffect(useCallback(() => {
    const id = setInterval(refreshIfChanged, 20000);
    return () => clearInterval(id);
  }, [refreshIfChanged]));

  // When the app returns to foreground (mobile lock-screen ↑), check again.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") refreshIfChanged();
    });
    return () => sub.remove();
  }, [refreshIfChanged]);

  const filtered = useMemo(() => items.filter((i) => i.category === cat), [items, cat]);

  return (
    <View testID="menu-screen" style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Text style={styles.eyebrow}>— LA CARTE</Text>
        <Text style={styles.title}>{t("menu")}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          style={styles.chipsScroll}
        >
          {CATS.map((c) => (
            <Pressable key={c} testID={`cat-chip-${c}`} onPress={() => setCat(c)} style={[styles.chip, cat === c && styles.chipActive]}>
              <Text style={[styles.chipTxt, cat === c && styles.chipTxtActive]}>{t(`categories.${c}`)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.color.brand} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={theme.color.brand}
              onRefresh={async () => {
                setRefreshing(true);
                await fetchMenu(false);
                setRefreshing(false);
              }}
            />
          }
          contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 140, paddingTop: theme.space.md }}
          renderItem={({ item }) => {
            const desc = lang === "fr" ? item.desc_fr : item.desc_en;
            const ingredients = lang === "fr" ? item.ingredients_fr : item.ingredients_en;
            const isPizza = item.category === "pizzas" && item.prices;
            return (
              <View testID={`menu-item-${item.id}`} style={styles.card}>
                <View style={styles.imgWrap}>
                  <Image source={item.image} style={styles.cardImg} contentFit="cover" />
                  <LinearGradient colors={["transparent", "rgba(5,5,5,0.9)"]} style={StyleSheet.absoluteFillObject} />
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.cardHead}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {!isPizza && <Text style={styles.price}>{item.price.toFixed(2)} €</Text>}
                  </View>
                  <Text style={styles.itemDesc}>{desc}</Text>
                  <Text style={styles.ingredientsLbl}>{lang === "fr" ? "INGRÉDIENTS" : "INGREDIENTS"}</Text>
                  <Text style={styles.ingredients}>{ingredients}</Text>
                  {isPizza && (
                    <View style={styles.sizesRow}>
                      <View style={styles.sizeBox}>
                        <Text style={styles.sizeLbl}>26 cm</Text>
                        <Text style={styles.sizePrice}>{item.prices["26"].toFixed(2)} €</Text>
                      </View>
                      <View style={styles.sizeBox}>
                        <Text style={styles.sizeLbl}>31 cm</Text>
                        <Text style={styles.sizePrice}>{item.prices["31"].toFixed(2)} €</Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  header: { paddingHorizontal: theme.space.xl, paddingTop: theme.space.md, paddingBottom: theme.space.sm, borderBottomWidth: 0.5, borderBottomColor: theme.color.border, backgroundColor: theme.color.surface },
  eyebrow: { color: theme.color.brand, letterSpacing: 3, fontSize: 10, fontWeight: "700", marginBottom: 6 },
  title: { color: theme.color.onSurface, fontSize: 34, fontWeight: "300", letterSpacing: -1 },
  chipsScroll: { marginTop: theme.space.lg, marginHorizontal: -theme.space.xl },
  chipsRow: { paddingHorizontal: theme.space.xl, gap: 8, paddingVertical: 4 },
  chip: { height: 36, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: theme.color.borderStrong, justifyContent: "center", flexShrink: 0 },
  chipActive: { borderColor: theme.color.brand, backgroundColor: "rgba(212,175,55,0.12)" },
  chipTxt: { color: theme.color.onSurfaceTertiary, fontSize: 12, fontWeight: "600", letterSpacing: 0.5 },
  chipTxtActive: { color: theme.color.brand },
  card: { backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.lg, overflow: "hidden", marginBottom: theme.space.lg, borderWidth: 1, borderColor: theme.color.border },
  imgWrap: { height: 200 },
  cardImg: { ...StyleSheet.absoluteFillObject as any },
  cardBody: { padding: theme.space.lg },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  itemName: { color: theme.color.onSurface, fontSize: 20, fontWeight: "500", flex: 1 },
  itemDesc: { color: theme.color.onSurfaceTertiary, fontSize: 13, lineHeight: 18, marginTop: 4, fontStyle: "italic" },
  ingredientsLbl: { color: theme.color.brand, fontSize: 9, letterSpacing: 2, fontWeight: "700", marginTop: 12 },
  ingredients: { color: theme.color.onSurfaceSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  price: { color: theme.color.brand, fontSize: 18, fontWeight: "600" },
  sizesRow: { flexDirection: "row", gap: 10, marginTop: theme.space.lg },
  sizeBox: { flex: 1, padding: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.brand, alignItems: "center" },
  sizeLbl: { color: theme.color.onSurfaceTertiary, fontSize: 11, letterSpacing: 2, fontWeight: "600" },
  sizePrice: { color: theme.color.brand, fontSize: 18, fontWeight: "600", marginTop: 4 },
});
