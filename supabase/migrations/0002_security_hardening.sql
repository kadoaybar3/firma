-- =========================================================
-- FİRMA REHBERİ — 0002 güvenlik sıkılaştırma
-- Kapsam: H1 (RPC sahteciliği), H2 (mükerrer yenileme), H3 (tutar çapraz doğrulama)
--
-- ÖNKOŞUL: 0001_init.sql uygulanmış olmalı (K1 düzeltmesiyle:
-- `current_app_role()` adlı fonksiyon tanımlı).
--
-- UYGULAMA:
--   supabase db push          CLI ile (önerilen — migration history tutulur)
--   veya Supabase Dashboard SQL Editor'de TÜM dosyayı tek seferde koş
--   (begin/commit bloğu tamamlar; parça parça koşmayın).
--
-- AMAÇ: Bu migration canlı veri SİLMEZ; yalnızca yetki daraltır ve
--   indeks ekler. Aşağıdaki ROLLBACK satırları her maddenin
--   geri alma komutunu içerir.
--
-- UYGULAMA SONRASI DOĞRULAMA İZLERİ (adımlar repo README'ye de işlendi):
--   psql> select reloptions from pg_class where relname = 'sales_open_renewal_unique';
--   psql> select has_function_privilege('anon',  'log_audit(text,text,jsonb)', 'EXECUTE');   -- beklenen: false
--   psql> select has_function_privilege('anon',  'confirm_sale(uuid)', 'EXECUTE');           -- beklenen: false
--   psql> select has_function_privilege('authenticated', 'confirm_sale(uuid)', 'EXECUTE');   -- beklenen: true
--   psql> select has_table_privilege('anon', 'profiles', 'UPDATE');                          -- beklenen: false
-- =========================================================

begin;

-- ---------- H1: audit-log sahteciliğini kapat ----------
-- log_audit yalnız SECURITY DEFINER zincirinden (confirm_sale,
-- confirm_renewal, verify_payment_manual) çağrılır: 0001'de başka
-- çağırıcı yoktur (satır 338, 379, 397) ve istemci kodu hiçbir RPC
-- kullanmıyor (demo mod). EXECUTE yüzeyi tamamen kapatılır; Edge
-- Functions/webhook için service_role açık kalır.
-- ROLLBACK: grant execute on function log_audit(text, text, jsonb) to public;
revoke execute on function log_audit(text, text, jsonb) from public, anon, authenticated;
grant execute on function log_audit(text, text, jsonb) to service_role;

-- RLS policy'leri bu yardımcı fonksiyonları çağıran KULLANICI izinleriyle
-- çalışır (B1 doğrulaması): rol-sınırlı olmayan "admin full" policy'leri
-- HER rol için değerlendirildiğinden anon'un da execute hakkı
-- ZORUNLUDUR — anon'da çekilirse halka açık firma okuması "permission
-- denied" atar. Bilgi sızıntısı yoktur: anon için auth.uid() null olduğundan
-- her iki fonksiyon da null döner.
-- ROLLBACK: grant execute on function current_app_role() to public;
revoke execute on function current_app_role() from public;
grant execute on function current_app_role() to anon, authenticated, service_role;

-- ROLLBACK: grant execute on function current_sales_rep_id() to public;
revoke execute on function current_sales_rep_id() from public;
grant execute on function current_sales_rep_id() to anon, authenticated, service_role;

-- Kritik işlemler: yalnız login'li kullanıcılar (admin/temsilci ayrımı
-- fonksiyon guard'ları içinde — davranış değişmez, anon yüzey kapatılır).
-- ROLLBACK: grant execute on function confirm_sale(uuid) to public;
revoke execute on function confirm_sale(uuid) from public, anon;
grant execute on function confirm_sale(uuid) to authenticated, service_role;

-- ROLLBACK: grant execute on function confirm_renewal(uuid) to public;
revoke execute on function confirm_renewal(uuid) from public, anon;
grant execute on function confirm_renewal(uuid) to authenticated, service_role;

-- ROLLBACK: grant execute on function verify_payment_manual(uuid) to public;
revoke execute on function verify_payment_manual(uuid) from public, anon;
grant execute on function verify_payment_manual(uuid) to authenticated, service_role;

-- ---------- H2: aynı üyelik için yalnızca TEK açık yenileme satışı ----------
-- İki ayrı 'potansiyel' yenileme satışı aynı üyelik için de kesinleşebilirdi
-- ve her biri ayrı komisyon üretirdi. Endeks yalnızca AÇIK (potansiyel)
-- yenilemelere bakar: iptal edilmiş bir yenileme, aynı üyeliğin gelecekteki
-- yenilemesine engel olmaz.
-- ROLLBACK: drop index if exists sales_open_renewal_unique;
--
--
-- Önce çakışma taraması (canlı veride aynı üyeliğe bağlı birden fazla açık
-- yenileme varsa index kurulamaz; hata mesajı aydınlatıcı olur).
do $$
begin
  if exists (
    select 1 from sales
    where renewal_for_membership_id is not null and status = 'potansiyel'
    group by renewal_for_membership_id
    having count(*) > 1
  ) then
    raise exception
      'H2 endeksi kurulamadı: aynı membership_id için birden fazla AÇIK '
      '(potansiyel) yenileme satışı var. Önce bu satışları kesinleştirin ya da '
      'iptal edin: select renewal_for_membership_id, id, created_at from sales '
      'where status = ''potansiyel'' and renewal_for_membership_id is not null '
      'order by renewal_for_membership_id;';
  end if;
end $$;

create unique index if not exists sales_open_renewal_unique
  on sales (renewal_for_membership_id)
  where renewal_for_membership_id is not null and status = 'potansiyel';

-- ---------- H3: manuel ödeme doğrulama + tutar çapraz doğrulama ----------
-- Sorun: temsilci satış açarken amount değerini serbest girer (policy'de
-- sınır yoktu); admin manuel doğrulama tutarı görsede de fonksiyon tutar
-- uyumsuzluğunu denetlemiyordu → şişirilmiş komisyon.
-- Düzeltme: onay yalnızca tutar eşliğinde; kayıt yok / daha önce
-- onaylanmış-iade edilmiş ya da tutar uyuşmazlığı durumunda exception üretilir.
-- Meşru akış (tutar eşit) değişmez.
-- ROLLBACK: 0001'deki orijinal verify_payment_manual gövdesine dön
-- (create or replace ile eski hal yazılır; aşağıdaki eskisinin aynı kalması
-- yeterli, 0001'in git geçmişinde korunmaktadır).
create or replace function verify_payment_manual(p_payment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if current_app_role() <> 'admin' then raise exception 'yetkisiz'; end if;
  update payments set status = 'onaylandi', updated_at = now()
  where id = p_payment_id and status = 'beklemede'
    and amount = (select s.amount from sales s where s.id = payments.sale_id);
  if not found then
    raise exception
      'ödeme doğrulanamadı: kayıt yok, daha önce onaylanmış/iade olmuş ya da '
      'tutar satış tutarıyla eşleşmiyor';
  end if;
  perform log_audit('odeme_dogrulandi', 'Ödeme manuel doğrulandı',
    jsonb_build_object('payment_id', p_payment_id));
end $$;

commit;
