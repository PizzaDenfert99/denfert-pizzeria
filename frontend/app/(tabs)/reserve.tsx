import React, { useState, useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { useI18n } from "@/src/i18n";
import { theme } from "@/src/theme";
import { ParallaxBackground } from "@/src/ParallaxBackground";
import { useBackgroundImage } from "@/src/hooks/use-background-image";

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

const WAIT_COLOR = "#F39C12";
const DAYS_LONG = {
  fr: ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};
const MONTHS_LONG = {
  fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

function formatLongDate(iso: string, lang: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return lang === "fr"
    ? `${DAYS_LONG.fr[dt.getDay()]} ${d} ${MONTHS_LONG.fr[m - 1]}`
    : `${DAYS_LONG.en[dt.getDay()]}, ${MONTHS_LONG.en[m - 1]} ${d}`;
}

type SuccessProps = {
  status: "confirmed" | "pending";
  tableNo: string | null;
  date: string;
  time: string;
  guests: number;
  zone: "indoor" | "terrace";
  onBackHome: () => void;
};

function ReservationSuccess({ status, tableNo, date, time, guests, zone, onBackHome }: SuccessProps) {
  const { t, lang } = useI18n();
  const fr = lang === "fr";
  const isWait = status === "pending";
  const accent = isWait ? WAIT_COLOR : theme.color.brand;

  const badge = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const heading = useRef(new Animated.Value(0)).current;
  const card = useRef(new Animated.Value(0)).current;
  const action = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    const all = [badge, heading, card, action];
    const fadeUp = (v: Animated.Value) =>
      Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    const run = (reduceMotion: boolean) => {
      if (!alive) return;
      if (reduceMotion) { all.forEach((v) => v.setValue(1)); return; }
      Animated.parallel([
        Animated.spring(badge, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(250),
          Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.sequence([Animated.delay(150), Animated.stagger(110, [heading, card, action].map(fadeUp))]),
      ]).start();
    };
    AccessibilityInfo.isReduceMotionEnabled().then(run).catch(() => run(false));
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rise = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
  });

  const rows: { key: string; icon: string; label: string; value: string }[] = [
    { key: "date", icon: "calendar", label: t("date"), value: formatLongDate(date, lang) },
    { key: "time", icon: "clock", label: t("time"), value: time },
    {
      key: "guests", icon: "users", label: t("guests"),
      value: `${guests} ${fr ? (guests > 1 ? "personnes" : "personne") : (guests > 1 ? "guests" : "guest")}`,
    },
    {
      key: "zone", icon: zone === "indoor" ? "home" : "sun", label: "Zone",
      value: zone === "indoor" ? (fr ? "Intérieur" : "Indoor") : (fr ? "Terrasse" : "Terrace"),
    },
  ];
  const showTable = !!tableNo || isWait;

  return (
    <View testID="reserve-success" style={styles.container}>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.successScroll}>
          <View style={styles.successInner}>
            <View style={styles.badgeWrap}>
              <Animated.View
                style={[styles.haloOuter, { backgroundColor: accent, opacity: badge.interpolate({ inputRange: [0, 1], outputRange: [0, 0.08] }), transform: [{ scale: Animated.add(badge, Animated.multiply(pulse, 0.12)) }] }]}
              />
              <Animated.View
                style={[styles.haloInner, { backgroundColor: accent, opacity: badge.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16] }), transform: [{ scale: badge }] }]}
              />
              <Animated.View
                style={[styles.checkCircle, { backgroundColor: accent, shadowColor: accent, opacity: badge.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1] }), transform: [{ scale: badge.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}
              >
                <Feather name={isWait ? "clock" : "check"} size={32} color={theme.color.onBrandPrimary} />
              </Animated.View>
            </View>

            <Animated.View style={[{ alignItems: "center" }, rise(heading)]}>
              <Text style={[styles.eyebrow, { color: accent, marginTop: theme.space.xl }]}>— RÉSERVATION</Text>
              <Text style={[styles.title, { textAlign: "center" }]}>
                {isWait ? (fr ? "En liste d'attente" : "Waiting list") : t("reservationConfirmed")}
              </Text>
              <Text style={[styles.body, styles.successSub]}>
                {isWait
                  ? (fr
                    ? "Toutes les tables sont prises pour ce créneau. Vous serez confirmé(e) automatiquement dès qu'une table se libère."
                    : "All tables are taken for this slot. You'll be automatically confirmed as soon as a table opens up.")
                  : t("seeYou")}
              </Text>
            </Animated.View>

            <Animated.View testID="reservation-details-card" style={[styles.detailCard, rise(card)]}>
              <View style={[styles.detailAccent, { backgroundColor: accent }]} />
              {rows.map((r, i) => (
                <View key={r.key} style={[styles.detailRow, i > 0 && styles.detailDivider]}>
                  <View style={[styles.zoneIcon, { borderColor: accent }]}>
                    <Feather name={r.icon as any} size={16} color={accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>{r.label.toUpperCase()}</Text>
                    <Text style={styles.detailValue}>{r.value}</Text>
                  </View>
                </View>
              ))}
              {showTable && (
                <View style={[styles.detailRow, styles.detailDivider]}>
                  <View style={[styles.zoneIcon, { borderColor: accent }]}>
                    <Feather name="hash" size={16} color={accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>TABLE</Text>
                    {!tableNo && (
                      <Text style={[styles.detailValue, { color: theme.color.onSurfaceTertiary }]}>
                        {fr ? "En attente d'attribution" : "Awaiting assignment"}
                      </Text>
                    )}
                  </View>
                  {!!tableNo && (
                    <View style={[styles.tablePill, { borderColor: accent }]}>
                      <Text style={[styles.tablePillTxt, { color: accent }]}>{tableNo}</Text>
                    </View>
                  )}
                </View>
              )}
            </Animated.View>

            <Animated.View style={[{ alignSelf: "stretch" }, rise(action)]}>
              <Pressable testID="back-home-btn" onPress={onBackHome} style={[styles.submit, { marginTop: theme.space.xxl }]}>
                <Text style={styles.submitTxt}>{t("backHome").toUpperCase()}</Text>
              </Pressable>
            </Animated.View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

export default function Reserve() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const bgUrl = useBackgroundImage("bg_reservations_url");
  const scrollY = useRef(new Animated.Value(0)).current;
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
    return (
      <ReservationSuccess
        status={done.status}
        tableNo={done.table_no}
        date={date}
        time={time}
        guests={guests}
        zone={zone}
        onBackHome={() => { setDone(null); router.replace("/(tabs)"); }}
      />
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
    <View testID="reserve-screen" style={[styles.container, bgUrl ? { backgroundColor: "transparent" } : null]}>
      {!!bgUrl && (
        <>
          <ParallaxBackground imageUrl={bgUrl} scrollY={scrollY} />
          {/* The background photo alone was too bright/clear behind the form —
              a flat scrim (same ~0.6 dark strength used elsewhere in this app,
              e.g. the auth screen's photo backdrop) keeps the counters/inputs
              readable without hiding the parallax effect entirely. */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(5,5,5,0.6)" }]} />
        </>
      )}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Animated.ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 160 }}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
        >
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
        </Animated.ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface, overflow: "hidden" },
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
  successScroll: { flexGrow: 1, alignItems: "center", paddingHorizontal: theme.space.xl, paddingTop: theme.space.xxl, paddingBottom: 140 },
  successInner: { width: "100%", maxWidth: 440, alignItems: "center" },
  successSub: { textAlign: "center", marginTop: theme.space.md, color: theme.color.onSurfaceTertiary, lineHeight: 22 },
  badgeWrap: { width: 148, height: 148, alignItems: "center", justifyContent: "center" },
  haloOuter: { position: "absolute", width: 148, height: 148, borderRadius: 74 },
  haloInner: { position: "absolute", width: 112, height: 112, borderRadius: 56 },
  checkCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.color.brand, alignItems: "center", justifyContent: "center", shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  detailCard: { alignSelf: "stretch", marginTop: theme.space.xxl, paddingHorizontal: theme.space.lg, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surfaceSecondary, overflow: "hidden" },
  detailAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 2, opacity: 0.8 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  detailDivider: { borderTopWidth: 1, borderTopColor: theme.color.border },
  detailLabel: { color: theme.color.muted, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  detailValue: { color: theme.color.onSurface, fontSize: 16, fontWeight: "500", marginTop: 3 },
  tablePill: { minWidth: 44, height: 32, paddingHorizontal: 12, borderRadius: theme.radius.pill, borderWidth: 1, backgroundColor: "rgba(212,175,55,0.1)", alignItems: "center", justifyContent: "center" },
  tablePillTxt: { fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },
});
