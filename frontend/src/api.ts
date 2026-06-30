import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

let _token: string | null = null;
export async function loadToken() {
  if (_token) return _token;
  _token = await AsyncStorage.getItem("@auth_token");
  return _token;
}
export async function setToken(t: string | null) {
  _token = t;
  if (t) await AsyncStorage.setItem("@auth_token", t);
  else await AsyncStorage.removeItem("@auth_token");
}

async function req(path: string, opts: RequestInit = {}) {
  const headers: any = { "Content-Type": "application/json", ...(opts.headers || {}) };
  const tok = await loadToken();
  if (tok) headers["Authorization"] = `Bearer ${tok}`;
  const r = await fetch(`${BASE}/api${path}`, { ...opts, headers });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`${r.status}: ${txt}`);
  }
  return r.json();
}

export const api = {
  otpRequest: (phone: string, name?: string) =>
    req("/auth/otp/request", { method: "POST", body: JSON.stringify({ phone, name }) }),
  otpVerify: (phone: string, code: string, name?: string) =>
    req("/auth/otp/verify", { method: "POST", body: JSON.stringify({ phone, code, name }) }),
  register: (email: string, password: string, name: string) =>
    req("/auth/register", { method: "POST", body: JSON.stringify({ email, password, name }) }),
  login: (email: string, password: string) =>
    req("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  googleSession: (session_id: string) =>
    req("/auth/google/session", { method: "POST", body: JSON.stringify({ session_id }) }),
  me: () => req("/auth/me"),
  logout: () => req("/auth/logout", { method: "POST" }),
  menu: () => req("/menu"),
  // Live sync signal — the shared backend bumps a revision counter on every
  // CMS menu write. The customer menu screen polls this every 20s and only
  // refetches the full /menu when the revision changes. Cheap & idempotent.
  menuVersion: (): Promise<{ revision: number; updated_at?: string }> => req("/menu/version"),
  createReservation: (data: any) => req("/reservations", { method: "POST", body: JSON.stringify(data) }),
  createGuestReservation: (data: any) => req("/reservations/guest", { method: "POST", body: JSON.stringify(data) }),
  myReservations: () => req("/reservations/me"),
  loyalty: () => req("/loyalty/me"),
  redeem: (reward: string) => req("/loyalty/redeem", { method: "POST", body: JSON.stringify({ reward }) }),
  adminScan: (qr_data: string) => req("/admin/scan", { method: "POST", body: JSON.stringify({ qr_data }) }),
  adminSearch: (query: string) => req("/admin/search", { method: "POST", body: JSON.stringify({ query }) }),
  adminAddPizza: (user_id: string, qr_token: string, pizza_count: number = 1, pizza_id?: string | null) =>
    req("/admin/customer/add-pizza", { method: "POST", body: JSON.stringify({ user_id, qr_token, pizza_count, pizza_id: pizza_id || null }) }),
  adminRedeem: (user_id: string, qr_token: string, reward: string) =>
    req("/admin/customer/redeem", { method: "POST", body: JSON.stringify({ user_id, qr_token, reward }) }),
  adminDashboard: (period: "today" | "week" | "month" | "all" = "all") =>
    req(`/admin/dashboard?period=${period}`),
  adminCreateStaff: (phone: string, name: string, role: string) =>
    req("/admin/staff/create", { method: "POST", body: JSON.stringify({ phone, name, role }) }),
  adminListStaff: () => req("/admin/staff"),
  adminUpdateRole: (user_id: string, role: string) =>
    req(`/admin/staff/${encodeURIComponent(user_id)}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  adminToggleDisabled: (user_id: string, disabled: boolean) =>
    req(`/admin/staff/${encodeURIComponent(user_id)}/disable`, { method: "PATCH", body: JSON.stringify({ disabled }) }),
  adminDeleteStaff: (user_id: string) =>
    req(`/admin/staff/${encodeURIComponent(user_id)}`, { method: "DELETE" }),
};

export { BASE };
