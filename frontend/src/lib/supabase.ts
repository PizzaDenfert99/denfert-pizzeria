// Supabase client for the Expo app (READ-ONLY anon access).
// • Customer code uses this to load menu, categories, settings.
// • Admin CMS web route also uses this for sign-in + writes (RLS enforces auth).
// • Service role key is NEVER imported here — it lives on the FastAPI backend only.

import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  if (!URL_ || !ANON) {
    // Defer the failure to the first call so the app boots even before env is set.
    throw new Error(
      "Supabase not configured — set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in /app/frontend/.env",
    );
  }
  _client = createClient(URL_, ANON, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return _client;
}

export const isSupabaseConfigured = () => Boolean(URL_ && ANON);

export type Category = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
};

export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  ingredients: string[];
  prices: Record<string, number>;
  image_url: string | null;
  thumbnail_url: string | null;
  category_id: string | null;
  sort_order: number;
  is_active: boolean;
};

export type RestaurantSettings = {
  id: string;
  opening_hours: Record<string, string>;
  phone: string | null;
  address: string | null;
};

// ---------- Customer (anon) read helpers ----------
export async function fetchActiveCategories(): Promise<Category[]> {
  const { data, error } = await getSupabase()
    .from("categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchActiveMenuItems(): Promise<MenuItem[]> {
  const { data, error } = await getSupabase()
    .from("menu_items")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchRestaurantSettings(): Promise<RestaurantSettings | null> {
  const { data, error } = await getSupabase()
    .from("restaurant_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
