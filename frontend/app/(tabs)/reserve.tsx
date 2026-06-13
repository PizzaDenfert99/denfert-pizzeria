import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { useI18n } from "@/src/i18n";
import { theme } from "@/src/theme";

const INTERIOR = "https://images.pexels.com/photos/4997894/pexels-photo-4997894.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=1200";

const TIMES_LUNCH = ["11:30", "12:00", "12:30", "13:00", "13:30", "14:00"];
const TIMES_DINNER = ["18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30"];

function nextDays(n: number) {
  const out: { iso: string; day: string; date: string }[] = [];
  const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({ iso: d.toISOString().slice(0, 10), day: dayNames[d.getDay()], date: String(d.getDate()) });
  }
  return out;
}

type ZoneAvail = { capacity: number; booked: number; available: number; full: boolean; tables_total?: number; tables_free?: number };
type Availability = { zones: { indoor: ZoneAvail; terrace: ZoneAvail } };

export default function Reserve() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const [date, setDate] = useState(nextDays(14)[0].iso);
  const [time, setTime] = useState("20:00");
  const [guests, setGuests] = useState(2);
  const [zone, setZone] = useState<"indoor" | "terrace">("indoor");
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<null | { status: "confirmed" | "pending"; table_no: string | null }>(null);
  const [err, setErr] = useState<string | null>(null);

  // Refresh availability on date/time changes AND on a slow poll so the customer sees live capacity.
  useEffect(() => {
    let alive = true;
    let timer: any = null;
    const fetchAvail = async () => {
      try {
        const a = await api.reservationAvailability(date, time);
        if (!alive) return;
        setAvailability(a);
        // Auto-flip zone if the current pick is full but the other isn't (only on first load per slot)
        const z = a?.zones;
        if (z && z[zone]?.full && !z[zone === "indoor" ? "terrace" : "indoor"]?.full) {
          setZone(zone === "indoor" ? "terrace" : "indoor");
        }
      } catch {
        if (alive) setAvailability(null);
      }
    };
    fetchAvail();
    // Poll every 25s while the user is on the slot
    timer = setInterval(fetchAvail, 25000);
    return () => { alive = false; if (timer) clearInterval(timer); };
  }, [date, time]); // eslint-disable-line react-hooks/exhaustive-deps

  const zInfo = availability?.zones?.[zone];
  const zoneFull = !!zInfo?.full;
  const submit = async () => {
    if (!name || !phone) { setErr(lang === "fr" ? "Nom et téléphone requis" : "Name and phone required"); return; }
    setErr(null);
    setLoading(true);
    try {
      const payload = { date, time, guests, zone, name, phone, notes };
      const r = user ? await api.createReservation(payload) : await api.createGuestReservation(payload);
      setDone({ status: r.status, table_no: r.table_no || null });
      // Refresh availability after creation (the customer sees the new state if they go back)
      try { const a = await api.reservationAvailability(date, time); setAvailability(a); } catch {}
    } catch (e: any) {
      const msg = e?.message || "";
      setErr(msg || "Error");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    const isWait = done.status === "pending";
    return (
      <View style={styles.container}>
        <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space.xl }}>
          <View style={[styles.checkCircle, isWait && { backgroundColor: "#F39C12" }]}>
            <Feather name={isWait ? "clock" : "check"} size={32} color={theme.color.onBrandPrimary} />
          </View>
          <Text style={[styles.title, { marginTop: theme.space.xl, textAlign: "center" }]}>
            {isWait
              ? (lang === "fr" ? "En liste d'attente" : "Waiting list")
              : t("reservationConfirmed")}
          </Text>
          <Text style={[styles.body, { textAlign: "center", marginTop: theme.space.md }]}>
            {isWait
              ? (lang === "fr"
                ? "Toutes les tables sont prises pour ce créneau. Vous serez confirmé(e) automatiquement dès qu'une table se libère."
                : "All tables are taken for this slot. You'll be automatically confirmed as soon as a table opens up.")
              : t("seeYou")}
          </Text>
          <Text style={[styles.body, { textAlign: "center", color: theme.color.brand, marginTop: theme.space.lg }]}>
            {date} · {time} · {guests} {lang === "fr" ? "convives" : "guests"} · {zone === "indoor" ? (lang === "fr" ? "Intérieur" : "Indoor") : (lang === "fr" ? "Terrasse" : "Terrace")}
            {done.table_no ? ` · ${lang === "fr" ? "Table" : "Table"} ${done.table_no}` : ""}
          </Text>
          <Pressable testID="back-home-btn" onPress={() => { setDone(null); router.replace("/(tabs)"); }} style={[styles.submit, { marginTop: theme.space.xxl }]}>
            <Text style={styles.submitTxt}>{t("backHome")}</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  const renderZoneCard = (key: "indoor" | "terrace") => {
    const z = availability?.zones?.[key];
    const isFull = !!z?.full;
    const isSelected = zone === key;
    const label = key === "indoor"
      ? (lang === "fr" ? "Restaurant intérieur" : "Indoor restaurant")
      : (lang === "fr" ? "Terrasse" : "Terrace");
    const icon = key === "indoor" ? "home" : "sun";
    const available = z?.available ?? 0;
    const subtitle = !z
      ? "—"
      : isFull
        ? (lang === "fr"
            ? "Complet — vous pouvez rejoindre la liste d'attente"
            : "Fully booked — you can join the waiting list")
        : (lang === "fr"
            ? `${available} place${available > 1 ? "s" : ""} disponible${available > 1 ? "s" : ""}`
            : `${available} seat${available > 1 ? "s" : ""} available`);
    return (
      <Pressable
        key={key}
        testID={`zone-${key}`}
        onPress={() => setZone(key)}
        style={[styles.zoneCard, isSelected && styles.zoneCardActive, isFull && !isSelected && styles.zoneCardFull]}
      >
        <View style={styles.zoneIcon}>
          <Feather name={icon as any} size={18} color={isSelected ? theme.color.onBrandPrimary : isFull ? "#F39C12" : theme.color.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.zoneName, isFull && !isSelected && styles.zoneNameFull, isSelected && styles.zoneNameActive]}>{label}</Text>
          <Text style={[styles.zoneSub, isFull && !isSelected && styles.zoneSubFull, isSelected && isFull && { color: theme.color.onBrandPrimary }]}>{subtitle}</Text>
        </View>
        {isFull ? (
          <View style={[styles.fullTag, isSelected && { backgroundColor: theme.color.onBrandPrimary }]}>
            <Text style={[styles.fullTagTxt, isSelected && { color: theme.color.brand }]}>{lang === "fr" ? "ATTENTE" : "WAITLIST"}</Text>
          </View>
        ) : isSelected ? (
          <Feather name="check-circle" size={18} color={theme.color.onBrandPrimary} />
        ) : null}
      </Pressable>
    );
  };

  return (
    <View testID="reserve-screen" style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 160 }}>
          <View style={styles.hero}>
            <Image source={INTERIOR} style={StyleSheet.absoluteFillObject} contentFit="cover" />
            <LinearGradient colors={["rgba(5,5,5,0.35)", "rgba(5,5,5,0.95)"]} style={StyleSheet.absoluteFillObject} />
            <SafeAreaView edges={["top"]} style={{ flex: 1, padding: theme.space.xl, justifyContent: "flex-end" }}>
              <Text style={styles.eyebrow}>— RÉSERVATION</Text>
              <Text style={styles.heroTitle}>{t("bookTable")}</Text>
            </SafeAreaView>
          </View>

          <View style={{ padding: theme.space.xl }}>
            <Text style={styles.label}>{t("date")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {nextDays(14).map((d) => (
                <Pressable key={d.iso} testID={`date-${d.iso}`} onPress={() => setDate(d.iso)} style={[styles.dateChip, date === d.iso && styles.dateChipActive]}>
                  <Text style={[styles.dateDay, date === d.iso && { color: theme.color.brand }]}>{d.day}</Text>
                  <Text style={[styles.dateNum, date === d.iso && { color: theme.color.brand }]}>{d.date}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={[styles.label, { marginTop: theme.space.xl }]}>{t("time")}</Text>
            <Text style={styles.smallLabel}>{t("hoursLunch")}</Text>
            <View style={styles.timesRow}>
              {TIMES_LUNCH.map((tm) => (
                <Pressable key={tm} testID={`time-${tm}`} onPress={() => setTime(tm)} style={[styles.timeChip, time === tm && styles.timeChipActive]}>
                  <Text style={[styles.timeTxt, time === tm && { color: theme.color.brand }]}>{tm}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.smallLabel, { marginTop: theme.space.md }]}>{t("hoursDinner")}</Text>
            <View style={styles.timesRow}>
              {TIMES_DINNER.map((tm) => (
                <Pressable key={tm} testID={`time-${tm}`} onPress={() => setTime(tm)} style={[styles.timeChip, time === tm && styles.timeChipActive]}>
                  <Text style={[styles.timeTxt, time === tm && { color: theme.color.brand }]}>{tm}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { marginTop: theme.space.xl }]}>{lang === "fr" ? "ZONE" : "ZONE"}</Text>
            {renderZoneCard("indoor")}
            <View style={{ height: 8 }} />
            {renderZoneCard("terrace")}

            <Text style={[styles.label, { marginTop: theme.space.xl }]}>{t("guests")}</Text>
            <View style={styles.guestsRow}>
              <Pressable testID="guests-minus" onPress={() => setGuests(Math.max(1, guests - 1))} style={styles.guestBtn}>
                <Feather name="minus" size={16} color={theme.color.brand} />
              </Pressable>
              <Text style={styles.guestsNum}>{guests}</Text>
              <Pressable testID="guests-plus" onPress={() => setGuests(Math.min(20, guests + 1))} style={styles.guestBtn}>
                <Feather name="plus" size={16} color={theme.color.brand} />
              </Pressable>
            </View>

            <TextInput testID="res-name-input" style={styles.input} placeholder={t("name")} placeholderTextColor={theme.color.muted} value={name} onChangeText={setName} />
            <TextInput testID="res-phone-input" style={styles.input} placeholder={t("phone")} placeholderTextColor={theme.color.muted} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            <TextInput testID="res-notes-input" style={[styles.input, { height: 90, textAlignVertical: "top", paddingTop: 14 }]} placeholder={t("notes")} placeholderTextColor={theme.color.muted} value={notes} onChangeText={setNotes} multiline />

            {err && <Text style={styles.err}>{err}</Text>}

            <Pressable testID="reserve-submit-btn" onPress={submit} disabled={loading} style={[styles.submit, loading && { opacity: 0.6 }]}>
              {loading ? <ActivityIndicator color={theme.color.onBrandPrimary} /> : (
                <Text style={styles.submitTxt}>
                  {zoneFull
                    ? (lang === "fr" ? "Rejoindre la liste d'attente" : "Join waiting list")
                    : t("confirmReservation")}
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  hero: { height: 240 },
  eyebrow: { color: theme.color.brand, letterSpacing: 3, fontSize: 11, fontWeight: "700", marginBottom: 8 },
  heroTitle: { color: theme.color.onSurface, fontSize: 40, fontWeight: "300", letterSpacing: -1 },
  title: { color: theme.color.onSurface, fontSize: 28, fontWeight: "300" },
  body: { color: theme.color.onSurfaceSecondary, fontSize: 15 },
  label: { color: theme.color.onSurfaceTertiary, fontSize: 11, letterSpacing: 2, fontWeight: "700", marginBottom: 10 },
  smallLabel: { color: theme.color.muted, fontSize: 10, letterSpacing: 1, marginBottom: 8 },
  dateChip: { width: 60, height: 76, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surfaceSecondary },
  dateChipActive: { borderColor: theme.color.brand, backgroundColor: "rgba(212,175,55,0.1)" },
  dateDay: { color: theme.color.muted, fontSize: 11, letterSpacing: 1 },
  dateNum: { color: theme.color.onSurface, fontSize: 22, fontWeight: "500", marginTop: 4 },
  timesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  timeChip: { paddingHorizontal: 14, height: 36, borderRadius: 999, borderWidth: 1, borderColor: theme.color.border, alignItems: "center", justifyContent: "center" },
  timeChipActive: { borderColor: theme.color.brand, backgroundColor: "rgba(212,175,55,0.1)" },
  timeTxt: { color: theme.color.onSurfaceTertiary, fontSize: 13, fontWeight: "500" },
  zoneCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surfaceSecondary },
  zoneCardActive: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  zoneCardFull: { opacity: 0.55, borderColor: "rgba(255,255,255,0.06)" },
  zoneIcon: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: theme.color.brand, alignItems: "center", justifyContent: "center" },
  zoneName: { color: theme.color.onSurface, fontSize: 15, fontWeight: "500" },
  zoneNameActive: { color: theme.color.onBrandPrimary },
  zoneNameFull: { color: theme.color.muted },
  zoneSub: { color: theme.color.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  zoneSubFull: { color: theme.color.muted },
  fullTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: theme.color.error },
  fullTagTxt: { color: theme.color.error, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  guestsRow: { flexDirection: "row", alignItems: "center", gap: 24 },
  guestBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: theme.color.brand, alignItems: "center", justifyContent: "center" },
  guestsNum: { color: theme.color.onSurface, fontSize: 32, fontWeight: "300", minWidth: 50, textAlign: "center" },
  input: { height: 54, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, paddingHorizontal: 16, color: theme.color.onSurface, marginTop: theme.space.md, backgroundColor: "rgba(255,255,255,0.03)", fontSize: 15 },
  err: { color: theme.color.error, fontSize: 13, marginTop: theme.space.md, textAlign: "center" },
  submit: { height: 54, borderRadius: theme.radius.md, backgroundColor: theme.color.brand, alignItems: "center", justifyContent: "center", marginTop: theme.space.xl },
  submitTxt: { color: theme.color.onBrandPrimary, fontSize: 14, fontWeight: "700", letterSpacing: 1 },
  checkCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.color.brand, alignItems: "center", justifyContent: "center" },
});
