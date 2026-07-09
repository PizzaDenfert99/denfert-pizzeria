import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/auth-context";
import { api, setToken } from "@/src/api";
import { useIdleKiosk } from "@/src/useIdleKiosk";

SplashScreen.preventAutoHideAsync();

function OAuthBridge() {
  const { refresh } = useAuth();
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const m = hash.match(/session_id=([^&]+)/) || search.match(/session_id=([^&]+)/);
    if (!m) return;
    (async () => {
      try {
        const res = await api.googleSession(decodeURIComponent(m[1]));
        await setToken(res.token);
        window.history.replaceState(null, "", window.location.pathname);
        await refresh();
      } catch {}
    })();
  }, [refresh]);
  return null;
}

// Runs the global idle-watcher (only active on the loyalty subdomain).
// Must live INSIDE the router tree to use usePathname/useRouter.
function IdleKioskWatcher() {
  useIdleKiosk();
  return null;
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#050505" }}>
      <AuthProvider>
        <OAuthBridge />
        <IdleKioskWatcher />
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#050505" },
            animation: "fade",
          }}
        />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
