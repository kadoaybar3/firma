# RLS / Güvenlik İnceleme Raporu — RD-5

## Tespitler

1. **`companies` tablosu — şema uygun, RLS eksik**
   - `sales_rep_id` (nullable) ve `created_at` (default now()) kolonları mevcut.
   - `createCompany` repo fonksiyonu `actor.repId` ve `createdAt` ayarlıyor.
   - RLS politikaları (0001_init): yalnızca `anon company read (published)` + `admin full companies`. `temsilci` için INSERT/UPDATE yok.
   - **Sonuç:** Çalışan doğrudan firma oluşturamaz; `supabase.from("companies").upsert()` ile 42501 hatası alınır.

2. **`leads` tablosu — temsilci politikası mevcut**
   - `rep insert own lead`, `rep update own lead`, `rep read own lead` mevcut.
   - Mevcut akış ``createLead`` → ``convertLead`` (admin) bozulmadan korundu.

3. **`sales` / `payments` / `memberships` / `commissions`**
   - Temsilci kendi satışlarını/ödemelerini/üyeliklerini/komisyonlarını okuyabilir, yazamaz (admin/engine kontrolü).
   - `verifyPayment` / ``confirmSale`` `engine.ts` üzerinden admin-only.

4. **`app_settings`**
   - `settings read` → herkes okuyabilir; `settings admin write` → sadece admin yazabilir.

5. **`profiles`**
   - `profiles self read/update` + admin full. Temsilci kendi profilini düzenleyebilir.

6. **Demo modu vs Supabase modu**
   - Demo: tüm yetki istemci tarafında (menu gizleme + `useAuth` rol kontrolü) → gerçek güvenlik sunucu/güvenlik duvarı (RLS) ile sağlanıyor.
   - RLS değiştirilmeyecektir (madde 8 kesin kural).

## Önerilen Migration (Uygulanmayacak — Onay Bekliyor)

`supabase/migrations/0007_repr_company_insert.sql`

```sql
-- Çalışanın kendi firmasını oluşturmasına izin verir;
-- oluşturucu çalışanın sales_rep_id'si zorunlu olur, created_at default kalır.
alter table companies enable row level security;
create policy "rep insert own company" on companies
  for insert with check (
    current_app_role() = 'temsilci' and
    sales_rep_id = current_sales_rep_id()
  );
create policy "rep update own company" on companies
  for update using (
    current_app_role() = 'temsilci' and
    sales_rep_id = current_sales_rep_id()
  );
```

- Bu değişiklik, `docs/GELISTIRME-GUNLUGU.md`'de RD-5 kaydı altında raporlanmıştır.
- **Uygulanmadı; onay bekleniyor.**
