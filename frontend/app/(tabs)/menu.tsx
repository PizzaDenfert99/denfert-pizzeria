import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Animated, View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, RefreshControl, AppState } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { theme } from "@/src/theme";
import type { Category, MenuItem } from "@/src/lib/supabase";
import { ParallaxBackground } from "@/src/ParallaxBackground";
import { useBackgroundImage } from "@/src/hooks/use-background-image";

// Unified shape used by the renderer (works for both CMS-proxy and legacy FastAPI rows).
type Row = {
  id: string;
  name: string;
  desc?: string | null;
  ingredients?: string | null;
  image?: string;
  // Either a single `price` (number) OR a `prices` map (e.g. { "26": 10.9, "31": 13.9 }).
  price?: number | null;
  prices?: Record<string, number> | null;
  category_slug: string; // slug used by chips
};

const LEGACY_FALLBACK_CATS = [
  { id: "pizzas", slug: "pizzas", name: "Pizzas", sort_order: 1 },
  { id: "focaccias", slug: "focaccias", name: "Focaccias", sort_order: 2 },
  { id: "gratins", slug: "gratins", name: "Gratins", sort_order: 3 },
  { id: "salades", slug: "salades", name: "Salades", sort_order: 4 },
  { id: "desserts", slug: "desserts", name: "Desserts", sort_order: 5 },
  { id: "boissons", slug: "boissons", name: "Boissons", sort_order: 6 },
  { id: "vins", slug: "vins", name: "Vins", sort_order: 7 },
];

export default function MenuScreen() {
  const { t, lang } = useI18n();
  const bgUrl = useBackgroundImage("bg_menu_url");
  const scrollY = useRef(new Animated.Value(0)).current;
  const [rows, setRows] = useState<Row[]>([]);
  const [cats, setCats] = useState<{ id: string; slug: string; name: string; sort_order: number }[]>(LEGACY_FALLBACK_CATS);
  const [cat, setCat] = useState<string>("pizzas");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [source, setSource] = useState<"cms" | "fastapi" | "loading">("loading");
  // Tracks the FastAPI menu revision (bumped by the loyalty backend on every
  // CMS write). Used only when we fall back to the FastAPI source to cheaply
  // detect CMS updates without a full refetch.
  const revRef = useRef<number | null>(null);

  const load = useCallback(async (spinner: boolean = true) => {
    if (spinner) setLoading(true);
    // --- 1. Try the CMS menu (Supabase-backed, proxied by our own backend) first ---
    try {
      const [cmsCats, cmsItems] = await Promise.all([api.publicCategories(), api.publicMenuItems()]);
      if ((cmsCats as Category[]).length > 0 || (cmsItems as MenuItem[]).length > 0) {
        const catList = (cmsCats as Category[]).map((c) => ({ id: c.id, slug: c.slug, name: c.name, sort_order: c.sort_order }));
        // Build slug index by category id for items
        const slugById = new Map<string, string>();
        (cmsCats as Category[]).forEach((c) => slugById.set(c.id, c.slug));
        const list: Row[] = (cmsItems as MenuItem[]).map((it) => ({
          id: it.id,
          name: it.name,
          desc: it.description,
          ingredients: (it.ingredients || []).join(", ") || null,
          // Prefer the optimised thumbnail for fast list rendering; fall back to original photo.
          image: it.thumbnail_url || it.image_url || undefined,
          // Reconstruct: pizzas (slug=pizzas) have 26/31 prices; others use `default` or first numeric.
          prices: it.prices && Object.keys(it.prices).some((k) => k !== "default") ? it.prices : null,
          price: it.prices?.default ?? (typeof it.prices === "object" ? Object.values(it.prices || {})[0] : null) ?? null,
          category_slug: (it.category_id && slugById.get(it.category_id)) || "pizzas",
        }));
        setCats(catList.sort((a, b) => a.sort_order - b.sort_order));
        setRows(list);
        // Default selected chip = first category that has items, else first chip
        if (catList.length > 0) {
          const firstWithItems = catList.sort((a, b) => a.sort_order - b.sort_order).find((c) => list.some((r) => r.category_slug === c.slug));
          setCat((prev) => (list.some((r) => r.category_slug === prev) ? prev : (firstWithItems?.slug ?? catList[0].slug)));
        }
        setSource("cms");
        if (spinner) setLoading(false);
        return;
      }
      console.warn("CMS menu reachable but no rows — falling back to FastAPI seed.");
    } catch (e) {
      console.warn("CMS menu fetch failed, falling back to FastAPI:", e);
    }
    // --- 2. Legacy FastAPI fallback ---
    try {
      const items = await api.menu();
      const list: Row[] = (items || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        desc: lang === "fr" ? m.desc_fr : m.desc_en,
        ingredients: lang === "fr" ? m.ingredients_fr : m.ingredients_en,
        image: m.image,
        price: typeof m.price === "number" ? m.price : null,
        prices: m.prices || null,
        category_slug: m.category,
      }));
      setCats(LEGACY_FALLBACK_CATS);
      setRows(list);
      setSource("fastapi");
      // Record the current revision so refreshIfChanged() can skip no-op refetches.
      try {
        const v: any = await (api as any).menuVersion?.();
        if (v) revRef.current = v.rev ?? null;
      } catch {
        // Older backend without /menu/version — pull-to-refresh still works.
      }
    } catch (e) {
      console.error("Both Supabase and FastAPI failed", e);
      setRows([]);
    } finally {
      if (spinner) setLoading(false);
    }
  }, [lang]);

  // Lightweight sync probe — refetch the menu only when the CMS revision
  // changed (FastAPI source) or unconditionally poll the CMS proxy (cheap query).
  const refreshIfChanged = useCallback(async () => {
    if (source === "cms") {
      // CMS proxy reads are cheap; just re-run silently.
      await load(false);
      return;
    }
    try {
      const v: any = await (api as any).menuVersion?.();
      if (v && v.rev !== revRef.current) await load(false);
    } catch {
      // ignore — keep whatever we have on screen
    }
  }, [source, load]);

  // Initial load when the screen first mounts.
  useEffect(() => { load(true); }, [load]);

  // On focus (user navigates back to the tab) — refresh silently.
  useFocusEffect(useCallback(() => { refreshIfChanged(); }, [refreshIfChanged]));

  // While the tab is focused, poll every 20 s. Cleared on blur.
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

  const filtered = useMemo(() => rows.filter((r) => r.category_slug === cat), [rows, cat]);

  // Localised category label fallback (i18n keys exist for the canonical 7 slugs).
  const labelFor = (c: { slug: string; name: string }) => {
    try { const k = `categories.${c.slug}` as any; const v = t(k); if (v && v !== k) return v; } catch {}
    return c.name;
  };

  return (
    <View testID="menu-screen" style={[styles.container, bgUrl ? { backgroundColor: "transparent" } : null]}>
      {/* Clipped to stop short of the floating tab bar (bottom: 140, matching
          this screen's own contentContainerStyle paddingBottom) — otherwise
          this layer extends underneath the tab bar's translucent/blurred
          background and visibly dims/fades it. */}
      {!!bgUrl && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { bottom: 140, overflow: "hidden" }]}>
          <ParallaxBackground imageUrl={bgUrl} scrollY={scrollY} />
        </View>
      )}
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Text style={styles.eyebrow}>— LA CARTE</Text>
        <Text style={styles.title}>{t("menu")}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          style={styles.chipsScroll}
        >
          {cats.map((c) => (
            <Pressable key={c.slug} testID={`cat-chip-${c.slug}`} onPress={() => setCat(c.slug)} style={[styles.chip, cat === c.slug && styles.chipActive]}>
              <Text style={[styles.chipTxt, cat === c.slug && styles.chipTxtActive]}>{labelFor(c)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.color.brand} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space.xl }}>
          <Text style={{ color: theme.color.muted, fontSize: 13, textAlign: "center", fontStyle: "italic" }}>
            {lang === "fr" ? "Aucun plat dans cette catégorie pour le moment." : "No dishes in this category yet."}
          </Text>
        </View>
      ) : (
        <Animated.FlatList
          data={filtered}
          keyExtractor={(i: Row) => i.id}
          contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 140, paddingTop: theme.space.md }}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={theme.color.brand} onRefresh={async () => { setRefreshing(true); await load(false); setRefreshing(false); }} />}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
          renderItem={({ item }: { item: Row }) => {
            const sizeKeys = item.prices ? Object.keys(item.prices).filter((k) => k !== "default") : [];
            const showSizes = sizeKeys.length >= 2;
            return (
              <View testID={`menu-item-${item.id}`} style={styles.card}>
                {!!item.image && (
                  <View style={styles.imgWrap}>
                    <Image source={item.image} style={styles.cardImg} contentFit="cover" />
                  </View>
                )}
                <View style={styles.cardBody}>
                  <View style={styles.cardHead}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {!showSizes && typeof item.price === "number" && item.price > 0 && (
                      <Text style={styles.price}>{item.price.toFixed(2)} €</Text>
                    )}
                  </View>
                  {!!item.desc && <Text style={styles.itemDesc}>{item.desc}</Text>}
                  {!!item.ingredients && (
                    <>
                      <Text style={styles.ingredientsLbl}>{lang === "fr" ? "INGRÉDIENTS" : "INGREDIENTS"}</Text>
                      <Text style={styles.ingredients}>{item.ingredients}</Text>
                    </>
                  )}
                  {showSizes && (
                    <View style={styles.sizesRow}>
                      {sizeKeys.sort().map((k) => (
                        <View key={k} style={styles.sizeBox}>
                          <Text style={styles.sizeLbl}>{/^\d+$/.test(k) ? `${k} cm` : k.toUpperCase()}</Text>
                          <Text style={styles.sizePrice}>{Number(item.prices![k]).toFixed(2)} €</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
      {source === "fastapi" && __DEV__ && (
        <Text style={{ position: "absolute", bottom: 90, alignSelf: "center", color: theme.color.muted, fontSize: 10, fontStyle: "italic" }}>
          source · FastAPI (CMS proxy indisponible)
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface, overflow: "hidden" },
  header: { paddingHorizontal: theme.space.xl, paddingTop: theme.space.md, paddingBottom: theme.space.sm, borderBottomWidth: 0.5, borderBottomColor: theme.color.border, backgroundColor: theme.color.surface },
  eyebrow: { color: theme.color.brand, letterSpacing: 3, fontSize: 10, fontWeight: "700", marginBottom: 6 },
  title: { color: theme.color.onSurface, fontSize: 34, fontWeight: "300", letterSpacing: -1 },
  chipsScroll: { marginTop: theme.space.lg, marginHorizontal: -theme.space.xl },
  chipsRow: { paddingHorizontal: theme.space.xl, gap: 8, paddingVertical: 4 },
  chip: { height: 36, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: theme.color.borderStrong, justifyContent: "center", flexShrink: 0 },
  chipActive: { borderColor: theme.color.brand, backgroundColor: "rgba(212,175,55,0.12)" },
  chipTxt: { color: theme.color.onSurfaceTertiary, fontSize: 12, fontWeight: "600", letterSpacing: 0.5 },
  chipTxtActive: { color: theme.color.brand },
  // Closer to the page background (theme.color.surface, #050505) than the shared
  // surfaceSecondary token (#1A1A1A) — the border still carries the separation
  // between cards while scrolling, so the fill itself can sit nearer to the page.
  card: { backgroundColor: "#0E0E0E", borderRadius: theme.radius.lg, overflow: "hidden", marginBottom: theme.space.lg, borderWidth: 1, borderColor: theme.color.border },
  imgWrap: { height: 200 },
  cardImg: { ...StyleSheet.absoluteFillObject as any },
  cardBody: { padding: theme.space.lg },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  itemName: { color: theme.color.onSurface, fontSize: 20, fontWeight: "500", flex: 1 },
  itemDesc: { color: theme.color.onSurfaceTertiary, fontSize: 13, lineHeight: 18, marginTop: 4, fontStyle: "italic" },
  ingredientsLbl: { color: theme.color.brand, fontSize: 9, letterSpacing: 2, fontWeight: "700", marginTop: 12 },
  ingredients: { color: theme.color.onSurfaceSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  price: { color: theme.color.brand, fontSize: 18, fontWeight: "600" },
  sizesRow: { flexDirection: "row", gap: 10, marginTop: theme.space.lg, flexWrap: "wrap" },
  sizeBox: { flex: 1, minWidth: 100, padding: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.brand, alignItems: "center" },
  sizeLbl: { color: theme.color.onSurfaceTertiary, fontSize: 11, letterSpacing: 2, fontWeight: "600" },
  sizePrice: { color: theme.color.brand, fontSize: 18, fontWeight: "600", marginTop: 4 },
});
