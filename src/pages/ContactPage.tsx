import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Compass,
  Inbox,
  Layers,
  Mail,
  MapPin,
  Megaphone,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { SEO } from "../components/SEO";
import CategorySelect from "../components/CategorySelect";
import LocationSelect from "../components/LocationSelect";
import { ErrorBanner, Field } from "../components/ui";
import {
  createPublicLead,
  getSettings,
  listCategories,
  listCities,
  listCompanies,
} from "../lib/repo";
import { submitWebLead } from "../lib/dataSource";
import { findCityByName } from "../lib/location";
import { formatTRY } from "../lib/format";
import { membershipPackages, type PackageKey } from "../lib/packages";
import { isSupabaseConfigured } from "../lib/supabase";
import "./contact.css";

/* İletişim bilgileri — sitede kullanılan gerçek değerler. */
const CONTACT_EMAIL = "kadirayb@icloud.com";
const CONTACT_PHONE_DISPLAY = "0551 975 98 98";
const CONTACT_PHONE_HREF = "tel:+905519759898";
const CONTACT_ADDRESS = ["Afyon Reklam", "Kurtuluş Caddesi No:45/3", "Merkez / Afyon"];

/* Sosyal kanıt daireleri — rehberdeki ilk firmaların baş harfleri (dekoratif). */
const AVATAR_COLORS = ["#2563eb", "#16a34a", "#f97316", "#8b5cf6", "#db2777"];

function firmInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  const letters = words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [name.trim().slice(0, 2)];
  return letters.join("").toLocaleUpperCase("tr");
}

const FAQS = [
  {
    q: "Başvurum ne zaman yayınlanır?",
    a: "Formu gönderdikten sonra ekibimiz verdiğiniz numaradan sizi arar. Bilgiler tamamlandığında firma kaydınız rehberde yayına alınır.",
  },
  {
    q: "Firma eklemek için ne göndermeliyim?",
    a: "Firma adı ve telefon yeterli. Kategori, ilçe ve kısa bir açıklama eklerseniz kaydı daha hızlı tamamlıyoruz.",
  },
  {
    q: "Mevcut kaydımı nasıl düzeltirim?",
    a: "Firma adı ve doğru bilgilerle bize e-posta yazın; rehberdeki kaydınızı güncelleyelim.",
  },
  {
    q: "Üyelik paketlerinin farkı ne?",
    a: "Her iki pakette de firmanız rehberde listelenir. Öne Çıkan Paket ayrıca ana sayfadaki Öne Çıkanlar bölümünde gösterilir.",
  },
  {
    q: "Formu doldurunca ödeme alınıyor mu?",
    a: "Hayır. Form bir başvurudur; paket ve ödeme adımını telefonda birlikte netleştiriyoruz.",
  },
  {
    q: "Farklı bir şehirdeyim, yine de yazabilir miyim?",
    a: "Rehber Afyonkarahisar ile başladı ve şehir şehir büyüyor. Başka bir şehirdenseniz de yazın; uygun olduğunda sizi bilgilendiririz.",
  },
];

export function ContactPage() {
  const categories = listCategories();
  const cities = listCities();
  const companies = listCompanies();
  const packages = membershipPackages(getSettings());
  const proofFirms = companies.slice(0, 5);
  const districtCount = new Set(cities.flatMap((city) => city.districts)).size;

  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [packageKey, setPackageKey] = useState<PackageKey | "">("");
  const [note, setNote] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  // Honeypot: bot doldurulursa kayıt YAPILMAZ ama başarı gibi görünür.
  const [honeypot, setHoneypot] = useState("");

  return (
    <SEO
      title="İletişim | RehberiX"
      description="Firmanızı rehbere ekletmek, üyelik veya destek konularında bizimle iletişime geçin."
    >
      <div className="ct-page">
        {/* ——— 1) HERO ——— */}
        <section className="ct-hero">
          <div className="ct-wrap ct-hero__grid">
            <div className="ct-hero__copy">
              <span className="ct-hero__badge">
                Google, Harita, Yapay Zeka Sonuçlarında Görünür Ol
              </span>
              <h1 className="ct-h1">
                Bir Yere Kayıt Ol,
                <br />
                <span className="ct-h1__accent">Her Yerde Ol.</span>
              </h1>
              <p className="ct-lead">
                İşletmenizin dijital dünyadaki yerini güçlendirin. Google'da, haritalarda ve yapay
                zekâ destekli arama sonuçlarında daha kolay keşfedilmeniz için firmanızı dijital
                rehberimize ekleyin.
              </p>

              <div className="ct-hero__actions">
                <a className="ct-btn ct-btn--primary" href="#basvuru">
                  Başvuru formuna git
                  <ArrowRight size={18} strokeWidth={2.2} aria-hidden="true" />
                </a>
                <a className="ct-btn ct-btn--ghost" href="#sss">
                  Sık sorulan sorular
                </a>
              </div>

              {/* Sosyal kanıt — üst üste gelen daireler + rehberdeki gerçek firma sayısı */}
              <div className="ct-proof">
                <div className="ct-proof__avatars" aria-hidden="true">
                  {proofFirms.map((firm, i) => (
                    <span key={firm.id} style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                      {firmInitials(firm.name)}
                    </span>
                  ))}
                </div>
                <div className="ct-proof__count">
                  <strong>{companies.length}</strong>
                  <span>kayıtlı firma</span>
                </div>
              </div>
            </div>

            {/* Dekoratif panel önizlemesi — sayılar gerçek veriden dinamik */}
            <div className="ct-mock ct-dash" aria-hidden="true">
              <div className="ct-mock__bar">
                <span className="ct-mock__dot" />
                <span className="ct-mock__dot" />
                <span className="ct-mock__dot" />
                <span className="ct-mock__url">rehberix.com/panel</span>
              </div>

              <div className="ct-dash__toast">
                <span className="ct-dash__toast-icon">
                  <Inbox size={18} strokeWidth={2} />
                </span>
                <div>
                  <b>Yeni Başvuru</b>
                  <span>Ekibimiz değerlendiriyor</span>
                </div>
              </div>

              <div className="ct-dash__body">
                <div className="ct-dash__stats">
                  <div className="ct-dash__stat ct-dash__stat--blue">
                    <span className="ct-dash__stat-icon">
                      <CheckCircle2 size={16} strokeWidth={2.2} />
                    </span>
                    <strong>{companies.length}</strong>
                    <span className="ct-dash__stat-label">Kayıtlı Firma</span>
                  </div>
                  <div className="ct-dash__stat">
                    <span className="ct-dash__stat-icon">
                      <Layers size={16} strokeWidth={2.2} />
                    </span>
                    <strong>{categories.length}</strong>
                    <span className="ct-dash__stat-label">Kategori</span>
                  </div>
                </div>

                <ul className="ct-dash__list">
                  <li>
                    <span className="ct-dash__list-icon">
                      <Search size={16} strokeWidth={2.1} />
                    </span>
                    Google
                  </li>
                  <li>
                    <span className="ct-dash__list-icon">
                      <MapPin size={16} strokeWidth={2.1} />
                    </span>
                    Harita
                  </li>
                  <li>
                    <span className="ct-dash__list-icon">
                      <Sparkles size={16} strokeWidth={2.1} />
                    </span>
                    Yapay Zeka
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ——— 2) KİMİ İLGİLENDİRİR ——— */}
        <section className="ct-section ct-section--soft" id="konular">
          <div className="ct-wrap">
            <div className="ct-head">
              <span className="ct-eyebrow ct-eyebrow--box">Kimi İlgilendirir</span>
              <h2 className="ct-h2">Bu Hizmet Tam Size Göre mi?</h2>
              <p className="ct-sub">
                İnternette varlık göstermek isteyen herkes için — ama özellikle şunlar için
                tasarladık:
              </p>
            </div>

            <div className="ct-grid-2 ct-grid-2--audience">
              <article className="ct-card ct-card--topic">
                <span className="ct-icon ct-icon--blue">
                  <Building2 size={20} strokeWidth={1.9} aria-hidden="true" />
                </span>
                <h3>Firma Sahipleri</h3>
                <p>
                  Google'da çıkmak istiyorsunuz ama nereden başlayacağınızı bilmiyorsunuz. Firma
                  rehberleri, Google Maps, yerel aramalar — bunların hepsi birbirine bağlı.
                  Bilgilerinizi bir kez girin, profesyonel ekibimiz sizi doğru platforma kayıt
                  etsin.
                </p>
                <div className="ct-card__highlight">
                  Haritada, aramada, rehberde — hep ön sırada
                </div>
              </article>

              <article className="ct-card ct-card--topic">
                <span className="ct-icon ct-icon--amber">
                  <Megaphone size={20} strokeWidth={1.9} aria-hidden="true" />
                </span>
                <h3>Dijital Pazarlama Ajansları</h3>
                <p>
                  Müşteri portföyünüz büyüdükçe operasyonel yük de büyüyor. RehberiX ile bu iş
                  yükünü dışarıdan, raporlanmış ve takip edilebilir şekilde yürütün.
                </p>
                <div className="ct-card__highlight">
                  Ajansınızın operasyonel kapasitesini artırın
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ——— 3) KANALLAR ——— */}
        <section className="ct-section">
          <div className="ct-wrap ct-split">
            <div className="ct-split__copy">
              <span className="ct-eyebrow">İLETİŞİM KANALLARI</span>
              <h2 className="ct-h2">Bize ulaşmanın dört yolu</h2>
              <p className="ct-sub">
                Formu doldurmak zorunda değilsiniz. Hangi kanal size kolaysa oradan yazın; tüm
                mesajlar aynı ekibe düşer.
              </p>
              <ul className="ct-list">
                <li>Form başvurularını telefonla tamamlıyoruz.</li>
                <li>Kayıt düzeltmelerini e-posta üzerinden yürütüyoruz.</li>
                <li>Adres bilgisi rehberdeki firma sayfalarında da görünür.</li>
              </ul>
            </div>

            <div className="ct-grid-2 ct-grid-2--tight">
              <a className="ct-card ct-card--info" href={`mailto:${CONTACT_EMAIL}`}>
                <span className="ct-icon ct-icon--blue">
                  <Mail size={18} strokeWidth={1.9} aria-hidden="true" />
                </span>
                <h3>E-posta</h3>
                <p className="ct-card__value">{CONTACT_EMAIL}</p>
                <span className="ct-card__hint">Yazın →</span>
              </a>

              <a className="ct-card ct-card--info" href={CONTACT_PHONE_HREF}>
                <span className="ct-icon ct-icon--green">
                  <Phone size={18} strokeWidth={1.9} aria-hidden="true" />
                </span>
                <h3>Telefon</h3>
                <p className="ct-card__value">{CONTACT_PHONE_DISPLAY}</p>
                <span className="ct-card__hint">Arayın →</span>
              </a>

              <div className="ct-card ct-card--info">
                <span className="ct-icon ct-icon--amber">
                  <MapPin size={18} strokeWidth={1.9} aria-hidden="true" />
                </span>
                <h3>Adres</h3>
                <p className="ct-card__value">
                  {CONTACT_ADDRESS.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </p>
              </div>

              <a className="ct-card ct-card--info" href="#basvuru">
                <span className="ct-icon ct-icon--navy">
                  <Compass size={18} strokeWidth={1.9} aria-hidden="true" />
                </span>
                <h3>Başvuru formu</h3>
                <p className="ct-card__value">Firma bilgileri</p>
                <span className="ct-card__hint">Formu doldurun →</span>
              </a>
            </div>
          </div>
        </section>

        {/* ——— 4) FORM ——— */}
        <section className="ct-section ct-section--soft" id="basvuru">
          <div className="ct-wrap ct-split ct-split--top">
            <div className="ct-split__copy">
              <span className="ct-eyebrow">BAŞVURU</span>
              <h2 className="ct-h2">Firmanızı rehbere ekletin</h2>
              <p className="ct-sub">
                Temel bilgileri paylaşın; ekibimiz sizi arayıp kaydı tamamlar ve firmanız rehberde
                yayına alınır.
              </p>
              <ul className="ct-checks">
                <li>
                  <CheckCircle2 size={18} strokeWidth={2.2} aria-hidden="true" />
                  Form yalnızca başvuru içindir, ödeme almaz.
                </li>
                <li>
                  <CheckCircle2 size={18} strokeWidth={2.2} aria-hidden="true" />
                  Dönüş, verdiğiniz telefon numarasından yapılır.
                </li>
                <li>
                  <CheckCircle2 size={18} strokeWidth={2.2} aria-hidden="true" />
                  Bilgileriniz yalnızca kayıt işlemi için kullanılır.
                </li>
              </ul>
            </div>

            <div className="ct-form-card" id="form">
              {sent ? (
                <div className="ct-sent">
                  <span className="ct-sent__icon" aria-hidden="true">
                    <CheckCircle2 size={28} strokeWidth={1.9} />
                  </span>
                  <h3>Başvurunuz alındı.</h3>
                  <p>
                    Ekibimiz en kısa sürede sizi arayacak. Destek konularında bu sayfadaki
                    kanallardan da ulaşabilirsiniz.
                  </p>
                  <a className="ct-btn ct-btn--ghost" href={`mailto:${CONTACT_EMAIL}`}>
                    E-posta gönder
                  </a>
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setError(null);
                    if (honeypot) {
                      // Honeypot doldurdu → bot. Kayıt oluşturulmaz, başarı gibi görünür.
                      setSent(true);
                      return;
                    }
                    setSubmitting(true);
                    try {
                      const data = {
                        companyName,
                        categoryId: categoryId || undefined,
                        // İl, veritabanındaki şehir kaydına eşlenir; olmayan iller
                        // yalnız ilçe metniyle kaydedilir (şema dışına çıkmadan).
                        cityId: findCityByName(cities, province)?.id,
                        district: district || undefined,
                        phone,
                        note,
                        packageKey: packageKey || undefined,
                      };
                      if (isSupabaseConfigured) {
                        // Canlı mod: yazma yalnız 0006 submit_web_lead RPC'siyle —
                        // şema anonime AÇILMADI, sunucu doğrulama + rate limit + honeypot uygular.
                        await submitWebLead(data);
                      } else {
                        // Demo mod: aynı yerel rep akışı
                        createPublicLead(data);
                      }
                      setSent(true);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Başvuru kaydedilemedi.");
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                >
                  <div className="form-grid">
                    <Field label="Firma adı" required>
                      <input
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        required
                        placeholder="Örn. Kadınana Pastanesi"
                      />
                    </Field>
                    <Field label="Telefon" required>
                      <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        required
                        placeholder="0272 000 00 00"
                        inputMode="tel"
                      />
                    </Field>
                    <Field label="Kategori">
                      <CategorySelect
                        categories={categories}
                        value={categoryId}
                        onChange={setCategoryId}
                        allLabel="Seçin (opsiyonel)"
                        ariaLabel="Kategori"
                      />
                    </Field>
                    <LocationSelect
                      stacked
                      value={{ province, district }}
                      onChange={(next) => {
                        setProvince(next.province);
                        setDistrict(next.district);
                      }}
                      extraProvinces={cities.map((c) => c.name)}
                      extraDistricts={findCityByName(cities, province)?.districts ?? []}
                    />
                  </div>
                  <Field
                    label="Paket seçimi (opsiyonel)"
                    hint="Şimdi seçmek zorunlu değil; paketi telefonda da netleştirebiliriz."
                  >
                    <select
                      value={packageKey}
                      onChange={(e) => setPackageKey(e.target.value as PackageKey | "")}
                    >
                      <option value="">Seçin (opsiyonel)</option>
                      {packages.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.label} — {formatTRY(p.amount)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Kısa açıklama (opsiyonel)">
                    <textarea
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Hizmetleriniz veya eklemek istediğiniz not…"
                    />
                  </Field>
                  {/* Honeypot — görsel olarak gizli, sekme akışı dışı */}
                  <input
                    type="text"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    aria-hidden="true"
                    tabIndex={-1}
                    autoComplete="off"
                    style={{ position: "absolute", left: -9999, width: 1, height: 1 }}
                  />
                  {error && <ErrorBanner message={error} />}
                  <button className="ct-btn ct-btn--primary ct-btn--block" type="submit" disabled={submitting}>
                    {submitting ? "Gönderiliyor…" : "Başvuruyu gönder"}
                  </button>
                  <p className="ct-form-card__note">
                    Gönderdiğiniz bilgiler yalnızca başvurunuz için kullanılır.
                  </p>
                </form>
              )}
            </div>
          </div>
        </section>

        {/* ——— 5) PAKETLER ——— */}
        <section className="ct-section" id="paketler">
          <div className="ct-wrap">
            <div className="ct-head">
              <span className="ct-eyebrow">PAKETLER</span>
              <h2 className="ct-h2">Firma üyelik paketleri</h2>
              <p className="ct-sub">
                Her iki pakette de firmanız rehberde listelenir. Öne Çıkan Paket ek görünürlük
                sağlar.
              </p>
            </div>

            <div className="ct-grid-2">
              <article className="ct-card ct-card--package">
                <div className="ct-card__head">
                  <span className="ct-icon ct-icon--blue">
                    <Compass size={19} strokeWidth={1.9} aria-hidden="true" />
                  </span>
                  <h3>Normal Paket</h3>
                </div>
                <div className="ct-price">
                  1.000 <span>TL</span>
                </div>
                <p>
                  İşletmeniz RehberiX'te listelenir; ziyaretçiler firma profilinizi ve iletişim
                  bilgilerinizi görüntüleyebilir.
                </p>
                <a className="ct-btn ct-btn--ghost ct-btn--block" href="#basvuru">
                  Bu paketle başvur
                </a>
              </article>

              <article className="ct-card ct-card--package ct-card--featured">
                <div className="ct-card__head">
                  <span className="ct-icon ct-icon--blue">
                    <Sparkles size={19} strokeWidth={1.9} aria-hidden="true" />
                  </span>
                  <h3>Öne Çıkan Paket</h3>
                  <span className="ct-tag">Öne çıkan</span>
                </div>
                <div className="ct-price">
                  2.000 <span>TL</span>
                </div>
                <p>
                  Normal Paket kapsamına ek olarak işletmeniz, ana sayfadaki Öne Çıkanlar
                  bölümünde gösterilir.
                </p>
                <a className="ct-btn ct-btn--primary ct-btn--block" href="#basvuru">
                  Bu paketle başvur
                </a>
              </article>
            </div>
          </div>
        </section>

        {/* ——— 6) SÜREÇ ——— */}
        <section className="ct-section ct-section--soft" id="surec">
          <div className="ct-wrap">
            <div className="ct-head">
              <span className="ct-eyebrow">SÜRECİMİZ</span>
              <h2 className="ct-h2">Başvurudan yayına, dört adım</h2>
              <p className="ct-sub">
                Otomatik sistem yok: her başvuru ekibimiz tarafından tek tek işlenir.
              </p>
            </div>

            <ol className="ct-steps">
              {[
                {
                  t: "Formu doldurun",
                  d: "Firma adı, telefon, kategori ve ilçe. Kısa bir açıklama eklerseniz kayıt daha hızlı tamamlanır.",
                },
                {
                  t: "Ekibimiz inceler",
                  d: "Bilgilerin eksik olup olmadığına bakıyoruz; aynı firmanın mükerrer kaydı varsa birleştiriyoruz.",
                },
                {
                  t: "Sizi telefonla ararız",
                  d: "Verdiğiniz numaradan ulaşıp paketi, kategoriyi ve varsa eksik bilgileri netleştiriyoruz.",
                },
                {
                  t: "Kaydınız yayına alınır",
                  d: "Firma profiliniz rehberde listelenir; bilgileri dilediğinizde birlikte güncelleyebiliriz.",
                },
              ].map((step, i) => (
                <li className="ct-step" key={step.t}>
                  <span className="ct-step__num" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="ct-step__body">
                    <h3>{step.t}</h3>
                    <p>{step.d}</p>
                  </div>
                </li>
              ))}
            </ol>

            <p className="ct-steps__note">
              Kayıtların rehberde görünmesi ekibimizin incelemesine bağlıdır. Amacımız bilgilerin
              eksiksiz ve doğru olması; nihai yayın kararı RehberiX ekibinindir.
            </p>
          </div>
        </section>

        {/* ——— 7) SAYILAR ——— */}
        <section className="ct-stats" aria-label="Rehberdeki güncel sayılar">
          <div className="ct-wrap ct-stats__grid">
            <div className="ct-stat">
              <strong>{companies.length}</strong>
              <span>Rehberdeki firma</span>
            </div>
            <div className="ct-stat">
              <strong>{categories.length}</strong>
              <span>Kategori</span>
            </div>
            <div className="ct-stat">
              <strong>{districtCount}</strong>
              <span>İlçe</span>
            </div>
          </div>
        </section>

        {/* ——— 8) HİKAYE ——— */}
        <section className="ct-section">
          <div className="ct-wrap ct-story">
            <div>
              <span className="ct-eyebrow">HİKAYEMİZ</span>
              <h2 className="ct-h2">Neden RehberiX?</h2>
              <p className="ct-sub">
                Yerel işletmelerin internette bulunması çoğu zaman bir dizin kaydına bakıyor. Ama
                kayıtlar eskiyor, numaralar değişiyor, adresler yanlış kalıyor.
              </p>
              <p className="ct-sub">
                RehberiX'i Afyonkarahisar'da bu boşluğu kapatmak için kurduk: bilgileri tek tek
                doğruluyor, firmaları kategori ve ilçe bazında düzenliyoruz.
              </p>
              <p className="ct-sub">
                Bugün tek şehirdeyiz. Doğru bilgiyle büyümeyi, kaliteden ödün vermemeyi
                hedefliyoruz.
              </p>
            </div>

            <figure className="ct-quote">
              <span className="ct-quote__mark" aria-hidden="true">
                “
              </span>
              <blockquote>
                Bir firmanın internette bulunması, dükkânının kapısının açık olması gibidir.
                RehberiX o kapıyı açık tutmak için var.
              </blockquote>
              <figcaption>— RehberiX Ekibi</figcaption>
            </figure>
          </div>
        </section>

        {/* ——— 9) SSS ——— */}
        <section className="ct-section ct-section--soft" id="sss">
          <div className="ct-wrap">
            <div className="ct-head">
              <span className="ct-eyebrow">MERAK EDİLENLER</span>
              <h2 className="ct-h2">Aklınızdaki sorular</h2>
            </div>

            <div className="ct-faq">
              {FAQS.map((item, i) => {
                const open = openFaq === i;
                return (
                  <div className={`ct-faq__item${open ? " is-open" : ""}`} key={item.q}>
                    <h3>
                      <button
                        type="button"
                        className="ct-faq__q"
                        aria-expanded={open}
                        aria-controls={`ct-faq-${i}`}
                        onClick={() => setOpenFaq(open ? null : i)}
                      >
                        <span>{item.q}</span>
                        <span className="ct-faq__icon" aria-hidden="true">
                          <Plus size={16} strokeWidth={2.6} />
                        </span>
                      </button>
                    </h3>
                    <div className="ct-faq__a" id={`ct-faq-${i}`} hidden={!open}>
                      {item.a}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ——— 10) CTA ——— */}
        <section className="ct-cta">
          <div className="ct-wrap ct-cta__inner">
            <ShieldCheck className="ct-cta__mark" size={34} strokeWidth={1.7} aria-hidden="true" />
            <h2>
              Firmanızı rehbere ekleyin,
              <br />
              <span>yerel aramalarda görünür olun.</span>
            </h2>
            <p>
              Formu doldurun; ekibimiz bilgileri tamamlayıp kaydınızı rehberde yayına alsın.
            </p>
            <div className="ct-cta__actions">
              <a className="ct-btn ct-btn--light" href="#basvuru">
                Başvuru formu
                <ArrowRight size={18} strokeWidth={2.2} aria-hidden="true" />
              </a>
              <Link className="ct-btn ct-btn--outline-light" to="/firmalar">
                Firmaları keşfet
              </Link>
            </div>
            <p className="ct-cta__note">
              <Clock size={15} strokeWidth={2} aria-hidden="true" />
              Dönüşler telefonla yapılır; formu doldurmanız ödeme yükümlülüğü doğurmaz.
            </p>
          </div>
        </section>
      </div>
    </SEO>
  );
}
