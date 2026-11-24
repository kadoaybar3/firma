/**
 * MÜKERRER FİRMA KONTROLÜ (sunucu tarafı)
 *
 * Amaç: Temsilci yeni firma taslağı oluştururken rehberde aynı firmanın
 * olup olmadığını öğrenebilsin. Yanıt yalnız bilgilendirme amaçlıdır:
 * eşleşen kayıtların adı/ilçesi döner (talep edilen görünür uyarı için);
 * telefon, adres vb. başka alanlar dönmez ve sonuç ASLA kaydı engellemez.
 *
 * GEREKLİ ORTAM DEĞİŞKENLERİ (yalnızca sunucu):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY
 */

import { createClient } from "@supabase/supabase-js";

export const config = { path: "/api/check-company-duplicate" };

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const TR_MAP: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
};

/** Karşılaştırma için sadeleştirme: Türkçe harfler, noktalama ve fazla boşluk. */
function normalize(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşüâîû]/g, (ch) => TR_MAP[ch] ?? ch)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** PostgREST `ilike` için joker karakterleri kaçır. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ message: "Yalnızca POST." }, 405);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

  if (!supabaseUrl || !serviceRole) {
    return json({ message: "Sunucu yapılandırması eksik." }, 503);
  }

  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!bearer?.[1]) return json({ message: "Oturum gerekli." }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userRes = await authClient.auth.getUser(bearer[1]);
  if (userRes.error || !userRes.data.user) {
    return json({ message: "Oturum doğrulanamadı." }, 403);
  }

  let body: { name?: unknown };
  try {
    body = (await req.json()) as { name?: unknown };
  } catch {
    return json({ message: "Geçersiz istek gövdesi." }, 400);
  }

  const rawName = typeof body.name === "string" ? body.name.trim() : "";
  const normalized = normalize(rawName);
  if (normalized.length < 2) return json({ exists: false, matches: [] });

  // Kök neden: filtre yalnız normalize (ASCII) token veriyordu; ham kolon Türkçe
  // ("Katılım") olduğu için ilike satır hiç dönmüyordu. Ham + normalize token
  // `.or()` ile tek sorguda denenir; iki yön de kapsanır.
  const longestWord = (value: string) =>
    value.split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? value;
  const rawToken = escapeLike(longestWord(rawName.toLocaleLowerCase("tr-TR")));
  const normToken = escapeLike(longestWord(normalized));
  const filter = `name.ilike.%${rawToken}%,name.ilike.%${normToken}%`;

  const adminClient = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await adminClient
    .from("companies")
    .select("name,district,published")
    .or(filter)
    .limit(200);

  if (error) return json({ message: "Mükerrer kontrolü yapılamadı." }, 500);

  // Aday (lead) kayıtları da aynı isim havuzunda; onlar da eşleşmeye dahil.
  const leadsRes = await adminClient
    .from("leads")
    .select("company_name,district")
    .or(`company_name.ilike.%${rawToken}%,company_name.ilike.%${normToken}%`)
    .limit(200);
  if (leadsRes.error) return json({ message: "Mükerrer kontrolü yapılamadı." }, 500);

  interface Row {
    name?: string;
    company_name?: string;
    district?: string | null;
    published?: boolean;
  }

  const similar = (other: string) => {
    if (!other) return false;
    if (other === normalized) return true;
    // Kısa adlar için "içerir" karşılaştırması yanlış pozitif üretmesin.
    if (normalized.length < 5 || other.length < 5) return false;
    return other.includes(normalized) || normalized.includes(other);
  };

  const matches = [
    ...(data ?? []).map((row) => ({ kind: "firma", ...row }) as const),
    ...(leadsRes.data ?? []).map(
      (row) =>
        ({
          kind: "aday",
          name: (row as Row).company_name ?? "",
          district: (row as Row).district ?? undefined,
        }) as const,
    ),
  ]
    .filter((m) => similar(normalize(m.name ?? "")))
    .slice(0, 5)
    .map((m) => ({
      kind: m.kind,
      name: m.name ?? "",
      district: m.district ?? undefined,
      ...(m.kind === "firma" && "published" in m ? { published: m.published } : {}),
    }));

  // Yalnız bilgilendirme: eşleşme olsa bile istemci kaydı engellemez.
  return json({ exists: matches.length > 0, matches });
};
