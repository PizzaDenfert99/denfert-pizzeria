// Expo dynamic configuration.
//
// Reads /app/frontend/app.json as the base (main customer app), then layers
// loyalty-only overrides when the env var APP_VARIANT=loyalty is set at
// `eas build` time (or `eas build --profile production-loyalty-apk`).
//
// Two distinct APKs come out of the SAME codebase:
//   * MAIN  (default)  → name "Pizza Denfert"          package = whatever EAS picked previously
//                         (NO override here — we keep the existing package ID intact
//                          so over-the-air updates to the customer APK continue to work)
//   * LOYALTY            → name "Pizza Denfert · Fidélité" package fr.pizzadenfert.loyalty
//
// Runtime detection: src/appMode.ts reads Constants.expoConfig?.extra?.variant
// to pick the right route gating for the native build (web still uses the
// hostname-based detection in the same file).

import type { ExpoConfig, ConfigContext } from "expo/config";
const base = require("./app.json").expo as ExpoConfig;

type Variant = "main" | "loyalty";

const variant: Variant = (process.env.APP_VARIANT === "loyalty" ? "loyalty" : "main");

export default ({ config: _c }: ConfigContext): ExpoConfig => {
  if (variant === "loyalty") {
    return {
      ...base,
      name: "Pizza Denfert · Fidélité",
      android: {
        ...(base.android || {}),
        package: "fr.pizzadenfert.loyalty",
      },
      ios: {
        ...(base.ios || {}),
        bundleIdentifier: "fr.pizzadenfert.loyalty",
      },
      extra: {
        ...(base.extra || {}),
        variant: "loyalty",
        buildLabel: "loyalty",
      },
    };
  }

  // MAIN: pass through app.json unchanged, only add the variant marker.
  return {
    ...base,
    extra: {
      ...(base.extra || {}),
      variant: "main",
      buildLabel: "main",
    },
  };
};
