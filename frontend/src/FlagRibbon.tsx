import React from "react";
import { View, StyleSheet } from "react-native";

// Small diagonal ribbon banners flanking the "Pizza Denfert" hero title —
// a French tricolor on the left, an Italian tricolor on the right, each with
// a pointed pennant tail + a darker "fold" triangle at the base for depth.
// Pure View/border shapes (no SVG, no images) so this ships as a plain JS/
// asset change via EAS Update — no new native module, no rebuild needed.

type Side = "left" | "right";
type Flag = "fr" | "it";

const FLAGS: Record<Flag, [string, string, string]> = {
  fr: ["#00267F", "#FFFFFF", "#ED2939"],
  it: ["#008C45", "#F4F5F0", "#CD212A"],
};

const BODY_W = 42;
const BODY_H = 18;
const TAIL_W = 12;

function shade(hex: string, amt: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp((n >> 16) + Math.round(255 * amt));
  const g = clamp(((n >> 8) & 0xff) + Math.round(255 * amt));
  const b = clamp((n & 0xff) + Math.round(255 * amt));
  return `rgb(${r},${g},${b})`;
}

export function FlagRibbon({ flag, side }: { flag: Flag; side: Side }) {
  const colors = FLAGS[flag];
  const tailColor = colors[2];
  const foldColor = shade(tailColor, -0.38);
  const rotation = side === "left" ? "-12deg" : "12deg";

  const body = (
    <View style={[styles.body, { width: BODY_W, height: BODY_H }]}>
      {colors.map((c, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: c }} />
      ))}
    </View>
  );

  const tail = (
    <View
      style={[
        styles.triangle,
        side === "left"
          ? { borderTopWidth: BODY_H / 2, borderBottomWidth: BODY_H / 2, borderRightWidth: TAIL_W, borderRightColor: tailColor }
          : { borderTopWidth: BODY_H / 2, borderBottomWidth: BODY_H / 2, borderLeftWidth: TAIL_W, borderLeftColor: tailColor },
      ]}
    />
  );

  const fold = (
    <View
      style={[
        styles.triangle,
        styles.fold,
        side === "left"
          ? { borderTopWidth: BODY_H / 4, borderBottomWidth: BODY_H / 4, borderRightWidth: TAIL_W * 0.6, borderRightColor: foldColor, left: BODY_W - 2 }
          : { borderTopWidth: BODY_H / 4, borderBottomWidth: BODY_H / 4, borderLeftWidth: TAIL_W * 0.6, borderLeftColor: foldColor, right: BODY_W - 2 },
      ]}
    />
  );

  return (
    <View style={[styles.wrap, { transform: [{ rotate: rotation }] }]}>
      {fold}
      <View style={styles.row}>
        {side === "left" ? tail : body}
        {side === "left" ? body : tail}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: BODY_W + TAIL_W,
    height: BODY_H,
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  body: {
    flexDirection: "row",
    borderRadius: 1.5,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  triangle: {
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  fold: {
    position: "absolute",
    top: "50%",
    marginTop: -(BODY_H / 4),
    zIndex: -1,
  },
});
