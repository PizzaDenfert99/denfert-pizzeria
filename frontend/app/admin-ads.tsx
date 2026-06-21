import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Platform, Switch, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter, Redirect } from "expo-router";
import { useAuth } from "@/src/auth-context";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { theme } from "@/src/theme";
import { pickImageFromGallery } from "@/src/imagePicker";
import { getSupabase } from "@/src/lib/supabase";
import { isLoyaltyApp } from "@/src/appMode";

type Slide = { id: string; section: string; order: number; title: string; subtitle?: string;
  image_url: string; duration_ms: number; active: boolean };
type Settings = { idle_seconds: number; loop: boolean; default_duration_ms: number; show_section_titles: boolean };

const SECTIONS = [
  { key: "loyalty", fr: "Club Fidélité" },
  { key: "experience", fr: "Expérience" },
  { key: "ingredients", fr: "Ingrédients" },
];

// Page-level guard: ad management lives on the loyalty tablet only.
export default function AdminAdsRoute() {
  if (!isLoyaltyApp()) return <Redirect href={"/" as any} />;
  return <AdminAds />;
}

function AdminAds() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { lang } = useI18n();
  const [slides, setSlides] = useState<Slide[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Slide | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user || !user.is_admin) { router.replace("/"); return; }
    refresh();
  }, [user, loading]);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.adminListAdSlides();
      setSlides(r.slides || []);
      const s = await api.adminGetKioskSettings();
      setSettings(s);
    } catch (e: any) {
      showToast(e?.message || "Erreur");
    } finally { setBusy(false); }
  }, []);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  if (loading || !user) return <View style={s.center}><ActivityIndicator color={theme.color.brand} /></View>;
  if (!user.is_admin) return null;

  const grouped = SECTIONS.map(sec => ({ ...sec, slides: slides.filter(sl => sl.section === sec.key).sort((a, b) => a.order - b.order) }));

  return (
    <SafeAreaView style={s.screen} edges={["top", "left", "right"]}>
      <View style={s.header}>
        <Pressable testID="back-btn" onPress={() => router.back()} style={s.iconBtn}>
          <Feather name="arrow-left" size={20} color={theme.color.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>— ADMINISTRATION</Text>
          <Text style={s.title}>{lang === "fr" ? "Diaporama publicitaire" : "Slideshow"}</Text>
        </View>
        <Pressable testID="preview-kiosk" onPress={() => router.push("/kiosk" as any)} style={s.iconBtn}>
          <Feather name="play" size={16} color={theme.color.brand} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 80 }}>
        {settings && (
          <View style={s.settingsBox}>
            <Text style={s.sectionLbl}>{lang === "fr" ? "PARAMÈTRES KIOSQUE" : "KIOSK SETTINGS"}</Text>
            <View style={s.settingRow}>
              <Text style={s.settingLbl}>{lang === "fr" ? "Veille après (sec)" : "Idle delay (s)"}</Text>
              <TextInput
                style={s.numInput}
                keyboardType="number-pad"
                value={String(settings.idle_seconds)}
                onChangeText={async (v) => {
                  const n = parseInt(v, 10);
                  if (!isNaN(n) && n >= 5 && n <= 600) {
                    const upd = await api.adminUpdateKioskSettings({ idle_seconds: n });
                    setSettings(upd);
                  }
                }}
              />
            </View>
            <View style={s.settingRow}>
              <Text style={s.settingLbl}>{lang === "fr" ? "Boucler" : "Loop"}</Text>
              <Switch value={settings.loop} onValueChange={async (v) => {
                const upd = await api.adminUpdateKioskSettings({ loop: v }); setSettings(upd);
              }} />
            </View>
            <View style={s.settingRow}>
              <Text style={s.settingLbl}>{lang === "fr" ? "Afficher titres section" : "Show section titles"}</Text>
              <Switch value={settings.show_section_titles} onValueChange={async (v) => {
                const upd = await api.adminUpdateKioskSettings({ show_section_titles: v }); setSettings(upd);
              }} />
            </View>
          </View>
        )}

        {busy && slides.length === 0 ? <ActivityIndicator color={theme.color.brand} /> : grouped.map(g => (
          <View key={g.key} style={s.sectionBox}>
            <View style={s.sectionHead}>
              <Text style={s.sectionTitle}>{g.fr} <Text style={s.sectionCount}>({g.slides.length})</Text></Text>
              <Pressable testID={`add-${g.key}`} onPress={async () => {
                const created = await api.adminCreateAdSlide({ section: g.key as any, title: "Nouveau slide", duration_ms: 5000, active: true });
                setSlides([...slides, created]);
                setEditing(created);
              }} style={s.addBtn}>
                <Feather name="plus" size={14} color={theme.color.onBrandPrimary} />
                <Text style={s.addBtnTxt}>{lang === "fr" ? "Ajouter" : "Add"}</Text>
              </Pressable>
            </View>
            {g.slides.map(sl => (
              <Pressable key={sl.id} testID={`slide-${sl.id}`} onPress={() => setEditing(sl)} style={[s.slideCard, !sl.active && { opacity: 0.5 }]}>
                {sl.image_url ? <Image source={{ uri: sl.image_url }} style={s.thumb} /> : <View style={[s.thumb, { backgroundColor: theme.color.surfaceTertiary, alignItems: "center", justifyContent: "center" }]}><Feather name="image" size={18} color={theme.color.muted} /></View>}
                <View style={{ flex: 1 }}>
                  <Text style={s.slideTitle} numberOfLines={1}>{sl.title}</Text>
                  {sl.subtitle ? <Text style={s.slideSub} numberOfLines={1}>{sl.subtitle}</Text> : null}
                  <Text style={s.slideMeta}>#{sl.order} · {Math.round(sl.duration_ms / 1000)}s {!sl.active && "· inactif"}</Text>
                </View>
                <Feather name="edit-2" size={14} color={theme.color.brand} />
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>

      {toast && <View style={s.toast}><Text style={s.toastTxt}>{toast}</Text></View>}

      {editing && <SlideEditor slide={editing} lang={lang as any} onClose={() => setEditing(null)}
        onSaved={async () => { await refresh(); setEditing(null); }} onToast={showToast} />}
    </SafeAreaView>
  );
}

function SlideEditor({ slide, lang, onClose, onSaved, onToast }: { slide: Slide; lang: "fr" | "en"; onClose: () => void; onSaved: () => void; onToast: (m: string) => void }) {
  const [title, setTitle] = useState(slide.title);
  const [subtitle, setSubtitle] = useState(slide.subtitle || "");
  const [durationS, setDurationS] = useState(String(Math.round(slide.duration_ms / 1000)));
  const [active, setActive] = useState(slide.active);
  const [imageUrl, setImageUrl] = useState(slide.image_url || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handlePick = async () => {
    const picked = await pickImageFromGallery();
    if (!picked) return;
    setUploading(true);
    try {
      const sb = getSupabase();
      const ext = (picked.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
      const path = `kiosk/${slide.id}/${Date.now()}.${ext}`;
      const { error } = await sb.storage.from("menu-images").upload(path, picked.blob || (picked as any), { upsert: true, contentType: picked.type, cacheControl: "31536000" });
      if (error) { onToast(error.message); return; }
      const url = sb.storage.from("menu-images").getPublicUrl(path).data.publicUrl;
      setImageUrl(url);
      onToast(lang === "fr" ? "Image téléchargée" : "Image uploaded");
    } finally { setUploading(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.adminUpdateAdSlide(slide.id, { title, subtitle, image_url: imageUrl, duration_ms: Math.max(500, parseInt(durationS, 10) * 1000 || 5000), active });
      onToast(lang === "fr" ? "Enregistré" : "Saved");
      onSaved();
    } catch (e: any) { onToast(e?.message || "Échec"); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (Platform.OS === "web" && !confirm("Supprimer ce slide ?")) return;
    try { await api.adminDeleteAdSlide(slide.id); onToast("Supprimé"); onSaved(); } catch (e: any) { onToast(e?.message || "Échec"); }
  };

  return (
    <View style={s.modalOverlay}>
      <View style={s.modalCard}>
        <ScrollView contentContainerStyle={{ padding: theme.space.lg }} keyboardShouldPersistTaps="handled">
          <View style={s.modalHead}>
            <Text style={s.modalTitle}>{lang === "fr" ? "Modifier le slide" : "Edit slide"}</Text>
            <Pressable onPress={onClose} style={s.iconBtn}><Feather name="x" size={18} color={theme.color.onSurface} /></Pressable>
          </View>

          <Text style={s.fieldLbl}>{lang === "fr" ? "Titre" : "Title"}</Text>
          <TextInput value={title} onChangeText={setTitle} style={s.input} />
          <Text style={s.fieldLbl}>{lang === "fr" ? "Sous-titre" : "Subtitle"}</Text>
          <TextInput value={subtitle} onChangeText={setSubtitle} style={s.input} />
          <Text style={s.fieldLbl}>{lang === "fr" ? "Durée (sec)" : "Duration (s)"}</Text>
          <TextInput value={durationS} onChangeText={setDurationS} keyboardType="number-pad" style={s.input} />
          <View style={[s.settingRow, { marginTop: 8 }]}>
            <Text style={s.fieldLbl}>{lang === "fr" ? "Actif" : "Active"}</Text>
            <Switch value={active} onValueChange={setActive} />
          </View>

          <Text style={[s.fieldLbl, { marginTop: 16 }]}>Image</Text>
          {imageUrl ? <Image source={{ uri: imageUrl }} style={s.preview} /> : null}
          <Pressable testID="pick-slide-image" disabled={uploading} onPress={handlePick} style={s.secondaryBtn}>
            {uploading ? <ActivityIndicator color={theme.color.brand} /> : <><Feather name="image" size={14} color={theme.color.brand} /><Text style={s.secondaryBtnTxt}>{imageUrl ? (lang === "fr" ? "Remplacer" : "Replace") : (lang === "fr" ? "Choisir une image" : "Choose image")}</Text></>}
          </Pressable>

          <Pressable testID="save-slide" onPress={save} disabled={saving} style={[s.primaryBtn, saving && { opacity: 0.6 }]}>
            {saving ? <ActivityIndicator color={theme.color.onBrandPrimary} /> : <Text style={s.primaryBtnTxt}>{lang === "fr" ? "Enregistrer" : "Save"}</Text>}
          </Pressable>
          <Pressable testID="delete-slide" onPress={remove} style={s.dangerBtn}>
            <Feather name="trash-2" size={12} color={"#E74C3C"} />
            <Text style={s.dangerBtnTxt}>{lang === "fr" ? "Supprimer" : "Delete"}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md, gap: theme.space.md },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border },
  eyebrow: { color: theme.color.brand, fontSize: 10, letterSpacing: 1.4, fontWeight: "600", marginBottom: 2 },
  title: { color: theme.color.onSurface, fontSize: 22, fontFamily: theme.font.display },
  sectionLbl: { color: theme.color.muted, fontSize: 10, letterSpacing: 1.2, fontWeight: "600", marginBottom: 8 },
  settingsBox: { backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: 12, padding: 12, marginBottom: 16 },
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  settingLbl: { color: theme.color.onSurface, fontSize: 13 },
  numInput: { width: 70, backgroundColor: theme.color.surface, borderRadius: 8, borderWidth: 1, borderColor: theme.color.border, paddingHorizontal: 10, paddingVertical: 6, color: theme.color.onSurface, fontSize: 14, textAlign: "center" },
  sectionBox: { marginBottom: 16 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  sectionTitle: { color: theme.color.onSurface, fontSize: 15, fontWeight: "600" },
  sectionCount: { color: theme.color.muted, fontSize: 12, fontWeight: "400" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.color.brand },
  addBtnTxt: { color: theme.color.onBrandPrimary, fontSize: 11, fontWeight: "700" },
  slideCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.color.surfaceSecondary, borderRadius: 10, borderWidth: 1, borderColor: theme.color.border, padding: 10, marginVertical: 4 },
  thumb: { width: 48, height: 48, borderRadius: 6, backgroundColor: theme.color.surfaceTertiary },
  slideTitle: { color: theme.color.onSurface, fontSize: 13, fontWeight: "600" },
  slideSub: { color: theme.color.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  slideMeta: { color: theme.color.muted, fontSize: 10, marginTop: 2 },
  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.color.overlay, justifyContent: "flex-end" },
  modalCard: { backgroundColor: theme.color.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "92%", ...(Platform.OS === "web" ? { maxWidth: 640, marginHorizontal: "auto", borderRadius: 20 } : {}) },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: theme.color.onSurface, fontSize: 20, fontFamily: theme.font.display },
  fieldLbl: { color: theme.color.muted, fontSize: 11, letterSpacing: 1, fontWeight: "600", marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: theme.color.surfaceSecondary, borderRadius: 8, borderWidth: 1, borderColor: theme.color.border, paddingHorizontal: 10, paddingVertical: 10, color: theme.color.onSurface, fontSize: 14 },
  preview: { width: "100%", height: 180, borderRadius: 8, marginVertical: 8 },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.color.borderStrong },
  secondaryBtnTxt: { color: theme.color.brand, fontSize: 13, fontWeight: "600" },
  primaryBtn: { backgroundColor: theme.color.brand, paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 18 },
  primaryBtnTxt: { color: theme.color.onBrandPrimary, fontSize: 14, fontWeight: "700" },
  dangerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, marginTop: 8 },
  dangerBtnTxt: { color: "#E74C3C", fontSize: 12, fontWeight: "600" },
  toast: { position: "absolute", left: 16, right: 16, bottom: 24, backgroundColor: theme.color.brand, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  toastTxt: { color: theme.color.onBrandPrimary, fontWeight: "600", fontSize: 13 },
});
