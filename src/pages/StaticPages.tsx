import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SEO } from "../components/SEO";
import { ErrorBanner, Field, InfoBanner } from "../components/ui";
import { useAuth } from "../lib/auth";
import { createPublicLead, listCategories, listCities } from "../lib/repo";
import { isSupabaseConfigured } from "../lib/supabase";
import { isPaymentProviderConfigured } from "../lib/payments";
import { submitWebLead } from "../lib/dataSource";

/* ============ İLETİŞİM ============ */

export function ContactPage() {
  const categories = listCategories();
  const cities = listCities();
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [cityId, setCityId] = useState(cities[0]?.id ?? "");
  const [district, setDistrict] = useState("");
  const [note, setNote] = useState("");
  // Honeypot: bot doldurulursa kayıt YAPILMAZ ama başarı gibi görünür.
  const [honeypot, setHoneypot] = useState("");
  return (
    <SEO
      title="İletişim | Firma Rehberi"
      description="Firmanızı rehbere ekletmek veya destek için bize ulaşın."
    >
      <div className="section container" style={{ maxWidth: 720 }}>
        <div className="page-head">
          <h2>İletişim</h2>
          <p>
            Firmanızı rehbere eklemek, üyelik veya destek konularında bizimle iletişime geçin.
          </p>
        </div>
        <div className="how-grid">
          <div className="how-card">
            <span style={{ fontSize: "1.6rem" }}>📧</span>
            <h3>E-posta</h3>
            <p>
              <a href="mailto:info@firmarehberi.example.com">info@firmarehberi.example.com</a>
            </p>
          </div>
          <div className="how-card">
            <span style={{ fontSize: "1.6rem" }}>📞</span>
            <h3>Telefon</h3>
            <p>
              <a href="tel:08501234567">0850 123 45 67</a>
              <br />
              <span className="text-muted small">Hafta içi 09:00–18:00</span>
            </p>
          </div>
          <div className="how-card">
            <span style={{ fontSize: "1.6rem" }}>📍</span>
            <h3>Adres</h3>
            <p>Merkez / Afyonkarahisar</p>
          </div>
        </div>

        <div className="card card__pad mt-18">
          <h3 style={{ fontWeight: 800, marginBottom: 6 }}>Firmanızı rehbere ekletin</h3>
          <p className="text-muted small" style={{ marginBottom: 14 }}>
            Temel bilgileri paylaşın; ekibimiz sizi arayıp kaydı tamamlar ve temsilci aday
            listesine ekler.
          </p>
          {sent ? (
            <div>
              <p style={{ fontSize: "1.8rem", margin: "10px 0 6px" }} aria-hidden="true">
                ✅
              </p>
              <p style={{ fontWeight: 600, marginBottom: 6 }}>Başvurunuz alındı.</p>
              <p className="text-muted small">
                Ekibimiz en kısa sürede sizi arayacak. Bu sayfayı kullanarak destek konularında
                da ulaşabilirsiniz.
              </p>
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
                    cityId: cityId || undefined,
                    district: district || undefined,
                    phone,
                    note,
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
                  <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    <option value="">Seçin (opsiyonel)</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Şehir / ilçe">
                  <select value={cityId} onChange={(e) => setCityId(e.target.value)}>
                    {cities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    style={{ marginTop: 8 }}
                  >
                    <option value="">Tüm ilçeler</option>
                    {(cities.find((c) => c.id === cityId)?.districts ?? []).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
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
              <button className="btn btn--primary" type="submit" disabled={submitting}>
                {submitting ? "Gönderiliyor…" : "Başvuruyu gönder"}
              </button>
            </form>
          )}
        </div>

        <div className="card card__pad mt-18">
          <h3 style={{ fontWeight: 800, marginBottom: 6 }}>Not</h3>
          <p className="text-muted small">
            Form kayıtları platform içi aday listesinde denetimli tutulur; e-posta servisi
            entegrasyonu sonraki sürümde devreye alınacaktır.
          </p>
        </div>
      </div>
    </SEO>
  );
}

/* ============ HAKKIMIZDA ============ */

export function HakkindaPage() {
  return (
    <SEO title="Hakkımızda | Firma Rehberi">
      <div className="section container" style={{ maxWidth: 760 }}>
        <div className="page-head">
          <h2>Hakkımızda</h2>
        </div>
        <div className="card card__pad">
          <p style={{ lineHeight: 1.7 }}>
            <strong>Firma Rehberi</strong>; küçük ve orta ölçekli işletmelerin internette
            bulunabilirliğini artırmak amacıyla tasarlanmış bir yerel firma rehberi platformudur.
            İlk olarak Afyonkarahisar'da faaliyete geçmiştir; kısa sürede Türkiye genelinde il, ilçe
            ve kategori bazında yaygınlaşma hedefindedir.
          </p>
          <p style={{ lineHeight: 1.7 }} className="mt-14">
            Platform her işletmeye ayrıca paylaşılabilir ve arama motorlarında taranabilir bir sayfa
            sunar. İşletmeler kategoriye göre sıralanır; müşteriler telefon, adres, çalışma saatleri
            ve yol tarifi bilgilerine tek yerden erişir.
          </p>
        </div>
      </div>
    </SEO>
  );
}

/* ============ KVKK ============ */

export function KvkkPage() {
  return (
    <SEO title="KVKK Aydınlatma Metni | Firma Rehberi">
      <div className="section container" style={{ maxWidth: 760 }}>
        <div className="page-head">
          <h2>KVKK Aydınlatma Metni</h2>
          <p>6698 sayılı KVKK kapsamında özet bilgilendirme.</p>
        </div>
        <div className="card card__pad">
          <h3 style={{ fontWeight: 800, marginBottom: 6 }}>1. Veri Sorumlusu</h3>
          <p className="text-muted" style={{ lineHeight: 1.65 }}>
            Firma Rehberi platformu. Ticari marka/unvan kayıtları kurumsallaşma aşamasında
            tamamlanacaktır.
          </p>
          <h3 style={{ fontWeight: 800, margin: "16px 0 6px" }}>2. İşlenen Veriler</h3>
          <p className="text-muted" style={{ lineHeight: 1.65 }}>
            Halka açık sayfalarda gerçek kişisel veri işlenmez; işletmelere ait ticari iletişim
            bilgileri (unvan, telefon, adres) açık kaynak olarak sunulur. Yönetim ve temsilci
            panellerindeki geçici oturum bilgileri yalnızca erişim denetimi amacıyla işlenir ve
            kısıtlı tutulur.
          </p>
          <h3 style={{ fontWeight: 800, margin: "16px 0 6px" }}>3. Kişisel Veri Talepleri</h3>
          <p className="text-muted" style={{ lineHeight: 1.65 }}>
            KVKK m.11 kapsamındaki taleplerinizi{" "}
            <a href="mailto:info@firmarehberi.example.com">info@firmarehberi.example.com</a>{" "}
            üzerinden iletebilirsiniz; talepler 30 gün içinde yanıtlanır.
          </p>
        </div>
      </div>
    </SEO>
  );
}

/* ============ KULLANIM KOŞULLARI ============ */

export function TermsPage() {
  return (
    <SEO title="Kullanım Koşulları | Firma Rehberi">
      <div className="section container" style={{ maxWidth: 760 }}>
        <div className="page-head">
          <h2>Kullanım Koşulları</h2>
        </div>
        <div className="card card__pad">
          <p className="text-muted" style={{ lineHeight: 1.7 }}>
            Sitedeki firma bilgileri işletmeler tarafından sağlanır; doğruluk çalışılsa da güncelliği
            taahhüt edilemez. Yanlış veya yanıltıcı içerik tespit edilen kayıtlar platform
            tarafından yayından kaldırılabilir. Yönetim ve temsilci panelleri yalnızca yetkili
            hesaplara açıktır; yetkisiz erişim girişimleri kayıt altına alınır.
          </p>
        </div>
      </div>
    </SEO>
  );
}

/* ============ 404 ============ */

export function NotFoundPage() {
  return (
    <SEO title="Sayfa bulunamadı | Firma Rehberi" noindex>
      <div className="section container" style={{ padding: "48px 16px" }}>
        <div className="empty-state">
          <span className="empty-state__icon" aria-hidden="true">🧭</span>
          <h3>Sayfa bulunamadı</h3>
          <p>Aradığınız sayfa taşınmış ya da hiç var olmamış olabilir.</p>
          <Link className="btn btn--primary" to="/">
            Ana sayfaya dön
          </Link>
        </div>
      </div>
    </SEO>
  );
}

/* ============ GİRİŞ SAYFASI ============ */

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (user) {
    // Zaten giriş yapılmışsa rol sayfasına yönlendir
    return <RoleRedirect role={user.role} />;
  }

  return (
    <SEO title="Giriş | Firma Rehberi Paneller" noindex>
      <div className="auth-wrap">
        <div className="auth-card">
          <h1>Panellere giriş</h1>
          <p>Yönetim ve satış temsilcisi girişi buradan yapılır.</p>

          {!isSupabaseConfigured && (
            <InfoBanner>
              <strong>Demo mod:</strong> Supabase kimlik doğrulaması henüz yapılandırılmadı.
              Örnek hesaplar: <code>admin@demo.com</code> (yönetici), <code>ayse@demo.com</code>,{" "}
              <code>mehmet@demo.com</code> — şifre: <code>demo</code>.
            </InfoBanner>
          )}
          {!isPaymentProviderConfigured && (
            <InfoBanner>
              Ödeme sağlayıcısı entegrasyonu yapılandırılmadı; bu sürümde gerçek kart ödemesi devre
              dışıdır.
            </InfoBanner>
          )}

          {error && <ErrorBanner message={error} />}

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setPending(true);
              setError(null);
              const res = await login(email, password);
              setPending(false);
              if (res.ok) {
                navigate(res.role === "admin" ? "/yonetim" : "/temsilci", { replace: true });
              } else {
                setError(res.error ?? "Giriş başarısız.");
              }
            }}
          >
            <label className="field">
              <span className="field__label">E-posta</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
                placeholder="ornek@demo.com"
              />
            </label>
            <label className="field">
              <span className="field__label">Şifre</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="demo"
              />
            </label>
            <button className="btn btn--primary btn--block" type="submit" disabled={pending}>
              {pending ? "Giriş yapılıyor…" : "Giriş yap"}
            </button>
          </form>
          <p className="text-muted small mt-14">
            <Link to="/">← Siteye dön</Link>
          </p>
        </div>
      </div>
    </SEO>
  );
}

function RoleRedirect({ role }: { role: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(role === "admin" ? "/yonetim" : "/temsilci", { replace: true });
  }, [navigate, role]);
  return (
    <div className="auth-wrap">
      <div className="auth-card">Giriş yapılmış, yönlendiriliyorsunuz…</div>
    </div>
  );
}
