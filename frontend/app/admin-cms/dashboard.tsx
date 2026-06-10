import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, RefreshControl, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getSupabase, isSupabaseConfigured } from "@/src/lib/supabase";
import { theme } from "@/src/theme";

type Tab = "categories" | "items" | "settings";

export default function CmsDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("items");
  const [user, setUser] = useState<any>(null);
  const [boot, setBoot] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null); // item being edited
  const [editingCat, setEditingCat] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const loadAll = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const sb = getSupabase();
    const [c, i, st] = await Promise.all([
      sb.from("categories").select("*").order("sort_order"),
      sb.from("menu_items").select("*").order("sort_order"),
      sb.from("restaurant_settings").select("*").maybeSingle(),
    ]);
    setCats(c.data || []);
    setItems(i.data || []);
    setSettings(st.data || null);
  }, []);

  useEffect(() => {
    (async () => {
      if (!isSupabaseConfigured()) { setBoot(false); return; }
      const sb = getSupabase();
      const { data: { user: u } } = await sb.auth.getUser();
      if (!u) { router.replace("/admin-cms"); return; }
      const { data: adminRow } = await sb.from("admins").select("user_id").eq("user_id", u.id).maybeSingle();
      if (!adminRow) { await sb.auth.signOut(); router.replace("/admin-cms"); return; }
      setUser(u);
      await loadAll();
      setBoot(false);
    })();
  }, [router, loadAll]);

  const signOut = async () => { await getSupabase().auth.signOut(); router.replace("/admin-cms"); };

  const importSeed = async () => {
    setImporting(true);
    try {
      const ADMIN_API_PROMPT = window.prompt ? window.prompt("Mot de passe admin FastAPI (admin@pizzadenfert.fr)") : null;
      if (!ADMIN_API_PROMPT) { setImporting(false); return; }
      const base = process.env.EXPO_PUBLIC_BACKEND_URL || "";
      const loginRes = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@pizzadenfert.fr", password: ADMIN_API_PROMPT }) });
      if (!loginRes.ok) throw new Error("FastAPI admin login failed");
      const { token } = await loginRes.json();
      const seedRes = await fetch(`${base}/api/admin/cms/seed-from-mongo`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!seedRes.ok) throw new Error("Import failed: " + (await seedRes.text()));
      const out = await seedRes.json();
      showToast(`Importé : ${out.inserted_items} pizzas, ${out.inserted_categories} catégories`);
      await loadAll();
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Import failed");
    } finally { setImporting(false); }
  };

  const upsertItem = async (it: any) => {
    setSavingId(it.id || "new");
    const sb = getSupabase();
    const payload = {
      name: it.name,
      description: it.description || null,
      ingredients: (it.ingredientsText || "").split(",").map((x: string) => x.trim()).filter(Boolean),
      prices: typeof it.prices === "string" ? JSON.parse(it.prices || "{}") : (it.prices || {}),
      image_url: it.image_url || null,
      category_id: it.category_id || null,
      sort_order: Number(it.sort_order) || 0,
      is_active: it.is_active !== false,
    };
    let q;
    if (it.id) q = await sb.from("menu_items").update(payload).eq("id", it.id);
    else q = await sb.from("menu_items").insert(payload);
    setSavingId(null);
    if (q.error) { Alert.alert("Erreur", q.error.message); return; }
    setEditing(null); showToast("Enregistré"); loadAll();
  };

  const upsertCat = async (c: any) => {
    setSavingId(c.id || "new-cat");
    const sb = getSupabase();
    const payload = { name: c.name, slug: c.slug, sort_order: Number(c.sort_order) || 0, is_active: c.is_active !== false };
    let q;
    if (c.id) q = await sb.from("categories").update(payload).eq("id", c.id);
    else q = await sb.from("categories").insert(payload);
    setSavingId(null);
    if (q.error) { Alert.alert("Erreur", q.error.message); return; }
    setEditingCat(null); showToast("Catégorie enregistrée"); loadAll();
  };

  const toggleActive = async (table: "menu_items" | "categories", row: any) => {
    const sb = getSupabase();
    const { error } = await sb.from(table).update({ is_active: !row.is_active }).eq("id", row.id);
    if (error) Alert.alert("Erreur", error.message); else loadAll();
  };

  const remove = async (table: "menu_items" | "categories", row: any) => {
    const ok = Platform.OS === "web" ? (typeof window !== "undefined" ? window.confirm(`Supprimer « ${row.name} » ?`) : true) : true;
    if (!ok) return;
    const sb = getSupabase();
    const { error } = await sb.from(table).delete().eq("id", row.id);
    if (error) Alert.alert("Erreur", error.message); else { showToast("Supprimé"); loadAll(); }
  };

  const reorder = async (row: any, dir: -1 | 1) => {
    const list = tab === "items" ? items : cats;
    const sorted = [...list].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((x) => x.id === row.id);
    const swap = sorted[idx + dir]; if (!swap) return;
    const sb = getSupabase();
    const table = tab === "items" ? "menu_items" : "categories";
    await sb.from(table).update({ sort_order: swap.sort_order }).eq("id", row.id);
    await sb.from(table).update({ sort_order: row.sort_order }).eq("id", swap.id);
    loadAll();
  };

  // Generate a high-quality thumbnail in the browser (canvas) without touching the original file.
  // Returns a JPEG Blob (~90% quality, longest-side ≤ MAX_DIM px) or null if generation is not possible.
  const buildThumbnail = async (file: File, maxDim = 1200, quality = 0.9): Promise<Blob | null> => {
    if (typeof window === "undefined" || typeof document === "undefined") return null;
    try {
      // createImageBitmap handles HEIC on Safari and is faster than <img> decode where supported.
      const bmp = await (typeof createImageBitmap === "function"
        ? createImageBitmap(file)
        : new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new window.Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
          }) as any);
      const w = (bmp as any).width as number;
      const h = (bmp as any).height as number;
      if (!w || !h) return null;
      // Don't upscale — if the source is already small, skip the thumbnail.
      if (Math.max(w, h) <= maxDim) return null;
      const scale = maxDim / Math.max(w, h);
      const tw = Math.round(w * scale);
      const th = Math.round(h * scale);
      const canvas = document.createElement("canvas");
      canvas.width = tw; canvas.height = th;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.imageSmoothingEnabled = true;
      (ctx as any).imageSmoothingQuality = "high";
      ctx.drawImage(bmp as any, 0, 0, tw, th);
      return await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), "image/jpeg", quality));
    } catch (e) {
      console.warn("thumbnail build failed, skipping:", e);
      return null;
    }
  };

  // Uploads ORIGINAL at full quality + optional optimized thumbnail. Returns both public URLs.
  // The original is stored under `*_original.<ext>` and the thumb under `*_thumb.jpg`.
  const uploadImageForItem = async (
    it: any,
    file: File,
  ): Promise<{ original: string; thumbnail: string | null } | null> => {
    const sb = getSupabase();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const stamp = Date.now();
    const base = `menu_items/${it.id || "new"}/${stamp}`;
    const origPath = `${base}_original.${ext}`;

    // 1. Upload original AS-IS (no compression on our side).
    const { error: origErr } = await sb.storage
      .from("menu-images")
      .upload(origPath, file, { upsert: true, contentType: file.type, cacheControl: "31536000" });
    if (origErr) { Alert.alert("Erreur upload (original)", origErr.message); return null; }
    const originalUrl = sb.storage.from("menu-images").getPublicUrl(origPath).data.publicUrl;

    // 2. Try to build + upload a thumbnail (skipped if browser cannot decode or image is already small).
    let thumbnailUrl: string | null = null;
    const thumbBlob = await buildThumbnail(file, 1600, 0.92);
    if (thumbBlob) {
      const thumbPath = `${base}_thumb.jpg`;
      const { error: thErr } = await sb.storage
        .from("menu-images")
        .upload(thumbPath, thumbBlob, { upsert: true, contentType: "image/jpeg", cacheControl: "31536000" });
      if (!thErr) {
        thumbnailUrl = sb.storage.from("menu-images").getPublicUrl(thumbPath).data.publicUrl;
      } else {
        console.warn("thumbnail upload failed (non-fatal):", thErr.message);
      }
    }
    return { original: originalUrl, thumbnail: thumbnailUrl };
  };

  const saveSettings = async () => {
    if (!settings) return;
    const sb = getSupabase();
    let oh: any = settings.opening_hours;
    if (typeof oh === "string") { try { oh = JSON.parse(oh); } catch { Alert.alert("JSON invalide", "opening_hours"); return; } }
    const { error } = await sb.from("restaurant_settings").update({ opening_hours: oh, phone: settings.phone, address: settings.address }).eq("id", settings.id);
    if (error) Alert.alert("Erreur", error.message); else showToast("Paramètres sauvegardés");
  };

  if (boot) return <View style={s.container}><ActivityIndicator color={theme.color.brand} style={{ flex: 1 }} /></View>;
  if (!isSupabaseConfigured()) {
    return (
      <View style={s.container}><SafeAreaView style={{ padding: 28 }}>
        <Text style={s.h1}>Supabase non configuré</Text>
        <Text style={s.body}>Renseignez EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY dans /app/frontend/.env puis redémarrez. Voir /app/SUPABASE_SETUP.md</Text>
      </SafeAreaView></View>
    );
  }

  return (
    <View testID="cms-dashboard" style={s.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={s.header}>
          <View>
            <Text style={s.eyebrow}>CMS · {user?.email}</Text>
            <Text style={s.h1}>Gestion du menu</Text>
          </View>
          <Pressable testID="cms-signout" onPress={signOut} style={s.iconBtn}><Feather name="log-out" size={18} color={theme.color.onSurface} /></Pressable>
        </View>

        <View style={s.tabRow}>
          {(['categories','items','settings'] as Tab[]).map((tb) => (
            <Pressable key={tb} testID={`tab-${tb}`} onPress={() => setTab(tb)} style={[s.tab, tab === tb && s.tabActive]}>
              <Feather name={tb === "categories" ? "folder" : tb === "items" ? "list" : "clock"} size={14} color={tab === tb ? theme.color.brand : theme.color.onSurfaceTertiary} />
              <Text style={[s.tabTxt, tab === tb && s.tabTxtActive]}>{tb === "categories" ? "Catégories" : tb === "items" ? "Menu" : "Paramètres"}</Text>
            </Pressable>
          ))}
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80, maxWidth: 900, width: "100%", alignSelf: "center" }} refreshControl={<RefreshControl refreshing={refreshing} tintColor={theme.color.brand} onRefresh={async () => { setRefreshing(true); await loadAll(); setRefreshing(false); }} />}>
          {tab === "items" && (
            <>
              <View style={s.actionsRow}>
                <Pressable testID="new-item" onPress={() => setEditing({ ingredientsText: "", is_active: true, sort_order: items.length, prices: { default: 0 } })} style={s.primaryBtn}>
                  <Feather name="plus" size={14} color={theme.color.onBrandPrimary} />
                  <Text style={s.primaryBtnTxt}>Nouveau plat</Text>
                </Pressable>
                {items.length === 0 && (
                  <Pressable testID="import-seed" onPress={importSeed} disabled={importing} style={s.secondaryBtn}>
                    {importing ? <ActivityIndicator size="small" color={theme.color.brand} /> : <><Feather name="download" size={14} color={theme.color.brand} /><Text style={s.secondaryBtnTxt}>Importer la carte initiale</Text></>}
                  </Pressable>
                )}
              </View>
              {items.length === 0 && <Text style={s.empty}>Aucun plat. Créez-en un ou utilisez l&apos;import.</Text>}
              {items.map((it) => {
                const cat = cats.find((c) => c.id === it.category_id);
                return (
                  <View key={it.id} style={[s.row, !it.is_active && { opacity: 0.5 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowName}>{it.name}</Text>
                      <Text style={s.rowSub}>{cat?.name || "—"} · {Object.entries(it.prices || {}).map(([k, v]) => `${k}: ${v}€`).join(" / ") || "sans prix"}</Text>
                    </View>
                    <Pressable onPress={() => reorder(it, -1)} style={s.iconBtn}><Feather name="arrow-up" size={14} color={theme.color.onSurface} /></Pressable>
                    <Pressable onPress={() => reorder(it, 1)} style={s.iconBtn}><Feather name="arrow-down" size={14} color={theme.color.onSurface} /></Pressable>
                    <Pressable onPress={() => toggleActive("menu_items", it)} style={s.iconBtn}><Feather name={it.is_active ? "eye" : "eye-off"} size={14} color={theme.color.brand} /></Pressable>
                    <Pressable testID={`edit-${it.id}`} onPress={() => setEditing({ ...it, ingredientsText: (it.ingredients || []).join(", "), prices: JSON.stringify(it.prices || {}) })} style={s.iconBtn}><Feather name="edit-2" size={14} color={theme.color.brand} /></Pressable>
                    <Pressable onPress={() => remove("menu_items", it)} style={s.iconBtn}><Feather name="trash-2" size={14} color={theme.color.error} /></Pressable>
                  </View>
                );
              })}
            </>
          )}

          {tab === "categories" && (
            <>
              <View style={s.actionsRow}>
                <Pressable testID="new-cat" onPress={() => setEditingCat({ is_active: true, sort_order: cats.length })} style={s.primaryBtn}><Feather name="plus" size={14} color={theme.color.onBrandPrimary} /><Text style={s.primaryBtnTxt}>Nouvelle catégorie</Text></Pressable>
              </View>
              {cats.length === 0 && <Text style={s.empty}>Aucune catégorie.</Text>}
              {cats.map((c) => (
                <View key={c.id} style={[s.row, !c.is_active && { opacity: 0.5 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowName}>{c.name}</Text>
                    <Text style={s.rowSub}>{c.slug} · ordre {c.sort_order}</Text>
                  </View>
                  <Pressable onPress={() => reorder(c, -1)} style={s.iconBtn}><Feather name="arrow-up" size={14} color={theme.color.onSurface} /></Pressable>
                  <Pressable onPress={() => reorder(c, 1)} style={s.iconBtn}><Feather name="arrow-down" size={14} color={theme.color.onSurface} /></Pressable>
                  <Pressable onPress={() => toggleActive("categories", c)} style={s.iconBtn}><Feather name={c.is_active ? "eye" : "eye-off"} size={14} color={theme.color.brand} /></Pressable>
                  <Pressable onPress={() => setEditingCat(c)} style={s.iconBtn}><Feather name="edit-2" size={14} color={theme.color.brand} /></Pressable>
                  <Pressable onPress={() => remove("categories", c)} style={s.iconBtn}><Feather name="trash-2" size={14} color={theme.color.error} /></Pressable>
                </View>
              ))}
            </>
          )}

          {tab === "settings" && settings && (
            <View>
              <Text style={s.label}>Téléphone</Text>
              <TextInput style={s.input} value={settings.phone || ""} onChangeText={(v) => setSettings({ ...settings, phone: v })} placeholder="+33 4 78 ..." placeholderTextColor={theme.color.muted} />
              <Text style={s.label}>Adresse</Text>
              <TextInput style={[s.input, { height: 64 }]} multiline value={settings.address || ""} onChangeText={(v) => setSettings({ ...settings, address: v })} placeholder="12 place Denfert..." placeholderTextColor={theme.color.muted} />
              <Text style={s.label}>Horaires d&apos;ouverture (JSON)</Text>
              <TextInput style={[s.input, { height: 160, fontFamily: "monospace" }]} multiline value={typeof settings.opening_hours === "string" ? settings.opening_hours : JSON.stringify(settings.opening_hours, null, 2)} onChangeText={(v) => setSettings({ ...settings, opening_hours: v })} placeholderTextColor={theme.color.muted} />
              <Pressable testID="save-settings" onPress={saveSettings} style={[s.primaryBtn, { marginTop: 16 }]}><Feather name="save" size={14} color={theme.color.onBrandPrimary} /><Text style={s.primaryBtnTxt}>Enregistrer</Text></Pressable>
            </View>
          )}
        </ScrollView>

        {/* ---------- Item edit modal (cheap inline overlay) ---------- */}
        {editing && (
          <View style={s.modal}>
            <View style={s.modalCard}>
              <ScrollView contentContainerStyle={{ padding: 20 }}>
                <Text style={s.h2}>{editing.id ? "Modifier le plat" : "Nouveau plat"}</Text>
                <Text style={s.label}>Nom</Text>
                <TextInput style={s.input} value={editing.name || ""} onChangeText={(v) => setEditing({ ...editing, name: v })} placeholderTextColor={theme.color.muted} />
                <Text style={s.label}>Description</Text>
                <TextInput style={[s.input, { height: 64 }]} multiline value={editing.description || ""} onChangeText={(v) => setEditing({ ...editing, description: v })} placeholderTextColor={theme.color.muted} />
                <Text style={s.label}>Ingrédients (séparés par virgule)</Text>
                <TextInput style={[s.input, { height: 56 }]} multiline value={editing.ingredientsText || ""} onChangeText={(v) => setEditing({ ...editing, ingredientsText: v })} placeholderTextColor={theme.color.muted} />
                <Text style={s.label}>Prix (JSON, ex: {`{"sm":9.5,"lg":13.5}`})</Text>
                <TextInput style={[s.input, { fontFamily: "monospace" }]} value={typeof editing.prices === "string" ? editing.prices : JSON.stringify(editing.prices)} onChangeText={(v) => setEditing({ ...editing, prices: v })} placeholderTextColor={theme.color.muted} />
                <Text style={s.label}>Catégorie</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {cats.map((c) => (
                    <Pressable key={c.id} onPress={() => setEditing({ ...editing, category_id: c.id })} style={[s.catChip, editing.category_id === c.id && s.catChipActive]}>
                      <Text style={[s.catChipTxt, editing.category_id === c.id && s.catChipTxtActive]}>{c.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={[s.label, { marginTop: 12 }]}>Image</Text>
                {editing.image_url && <Text style={{ color: theme.color.muted, fontSize: 11, marginBottom: 6 }}>Actuelle : {editing.image_url}</Text>}
                {Platform.OS === "web" && (
                  // @ts-ignore native web input
                  <input type="file" accept="image/*" onChange={async (e: any) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    if (!editing.id) { Alert.alert("Enregistrez d'abord le plat", "Une image nécessite un id"); return; }
                    if (f.size > 20 * 1024 * 1024) { Alert.alert("Fichier trop gros", "Max 20 MB"); return; }
                    setSavingId(editing.id);
                    const urls = await uploadImageForItem(editing, f);
                    setSavingId(null);
                    if (urls) {
                      // Persist BOTH URLs immediately so the customer screen + CMS list show the new photo without a manual save.
                      const sb = getSupabase();
                      const payload: any = { image_url: urls.original };
                      if (urls.thumbnail) payload.thumbnail_url = urls.thumbnail;
                      // First attempt with thumbnail_url; if schema lacks the column (PGRST204), retry without it.
                      let { error } = await sb.from("menu_items").update(payload).eq("id", editing.id);
                      if (error && /thumbnail_url/i.test(error.message)) {
                        const { error: e2 } = await sb.from("menu_items").update({ image_url: urls.original }).eq("id", editing.id);
                        error = e2;
                        showToast("Image enregistrée (colonne thumbnail_url manquante — voir /app/SUPABASE_SETUP.md)");
                      } else if (!error) {
                        showToast(urls.thumbnail ? "Image + miniature en ligne" : "Image en ligne");
                      }
                      if (error) Alert.alert("Erreur enregistrement image", error.message);
                      setEditing({ ...editing, image_url: urls.original, thumbnail_url: urls.thumbnail });
                      loadAll();
                    }
                  }} style={{ color: "white", marginBottom: 12 }} />
                )}
                <Text style={{ color: theme.color.muted, fontSize: 10, marginTop: -4, marginBottom: 10 }}>
                  Jusqu&apos;à 20 MB. L&apos;image originale est conservée en pleine qualité, sans aucune compression ; une miniature haute qualité (≤1600 px, JPEG 92%) est générée automatiquement pour l&apos;affichage côté client.
                </Text>
                <Pressable onPress={() => setEditing({ ...editing, is_active: !editing.is_active })} style={s.checkRow}>
                  <Feather name={editing.is_active ? "check-square" : "square"} size={16} color={theme.color.brand} />
                  <Text style={s.checkTxt}>Actif (visible côté client)</Text>
                </Pressable>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                  <Pressable testID="item-cancel" onPress={() => setEditing(null)} style={[s.secondaryBtn, { flex: 1 }]}><Text style={s.secondaryBtnTxt}>Annuler</Text></Pressable>
                  <Pressable testID="item-save" onPress={() => upsertItem(editing)} disabled={!editing.name || savingId !== null} style={[s.primaryBtn, { flex: 1 }]}>{savingId ? <ActivityIndicator size="small" color={theme.color.onBrandPrimary} /> : <><Feather name="save" size={14} color={theme.color.onBrandPrimary} /><Text style={s.primaryBtnTxt}>Enregistrer</Text></>}</Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        )}

        {/* ---------- Category edit modal ---------- */}
        {editingCat && (
          <View style={s.modal}>
            <View style={s.modalCard}>
              <ScrollView contentContainerStyle={{ padding: 20 }}>
                <Text style={s.h2}>{editingCat.id ? "Modifier la catégorie" : "Nouvelle catégorie"}</Text>
                <Text style={s.label}>Nom</Text>
                <TextInput style={s.input} value={editingCat.name || ""} onChangeText={(v) => setEditingCat({ ...editingCat, name: v })} placeholderTextColor={theme.color.muted} />
                <Text style={s.label}>Slug (URL-safe)</Text>
                <TextInput style={s.input} value={editingCat.slug || ""} onChangeText={(v) => setEditingCat({ ...editingCat, slug: v.toLowerCase().replace(/[^a-z0-9-]+/g, "-") })} placeholderTextColor={theme.color.muted} />
                <Text style={s.label}>Ordre</Text>
                <TextInput style={s.input} keyboardType="number-pad" value={String(editingCat.sort_order ?? 0)} onChangeText={(v) => setEditingCat({ ...editingCat, sort_order: v })} placeholderTextColor={theme.color.muted} />
                <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                  <Pressable onPress={() => setEditingCat(null)} style={[s.secondaryBtn, { flex: 1 }]}><Text style={s.secondaryBtnTxt}>Annuler</Text></Pressable>
                  <Pressable onPress={() => upsertCat(editingCat)} disabled={!editingCat.name || !editingCat.slug || savingId !== null} style={[s.primaryBtn, { flex: 1 }]}>{savingId ? <ActivityIndicator size="small" color={theme.color.onBrandPrimary} /> : <><Feather name="save" size={14} color={theme.color.onBrandPrimary} /><Text style={s.primaryBtnTxt}>Enregistrer</Text></>}</Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        )}

        {toast && <View style={s.toast}><Feather name="check-circle" size={14} color={theme.color.brand} /><Text style={s.toastTxt}>{toast}</Text></View>}
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 0.5, borderBottomColor: theme.color.border },
  eyebrow: { color: theme.color.brand, fontSize: 9, letterSpacing: 2, fontWeight: "700" },
  h1: { color: theme.color.onSurface, fontSize: 20, fontWeight: "400", marginTop: 2 },
  h2: { color: theme.color.onSurface, fontSize: 18, fontWeight: "500", marginBottom: 12 },
  body: { color: theme.color.onSurfaceSecondary, fontSize: 13, marginTop: 12, lineHeight: 18 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  tabRow: { flexDirection: "row", gap: 6, padding: 12 },
  tab: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", height: 40, borderRadius: 999, borderWidth: 1, borderColor: theme.color.border },
  tabActive: { borderColor: theme.color.brand, backgroundColor: "rgba(212,175,55,0.1)" },
  tabTxt: { color: theme.color.onSurfaceTertiary, fontSize: 12, fontWeight: "600" },
  tabTxtActive: { color: theme.color.brand },
  actionsRow: { flexDirection: "row", gap: 8, marginBottom: 14, flexWrap: "wrap" },
  primaryBtn: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, height: 42, borderRadius: 10, backgroundColor: theme.color.brand },
  primaryBtnTxt: { color: theme.color.onBrandPrimary, fontWeight: "700", fontSize: 13, letterSpacing: 0.5 },
  secondaryBtn: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, height: 42, borderRadius: 10, borderWidth: 1, borderColor: theme.color.brand, backgroundColor: "rgba(212,175,55,0.06)" },
  secondaryBtnTxt: { color: theme.color.brand, fontWeight: "600", fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: 4, padding: 10, borderRadius: 10, backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, marginBottom: 8 },
  rowName: { color: theme.color.onSurface, fontSize: 14, fontWeight: "500" },
  rowSub: { color: theme.color.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  empty: { color: theme.color.muted, textAlign: "center", paddingVertical: 30, fontStyle: "italic" },
  label: { color: theme.color.onSurfaceTertiary, fontSize: 10, letterSpacing: 1.5, fontWeight: "700", marginTop: 12, marginBottom: 6 },
  input: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: theme.color.border, paddingHorizontal: 12, paddingVertical: 10, color: theme.color.onSurface, backgroundColor: "rgba(255,255,255,0.04)", fontSize: 14 },
  catChip: { paddingHorizontal: 10, height: 32, borderRadius: 999, borderWidth: 1, borderColor: theme.color.border, alignItems: "center", justifyContent: "center", marginRight: 4, marginBottom: 4 },
  catChipActive: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  catChipTxt: { color: theme.color.onSurfaceTertiary, fontSize: 11, fontWeight: "600" },
  catChipTxtActive: { color: theme.color.onBrandPrimary },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  checkTxt: { color: theme.color.onSurface, fontSize: 13 },
  modal: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalCard: { width: "100%", maxWidth: 560, maxHeight: "90%", borderRadius: 16, backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.brand, overflow: "hidden" },
  toast: { position: "absolute", bottom: 24, left: 16, right: 16, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", padding: 14, borderRadius: 12, backgroundColor: theme.color.surfaceTertiary, borderWidth: 1, borderColor: theme.color.brand, maxWidth: 560, alignSelf: "center" },
  toastTxt: { color: theme.color.onSurface, fontSize: 13, fontWeight: "500" },
});
