/**
 * ADMIN — BAŞVURU ONAYLAMA VE PERSONEL HESABI OLUŞTURMA
 *
 * Amaç: Yönetici tarafından beklemedeki personel başvurusunun (0012)
 * onaylanması ve başvuru sahibi için Supabase Auth + profiles + sales_reps
 * kayıtlarının oluşturulması.
 *
 * GEREKLİ YAPILANDIRMA (Netlify → Site settings → Environment variables):
 *   SUPABASE_SERVICE_ROLE_KEY → Supabase service_role key (SUNUCU tarafı)
 *   SUPABASE_URL              → Supabase proje URL'si
 *   VITE_SUPABASE_ANON_KEY    → Supabase publishable (anon) key (doğrulama için)
 *
 * GÜVENLİK (admin-create-user.mts deseninin aynası):
 *  - `SUPABASE_SERVICE_ROLE_KEY` ASLA ön tarafa (`VITE_` ile) açılmaz.
 *  - İstemci geçerli `access_token` ile istek atar; token Supabase Auth
 *    ile doğrulanır, admin rolü profiles üzerinden service_role ile teyit edilir.
 *  - service_role yalnızca Auth kullanıcı oluşturma + onay RPC'si için.
 *
 * İŞLEM SIRASI (yarım durum bırakmaz):
 *  1. auth.admin.createUser → yeni Auth kullanıcısı.
 *  2. approve_rep_application RPC (TEK TRANSACTION): referans personeli +
 *     ekip yeniden doğrulanır, kapasite yeniden kontrol edilir, sales_reps +
 *     profiles + başvuru 'onaylandi' birlikte yazılır.
 *  3. RPC hata verirse Auth kullanıcısı silinir → "onaylanmış görünüp
 *     hesabı oluşmamış başvuru" veya yarım hesap KALMAZ (yerel tarafın
 *     tamamı zaten RPC ile geri alındı).
 */

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

interface ApproveBody {
  applicationId?: unknown;
  password?: unknown;
}

export const config = { path: "/api/approve-rep-application" };

interface ApplicationRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  status: string;
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

  // 1. Authorization Bearer token
  const authHeader = req.headers.get("authorization") || "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!bearerMatch || !bearerMatch[1]) {
    return json({ message: "Yönetici access_token eksik (Authorization: Bearer <token>)." }, 401);
  }
  const token = bearerMatch[1];

  try {
    // 2. Token'i Supabase Auth ile doğrula (anon key ile geçici istemci)
    const tempClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const userRes = await tempClient.auth.getUser(token);
    if (userRes.error || !userRes.data.user) {
      return json({ message: "Oturum doğrulanamadı. Yönetici giriş yapmış olmalıdır." }, 403);
    }

    // 3. Admin rolünü profiles tablosundan doğrula (service role ile)
    const adminClient = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const profRes = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", userRes.data.user.id)
      .maybeSingle();
    if (profRes.error) {
      return json({ message: "Profil okunamadı." }, 500);
    }
    if (profRes.data?.role !== "admin") {
      return json({ message: "Bu işlem yalnızca yönetici tarafından yapılabilir." }, 403);
    }

    // 4. İstek verileri
    const body: ApproveBody = await req.json();
    const applicationId = typeof body.applicationId === "string" ? body.applicationId.trim() : "";
    const password = typeof body.password === "string" ? body.password.trim() : "";
    if (!applicationId) return json({ message: "Başvuru kimliği eksik." }, 400);
    if (password.length < 6) {
      return json({ message: "Personel şifresi en az 6 karakter olmalıdır." }, 400);
    }

    // 5. Başvuruyu oku (durum, iletişim ve referans bilgileri)
    const appRes = await adminClient
      .from("rep_applications")
      .select("id, first_name, last_name, phone, email, status")
      .eq("id", applicationId)
      .maybeSingle();
    if (appRes.error) return json({ message: `Başvuru okunamadı: ${appRes.error.message}` }, 500);
    const application = appRes.data as ApplicationRow | null;
    if (!application) return json({ message: "Başvuru bulunamadı." }, 404);
    if (application.status !== "beklemede") {
      return json(
        { message: "Bu başvuru zaten sonuçlandırılmış; tekrar onaylanamaz." },
        409,
      );
    }

    const fullName = `${application.first_name} ${application.last_name}`.trim();

    // 6. Auth kullanıcısı → tek transaction onay RPC → hata temizliği
    let userId: string | null = null;
    try {
      const createRes = await adminClient.auth.admin.createUser({
        email: application.email,
        password,
        email_confirm: true, // başvuru sahibi e-postayı doğrulamış sayılır (yönetici onayladı)
        app_metadata: {
          role: "temsilci",
          name: fullName,
          phone: application.phone,
        },
        user_metadata: {
          firstName: application.first_name,
          lastName: application.last_name,
          phone: application.phone,
        },
      });
      if (createRes.error) {
        return json(
          { message: createRes.error.message || "Personel hesabı oluşturulamadı." },
          400,
        );
      }
      userId = createRes.data.user.id;

      // Yerel taraf (sales_reps + profiles + durum) TEK transaction'da.
      const { data: repId, error: approveError } = await adminClient.rpc(
        "approve_rep_application",
        { p_application_id: applicationId, p_auth_user_id: userId },
      );
      if (approveError) {
        throw new Error(approveError.message || "Başvuru onaylanamadı.");
      }

      return json(
        {
          message: "Başvuru onaylandı; personel hesabı oluşturuldu.",
          repId,
          applicationId,
          email: application.email,
          name: fullName,
        },
        200,
      );
    } catch (err) {
      // Yarım hesap bırakma: RPC hata verdiyse Auth kullanıcısını geri sil
      // (yerel kayıtlar RPC içindeki transaction ile zaten geri alındı).
      if (userId) {
        try {
          await adminClient.auth.admin.deleteUser(userId);
        } catch {
          /* geri alma en iyi çaba; asıl hata aşağıda raporlanır */
        }
      }
      throw err;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ message: msg }, 500);
  }
};
