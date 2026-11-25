# Sentetik Kullanıcı Geri Bildirimi — Yönetim Paneli / İşlem Merkezi

**Hedef:** RehberiX yönetim paneli → `/yonetim` (İşlem Merkezi)
**Geri bildirim türü:** Kullanılabilirlik + günlük operasyon takibi
**Tarih:** 26 Kasım 2026, 00:52 (yerel saat)
**Görünümler:** Masaüstü 1440×900 · Mobil 390×844
**Yöntem:** FreeBuff Local browser ile gerçek gezinme, tıklama, kaydırma ve klavye etkileşimi; DOM ölçümleri (taşma, hedef boyutu, kontrast, bölüm konumları).

## Test künyesi ve sınırlar

- Sayfa, canlı Supabase oturumu yerine **demo modda** incelendi: `vite --mode test` ile Supabase istemcisi oluşturulmadı, veriler yalnızca tarayıcıdaki seed kümesinden okundu. **Veritabanına hiçbir yazma yapılmadı.**
- Demo seed'inde bekleyen işlem sayısı **0** olduğu için işlem kuyruğunun dolu hâli, satır eylemleri (Onayla / Reddet / Kesinleştir / Yayınla), onay diyalogları ve satır içi durum rozetleri denenemedi. Kullanıcı sınırı gereği kayıt da oluşturulmadı.
- Yalnızca Dashboard incelendi; "Tüm satışlar", "Tümünü Gör" gibi bağlantıların hedef sayfalarına gidilmedi.
- Dashboard'da tablo veya trend grafiği yok; tek liste "En çok ziyaret edilen İlk 5 firma" ve o da boş. Tablo/grafik değerlendirmesi bu nedenle "yokluk" üzerinden yapıldı.
- Demo mod bilgi şeridi canlı ortamda görünmez; bulgulara dahil edilmedi.

---

## Persona oturumları

### 1. Selin — Yoğun çalışan yönetici (41, üç şube, günde ~5 dakika panel)

**Verdict:** Günlük iş takibi için yetersiz — görev tamamlanamadı (iş kuyruğuna ulaşmak için kaydırma gerekti).
**İlk izlenim:** 5/10

> **[SELİN — 00:47]** "İyi geceler, Platform"… Platform kim? Neyse. Sayfa bana önce sıfırları gösteriyor: 0 ziyaret, 0 etkileşim, 0 bekleyen. Benim tek sorusu şu: *bugün onay bekleyen ne var?* Cevap ekranın altında, 873. pikselde başlıyor.
>
> "Dijital Görünürlük" bloğu krem rengiyle gözümü çekiyor ama içi boş. İş özetindeki 12 firma / ₺2.000 tahsilat bilgisi ise minicik bir şeritte. Öncelik sırası ters kurulmuş.
>
> **Son söz:** "Bana 'iş yok' demek için iki ekran harcıyorsun; iş olduğunda da aynı yerde olacaksa her sabah kaydırmak zorundayım."

### 2. Murat — Sistemi her gün kullanan operasyon sorumlusu (32, günde 30+ kayıt)

**Verdict:** Kavram doğru, icra yavaş — iş akışına güveniyor, geri bildirim eksikliğine takılıyor.
**İlk izlenim:** 6/10

> **[MURAT — 00:49]** Tek kuyruk fikri doğru: para → yayın → bilgi sırası mantıklı, satır içi eylem de doğru çözüm. Ama "Yenile"ye bastım, hiçbir şey olmadı; ne dönen ikon ne "son güncelleme" saati. Verinin güncel olup olmadığını bilemiyorum.
>
> Menüde "Çeşitli" var; içinde Firma Hattı, İçe Aktarma, Ödeme Kayıtları, Üyelik Yenileme. Bunlar benim günlük işim ama adı "çeşitli". "Hakediş" ile "Ödeme Kayıtları" arasındaki farkı da ilk bakışta ayıramıyorum.
>
> **Son söz:** "Doğru ekranı kurmuşsunuz; yanlış yere koymuşsunuz."

### 3. Zeynep — Sisteme yeni başlayan yönetici (36, ilk hafta)

**Verdict:** Yön bulmakta zorlandı; boş durum metinleri yardımcı ama sayfa kimliği belirsiz.
**İlk izlenim:** 4/10

> **[ZEYNEP — 00:51]** Sayfaya girdim, başlık "İyi geceler, Platform". Sistem bana ismimle mi sesleniyor, yoksa "Platform" bir unvan mı? Sayfanın adı "İşlem Merkezi" sadece küçük bir üst etikette.
>
> "İlk 5 firma" alanı kocaman ve boş; "Henüz sayılmış ziyaret yok" yazıyor. Altında bir de yöntem açıklaması var: günlük/haftalık grafik gösterilmediği anlatılıyor. Yeni biri olarak önce neyi yapacağımı değil, neyin *olmadığını* okuyorum.
>
> **Son söz:** "Bana nereden başlayacağımı söyle; boş alanları değil."

---

## Masaüstü bulguları (1440×900)

| # | Önem | Alan | Sorun | Kullanıcıya etkisi | Öneri |
|---|------|------|-------|--------------------|-------|
| D1 | **Kritik** | Sayfa akışı | İşlem kuyruğu `y=873`te başlıyor; 900 px'lik ekranda yalnızca 27 px görünüyor. Hero 189 px + Dijital Görünürlük 386 px, kuyruğun önüne geçiyor. | Yönetici sayfayı açar açmaz günün işini göremiyor; her seferinde kaydırmak zorunda. "İşlem Merkezi" adıyla çelişiyor. | Kuyruğu Dijital Görünürlük'ün üstüne al; sıfır veri varken görünürlük bloğunu tek satırlık özete indir. |
| D2 | **Yüksek** | Bilgi hiyerarşisi | Sıfır verili Dijital Görünürlük 386 px ve görsel olarak baskın (krem panel, 17,9 px başlık, 24 px sıfırlar). "İş özeti" başlığı 10,9 px gri; KPI değerleri 19,8 px. | Dikkat operasyonel olmayan metriklere gidiyor; firma/tahsilat özeti ikincil görünüyor. | Sıfır durumda bloğu katla; dolu durumda bile KPI şeridinden sonra göster. "İş özeti"ni 14–16 px ve daha koyu yap. |
| D3 | **Yüksek** | Tekrar | "Bekleyen iş yok" mesajı dört yerde: hero'daki 0, hero alt metni, kuyruk boş başlığı, kuyruk açıklaması. | Gereksiz yoğunluk; kullanıcı aynı bilgiyi okuyup ilerleyemiyor. | Hero'da tek cümle bırak; kuyrukta yalnız başlık + tek satır açıklama kalsın. |
| D4 | **Orta** | Karşılama / H1 | Sayfanın tek H1'i saate göre değişen karşılama. Kullanıcı adı "Platform Yöneticisi" olduğu için "İyi geceler, **Platform**" çıkıyor. Gece metni motivasyon cümlesi içeriyor. | Sayfa kimliği kayboluyor; isim/unvan ayrımı hatalı; profesyonel tonda değil. | H1 sabit "İşlem Merkezi" olsun; karşılama alt satıra insin. İsim için `full_name`in ilk kelimesi yerine unvan ayıklayan kural kullan. |
| D5 | **Orta** | Navigasyon | "Çeşitli" başlığı altında Firma Hattı, İçe Aktarma, Ödeme Kayıtları, Üyelik Yenileme bir arada. "Firma Detayları" ile "Firma Hattı", "Hakediş" ile "Ödeme Kayıtları" anlamca örtüşüyor. | Günlük işini arayan operasyon sorumlusu yanlış bölüme giriyor; menü öğrenme maliyeti yüksek. | "Çeşitli"yi kaldır: "Ödemeler" (Ödeme Kayıtları + Üyelik Yenileme), "İçe Aktarma" ve "Firma Hattı"nı kendi bölümlerine taşı. "Hakediş"i "Komisyonlar" olarak netleştir. |
| D6 | **Orta** | Menü etkileşimi | Alt menü aç/kapat düğmeleri 30×30 px, menü satırları 34 px. Daraltılmış rayda 40 px satır, etiketler yalnız `title` ile. | Fareyle kullanılabilir; dokunmatik dizüstü ve motor becerisi kısıtlı kullanıcıda hata payı yüksek. | Düğmeleri 44×44'e, satırları en az 40 px'e çıkar; rayda kalıcı `aria-label` + görünür tooltip kullan. |
| D7 | **Düşük** | Sayfa meta | Sekme başlığı `/yonetim`de "Giriş | RehberiX Paneller" kalıyor; `robots: noindex` yok. | Yönetici çok sekme açtığında sayfayı ayırt edemiyor; panel sayfası arama motorlarına açık kalabilir. | Panel köküne `SEO title="İşlem Merkezi | RehberiX Yönetim" noindex` ekle. |
| D8 | **Düşük** | "Yenile" | Tıklama sonrası dönen ikon, "son güncelleme" saati veya kısa onay yok; içerik değişmese de işlem yapıldığı anlaşılmıyor. | Operasyon sorumlusu verinin tazeliğine güvenemiyor, gereksiz tekrar tıklıyor. | Düğmeye 400 ms spinner + "Son güncelleme: 00:49" satırı ekle. |
| D9 | **Düşük** | KPI şeridi | 5 kart tek satırda dengeli; ancak etiketler 11,8 px ve değerler Dijital Görünürlük sıfırlarından küçük. | Hızlı taramada firma/tahsilat rakamları gözden kaçıyor. | Değeri 24 px'e çıkar, etiketi 12,5–13 px yap; "Bekleyen tutar"ı ₺0 yerine "Temiz" rozetiyle de gösterebilirsin. |

### Masaüstünde iyi çalışan kararlar

- **Tek kuyruk kavramı** ve "para → yayın → bilgi" sıralaması doğru; satır içi eylem mantığı operasyon için uygun.
- Yapışkan kenar çubuğu ve üst bar; aktif menüde `aria-current="page"`, üstte kırıntı (`Yönetim › İşlem Merkezi`).
- Hero'da bekleyen işlem sayısı + tarih aynı bakışta; tarih Türkçe ve okunur.
- Boş durum metni ne bekleneceğini açıklıyor; sahte veri veya uydurma trend üretilmemiş, yöntem notu dürüst.
- 1440 px'de yatay taşma yok, metin kırpılması yok; konsolda hata yok.
- Menü daraltma çalışıyor (256 → 78 px), içerik genişliyor ve tercih `localStorage`ta kalıcı; klavye odak halkası görünür.
- Kontrast: gövde/lead 6,99:1, menü 16:1, amber üst etiket 5,26:1 — WCAG AA üstü.

---

## Mobil bulguları (390×844)

| # | Önem | Alan | Sorun | Kullanıcıya etkisi | Öneri |
|---|------|------|-------|--------------------|-------|
| M1 | **Kritik** | Sayfa akışı | İşlem kuyruğu `y=1426`da; hero 303 px, Dijital Görünürlük 696 px. İlk iki ekran neredeyse tamamen sıfır durumu. | Telefondan günlük kontrol yapan yönetici işini görmek için ~1,7 ekran kaydırıyor; "hızlı bakış" senaryosu çalışmıyor. | Mobilde sıra: kompakt durum satırı → işlem kuyruğu → iş özeti → görünürlük. Sıfır veride görünürlük bloğunu tek satıra indir. |
| M2 | **Yüksek** | Dijital Görünürlük | Boş "İlk 5 firma" paneli yaklaşık 250 px; üç ayrı açıklama paragrafı ve %0 çubukları var. | Ekranın en büyük bloğu, hiç veri olmayan bir alan; kaydırma maliyetini artırıyor. | Veri yokken yalnız "Henüz ziyaret sayımı yok" + tek satır yöntem notu göster; boş listeyi ve %0 çubuklarını gizle. |
| M3 | **Yüksek** | Hero | "0 Bekleyen işlem" kartı tam genişlikte ~100 px; tarih ayrı blok ve ayırıcı çizgi. | Değeri sıfır olan tek bilgi için fazla dikey alan; kuyruğu aşağı itiyor. | 0 durumunu tek satır rozete çevir (`✓ Bekleyen iş yok`), tarihi aynı satıra al. |
| M4 | **Orta** | İş özeti | 5 KPI 2 sütunda; 5. kart ("Bekleyen tutar") tek başına yarım satır, yanında boşluk. | Düzensiz görünüm; son kart gözden kaçıyor. | Son kartı tam genişlik yap veya 5 kartı yatay kaydırmalı tek şeride al. |
| M5 | **Orta** | Dokunma hedefleri | Üst barda menü ve "Siteyi gör" 34×34; alt menü aç/kapat 30×30; menü satırları 34 px; çıkış 30×30. | Başparmakla ıskalama; art arda yanlış menü açma. | Tüm ikon ve menü satırlarını en az 44×44 yap; çıkışa metin ekle. |
| M6 | **Yüksek (erişilebilirlik)** | Mobil menü | Drawer açılınca odak içine taşınmıyor; Tab, backdrop arkasındaki "Siteyi gör"e gidiyor. Kapalıyken menü bağlantıları erişilebilirlik ağacında kalıyor. | Klavye/screen reader kullanıcısı görünmeyen içerikte geziniyor; menü "modal" gibi davranmıyor. | Açılışta odağı kapat düğmesine taşı, `focus trap` uygula, kapanışta odağı menü düğmesine döndür; kapalıyken `inert`/`aria-hidden` kullan. Escape ve gövde kilidi zaten doğru çalışıyor. |
| M7 | **Düşük** | Drawer alt bilgisi | Menü içeriği 646 px, görünür alan 611 px; "Ayarlar / İşlem Geçmişi / Çıkış" için 35 px iç kaydırma gerekiyor. | Küçük ama fark edilir sürtünme; kullanıcı çıkışı bulamayabilir. | Alt bilgiyi sabitle veya üst bölümleri biraz sıkıştır. |
| M8 | **Düşük** | Bölüm başlıkları | "İŞ ÖZETİ" 10,9 px, "İşlem kuyruğu" 15,2 px; mobilde bölüm geçişleri zayıf hissediliyor. | Uzun kaydırmada nerede olduğunu kaybetme. | Bölüm başlıklarını 14–16 px ve daha güçlü kontrastla ver; gerekiyorsa yapışkan bölüm etiketi kullan. |

### Mobilde iyi çalışan kararlar

- **Yatay taşma yok:** `document.scrollWidth = 390`; hiçbir metin kırpılmıyor, tablo zorlaması yok.
- Dijital Görünürlük ve kuyruk eylemleri 44 px yüksekliğinde; ana dokunma hedefleri rahat.
- Kartlar tek sütuna doğru düzgün katlanıyor; KPI'lar iki sütunda okunaklı (178 px kart).
- Menü çekmecesi 256 px, backdrop ve gövde kaydırma kilidi çalışıyor; **Escape** ile kapanıyor.
- Kontrast ve punto okunur (lead 6,99:1); başlık 30,4 px ile net.
- Klavye odağı görünür (3 px mavi halka); kapalı menü ileri Tab sırasında atlanıyor.
- Mobil üst bar 58 px, kırıntı kırpılmıyor; "Siteyi gör" ikonu erişilebilir ad taşıyor.

---

## Persona üstü sentez

**Hepsinin takıldığı yer:**
- Sayfanın adı "İşlem Merkezi" ama ilk ekranda iş yok; sıfır metrikler ve boş görünürlük bloğu öne çıkıyor.
- Aynı "bekleyen iş yok" bilgisi farklı biçimlerde tekrarlanıyor.
- Menüde "Çeşitli" ve örtüşen bölüm adları yüzünden günlük işin yeri belirsiz.

**Ayrışan tepkiler:**
- **Selin** yalnızca hız odaklı: kuyruk ilk ekranda olmazsa sayfayı kullanmıyor.
- **Murat** kavramı beğeniyor; geri bildirim ve menü adlandırmasındaki belirsizliğe takılıyor.
- **Zeynep** sayfa kimliği ve ilk adım konusunda kayboluyor; boş durum açıklamalarını faydalı buluyor ama sırasını yanlış buluyor.

**Veri/grafik notu:** Dashboard'da trend grafiği yok ve olay geçmişi tutulmadığı için üretilmemesi doğru. Grafik eklenirse yalnız gerçek olay verisiyle yapılmalı; sıfır veride boş grafik gösterilmemeli.

---

## Önceliklendirilmiş iyileştirme listesi

| Öncelik | İş | Etki | Efor |
|---|---|---|---|
| **P0** | İşlem kuyruğunu Dijital Görünürlük'ün üstüne al; sıfır veride görünürlüğü tek satıra indir (masaüstü + mobil). | Kuyruk ilk ekranda; günlük kontrol tek bakışta. | S–M |
| **P0** | Sıfır durumunu tekilleştir: hero'da tek cümle, kuyrukta tek boş durum; boş İlk 5 listesini ve %0 çubuklarını gizle. | Dört tekrar ve ~250 px boş alan kalkar. | S |
| **P0** | Mobil hero'yu kompaktlaştır: 0 kartını rozete çevir, tarihi aynı satıra al. | Kuyruk ~100 px yukarı gelir. | S |
| **P1** | H1'i sabit "İşlem Merkezi" yap; karşılamayı alt satıra indir; "Platform" isim hatasını düzelt. | Sayfa kimliği ve profesyonel ton netleşir. | S |
| **P1** | Navigasyonu sadeleştir: "Çeşitli"yi kaldır, ödeme/üyelik/içe aktarma/firma hattını kendi bölümlerine taşı, "Hakediş"i "Komisyonlar" yap. | Doğru sayfaya ulaşma süresi kısalır. | M |
| **P1** | Mobil menüde odak tuzağı + açılış/kapanış odak yönetimi; kapalı menüyü `inert`/`aria-hidden` yap. | Klavye ve screen reader erişimi düzelir. | M |
| **P1** | Tüm ikon/menü hedeflerini ≥44 px yap. | Dokunmatik hata payı azalır. | S |
| **P2** | "Yenile"ye spinner + "Son güncelleme: HH:MM" ekle. | Veri tazeliğine güven artar. | S |
| **P2** | Panel sekme başlığını "İşlem Merkezi" yap ve `noindex` ekle. | Çoklu sekmede ayırt edilebilirlik; panelin indekslenmemesi. | S |
| **P2** | Mobilde 5. KPI kartını tam genişlik yap; bölüm başlıklarını büyüt. | Düzen ve taranabilirlik iyileşir. | S |
| **P2** | Kuyruk dolu hâlini (satırlar, eylemler, onay diyalogları) gerçek/onaylı test verisiyle ayrıca test et. | Bu raporda kapsanmayan en büyük risk kapanır. | M |

**Uygulama durumu:** Bu turda hiçbir kaynak dosya, veritabanı kaydı veya yapılandırma değiştirilmedi; yalnızca bu rapor oluşturuldu. Öneriler uygulanmadı.
