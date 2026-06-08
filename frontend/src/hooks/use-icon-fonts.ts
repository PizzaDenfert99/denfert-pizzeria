// Icon font loader. Uses the static .font property exported by @expo/vector-icons,
// which is a Metro require() of the bundled .ttf file. This works on every
// runtime: Expo Go, native dev builds, native production builds, and web.
//
// Why not load from a CDN? jsdelivr occasionally returns a 0-byte response
// for some icon families (notably Feather), which causes:
//   "ExpoFontLoader.loadAsync has been rejected. Font file for feather is empty."
// Bundling the .ttf instead of fetching it removes that failure mode entirely.

import { useFonts } from "expo-font";
import { Feather } from "@expo/vector-icons";

export const useIconFonts = (): readonly [boolean, Error | null] =>
  useFonts({
    ...Feather.font,
  });
