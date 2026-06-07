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
  register: (email: string, password: string, name: string) =>
    req("/auth/register", { method: "POST", body: JSON.stringify({ email, password, name }) }),
  login: (email: string, password: string) =>
    req("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  googleSession: (session_id: string) =>
    req("/auth/google/session", { method: "POST", body: JSON.stringify({ session_id }) }),
  me: () => req("/auth/me"),
  logout: () => req("/auth/logout", { method: "POST" }),
  menu: () => req("/menu"),
  createReservation: (data: any) => req("/reservations", { method: "POST", body: JSON.stringify(data) }),
  createGuestReservation: (data: any) => req("/reservations/guest", { method: "POST", body: JSON.stringify(data) }),
  myReservations: () => req("/reservations/me"),
  loyalty: () => req("/loyalty/me"),
  addPurchase: (pizza_count: number) => req("/loyalty/add-purchase", { method: "POST", body: JSON.stringify({ pizza_count }) }),
  redeem: (reward: string) => req("/loyalty/redeem", { method: "POST", body: JSON.stringify({ reward }) }),
};

export { BASE };
