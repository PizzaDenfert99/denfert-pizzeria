import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setToken, loadToken } from "./api";

type User = { user_id: string; email: string; name: string; loyalty_points?: number; is_admin?: boolean; picture?: string } | null;

interface AuthCtx {
  user: User;
  loading: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signInGoogleSession: (session_id: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({} as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const tok = await loadToken();
      if (!tok) { setUser(null); return; }
      const me = await api.me();
      setUser(me);
    } catch {
      await setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const signInEmail = async (email: string, password: string) => {
    const res = await api.login(email, password);
    await setToken(res.token);
    setUser(res.user);
  };
  const signUp = async (email: string, password: string, name: string) => {
    const res = await api.register(email, password, name);
    await setToken(res.token);
    setUser(res.user);
  };
  const signInGoogleSession = async (session_id: string) => {
    const res = await api.googleSession(session_id);
    await setToken(res.token);
    setUser(res.user);
  };
  const signOut = async () => {
    try { await api.logout(); } catch {}
    await setToken(null);
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, signInEmail, signUp, signInGoogleSession, signOut, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
