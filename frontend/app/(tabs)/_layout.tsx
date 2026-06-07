import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { theme } from "@/src/theme";
import { useI18n } from "@/src/i18n";

export default function TabsLayout() {
  const { t } = useI18n();
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
          height: 78,
          paddingTop: 8,
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
      <Tabs.Screen
        name="index"
        options={{
          title: t("home"),
          tabBarIcon: ({ color }) => <Feather name="home" size={20} color={color} />,
          tabBarButtonTestID: "tab-home",
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: t("menu"),
          tabBarIcon: ({ color }) => <Feather name="book-open" size={20} color={color} />,
          tabBarButtonTestID: "tab-menu",
        }}
      />
      <Tabs.Screen
        name="reserve"
        options={{
          title: t("reserve"),
          tabBarIcon: ({ color }) => <Feather name="calendar" size={20} color={color} />,
          tabBarButtonTestID: "tab-reserve",
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t("account"),
          tabBarIcon: ({ color }) => <Feather name="user" size={20} color={color} />,
          tabBarButtonTestID: "tab-account",
        }}
      />
    </Tabs>
  );
}
