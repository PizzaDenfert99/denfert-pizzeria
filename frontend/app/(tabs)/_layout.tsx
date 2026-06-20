import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { isLoyaltyApp } from "@/src/appMode";

export default function TabsLayout() {
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const loyalty = isLoyaltyApp();
  // Ensure the tab bar always clears the Android navigation gesture bar / 3-button bar.
  // Strategy: always add a fixed 16dp "lift" ON TOP of the OS-reported bottom inset.
  // On Samsung One UI specifically, when 3-button navigation is enabled some
  // older Android versions report inset.bottom = 0 even though the nav bar
  // overlays content; the floor of 28dp on Android guarantees visibility.
  const osInset = insets.bottom;
  const extraLift = 20;
  const minAndroid = 36;
  const bottomPadding =
    Platform.OS === "android"
      ? Math.max(osInset + extraLift, minAndroid)
      : osInset + extraLift;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.brand,
        tabBarInactiveTintColor: "#857F70",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", letterSpacing: 1, marginBottom: 4 },
        tabBarStyle: {
          position: "absolute",
          borderTopWidth: 0.5,
          borderTopColor: "rgba(212,175,55,0.18)",
          backgroundColor: Platform.OS === "android" ? "rgba(10,10,10,0.96)" : "transparent",
          height: 60 + bottomPadding,
          paddingTop: 8,
          paddingBottom: bottomPadding,
          elevation: 0,
        },
        tabBarBackground: () =>
          Platform.OS !== "android" ? (
            <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(10,10,10,0.96)" }]} />
          ),
      }}
    >
      {/* HOME — on loyalty mode the tab is hidden; index.tsx itself redirects to /kiosk */}
      <Tabs.Screen
        name="index"
        options={loyalty ? { href: null } : {
          title: t("home"),
          tabBarIcon: ({ color }) => <Feather name="home" size={20} color={color} />,
          tabBarButtonTestID: "tab-home",
        }}
      />
      {/* MENU & RESERVE are customer-only — completely hidden on the loyalty tablet APK. */}
      <Tabs.Screen
        name="menu"
        options={loyalty ? { href: null } : {
          title: t("menu"),
          tabBarIcon: ({ color }) => <Feather name="book-open" size={20} color={color} />,
          tabBarButtonTestID: "tab-menu",
        }}
      />
      <Tabs.Screen
        name="reserve"
        options={loyalty ? { href: null } : {
          title: t("reserve"),
          tabBarIcon: ({ color }) => <Feather name="calendar" size={20} color={color} />,
          tabBarButtonTestID: "tab-reserve",
        }}
      />
      {/* ACCOUNT — kept on BOTH variants. On loyalty it's the customer's loyalty card lobby. */}
      <Tabs.Screen
        name="account"
        options={{
          title: loyalty ? (lang === "fr" ? "Fidélité" : "Loyalty") : t("account"),
          tabBarIcon: ({ color }) => <Feather name={loyalty ? "award" : "user"} size={20} color={color} />,
          tabBarButtonTestID: "tab-account",
        }}
      />
    </Tabs>
  );
}
