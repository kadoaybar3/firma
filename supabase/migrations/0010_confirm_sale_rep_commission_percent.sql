-- =========================================================
-- FİRMA REHBERİ — 0010 confirm_sale komisyonu yüzdeye çevrildi
-- Kapsam: YALNIZ `confirm_sale(uuid)` fonksiyonunun temsilci komisyonu
--         ifadesi. Diğer her satır 0001 ile birebir aynıdır.
--
-- BULGU: JS motoru (src/lib/engine.ts confirmSale) temsilci komisyonunu
--   `satış tutarı × oran / 100` (yüzde) olarak hesaplıyor; ancak 0001'deki
--   `confirm_sale` RPC'si genel oran için `st.rep_commission` değerini
--   DOĞRUDAN TL komisyon olarak yazıyordu (sabit). Sonuç: canlıda normal
--   1.000 TL satışta 600 TL (yerelde 500), öne çıkan 2.000 TL satışta da
--   600 TL (yerelde 1.000) komisyon üretiliyordu.
--
-- DEĞİŞİKLİK (tek ifade):
--   eski: coalesce( case ... end, st.rep_commission )
--   yeni: coalesce( case ... end, round(s.amount * <genel oran> / 100) )
--   <genel oran> = case when st.rep_commission > 100 then 50 else st.rep_commission end
--
-- NEDEN `> 100` YEDEĞİ (geriye dönük uyumluluk):
--   `app_settings.rep_commission` canlıda hâlâ eski TL değeri (600) taşıyor
--   olabilir. Saf `round(s.amount * 600 / 100)` formülü 600 TL'lik %600
--   komisyon üretirdi. JS tarafı aynı değeri okuma anında %50 olarak
--   yorumluyor (src/lib/dataSource.ts settingsFromRow: `> 100 → 50`);
--   bu migration da AYNI kuralı uygulayarak SQL ile JS'in aynı sonucu
--   üretmesini sağlar (kural 5) ve eski satırla bozulmadan çalışır (kural 6).
--   Admin Ayarlar ekranından oran yüzde olarak kaydedildiğinde (≤ 100)
--   bu yedek devre dışı kalır.
--
-- KORUNANLAR (değişmedi):
--   * security definer + search_path = public
--   * yetki kontrolü ('yetkisiz'), satır kilidi (for update), durum/ödeme
--     ve mükerrer komisyon ('komisyon zaten var') kontrolleri
--   * üyelik oluşturma, satış durumu güncelleme, referans kodu kullanımı
--   * `referral_reward` ve `referral_code` (referans) dalı — sabit tutar
--   * `confirm_renewal` / `renewal_commission` — bu dosyaya dahil değil
--   * özel oran önceliği: custom_commission_rate NOT NULL ise o önce gelir
--     ve yüzde olarak hesaplanır (0 → komisyon 0)
--   * yetkiler: create or replace mevcut ACL'yi (0002: anon/public revoked,
--     authenticated + service_role granted) korur; yeniden grant gerekmez.
--
-- UYGULAMA (onayınızla):
--   supabase db push   veya   SQL Editor'de bu dosyayı tek seferde çalıştırın.
--
-- UYGULAMA SONRASI DOĞRULAMA İZLERİ:
--   psql> select has_function_privilege('anon', 'confirm_sale(uuid)', 'EXECUTE');            -- false
--   psql> select has_function_privilege('authenticated', 'confirm_sale(uuid)', 'EXECUTE');   -- true
--   psql> select pronacl from pg_proc where proname = 'confirm_sale';                        -- 0002 ile aynı
--   psql> select prosrc from pg_proc where proname = 'confirm_sale';                         -- round(.../100) içermeli
--
-- VERİ: Bu dosya hiçbir satırı okumaz/yazmaz; yalnız fonksiyon tanımını
--   değiştirir. Mevcut satış/komisyon kayıtlarına dokunmaz.
--
-- ROLLBACK:
--   supabase/migrations/0001_init.sql içindeki orijinal `confirm_sale`
--   tanımını yeniden çalıştırın (create or replace geri alır).
-- =========================================================

begin;

create or replace function confirm_sale(p_sale_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s sales;
  m memberships;
  st app_settings;
  rep sales_reps;
  ref referrals;
  new_commission_id uuid;
begin
  if current_app_role() <> 'admin' then
    raise exception 'yetkisiz';
  end if;

  select * into s from sales where id = p_sale_id for update;
  if not found then raise exception 'satış yok'; end if;
  if s.status <> 'potansiyel' then raise exception 'satış kesinleşemez/iyilemiş'; end if;
  if not exists (select 1 from payments where sale_id = s.id and status = 'onaylandi') then
    raise exception 'ödeme doğrulanmadı';
  end if;
  if exists (select 1 from commissions where sale_id = s.id) then
    raise exception 'komisyon zaten var';
  end if;

  select * into st from app_settings where id = 1;
  select * into rep from sales_reps where id = s.sales_rep_id;

  insert into memberships (company_id, sale_id, starts_at, ends_at, status)
  values (s.company_id, s.id, now(), now() + interval '1 year', 'aktif')
  returning * into m;

  update sales set status = 'odendi', confirmed_at = now() where id = s.id;

  new_commission_id := null;
  if s.channel = 'temsilci' and s.sales_rep_id is not null then
    insert into commissions (sale_id, sales_rep_id, type, amount, status)
    values (
      s.id, s.sales_rep_id, 'satis',
      coalesce(
        case when rep.custom_commission_rate is not null
          then round(s.amount * rep.custom_commission_rate / 100)
        end,
        -- Genel oran da yüzde olarak uygulanır (JS engine ile aynı sonuç).
        -- > 100 = eski TL değeri; JS settingsFromRow ile aynı %50 yedeği.
        round(s.amount * (case when st.rep_commission > 100 then 50 else st.rep_commission end) / 100)
      ),
      'beklemede'
    ) returning id into new_commission_id;
  elsif s.channel = 'dogrudan' and s.referral_code is not null then
    select * into ref from referrals where code = s.referral_code and used_at is null for update;
    if found then
      update referrals set used_at = now(), sale_id = s.id where id = ref.id;
      insert into commissions (sale_id, sales_rep_id, type, amount, status)
      values (s.id, ref.sales_rep_id, 'referans', st.referral_reward, 'beklemede')
      returning id into new_commission_id;
    end if;
  end if;

  perform log_audit('satis_kesinlesti', 'Satış kesinleşti', jsonb_build_object('sale_id', s.id));
  return new_commission_id;
end $$;

commit;
