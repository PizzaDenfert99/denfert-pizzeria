// App mode detection — branches behaviour based on the host we're served from.
// All three subdomains serve the SAME Expo bundle; Nginx restricts which routes
// are reachable on each, but the JS still needs to know which experience to render.

import { Platform } from "react-native";

export type AppMode = "main" | "loyalty";

export function getAppMode(): AppMode {
  if (Platform.OS !== "web") return "loyalty"; // native build is the loyalty/kiosk app
  if (typeof window === "undefined" || !window.location?.hostname) return "main";
  const host = window.location.hostname;
  if (host === "loyalty.pizzadenfert.fr") return "loyalty";
  return "main";
}

export const isLoyaltyApp = () => getAppMode() === "loyalty";
export const isMainApp = () => getAppMode() === "main";
