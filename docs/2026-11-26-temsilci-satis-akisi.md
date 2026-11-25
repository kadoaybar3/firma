# Synthetic User Feedback Report

**Target:** https://firma5.netlify.app (RehberiX — Afyonkarahisar firma rehberi)
**Feedback Type:** Usability — görev tamamlama modu (temsilci satış akışı) + genel keşif
**Date:** 26 Kasım 2026
**Kapsam:** Herkese açık sayfalar (ana sayfa, /firmalar, firma profili, /giris, /iletisim) üretimden; temsilci paneli (/temsilci, yeni firma, taslaklar, ödeme adımı, satışlarım, ekipler) gerçek hesapla incelendi.
**Kısıt:** Gerçek veri oluşturulmadı, satış kaydedilmedi, ödeme yapılmadı. Formlar açıldı, hiçbir gönderim yapılmadı.

---

## Kullanılan Personalar

| Persona | Profil | Odak |
|---------|--------|------|
| **Mert — Yeni Temsilci** | 24, saha satışına yeni başladı, aracı ilk kez kullanıyor, rehber ürününe yabancı | Akışın nereye gittiğini bulabiliyor mu? |
| **Selma — Deneyimli Temsilci** | 35, 8 yıl saha satışı, hız ve gereksiz adım tahammülü düşük | Kaç adımda kayıt tamamlanıyor? |
| **Ayhan — Firma Sahibi** | 48, mobilya dükkanı sahibi, rehbere girmek istiyor, bütçeye duyarlı | Bana ne satılıyor, güvenilir mi? |

---

### Mert — Yeni Temsilci

**Verdict:** Görevi tamamladı — ama yalnız kendi başına deneyerek (3 ekran sonra akışı çözdü)
**First Impression:** 6/10

**Pain Points:**
- Giriş sayfasında tek kapı var: "Yönetim ve satış temsilcisi girişi buradan yapılır" — hangi hesabın kendi olduğu belli değil, rastgele deniyor.
- Panelde **iki ayrı "Ana Sayfa"** linki var: biri siteye (`/`), biri panele (`/temsilci`). İkisi de aynı metin; hangisinin nereye götürdüğü belirsiz.
- "Ödemeye Geç" butonuna bastığında **kart ödemesi yok**: "altyapı yok" uyarısı + en altta pasif duran "Anlaşmayı bildir (ödemesiz)". Asıl çalışan yol sayfanın en altında ve adı bile ödeme değil.
- Satış yaşam döngüsü (taslak → yönetici onayı → ödeme → kesinleşme → komisyon) panelde **hiçbir yerde tek yerde anlatılmıyor**; "şimdi ne olacak?" sorusunun cevabı dağılmış.

**What Worked:**
- Dashboard net: bekleyen taslak sayısı, komisyon bakiyesi ve "Son işlemler" hızlı durum veriyor.
- Yeni firma formunda üstteki açıklama ("kayıt taslak olarak size bağlanır; yönetici onayı olmadan yayınlanmaz") beklentiyi doğru kuruyor.
- Mükerrer kontrol metni baskıcı değil: "benzer kayıt bulunsa bile taslak kaydedilebilir; karar sizindir."

**Unanswered Questions:**
- "Satışım ne zaman kesinleşiyor, komisyon ne zaman hesabıma geçer?"
- "Ödemesiz bildirdiğim anlaşmada para kimden, ne zaman tahsil ediliyor?"

**Final Word:**
> "Formu doldurdum, kaydettim... peki şimdi ne oluyor? Bu adımların hiçbirisinde 'sıradaki adım ne' yazmıyor."

---

### Selma — Deneyimli Temsilci

**Verdict:** Görevi tamamladı — ama 4 gereksiz adım saydı
**First Impression:** 6.5/10

**Pain Points:**
- **Uzun tek sayfa form:** iletişim + 3 sosyal medya + kategori + Maps + 5 adres alanı + harita + 7 günlük çalışma saatleri + not. Sahada tek elle doldurmak ağır.
- Çalışma saatleri yardım metni geliştirici dili: *"Hafta içi günleri (Pazartesi–Cuma) tek saat aralığı olarak saklanır; birini değiştirdiğinizde hafta içi günlerinin tümü aynı olur."* — sahadaki temsilciye bunun ne anlama geldiği anlatılmıyor.
- Paket isimleri satış görüşmesinde tutmuyor: **herkese açık sayfada "Standart / Advance (1.000 / 2.000 TL)"**, panel ödeme adımında **"Normal / Öne Çıkan (₺1.000 / ₺2.000)"**. Müşteriye başka, panele başka isim söyleniyor; bir de İngilizce "Advance" sırıtıyor.
- Firma kartlarında yalnız "Kapalı" yazıyor, açılış saati yok — "ne zaman açık?" bilgisi kartta yok.
- Ödeme adımına gelene kadar paket seçimi zorunlu; butonlar "önce paket seçin" diyor (bu iyi), ancak çalışan yol ("Anlaşmayı bildir") kart seçiminin altında ikinci sırada.

**What Worked:**
- Taslaklar → Düzenle → Ödeme adımları kısa; "Mevcut adres korunuyor" notu veri kaybı korkusunu gideriyor.
- Satışlarım sayfası **şeffaf**: ödeme durumu, yönetici onayı ve komisyon kademesi satır satır görünüyor; "Banka referans no girilmedi" gibi boşluklar dürüst.
- Paket tutarı kullanıcıya kapalı ("tutar giremez veya değiştirilemez") — anlaşma sırasında oynama riski yok.
- Ödeme altyapısı yoksa bunu **açıkça söyleyen** metin ("sahte 'ödeme başarılı' durumu gösterilmez") profesyonel.

**Unanswered Questions:**
- "Mükerrer kontrol tam olarak ne zaman çalışıyor? Formda tetikleyicisini göremiyorum."
- "Anlaşmayı bildirdikten sonra yönetici ne kadar sürede dönüyor?"

**Final Word:**
> "Akış mantığı doğru ama adımların isimleri yanlış: ödeme sayfasında ödeme yok, satış kaydı dediğin şey anlaşma bildirimi. Müşteriye bunu anlatmak bana düşüyor."

---

### Ayhan — Firma Sahibi

**Verdict:** Bilgi topladı — başvuru formunu gördü, henüz başvurmadı (ihtiyaç duymadı)
**First Impression:** 7/10

**Pain Points:**
- Ana sayfa iki farklı kişiye aynı anda sesleniyor: hero'da hem *"İşletmenizin dijital görünürlüğünü artırın"* (bana) hem *"İhtiyacınız olan ürün ve hizmeti bulun"* (müşteriye). Kimin sitesi olduğu 3 saniyede anlaşılmıyor.
- İletişim sayfasında paketler "Advance" diye adlandırılıyor ama panelde/ücretlendirmede karşılığı "Öne Çıkan" — teklif geldiğinde isim uyuşmazlığı riski.
- İletişim bilgileri **kişisel görünüyor**: `kadirayb@icloud.com` ve "Afyoon Reklam" (yazım hatasıyla) — güven sinyali zayıf.
- Başvuru sonrası süreç belirsiz: "ekibimiz sizi arayacak" yazıyor ama ne kadar sürede, kim arayacak bilinmiyor.

**What Worked:**
- Paketler açık fiyatlı (1.000 / 2.000 TL), kapsam farkı ("Öne Çıkanlarda ek görünürlük") net anlatılmış.
- Firma profilleri zengin: telefon, WhatsApp, Instagram/Facebook, çalışma saatleri, harita, paylaş butonu — "şu an açık/kapalı" bilgisi güven veriyor.
- "Başvuruyu gönder" formu kısa (zorunlu: yalnız ad + telefon).

**Unanswered Questions:**
- "Başvurum kaç gün içinde yayınlanır?"
- "Yıllık üyelik bitince ne oluyor, otomatik yenileniyor mu?"

**Final Word:**
> "Fiyatı yazmışsınız, güvendim. Ama 'Advance' ile 'Öne Çıkan' aynı şey mi, telefonda bana başka mı diyecekler?"

---

## Cross-Persona Insights

**All struggled with:**
- **Adım isimleri gerçek akışı yansıtmıyor:** "Ödemeye Geç" → ödeme yok; "Ana Sayfa" ×2; paketlerde iki ayrı isimlendirme. Üç persona da aynı kafa karışıklığını farklı yerlerde yaşadı.
- **"Sıradaki adım ne?" sorusunun cevabı yok:** akış yalnız deneme yanılma ile öğreniliyor.

**Divergent reactions:**
- **Mert** (yeni): kayboluyor, dashboard sayesinde toparlanıyor.
- **Selma** (deneyimli): akışı çözüyor ama form uzunluğundan ve isim tutarsızlığından şikâyetçi — hız kesici.
- **Ayhan** (firma sahibi): herkese açık tarafı daha güvenilir buldu; panel karmaşası onu ilgilendirmiyor ama paket isimleri onu da ilgilendiriyor.

---

## Önceliklendirilmiş Bulgular

### P1 — Satış senaryosuna doğrudan engel / güven riski

| # | Bulgu | Kanıt | Öneri |
|---|-------|-------|-------|
| 1 | **Ödeme adımı ölü uç gibi görünüyor.** "Ödemeye Geç" sonrası kart ödemesi yok; çalışan yol ("Anlaşmayı bildir — ödemesiz") sayfanın altında ve adı bile ödeme değil | `/temsilci/taslak/:id/odeme` | Adı "Anlaşma adımına geç" yap; çalışan yolu birincil buton olarak üste al |
| 2 | **Paket isimleri tutarsız:** herkese açık `Standart/Advance` ↔ panel `Normal/Öne Çıkan`; ayrıca İngilizce "Advance" | `/iletisim` vs ödeme sayfası | Tek isim kaynağı; her iki tarafta aynı ad |
| 3 | **Panelde iki "Ana Sayfa" linki** (biri `/`, biri `/temsilci`) | temsilci header/nav | Siteye giden linki "Siteyi gör" veya marka altına taşı |
| 4 | **Satış yaşam döngüsü panelde anlatılmıyor** (taslak → onay → ödeme → kesinleşme → komisyon) | tüm panel sayfaları | Dashboard'a 4 satırlık "Süreç" kartı ekle |

### P2 — Güven ve veri kalitesi (üretim yayını)

| # | Bulgu | Kanıt | Öneri |
|---|-------|-------|-------|
| 5 | **Test kayıtları yayında:** "Deneme 1-2-3-4-55-6-7", "Deneme A.Ş."; mükerrer telefonlar (05519759898 ×3, 05062776701 ×2); ekipte "RehberiX" adında üye | `/firmalar`, taslaklar, ekipler | Yayından temizle |
| 6 | **Karışık kitle mesajı:** hero hem işletme sahibine hem müşteriye sesleniyor | ana sayfa | Hero'yu tek kitleye netleştiren test et |
| 7 | **İletişim güven sinyali zayıf:** kişisel iCloud e-postası, "Afyoon Reklam" yazım hatası | `/iletisim` | Kurumsal e-posta + yazım düzeltmesi |

### P3 — Küçük UX

| # | Bulgu | Öneri |
|---|-------|-------|
| 8 | "Veri bağlantısı kuruluyor…" kapısı — içerik bağlantıya kilitli, yavaş ağda boş sayfa hissi | Yerel iskelet göster, bağlantı beklemeden |
| 9 | "Haritada Görüntüle" Google Maps **yol tarifi** (dir) linkine gidiyor; "Yol tarifi" ile aynı hedef | Place linki ver ya da metni "Yol tarifi" ile birleştir |
| 10 | Yeni firma formu uzun; saat bloğu yardım metni geliştirici dili | Sahaya uygun kısa yardım + isteğe bağlı alan gruplaması |
| 11 | Üretim girişinde herkese açık ödeme uyarısı + şifre alanında "demo" placeholder'ı | Uyarıyı yalnız ilgili role göster; "demo" ipucunu üretimden kaldır |
| 12 | Firma kartlarında "Kapalı" var, açılış saati yok | Kartta "Bugün 09:00'da açılır" gibi ipucu |

**Console hataları:** gezilen sayfalarda hata yok. **Erişilebilirlik (gözlemlenen):** "İçeriğe geç" skip-link, etiketli navigasyon mevcut.

---

## Ortam Notları ve Kısıtlar

- **Giriş:** Verilen demo/üretim hesap bilgisi Supabase tarafından `invalid_credentials` (400) ile reddedildi; kullanıcı tarayıcıdan kendi girişi yaptı, oturumla incelendi.
- **Yazma yok:** Hiçbir form gönderilmedi; taslak oluşturulmadı, anlaşma bildirilmedi, ödeme yapılmadı. Ödeme sayfasındaki butonlar seçim yapılmadan pasif kaldı.
- **Mobil test edilmedi:** Tarayıcı aracı viewport emülasyonu desteklemiyor — bulgular masaüstüne ait; mobil akış ayrı test edilmeli.
- Üretim adresi `firma5.netlify.app`; kod referansı yerel depodan (main @ `3528095`) doğrulandı.

---

### Top 3 Recommendations

1. **Adım isimlerini gerçeğe göre düzelt:** "Ödemeye Geç" → "Anlaşma adımına geç", çalışan (ödemesiz) yolu birincil yap, paneldeki çift "Ana Sayfa"yı ayır — satış akışının en büyük tıkanma noktası burada.
2. **Paket isimlerini tek kaynakta birleştir:** `Standart/Advance` ↔ `Normal/Öne Çıkan` uyuşmazlığını ve İngilizce "Advance"ı kaldır — satış görüşmesinde güven kaybına yol açıyor.
3. **Yayından test verisini temizle + panelde tek ekranlık "satış akışı nasıl işler" rehberi ekle:** "Deneme..." kayıtları canlı demoyu amatör gösteriyor; yeni temsilciye süreç şeması onboarding yükünü kaldırıyor.
