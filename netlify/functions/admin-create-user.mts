/**
 * ADMIN — PERSONEL HESABI OLUŞTURMA
 *
 * Amaç: Yönetici (admin) tarafından yeni satış temsilcisi hesabının
 * güvenli şekilde oluşturulması.
 *
 * GEREKLİ YAPILANDIRMA (Netlify → Site settings → Environment variables):
 *   SUPABASE_SERVICE_ROLE_KEY → Supabase service_role key (SUNUCU tarafı)
 *   SUPABASE_URL              → Supabase proje URL'si
 *   VITE_SUPABASE_ANON_KEY    → Supabase publishable (anon) key (doğrulama için)
 *
 * ÖNEMLİ GÜVENLİK NOTLARI:
 *  - `SUPABASE_SERVICE_ROLE_KEY` ASLA ön tarafa (`VITE_` ile) açılmaz.
 *  - İstemci bu fonksiyona geçerli `access_token` ile istek atar.
 *  - Sunucu token'i Supabase Auth ile doğrular; admin profilini okur.
 *  - Service role yalnızca kullanıcı oluşturma için kullanılır (auth/v1/admin/users).
 */

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

interface CreateStaffBody {
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
  email?: unknown;
  password?: unknown;
  customCommissionRate?: unknown;
}

export const config = { path: "/api/admin-create-user" };

/** Telefonu TR E.164 (+90XXXXXXXXXX) biçimine indirger. */
function toE164TR(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 12 && digits.startsWith("90")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.length === 10 ? `+90${digits}` : null;
}

/** ---------- Yeni personel kayıtları (yalnızca bu istek için) ---------- */

interface ProfileSnapshot {
  full_name: string;
  role: string;
  sales_rep_id: string | null;
}

interface CreatedRecords {
  userId: string | null;
  repId: string | null;
  previousProfile: ProfileSnapshot | null;
}

/** Mevcut kod üretim mantığıyla aynı biçim: AF-001, AF-002, … */
async function nextRepCode(adminClient: SupabaseClient): Promise<string> {
  const { data, error } = await adminClient.from("sales_reps").select("code");
  if (error) throw new Error(`Temsilci kodları okunamadı: ${error.message}`);
  let max = 0;
  for (const row of (data ?? []) as { code: string | null }[]) {
    const match = /^AF-(\d+)$/.exec(row.code ?? "");
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `AF-${String(max + 1).padStart(3, "0")}`;
}

/** sales_reps kaydı; kod çakışırsa (eşzamanlı oluşturma) yeniden dener. */
async function createRepRecord(
  adminClient: SupabaseClient,
  name: string,
  phone: string,
  customCommissionRate: number | null,
): Promise<{ id: string; code: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await nextRepCode(adminClient);
    const res = await adminClient
      .from("sales_reps")
      .insert({ name, phone, code, status: "aktif", custom_commission_rate: customCommissionRate })
      .select("id, code")
      .single();
    if (!res.error) return res.data as { id: string; code: string };
    // 23505 = unique_violation → kod başka bir istekte alınmış olabilir
    if (res.error.code !== "23505") {
      throw new Error(`Temsilci kaydı oluşturulamadı: ${res.error.message}`);
    }
  }
  throw new Error("Temsilci kodu üretilemedi (kod çakışması).");
}

/**
 * Kısmi başarısızlıkta yalnızca BU istekte oluşturulan kayıtları geri alır.
 * Mevcut kullanıcı/personel kayıtlarına dokunmaz; varsa önceki profil
 * değerleri aynen geri yazılır.
 */
async function rollbackCreatedRecords(
  adminClient: SupabaseClient,
  created: CreatedRecords,
): Promise<void> {
  const { userId, repId, previousProfile } = created;
  if (!userId) return;

  try {
    if (previousProfile) {
      // Profil bu istekten önce de vardı → eski hâline döndür.
      await adminClient.from("profiles").update(previousProfile).eq("id", userId);
    } else {
      // Profil bu istekte oluştu → kaldır (auth kullanıcı silinince zaten cascade).
      await adminClient.from("profiles").delete().eq("id", userId);
    }
  } catch {
    /* geri alma en iyi çaba; asıl hata yukarıda raporlanır */
  }

  if (repId) {
    try {
      await adminClient.from("sales_reps").delete().eq("id", repId);
    } catch {
      /* geri alma en iyi çaba */
    }
  }

  try {
    await adminClient.auth.admin.deleteUser(userId);
  } catch {
    /* geri alma en iyi çaba */
  }
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ message: "Yalnızca POST." }, 405);

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

  if (!serviceRole || !supabaseUrl || !anonKey) {
    return json(
      {
        message:
          "Sunucu yapılandırması eksik: SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL ve VITE_SUPABASE_ANON_KEY tanımlı olmalıdır.",
      },
      503,
    );
  }

  // Authorization Bearer token alınrı
  const authHeader = req.headers.get("authorization") || "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!bearerMatch || !bearerMatch[1]) {
    return json({ message: "Yönetici access_token eksik (Authorization: Bearer <token>)." }, 401);
  }
  const token = bearerMatch[1];

  try {
    // 1. Token'i Supabase Auth ile doğrula (anon key ile geçici istemci)
    //    Not: setSession() boş refresh_token ile "Auth session missing!" verir;
    //    bu yüzden access_token doğrudan getUser(token) ile doğrulanır.
    const tempClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const userRes = await tempClient.auth.getUser(token);
    if (userRes.error || !userRes.data.user) {
      return json({ message: "Oturum doğrulanamadı. Yönetici giriş yapmış olmalıdır." }, 403);
    }
    const userId = userRes.data.user.id;

    // 2. Admin rolünü profiles tablosundan doğrula (service role ile)
    const adminClient = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const profRes = await adminClient.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (profRes.error) {
      return json({ message: "Profil okunamadı." }, 500);
    }
    if (profRes.data?.role !== "admin") {
      return json({ message: "Bu işlem yalnızca yönetici tarafından yapılabilir." }, 403);
    }

    // 3. Giriş verilerini al
    const body: CreateStaffBody = await req.json();
    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
    const phoneRaw = typeof body.phone === "string" ? body.phone.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password.trim() : "";

    if (!firstName || !lastName || !email || !password || !phoneRaw) {
      return json({ message: "Ad, soyad, telefon, e-posta ve şifre zorunludur." }, 400);
    }
    if (password.length < 6) {
      return json({ message: "Şifre en az 6 karakter olmalıdır." }, 400);
    }
    const phone = toE164TR(phoneRaw);
    if (!phone) {
      return json({ message: "Geçerli bir Türkiye telefon numarası girin (ör. 0555 000 00 00)." }, 400);
    }

    const rateRaw = body.customCommissionRate;
    let customCommissionRate: number | null = null;
    if (rateRaw !== null && rateRaw !== undefined && rateRaw !== "") {
      if (
        typeof rateRaw !== "number" ||
        !Number.isFinite(rateRaw) ||
        rateRaw < 0 ||
        rateRaw > 100
      ) {
        return json({ message: "Komisyon oranı 0–100 arasında bir sayı olmalıdır." }, 400);
      }
      customCommissionRate = rateRaw;
    }

    // 4. Service role ile auth kullanıcı oluştur
    //    Telefonla giriş GoTrue Phone provider'a bağlı değildir; eşleştirme
    //    /api/phone-login içinde sales_reps → profiles üzerinden yapılır.
    const created: CreatedRecords = { userId: null, repId: null, previousProfile: null };
    try {
      const fullName = `${firstName} ${lastName}`.trim();

      const createRes = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: {
          role: "temsilci",
          name: fullName,
          phone,
        },
        user_metadata: {
          firstName,
          lastName,
          phone,
        },
      });

      if (createRes.error) {
        return json(
          { message: createRes.error.message || "Personel hesabı oluşturulamadı.", details: createRes.error },
          400,
        );
      }
      created.userId = createRes.data.user.id;

      // 5. sales_reps kaydı (AF-xxx) — mevcut kod üretim mantığıyla uyumlu
      const rep = await createRepRecord(adminClient, fullName, phone, customCommissionRate);
      created.repId = rep.id;

      // 6. profiles bağlantısı.
      //    Şemada auth.users trigger'ı YOK; profil normalde ilk girişte istemci
      //    tarafından oluşur. Yine de arada bir giriş olursa (yarış durumu)
      //    mevcut satırı ezmeden güncellemek için upsert kullanılır.
      const existing = await adminClient
        .from("profiles")
        .select("full_name, role, sales_rep_id")
        .eq("id", created.userId)
        .maybeSingle();
      if (existing.error) throw new Error(`Profil okunamadı: ${existing.error.message}`);
      created.previousProfile = (existing.data as ProfileSnapshot | null) ?? null;

      const upsert = await adminClient.from("profiles").upsert(
        {
          id: created.userId,
          full_name: fullName,
          role: "temsilci",
          sales_rep_id: created.repId,
        },
        { onConflict: "id" },
      );
      if (upsert.error) throw new Error(`Profil bağlantısı kurulamadı: ${upsert.error.message}`);

      return json(
        {
          message: "Personel hesabı başarıyla oluşturuldu.",
          userId: created.userId,
          repId: created.repId,
          code: rep.code,
          email,
          name: fullName,
        },
        201,
      );
    } catch (err) {
      // Kısmi başarısızlık: yalnızca bu istekte oluşturulan kayıtları geri al.
      await rollbackCreatedRecords(adminClient, created);
      throw err;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ message: msg }, 500);
  }
};
