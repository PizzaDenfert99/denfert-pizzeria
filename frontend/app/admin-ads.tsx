import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Platform, Switch, Image, Animated, Easing } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter, Redirect } from "expo-router";
import { VideoView, useVideoPlayer } from "@/src/safeVideo";
import { useAuth } from "@/src/auth-context";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { theme } from "@/src/theme";
import { pickImageFromGallery, pickVideoFromGallery } from "@/src/imagePicker";
import { isLoyaltyApp } from "@/src/appMode";

type MediaType = "image" | "video";
type Slide = { id: string; section: string; order: number; title: string; subtitle?: string;
  image_url: string; media_type?: MediaType; duration_ms: number; active: boolean;
  background_color?: string; font_family?: string; font_color?: string; effect_type?: string };
type Settings = { idle_seconds: number; loop: boolean; default_duration_ms: number; show_section_titles: boolean };

const SECTIONS = [
  { key: "loyalty", fr: "Club Fidélité" },
  { key: "experience", fr: "Expérience" },
  { key: "ingredients", fr: "Ingrédients" },
];

// Must mirror AD_FONTS / AD_EFFECTS in backend/server.py. Only fonts actually
// registered in src/hooks/use-icon-fonts.ts are offered here (System,
// PlayfairDisplay_600SemiBold, DancingScript_600SemiBold) — this app's
// theme.font.display ("CormorantGaramond") and theme.font.text ("Satoshi")
// are NOT loaded via useFonts() and are intentionally excluded.
const FONT_OPTIONS = [
  { key: "System", label: "Système" },
  { key: "PlayfairDisplay_600SemiBold", label: "Serif élégant" },
  { key: "DancingScript_600SemiBold", label: "Manuscrit" },
];
const EFFECT_OPTIONS = [
  { key: "kenburns", label: "Zoom (Ken Burns)" },
  { key: "wave", label: "Vague" },
  { key: "rotate", label: "Rotation" },
  { key: "slide", label: "Panoramique" },
  { key: "fade", label: "Fondu" },
  { key: "none", label: "Aucun" },
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
  const [mediaType, setMediaType] = useState<MediaType>((slide.media_type as MediaType) || "image");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Per-slide style — all optional; empty string means "use kiosk default".
  // Ignored for video slides (see EFFECT_OPTIONS below) — a looping video
  // already has its own motion, so we don't compete with a Ken Burns/wave/
  // rotate/etc. transform on top of it.
  const [backgroundColor, setBackgroundColor] = useState(slide.background_color || "");
  const [fontFamily, setFontFamily] = useState(slide.font_family || "");
  const [fontColor, setFontColor] = useState(slide.font_color || "");
  const [effectType, setEffectType] = useState(slide.effect_type || "");

  const handlePick = async () => {
    const picked = mediaType === "video" ? await pickVideoFromGallery() : await pickImageFromGallery();
    if (!picked) return;
    setUploading(true);
    try {
      const { url } = await api.adminCmsUploadImage(slide.id, picked, "original", "kiosk");
      setImageUrl(url);
      onToast(mediaType === "video"
        ? (lang === "fr" ? "Vidéo téléchargée" : "Video uploaded")
        : (lang === "fr" ? "Image téléchargée" : "Image uploaded"));
    } catch (e: any) {
      onToast(e?.message || (lang === "fr" ? "Échec de l'envoi" : "Upload failed"));
    } finally { setUploading(false); }
  };

  const bgValid = backgroundColor === "" || /^#[0-9A-Fa-f]{6}$/.test(backgroundColor);
  const fontColorValid = fontColor === "" || /^#[0-9A-Fa-f]{6}$/.test(fontColor);

  const save = async () => {
    if (!bgValid || !fontColorValid) {
      onToast(lang === "fr" ? "Couleur invalide (format #RRGGBB)" : "Invalid color (format #RRGGBB)");
      return;
    }
    setSaving(true);
    try {
      await api.adminUpdateAdSlide(slide.id, {
        title, subtitle, image_url: imageUrl, media_type: mediaType,
        duration_ms: Math.max(500, parseInt(durationS, 10) * 1000 || 5000), active,
        background_color: backgroundColor, font_family: fontFamily,
        font_color: fontColor, effect_type: effectType,
      });
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

          <Text style={[s.fieldLbl, { marginTop: 16 }]}>{lang === "fr" ? "Type de média" : "Media type"}</Text>
          <View style={s.chipRow}>
            {(["image", "video"] as MediaType[]).map((mt) => (
              <Pressable
                key={mt}
                testID={`media-type-${mt}`}
                onPress={() => { if (mt !== mediaType) { setMediaType(mt); setImageUrl(""); } }}
                style={[s.chip, mediaType === mt && s.chipActive]}
              >
                <Feather name={mt === "video" ? "film" : "image"} size={12} color={mediaType === mt ? theme.color.onBrandPrimary : theme.color.onSurface} />
                <Text style={[s.chipTxt, mediaType === mt && s.chipTxtActive, { marginLeft: 6 }]}>
                  {mt === "video" ? (lang === "fr" ? "Vidéo" : "Video") : (lang === "fr" ? "Photo" : "Photo")}
                </Text>
              </Pressable>
            ))}
          </View>

          {imageUrl && mediaType === "video" ? <VideoPreviewThumb uri={imageUrl} /> : null}
          {imageUrl && mediaType === "image" ? <Image source={{ uri: imageUrl }} style={s.preview} /> : null}
          <Pressable testID="pick-slide-image" disabled={uploading} onPress={handlePick} style={s.secondaryBtn}>
            {uploading ? <ActivityIndicator color={theme.color.brand} /> : (
              <>
                <Feather name={mediaType === "video" ? "film" : "image"} size={14} color={theme.color.brand} />
                <Text style={s.secondaryBtnTxt}>
                  {imageUrl
                    ? (lang === "fr" ? "Remplacer" : "Replace")
                    : mediaType === "video"
                      ? (lang === "fr" ? "Choisir une vidéo" : "Choose video")
                      : (lang === "fr" ? "Choisir une image" : "Choose image")}
                </Text>
              </>
            )}
          </Pressable>
          {mediaType === "video" && (
            <Text style={s.hintTxt}>{lang === "fr" ? "MP4 ou WebM, 50 Mo max. La vidéo boucle silencieusement pendant la durée du slide." : "MP4 or WebM, 50 MB max. The video loops silently for the slide's duration."}</Text>
          )}

          <Text style={[s.sectionLbl, { marginTop: 20, marginBottom: 8 }]}>{lang === "fr" ? "STYLE DU SLIDE (OPTIONNEL)" : "SLIDE STYLE (OPTIONAL)"}</Text>

          <StylePreview
            imageUrl={imageUrl}
            mediaType={mediaType}
            title={title}
            subtitle={subtitle}
            backgroundColor={bgValid ? backgroundColor : ""}
            fontFamily={fontFamily}
            fontColor={fontColorValid ? fontColor : ""}
            effectType={effectType}
          />

          <HexColorField
            label={lang === "fr" ? "Couleur de fond" : "Background color"}
            value={backgroundColor}
            onChange={setBackgroundColor}
            valid={bgValid}
            placeholder="#1a1a1a"
            testID="bg-color-input"
          />
          <HexColorField
            label={lang === "fr" ? "Couleur du texte" : "Text color"}
            value={fontColor}
            onChange={setFontColor}
            valid={fontColorValid}
            placeholder="#ffffff"
            testID="font-color-input"
          />

          <Text style={s.fieldLbl}>{lang === "fr" ? "Police" : "Font"}</Text>
          <ChipRow options={FONT_OPTIONS} value={fontFamily} onChange={setFontFamily} testIDPrefix="font" />

          {mediaType === "image" ? (
            <>
              <Text style={s.fieldLbl}>{lang === "fr" ? "Animation" : "Effect"}</Text>
              <ChipRow options={EFFECT_OPTIONS} value={effectType} onChange={setEffectType} testIDPrefix="effect" />
            </>
          ) : (
            <Text style={[s.fieldLbl, s.hintTxt]}>
              {lang === "fr"
                ? "Animation non disponible pour les vidéos (la vidéo a déjà son propre mouvement)."
                : "Animation not available for video (the video already has its own motion)."}
            </Text>
          )}

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

function HexColorField({ label, value, onChange, valid, placeholder, testID }: {
  label: string; value: string; onChange: (v: string) => void; valid: boolean; placeholder: string; testID: string;
}) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={s.fieldLbl}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={[s.swatch, { backgroundColor: valid && value ? value : theme.color.surfaceTertiary }]} />
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={theme.color.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={[s.input, { flex: 1 }, !valid && s.inputError]}
        />
        {!!value && (
          <Pressable testID={`${testID}-clear`} onPress={() => onChange("")} style={s.iconBtn}>
            <Feather name="x" size={14} color={theme.color.muted} />
          </Pressable>
        )}
      </View>
      {!valid && <Text style={s.errorTxt}>{"Format attendu: #RRGGBB"}</Text>}
    </View>
  );
}

function ChipRow({ options, value, onChange, testIDPrefix }: {
  options: { key: string; label: string }[]; value: string; onChange: (v: string) => void; testIDPrefix: string;
}) {
  return (
    <View style={s.chipRow}>
      {options.map(o => {
        const selected = value === o.key;
        return (
          <Pressable
            key={o.key}
            testID={`${testIDPrefix}-${o.key}`}
            onPress={() => onChange(selected ? "" : o.key)}
            style={[s.chip, selected && s.chipActive]}
          >
            <Text style={[s.chipTxt, selected && s.chipTxtActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Lightweight looping version of the kiosk's per-slide effects, so the admin can
// see roughly how the motion will look without leaving the editor.
// Small looping muted preview of a just-picked/existing kiosk video, shown
// right under the media-type toggle — separate from StylePreview's own video
// rendering below (that one adds the title/subtitle overlay + background).
function VideoPreviewThumb({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.muted = true; p.play(); });
  return <VideoView player={player} style={s.preview} contentFit="cover" nativeControls={false} />;
}

function StylePreview({ imageUrl, mediaType, title, subtitle, backgroundColor, fontFamily, fontColor, effectType }: {
  imageUrl: string; mediaType: MediaType; title: string; subtitle: string; backgroundColor: string; fontFamily: string; fontColor: string; effectType: string;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const player = useVideoPlayer(mediaType === "video" && imageUrl ? imageUrl : null, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    if (mediaType === "video" && imageUrl) player.play();
  }, [mediaType, imageUrl, player]);

  useEffect(() => {
    anim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 3000, easing: Easing.linear, useNativeDriver: true })
    );
    // Video slides never apply effect_type — the video already has its own motion.
    if (mediaType === "image" && effectType && effectType !== "none" && effectType !== "fade") loop.start();
    return () => loop.stop();
  }, [effectType, mediaType]);

  let imgStyle: any = {};
  if (mediaType === "image") switch (effectType) {
    case "kenburns":
      imgStyle = { transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1.14] }) }] };
      break;
    case "wave":
      imgStyle = { transform: [
        { scale: 1.06 },
        { translateX: anim.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 6, 0, -6, 0] }) },
      ] };
      break;
    case "rotate":
      imgStyle = { transform: [
        { scale: 1.08 },
        { rotate: anim.interpolate({ inputRange: [0, 1], outputRange: ["-2deg", "2deg"] }) },
      ] };
      break;
    case "slide":
      imgStyle = { transform: [
        { scale: 1.12 },
        { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-14, 14] }) },
      ] };
      break;
    default:
      imgStyle = {};
  }

  return (
    <View style={[s.previewBox, { backgroundColor: backgroundColor || theme.color.surfaceTertiary }]}>
      {mediaType === "video" && imageUrl ? (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      ) : imageUrl ? (
        <Animated.View style={[StyleSheet.absoluteFill, imgStyle]}>
          <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        </Animated.View>
      ) : null}
      <View style={[StyleSheet.absoluteFill, s.previewOverlay]}>
        <Text numberOfLines={2} style={[s.previewTitle, !!fontFamily && { fontFamily }, !!fontColor && { color: fontColor }]}>
          {title || "Titre du slide"}
        </Text>
        {!!subtitle && (
          <Text numberOfLines={2} style={[s.previewSub, !!fontFamily && { fontFamily }, !!fontColor && { color: fontColor }]}>
            {subtitle}
          </Text>
        )}
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
  swatch: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: theme.color.borderStrong },
  inputError: { borderColor: "#E74C3C" },
  errorTxt: { color: "#E74C3C", fontSize: 11, marginTop: 4 },
  hintTxt: { color: theme.color.muted, fontSize: 11, marginTop: 6, fontWeight: "400", letterSpacing: 0 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  chip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: theme.color.borderStrong, backgroundColor: theme.color.surfaceSecondary },
  chipActive: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  chipTxt: { color: theme.color.onSurface, fontSize: 12, fontWeight: "600" },
  chipTxtActive: { color: theme.color.onBrandPrimary },
  previewBox: { width: "100%", height: 160, borderRadius: 10, overflow: "hidden", marginTop: 4, marginBottom: 4, justifyContent: "flex-end" },
  previewOverlay: { justifyContent: "flex-end", padding: 12, backgroundColor: "rgba(0,0,0,0.25)" },
  previewTitle: { color: "#ffffff", fontSize: 16, fontWeight: "700", textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  previewSub: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 4, textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
});
