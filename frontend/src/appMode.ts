// App mode detection — branches behaviour based on the host we're served from
// (web) or the build variant baked into the APK (native).
//
// WEB
//   * pizzadenfert.fr / admin.pizzadenfert.fr → "main"
//   * loyalty.pizzadenfert.fr                  → "loyalty"
//
// NATIVE (iOS / Android)
//   * APK built with `eas build --profile production-loyalty-apk`
//     (sets env APP_VARIANT=loyalty → app.config.ts injects extra.variant)
//                                              → "loyalty"
//   * Any other native build (main customer APK)
//                                              → "main"
//
// The same JS bundle ships for both variants; only the entitlement check
// here decides which routes / UI surface the user can reach at runtime.

import { Platform } from "react-native";
import Constants from "expo-constants";

export type AppMode = "main" | "loyalty";

function nativeVariantFromBuildConfig(): AppMode {
  // Order of precedence: typed config → manifest (legacy) → default main
  const fromExpoConfig = (Constants.expoConfig as any)?.extra?.variant;
  const fromManifest = (Constants as any)?.manifest?.extra?.variant;
  const v = (fromExpoConfig || fromManifest || "main") as string;
  return v === "loyalty" ? "loyalty" : "main";
}

export function getAppMode(): AppMode {
  if (Platform.OS !== "web") return nativeVariantFromBuildConfig();
  if (typeof window === "undefined" || !window.location?.hostname) return "main";
  const host = window.location.hostname;
  if (host === "loyalty.pizzadenfert.fr") return "loyalty";
  return "main";
}

export const isLoyaltyApp = () => getAppMode() === "loyalty";
export const isMainApp = () => getAppMode() === "main";
