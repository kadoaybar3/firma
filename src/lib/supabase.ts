import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Çalışma modu bayrağı.
 *
 * Supabase erişim bilgileri (.env) henüz sağlanmadı. Bu durumda uygulama
 * "demo modda" çalışır: veriler yalnızca tarayıcı hafızasında (localStorage)
 * tutulur ve gerçek bir veritabanına yazar gibi DAVRANMAZ.
 *
 * Gerçek ortam için:
 *  1. supabase/migrations/0001_init.sql dosyasını Supabase projesine uygulayın.
 *  2. .env dosyasına VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY girin.
 *  3. src/lib/dataSource.ts içindeki Supabase deposunu devreye alın.
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

export let supabase: SupabaseClient | null = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    console.warn("Supabase istemcisi oluşturulamadı, demo modda devam ediliyor.", err);
  }
}

export const isSupabaseConfigured = supabase !== null;
