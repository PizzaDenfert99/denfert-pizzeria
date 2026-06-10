import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, ScrollView, Platform, KeyboardAvoidingView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getSupabase, isSupabaseConfigured } from "@/src/lib/supabase";
import { theme } from "@/src/theme";

export default function AdminCmsLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // If a session already exists and the user is in `admins`, jump straight to dashboard.
  useEffect(() => {
    (async () => {
      if (!isSupabaseConfigured()) { setBootLoading(false); return; }
      try {
        const sb = getSupabase();
        const { data: { user } } = await sb.auth.getUser();
        if (user) {
          const { data: adminRow } = await sb.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
          if (adminRow) router.replace("/admin-cms/dashboard");
        }
      } catch {}
      setBootLoading(false);
    })();
  }, [router]);

  const submit = async () => {
    setErr(null);
    if (!isSupabaseConfigured()) {
      setErr("Supabase env vars missing — see /app/SUPABASE_SETUP.md");
      return;
    }
    setLoading(true);
    try {
      const sb = getSupabase();
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      // verify admin membership
      const { data: adminRow, error: adminErr } = await sb
        .from("admins").select("user_id").eq("user_id", data.user!.id).maybeSingle();
      if (adminErr || !adminRow) {
        await sb.auth.signOut();
        throw new Error("Not an admin");
      }
      router.replace("/admin-cms/dashboard");
    } catch (e: any) {
      setErr(e?.message || "Sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  if (bootLoading) return <View style={s.container}><ActivityIndicator color={theme.color.brand} style={{ flex: 1 }} /></View>;

  return (
    <View testID="cms-login" style={s.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 28, paddingTop: 80, maxWidth: 460, width: "100%", alignSelf: "center" }}>
            <View style={s.shield}><Feather name="settings" size={28} color={theme.color.brand} /></View>
            <Text style={s.eyebrow}>— CMS · MENU & CONTENU</Text>
            <Text style={s.title}>Pizza Denfert{"\n"}Admin</Text>
            <Text style={s.sub}>Connexion propriétaire / staff</Text>
            <TextInput testID="cms-email" style={s.input} placeholder="Email" placeholderTextColor={theme.color.muted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
            <TextInput testID="cms-password" style={s.input} placeholder="Mot de passe" placeholderTextColor={theme.color.muted} secureTextEntry value={password} onChangeText={setPassword} />
            {err && <Text style={s.err}>{err}</Text>}
            <Pressable testID="cms-submit" onPress={submit} disabled={loading} style={s.btn}>
              {loading ? <ActivityIndicator color={theme.color.onBrandPrimary} /> : <Text style={s.btnTxt}>Connexion sécurisée</Text>}
            </Pressable>
            <Pressable onPress={() => router.replace("/")}><Text style={s.linkBack}>← Retour au site</Text></Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  shield: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: theme.color.brand, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(212,175,55,0.08)", marginBottom: 22 },
  eyebrow: { color: theme.color.brand, letterSpacing: 3, fontSize: 11, fontWeight: "700", marginBottom: 6 },
  title: { color: theme.color.onSurface, fontSize: 32, fontWeight: "300", letterSpacing: -1, lineHeight: 36 },
  sub: { color: theme.color.onSurfaceTertiary, fontSize: 14, marginTop: 8, fontStyle: "italic", marginBottom: 24 },
  input: { height: 54, borderRadius: 12, borderWidth: 1, borderColor: theme.color.border, paddingHorizontal: 16, color: theme.color.onSurface, marginBottom: 12, backgroundColor: "rgba(255,255,255,0.04)", fontSize: 15 },
  err: { color: theme.color.error, fontSize: 13, marginBottom: 12, textAlign: "center" },
  btn: { height: 54, borderRadius: 12, backgroundColor: theme.color.brand, alignItems: "center", justifyContent: "center", marginTop: 8 },
  btnTxt: { color: theme.color.onBrandPrimary, fontWeight: "700", letterSpacing: 1, fontSize: 14 },
  linkBack: { color: theme.color.onSurfaceTertiary, textAlign: "center", marginTop: 18, fontSize: 13 },
});
