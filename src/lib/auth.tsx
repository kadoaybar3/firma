import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { DEMO_PASSWORD, demoUsers } from "../data/seed";
import type { AppUser, Role } from "./types";
import { isSupabaseConfigured } from "./supabase";

/**
 * OTURUM KATMANI
 *
 * Gerçek kimlik doğrulama henüz yapılandırılmadı (Supabase erişim bilgileri yok).
 * Bu katman DEMO GİRİŞ sağlar: önceden tanımlı örnek hesaplar + "demo" parolası.
 *
 * GÜVENLİK NOTU: Demo mod salt uçbirim tarafındadır; yetki sınırı arayüzde uygulanır.
 * Üretimde şu korunumlar devreye alınacak (migration'lar hazır):
 *  - Supabase Auth (e-posta/şifre + rol profil tablosu)
 *  - Row Level Security politikaları (temsilci yalnız kendi kayıtları)
 */

const SESSION_KEY = "firma-rehberi.session.v1";

interface Session {
  userId: string;
}

export interface AuthState {
  user: AppUser | null;
  login: (email: string, password: string) => { ok: boolean; error?: string };
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(() => {
    if (isSupabaseConfigured) return null; // Gerçek auth entegrasyonunda burada Supabase oturumu kontrol edilir
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw) as Session;
      return demoUsers().find((u) => u.id === session.userId) ?? null;
    } catch {
      return null;
    }
  });

  const login = useCallback((email: string, password: string) => {
    if (isSupabaseConfigured) {
      return {
        ok: false,
        error:
          "Gerçek kimlik doğrulama entegrasyonu bu sürümde devre dışı. Lütfen Supabase bilgilerini yapılandırın.",
      };
    }
    const found = demoUsers().find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!found) return { ok: false, error: "Bu e-posta kayıtlı değil. Demo hesapları deneyin." };
    if (password !== DEMO_PASSWORD) return { ok: false, error: "Şifre hatalı (demo şifresi: demo)" };
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: found.id } satisfies Session));
    setUser(found);
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    // Oturum değişince diğer sekmeleri uyumlu tut
    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_KEY) {
        try {
          const session = e.newValue ? (JSON.parse(e.newValue) as Session) : null;
          setUser(session ? (demoUsers().find((u) => u.id === session.userId) ?? null) : null);
        } catch {
          /* yoksay */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, login, logout, isAdmin: user?.role === "admin" }),
    [user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth, AuthProvider içinde kullanılmalıdır.");
  return ctx;
}

/** Oturum kuralına göre panellerin actor bilgisi */
export function useActor(): { userId?: string; role: Role | "sistem"; repId?: string } {
  const { user } = useAuth();
  if (!user) return { role: "sistem" };
  return { userId: user.id, role: user.role, repId: user.repId };
}
