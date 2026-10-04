// Drop-in replacement for `import { VideoView, useVideoPlayer } from "expo-video"`.
//
// expo-video is a native module that was added AFTER the 1.3.0 production
// binaries were built. Importing it directly throws at module-evaluation time
// on those binaries ("Cannot find native module 'ExpoVideo'"), and because
// expo-router evaluates every route module at startup, that would take down
// the whole app — not just the kiosk/ads screens — when the bundle is
// delivered as an OTA update.
//
// So: only require expo-video when its native module is actually present
// (always the case on web, and on any binary built with expo-video). On older
// binaries we fall back to an empty View + a no-op player, so video slides
// render as their background color/overlay instead of crashing.
import React from "react";
import { Platform, View } from "react-native";
import { requireOptionalNativeModule } from "expo";

type ExpoVideo = typeof import("expo-video");

let mod: ExpoVideo | null = null;
if (Platform.OS === "web" || requireOptionalNativeModule("ExpoVideo")) {
  try {
    mod = require("expo-video");
  } catch {
    mod = null;
  }
}

export const videoAvailable = mod !== null;

const noopPlayer: any = { loop: false, muted: false, play() {}, pause() {}, release() {} };

// `mod` is fixed for the lifetime of the JS runtime, so which hook
// implementation runs never changes between renders.
export const useVideoPlayer: ExpoVideo["useVideoPlayer"] = mod
  ? mod.useVideoPlayer
  : ((() => noopPlayer) as any);

export const VideoView: ExpoVideo["VideoView"] = mod
  ? mod.VideoView
  : ((({ style, pointerEvents }: any) => <View style={style} pointerEvents={pointerEvents} />) as any);
