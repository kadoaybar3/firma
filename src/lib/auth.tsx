import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { DEMO_PASSWORD, demoUsers } from "../data/seed";
import type { AppUser, Role } from "./types";
import { isSupabaseConfigured, supabase } from "./supabase";
import { loadSnapshot, flushNow } from "./dataSource";
import { applySnapshot } from "./repo";

/**
 * OTURUM KATMANI
 *
 * DEMO MOD (Supabase yapılandırılmamış): önceden tanımlı örnek hesaplar +
 * "demo" parolası. Oturum yalnızca tarayıcı hafızasındadır; yetki sınırı
 * arayüzde uygulanır.
 *
 * SUPABASE MOD (.env dolu): gerçek Auth — signInWithPassword + profiles
 * tablosundaki rol haritası (1-1 auth.users; admin biri tarafından SQL ile
 * yükseltilir). Oturum açılınca rolün RLS yetkisine göre tüm tablolar
 * yeniden okunur (hydrate) ve panel verisi tam görüntü olur.
 *
 * GÜVENLİK NOTU: yetkilendirme sunucuda RLS ile tasdiklenir; istemcideki rol
 * yalnızca arayüz yönlendirmesi içindir. service_role anahtarı asla istemcide
 * bulunmaz.
 */

const SESSION_KEY = "firma-rehberi.session.v1";

interface Session {
  userId: string;
}

/** Uygulamanın açılış fazı: Supabase modunda hydrate tamamlanana kadar "booting". */
export type AuthPhase = "booting" | "ready" | "error";

export interface AuthState {
  user: AppUser | null;
  phase: AuthPhase;
  bootError: string | null;
  login: (
    identifier: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string; role?: Role }>;
  logout: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

/* ---------- Supabase yardımcıları ---------- */

type ProfileRow = { full_name: string; role: string; sales_rep_id: string | null };

const PROFILE_COLS = "full_name, role, sales_rep_id";

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-posta veya şifre hatalı.";
  if (m.includes("email not confirmed")) return "E-posta adresi henüz doğrulanmamış.";
  if (m.includes("too many requests") || m.includes("rate limit"))
    return "Çok fazla deneme; lütfen bir süre sonra tekrar deneyin.";
  if (m.includes("fetch") || m.includes("network")) return "Ağ hatası; bağlantınızı kontrol edin.";
  return message;
}

/** Telefonu karşılaştırma anahtarına indirger; importLib phoneKey ile aynı. */
function phoneKey(raw: string): string {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 12 && digits.startsWith("90")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

/**
 * auth.users oturumunu profiles satırına haritalar. Profil yoksa (ilk giriş)
 * RLS "self insert temsilci" politikasıyla kendi satırını açar; admin daha
 * sonra SQL ile role='admin' yapar ve rep bağlar.
 */
async function profileToUser(): Promise<AppUser | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  const u = data.user;

  const got = await supabase.from("profiles").select(PROFILE_COLS).eq("id", u.id).maybeSingle();
  if (got.error) throw new Error(`Profil okunamadı: ${got.error.message}`);
  let prof = (got.data as ProfileRow | null) ?? null;

  if (!prof) {
    const ins = await supabase
      .from("profiles")
      .insert({
        id: u.id,
        full_name: (u.email ?? "").split("@")[0],
        role: "temsilci",
        sales_rep_id: null,
      })
      .select(PROFILE_COLS)
      .single();
    if (ins.error) throw new Error(`Profil oluşturulamadı: ${ins.error.message}`);
    prof = ins.data as ProfileRow;
  }

  const role: Role = prof.role === "admin" ? "admin" : "temsilci";
  return {
    id: u.id,
    name: prof.full_name?.trim() || (u.email ?? "").split("@")[0],
    email: u.email ?? "",
    role,
    repId: prof.sales_rep_id ?? undefined,
  };
}

/** Oturumun RLS yetkisine göre tüm tabloları okuyup repo'ya devreder. */
async function hydrateFromSupabase(): Promise<void> {
  const { db } = await loadSnapshot();
  applySnapshot(db);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(() => {
    if (isSupabaseConfigured) return null; // bootstrap effect doldurur
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw) as Session;
      return demoUsers().find((u) => u.id === session.userId) ?? null;
    } catch {
      return null;
    }
  });
  const [phase, setPhase] = useState<AuthPhase>(isSupabaseConfigured ? "booting" : "ready");
  const [bootError, setBootError] = useState<string | null>(null);

  /* Bootstrap: Supabase modunda oturumu geri yükle + hydrate et. */
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    (async () => {
      try {
        const u = await profileToUser();
        // Anonim ziyaretçi dahil HER durumda görüntü yüklenir; RLS anonime
        // yalnızca kamu verisini (kategoriler/şehirler/yayınlanmış firmalar)
        // döndürür. Oturum varsa satır kümesi rolün yetkisiyle genişler.
        await hydrateFromSupabase();
        if (!alive) return;
        setUser(u);
        setPhase("ready");
      } catch (e) {
        if (!alive) return;
        setBootError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const value = identifier.trim();
    const isEmail = value.includes("@");
    if (!isEmail && phoneKey(value).length < 10) {
      return { ok: false, error: "Geçerli bir e-posta veya telefon numarası girin." };
    }
    if (!isSupabaseConfigured || !supabase) {
      if (!isEmail) return { ok: false, error: "Demo modda telefonla giriş yoktur; e-posta kullanın." };
      const found = demoUsers().find((u) => u.email.toLowerCase() === value.toLowerCase());
      if (!found) return { ok: false, error: "Bu e-posta kayıtlı değil. Demo hesapları deneyin." };
      if (password !== DEMO_PASSWORD) return { ok: false, error: "Şifre hatalı (demo şifresi: demo)" };
      localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: found.id } satisfies Session));
      setUser(found);
      return { ok: true, role: found.role };
    }
    try {
      if (isEmail) {
        const { error } = await supabase.auth.signInWithPassword({ email: value, password });
        if (error) return { ok: false, error: friendlyAuthError(error.message) };
      } else {
        // Telefon → e-posta eşleştirmesi ve şifre doğrulaması sunucuda yapılır;
        // yalnızca oturum tokenları döner (SMS/OTP gerekmez).
        const res = await fetch("/api/phone-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: value, password }),
        });
        const payload = (await res.json().catch(() => ({}))) as {
          message?: string;
          access_token?: string;
          refresh_token?: string;
        };
        if (!res.ok || !payload.access_token || !payload.refresh_token) {
          return { ok: false, error: payload.message || "Telefon veya şifre hatalı." };
        }
        const { error } = await supabase.auth.setSession({
          access_token: payload.access_token,
          refresh_token: payload.refresh_token,
        });
        if (error) return { ok: false, error: "Oturum açılamadı; tekrar deneyin." };
      }
      const u = await profileToUser();
      if (!u) return { ok: false, error: "Oturum açıldı ancak profil bilgisi alınamadı." };
      await flushNow(); // giriş öncesi bekleyen yazım varsa önce sunucuya gitsin
      await hydrateFromSupabase(); // rolün RLS yetkisinde tam görüntü
      setUser(u);
      return { ok: true, role: u.role };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Giriş başarısız." };
    }
  }, []);

  const logout = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      localStorage.removeItem(SESSION_KEY);
      setUser(null);
      return;
    }
    try {
      await flushNow(); // çıkış öncesi bekleyen farkı gönder; hata banner'da görünür
    } catch {
      /* yazım başarısız olsa da çıkış engellenmez (veri bellekte kalır) */
    }
    await supabase.auth.signOut();
    setUser(null);
    try {
      await hydrateFromSupabase(); // anonim (kamu) görüntüye dön
    } catch {
      /* anonim yeniden yükleme başarısızsa mevcut görüntü kalır */
    }
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured) return; // üretimde oturum Supabase tarafından taşınır
    // Oturum değişince diğer sekmeleri uyumlu tut (yalnız demo mod)
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
    () => ({ user, phase, bootError, login, logout, isAdmin: user?.role === "admin" }),
    [user, phase, bootError, login, logout],
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
