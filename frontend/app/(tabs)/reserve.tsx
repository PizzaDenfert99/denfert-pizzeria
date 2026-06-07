import React, { useState } from "react";
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

export default function Reserve() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const [date, setDate] = useState(nextDays(14)[0].iso);
  const [time, setTime] = useState("20:00");
  const [guests, setGuests] = useState(2);
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name || !phone) { setErr(lang === "fr" ? "Nom et téléphone requis" : "Name and phone required"); return; }
    setErr(null);
    setLoading(true);
    try {
      if (user) await api.createReservation({ date, time, guests, name, phone, notes });
      else await api.createGuestReservation({ date, time, guests, name, phone, notes });
      setDone(true);
    } catch (e: any) {
      setErr(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space.xl }}>
          <View style={styles.checkCircle}>
            <Feather name="check" size={32} color={theme.color.onBrandPrimary} />
          </View>
          <Text style={[styles.title, { marginTop: theme.space.xl, textAlign: "center" }]}>{t("reservationConfirmed")}</Text>
          <Text style={[styles.body, { textAlign: "center", marginTop: theme.space.md }]}>{t("seeYou")}</Text>
          <Text style={[styles.body, { textAlign: "center", color: theme.color.brand, marginTop: theme.space.lg }]}>
            {date} · {time} · {guests} {lang === "fr" ? "convives" : "guests"}
          </Text>
          <Pressable testID="back-home-btn" onPress={() => { setDone(false); router.replace("/(tabs)"); }} style={[styles.submit, { marginTop: theme.space.xxl }]}>
            <Text style={styles.submitTxt}>{t("backHome")}</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

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
                <Pressable
                  key={d.iso}
                  testID={`date-${d.iso}`}
                  onPress={() => setDate(d.iso)}
                  style={[styles.dateChip, date === d.iso && styles.dateChipActive]}
                >
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

            <Pressable testID="reserve-submit-btn" onPress={submit} disabled={loading} style={styles.submit}>
              {loading ? <ActivityIndicator color={theme.color.onBrandPrimary} /> : <Text style={styles.submitTxt}>{t("confirmReservation")}</Text>}
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
  guestsRow: { flexDirection: "row", alignItems: "center", gap: 24 },
  guestBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: theme.color.brand, alignItems: "center", justifyContent: "center" },
  guestsNum: { color: theme.color.onSurface, fontSize: 32, fontWeight: "300", minWidth: 50, textAlign: "center" },
  input: { height: 54, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, paddingHorizontal: 16, color: theme.color.onSurface, marginTop: theme.space.md, backgroundColor: "rgba(255,255,255,0.03)", fontSize: 15 },
  err: { color: theme.color.error, fontSize: 13, marginTop: theme.space.md, textAlign: "center" },
  submit: { height: 54, borderRadius: theme.radius.md, backgroundColor: theme.color.brand, alignItems: "center", justifyContent: "center", marginTop: theme.space.xl },
  submitTxt: { color: theme.color.onBrandPrimary, fontSize: 14, fontWeight: "700", letterSpacing: 1 },
  checkCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.color.brand, alignItems: "center", justifyContent: "center" },
});
