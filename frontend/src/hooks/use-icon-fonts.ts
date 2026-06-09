// Icon font loader + premium serif for the brand wordmark.
// Uses the static .font property from @expo/vector-icons (bundled .ttf, no CDN).
// Playfair Display is loaded from @expo-google-fonts — a serif used by many
// French and Italian fine-dining restaurants. Loaded once at startup so the
// brand wordmark renders consistently across Expo Go, dev and production builds.

import { useFonts } from "expo-font";
import { Feather } from "@expo/vector-icons";
import {
  PlayfairDisplay_500Medium,
  PlayfairDisplay_600SemiBold,
} from "@expo-google-fonts/playfair-display";
import {
  DancingScript_500Medium,
  DancingScript_600SemiBold,
} from "@expo-google-fonts/dancing-script";

export const useIconFonts = (): readonly [boolean, Error | null] =>
  useFonts({
    ...Feather.font,
    PlayfairDisplay_500Medium,
    PlayfairDisplay_600SemiBold,
    DancingScript_500Medium,
    DancingScript_600SemiBold,
  });
