// Admin CMS — responsive Expo Router stack served on web + native.
// The entire CMS lives ONLY on the loyalty/admin variant (staff tablet).
// Any visit from the customer Pizza Denfert app is bounced to home.
import { Stack, Redirect } from "expo-router";
import React from "react";
import { isLoyaltyApp } from "@/src/appMode";

export default function AdminCmsLayout() {
  if (!isLoyaltyApp()) return <Redirect href={"/" as any} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
