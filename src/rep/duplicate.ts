import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { listCompanies } from "../lib/repo";

export type DuplicateCheck = "none" | "exists" | "unavailable";

/** Türkçe karakterleri sadeleştirip karşılaştırma anahtarı üretir (yalnız demo mod). */
function normalize(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşüâîû]/g, (ch) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" })[ch] ?? ch)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Mükerrer firma kontrolü.
 *
 * Canlı modda yalnızca sunucu uç noktası kullanılır ve yanıt tek bir boolean'dır;
 * rehberdeki firma adları/adresleri istemciye hiçbir şekilde dönmez. Demo modda
 * tarayıcı hafızasındaki demo verisi karşılaştırılır.
 */
export async function checkDuplicate(name: string): Promise<DuplicateCheck> {
  const trimmed = name.trim();
  if (trimmed.length < 2) return "none";

  if (!isSupabaseConfigured) {
    const target = normalize(trimmed);
    const exists = listCompanies().some((c) => {
      const other = normalize(c.name);
      if (!other) return false;
      if (other === target) return true;
      if (target.length < 5 || other.length < 5) return false;
      return other.includes(target) || target.includes(other);
    });
    return exists ? "exists" : "none";
  }

  if (!supabase) return "unavailable";
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return "unavailable";

  try {
    const res = await fetch("/api/check-company-duplicate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!res.ok) return "unavailable";
    const body = (await res.json()) as { exists?: boolean };
    return body.exists ? "exists" : "none";
  } catch {
    return "unavailable";
  }
}
