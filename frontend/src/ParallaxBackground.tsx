// Full-bleed decorative background behind a screen's scrollable content, with
// a parallax lag: it shifts at a fraction of the scroll speed instead of
// staying pinned or scrolling 1:1, giving a sense of depth (Instagram/Spotify
// style). Render it as the FIRST child of a `position: relative` (RN default),
// `overflow: hidden` container, followed by the screen's real content — then
// wire that container's ScrollView/FlatList `onScroll` to the same `scrollY`
// Animated.Value via `Animated.event(..., { useNativeDriver: true })`.
import React from "react";
import { Animated, StyleSheet } from "react-native";
import { Image } from "expo-image";

// Extra travel room (px) above/below the viewport so the parallax shift never
// exposes a transparent edge, and the scroll distance (px) over which the
// shift ramps up to that room before clamping.
const BUFFER = 160;
const SPEED = 0.28;

export function ParallaxBackground({ imageUrl, scrollY }: { imageUrl: string; scrollY: Animated.Value }) {
  const translateY = scrollY.interpolate({
    inputRange: [-BUFFER / SPEED, 0, BUFFER / SPEED],
    outputRange: [BUFFER, 0, -BUFFER],
    extrapolate: "clamp",
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, { top: -BUFFER, bottom: -BUFFER, transform: [{ translateY }] }]}
    >
      <Image source={{ uri: imageUrl }} style={{ flex: 1 }} contentFit="cover" />
    </Animated.View>
  );
}
