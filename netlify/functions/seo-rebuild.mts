/**
 * SEO YENİDEN BUILD — Netlify Build Hook tetikleyici (Faz 4F)
 *
 * Amaç: Yayınlanan/SEO çıktısını değiştiren firma verisi değişikliklerinden
 * sonra Netlify Build Hook'u çağırılır; yeni build sitemap.xml ve prerender
 * sayfalarını Supabase'deki güncel verilerle yeniler (Faz 4E-1 akışı).
 *
 * GEREKLİ YAPILANDIRMA (Netlify → Site settings → Environment variables):
 *   NETLIFY_BUILD_HOOK_URL      → Netlify Build Hook URL'si (SUNUCU tarafı)
 *   SUPABASE_URL                → Supabase proje URL'si
 *   SUPABASE_SERVICE_ROLE_KEY   → Supabase service_role key (SUNUCU tarafı)
 *   VITE_SUPABASE_ANON_KEY      → Supabase publishable (anon) key (doğrulama için)
 *
 * ÖNEMLİ GÜVENLİK NOTLARI:
 *  - `NETLIFY_BUILD_HOOK_URL` ASLA `VITE_` önekiyle istemciye açılmaz;
 *    yalnız process.env'de okunur, hiçbir yanıt/log/istemci verisinde
 *    gösterilmez (yalnızca HTTP durum kodu/ileti geri döner).
 *  - Yetkilendirme deseni `admin-create-user.mts` ile aynıdır: istemci
 *    access_token gönderir, sunucu Supabase Auth ile doğrular ve admin
 *    rolünü profiles tablosundan teyit eder.
 *  - Build Hook çağrısı fire-and-forget'tir: firma yayınlama işlemi bu
 *    fonksiyondan BAĞIMSIZDIR ve buradaki hata geri alınamaz/engellemez.
 */

import { createClient } from "@supabase/supabase-js";

/** Sunucu tarafı env erişimi; bu dosya programa yalnız test üzerinden girer. */
declare const process: { env: Record<string, string | undefined> };

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

export const config = { path: "/api/seo-rebuild" };

/** Kimlik doğrulama sonucu: null = yetkili. */
type AuthResult = { status: number; message: string } | null;

export type SeoRebuildDeps = {
  env: Record<string, string | undefined>;
  fetchImpl: typeof fetch;
  /** Token doğrulama + admin rolü kontrolü (test enjeksiyonu). */
  verifyAdmin: (
    token: string,
    env: Record<string, string | undefined>,
  ) => Promise<AuthResult>;
};

/** admin-create-user.mts deseni: geçerli oturum + profiles.role === "admin". */
async function verifyAdminDefault(
  token: string,
  env: Record<string, string | undefined>,
): Promise<AuthResult> {
  try {
    const supabaseUrl = env.SUPABASE_URL ?? "";
    const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
    const tempClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const userRes = await tempClient.auth.getUser(token);
    if (userRes.error || !userRes.data.user) {
      return { status: 403, message: "Oturum doğrulanamadı. Yönetici giriş yapmış olmalıdır." };
    }
    const adminClient = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const profRes = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", userRes.data.user.id)
      .maybeSingle();
    if (profRes.error) return { status: 500, message: "Profil okunamadı." };
    if (profRes.data?.role !== "admin") {
      return { status: 403, message: "Bu işlem yalnızca yönetici tarafından yapılabilir." };
    }
    return null;
  } catch {
    return { status: 500, message: "Kimlik doğrulama başarısız oldu." };
  }
}

export async function handleSeoRebuild(req: Request, deps: SeoRebuildDeps): Promise<Response> {
  if (req.method !== "POST") return json({ message: "Yalnızca POST." }, 405);

  const { env, fetchImpl } = deps;
  const hookUrl = env.NETLIFY_BUILD_HOOK_URL;
  const supabaseEnvOk = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY &&
    (env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY);
  if (!hookUrl || !supabaseEnvOk) {
    // Yalnız değişken ADLARI söylenir; değerler (hook URL dahil) hiçbir yere yazılmaz.
    return json(
      {
        message:
          "Sunucu yapılandırması eksik: NETLIFY_BUILD_HOOK_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ve VITE_SUPABASE_ANON_KEY tanımlı olmalıdır.",
      },
      503,
    );
  }

  const bearerMatch = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!bearerMatch || !bearerMatch[1]) {
    return json({ message: "Yönetici access_token eksik (Authorization: Bearer <token>)." }, 401);
  }

  const authError = await deps.verifyAdmin(bearerMatch[1], env);
  if (authError) return json({ message: authError.message }, authError.status);

  try {
    const res = await fetchImpl(hookUrl, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      // Hook URL dahil edilmez; yalnız durum kodu raporlanır.
      return json({ message: `Build Hook yanıtı başarısız (HTTP ${res.status}).` }, 502);
    }
    return json({ message: "Yeniden build isteği gönderildi.", ok: true }, 200);
  } catch (err) {
    // Yalnız hata adı (timeout/dns …): hook URL'i hatada da sızmaz.
    const name = err instanceof Error && err.name ? err.name : "bilinmeyen";
    return json({ message: `Build Hook'a ulaşılamadı (${name}).` }, 502);
  }
}

export default (req: Request): Promise<Response> =>
  handleSeoRebuild(req, {
    env: process.env,
    fetchImpl: fetch,
    verifyAdmin: verifyAdminDefault,
  });
