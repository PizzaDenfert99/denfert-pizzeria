// Icon font loader + premium serif for the brand wordmark.
//
// This hook is the UNION of two prior implementations:
//   - Loyalty variant: loads @expo/vector-icons' bundled .ttf via `Feather.font`,
//     plus Playfair Display + Dancing Script from @expo-google-fonts for the
//     brand wordmark (used across the customer + loyalty apps).
//   - Customer variant: loaded icon .ttf files from a CDN under Expo Go only,
//     because Metro's asset resolver returned 0-byte files there. That path is
//     preserved below as reference — but our current builds rely on
//     @expo/vector-icons' static `.font` map which is now stable in Expo Go too.
//
// If you ever hit 0-byte icon fonts under Expo Go on Android again, uncomment
// the CDN block below and merge it into the `useFonts({...})` argument.

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

/*
// --- CDN fallback for @expo/vector-icons fonts under Expo Go (legacy) ---
// import Constants, { ExecutionEnvironment } from "expo-constants";
// const ICON_VECTOR_VERSION = "15.0.3";
// const ICON_FAMILIES = [
//   "AntDesign", "Entypo", "EvilIcons", "Feather", "FontAwesome",
//   "FontAwesome5_Brands", "FontAwesome5_Regular", "FontAwesome5_Solid",
//   "FontAwesome6_Brands", "FontAwesome6_Regular", "FontAwesome6_Solid",
//   "Fontisto", "Foundation", "Ionicons", "MaterialCommunityIcons",
//   "MaterialIcons", "Octicons", "SimpleLineIcons", "Zocial",
// ] as const;
// const cdnMap = Object.fromEntries(ICON_FAMILIES.map((f) => [
//   f,
//   `https://cdn.jsdelivr.net/npm/@expo/vector-icons@${ICON_VECTOR_VERSION}/build/vendor/react-native-vector-icons/Fonts/${f}.ttf`,
// ]));
*/

export const useIconFonts = (): readonly [boolean, Error | null] =>
  useFonts({
    ...Feather.font,
    PlayfairDisplay_500Medium,
    PlayfairDisplay_600SemiBold,
    DancingScript_500Medium,
    DancingScript_600SemiBold,
  });
