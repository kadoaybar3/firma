/**
 * TELEFON + ŞİFRE GİRİŞİ (SMS/OTP YOK)
 *
 * Akış:
 *   1. Telefon `phoneKey` mantığıyla normalize edilir.
 *   2. Service role ile `sales_reps` → `profiles` → auth kullanıcı e-postası bulunur.
 *   3. Şifre, Supabase GoTrue'nun kendi `grant_type=password` akışıyla doğrulanır.
 *   4. Yalnızca oturum tokenları istemciye döner; e-posta/telefon sızdırılmaz.
 *
 * GÜVENLİK:
 *  - `SUPABASE_SERVICE_ROLE_KEY` yalnızca bu sunucu fonksiyonunda kullanılır.
 *  - Hatalı telefon/şifre/kayıt durumlarında tek tip mesaj döner.
 *  - Basit bellek-içi hız sınırı (IP + telefon) vardır; sunucu örneği başına
 *    geçerlidir. Kalıcı/paylaşımlı sınır için Netlify Edge/WAF katmanı gerekir.
 *    shortcut: bellek-içi limit, çok örnekli yoğun trafikte yükselt.
 */

import { createClient } from "@supabase/supabase-js";

const GENERIC_ERROR = "Telefon veya şifre hatalı.";
const WINDOW_MS = 10 * 60 * 1000;
/** Aynı telefon için deneme sınırı. */
const MAX_PHONE_ATTEMPTS = 10;
/** Aynı IP'den farklı telefonlarla toplam deneme sınırı. */
const MAX_IP_ATTEMPTS = 30;
const attempts = new Map<string, { count: number; resetAt: number }>();

export const config = { path: "/api/phone-login" };

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

/** importLib.ts phoneKey ile aynı normalizasyon. */
function phoneKey(raw: string): string {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 12 && digits.startsWith("90")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

function clientIp(req: Request): string {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/** true → istek sınırlandı. */
function rateLimited(key: string, max: number): boolean {
  const now = Date.now();
  // Bellek şişmesini önle: süresi geçmiş kayıtları ara sıra temizle.
  if (attempts.size > 1000) {
    for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
  }
  const row = attempts.get(key);
  if (!row || row.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  row.count += 1;
  return row.count > max;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ message: "Yalnızca POST." }, 405);

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
  if (!serviceRole || !supabaseUrl || !anonKey) {
    return json({ message: "Giriş servisi yapılandırılmamış." }, 503);
  }

  let body: { phone?: unknown; password?: unknown };
  try {
    body = (await req.json()) as { phone?: unknown; password?: unknown };
  } catch {
    return json({ message: GENERIC_ERROR }, 400);
  }
  const phone = typeof body.phone === "string" ? body.phone : "";
  const password = typeof body.password === "string" ? body.password : "";
  const key = phoneKey(phone);
  const ip = clientIp(req);

  if (rateLimited(`ip:${ip}`, MAX_IP_ATTEMPTS) || rateLimited(`phone:${ip}:${key || "?"}`, MAX_PHONE_ATTEMPTS)) {
    return json({ message: "Çok fazla deneme. Lütfen biraz sonra tekrar deneyin." }, 429);
  }
  if (!key || !password) return json({ message: GENERIC_ERROR }, 401);

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1. sales_reps: telefonlar farklı biçimlerde saklanmış olabilir → normalize karşılaştır.
    //    Aynı numara birden fazla kayda bağlıysa tahmin yürütülmez.
    const reps = await admin.from("sales_reps").select("id, phone");
    if (reps.error) return json({ message: "Giriş servisi hatası." }, 500);
    const matches = ((reps.data as { id: string; phone: string | null }[] | null) ?? []).filter(
      (row) => phoneKey(row.phone ?? "") === key,
    );
    if (matches.length !== 1) return json({ message: GENERIC_ERROR }, 401);
    const rep = matches[0];

    // 2. profiles → auth kullanıcı kimliği (birden fazla eşleşme güvenli değil)
    const prof = await admin.from("profiles").select("id").eq("sales_rep_id", rep.id);
    if (prof.error) return json({ message: "Giriş servisi hatası." }, 500);
    if (!prof.data || prof.data.length !== 1) return json({ message: GENERIC_ERROR }, 401);
    const profileId = (prof.data[0] as { id: string }).id;

    // 3. auth e-postası (yalnızca sunucuda kullanılır, istemciye dönmez)
    const userRes = await admin.auth.admin.getUserById(profileId);
    const email = userRes.data?.user?.email;
    if (userRes.error || !email) return json({ message: GENERIC_ERROR }, 401);

    // 4. Şifre doğrulaması Supabase GoTrue ile; tokenlar istemciye aktarılır.
    const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ email, password }),
    });
    if (tokenRes.status >= 500) return json({ message: "Giriş servisi hatası." }, 503);
    if (!tokenRes.ok) return json({ message: GENERIC_ERROR }, 401);

    const session = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
    };
    if (!session.access_token || !session.refresh_token) {
      return json({ message: GENERIC_ERROR }, 401);
    }

    attempts.delete(`phone:${ip}:${key}`);
    return json(
      { access_token: session.access_token, refresh_token: session.refresh_token },
      200,
    );
  } catch {
    return json({ message: "Giriş servisi hatası." }, 500);
  }
};
