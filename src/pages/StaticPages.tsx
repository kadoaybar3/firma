import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Compass, MapPin } from "lucide-react";
import { SEO } from "../components/SEO";
import { ErrorBanner, Field, InfoBanner } from "../components/ui";
import { useAuth } from "../lib/auth";
import { createPublicApplication } from "../lib/repo";
import { isSupabaseConfigured } from "../lib/supabase";
import { isPaymentProviderConfigured } from "../lib/payments";
import { submitRepApplication } from "../lib/dataSource";

/* ============ PERSONEL BAŞVURUSU (referans bağlantısı) ============ */

/**
 * Halka açık personel başvuru formu (/basvuru?ref=AF-001).
 * Referans kimliği URL'den okunur ve formda değiştirilemez; sunucu kodu
 * yeniden çözerek personeli ve ekibini belirler (0012). Başvuru beklemede
 * kaydedilir — onay ve hesap oluşturma yalnız yöneticidedir (sonraki aşama).
 */
export function BasvuruPage() {
  const [searchParams] = useSearchParams();
  const refCode = (searchParams.get("ref") ?? "").trim().toUpperCase();
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  // Honeypot: bot doldurulursa başvuru YAPILMAYA ama başarı gibi görünür.
  const [honeypot, setHoneypot] = useState("");

  return (
    <SEO title="Personel Başvurusu | RehberiX" noindex>
      <div className="section container" style={{ maxWidth: 720 }}>
        <div className="page-head">
          <h2>Personel Başvurusu</h2>
          <p>
            Bir personelimizin referans bağlantısıyla geldiyseniz başvuru formunu doldurun.
            Başvurunuz değerlendirilmek üzere kaydedilir.
          </p>
        </div>

        <div className="card card__pad">
          {sent ? (
            <div>
              <p style={{ color: "var(--success)", margin: "10px 0 6px" }} aria-hidden="true">
                <CheckCircle2 size={30} strokeWidth={1.8} />
              </p>
              <p style={{ fontWeight: 600, marginBottom: 6 }}>Başvurunuz alındı.</p>
              <p className="text-muted small">
                Başvurunuz incelenmek üzere kaydedildi. Değerlendirme sonucu hakkında size
                dönüş yapılacaktır.
              </p>
            </div>
          ) : !refCode ? (
            <InfoBanner>
              Bu sayfa bir personel referans bağlantısıyla açılmalıdır. Başvurunuzu davet
              eden personele ulaşıp bağlantı isteyin.
            </InfoBanner>
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
                  const data = { firstName, lastName, phone, email, refCode, honeypot };
                  if (isSupabaseConfigured) {
                    // Canlı mod: yazma yalnız 0012 submit_rep_application RPC'siyle —
                    // referans personeli ve ekip SUNUCUDA çözülür.
                    await submitRepApplication(data);
                  } else {
                    // Demo mod: aynı yerel doğrulama ve kayıt
                    createPublicApplication(data);
                  }
                  setSent(true);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Başvuru kaydedilemedi.");
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {/* Referans personeli URL'den gelir; kullanıcı değiştiremez. */}
              <p className="text-muted small" style={{ margin: "0 0 12px" }}>
                Referans personel kodu: <strong>{refCode}</strong> — bağlantıyla
                geldiğiniz için bu alan değiştirilemez.
              </p>
              <div className="form-grid">
                <Field label="Ad" required>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    maxLength={50}
                    placeholder="Adınız"
                    autoComplete="given-name"
                  />
                </Field>
                <Field label="Soyad" required>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    maxLength={50}
                    placeholder="Soyadınız"
                    autoComplete="family-name"
                  />
                </Field>
                <Field label="Telefon" required>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    placeholder="0555 111 22 33"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </Field>
                <Field label="E-posta" required>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="ornek@eposta.com"
                    autoComplete="email"
                  />
                </Field>
              </div>
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
              <p className="text-muted small" style={{ marginTop: 10 }}>
                Başvuru, yönetici onayına kadar beklemede tutulur; gönderim kişisel bir
                personel hesabı oluşturmaz.
              </p>
            </form>
          )}
        </div>
      </div>
    </SEO>
  );
}

/* ============ HAKKIMIZDA ============ */

export function HakkindaPage() {
  return (
    <SEO title="Hakkımızda | RehberiX">
      <div className="section container" style={{ maxWidth: 760 }}>
        <div className="page-head">
          <h2>Hakkımızda</h2>
        </div>
        <div className="card card__pad">
          <p style={{ lineHeight: 1.7 }}>
            <strong>RehberiX</strong>; küçük ve orta ölçekli işletmelerin internette
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
    <SEO title="KVKK Aydınlatma Metni | RehberiX">
      <div className="section container" style={{ maxWidth: 760 }}>
        <div className="page-head">
          <h2>KVKK Aydınlatma Metni</h2>
          <p>6698 sayılı KVKK kapsamında özet bilgilendirme.</p>
        </div>
        <div className="card card__pad">
          <h3 style={{ fontWeight: 800, marginBottom: 6 }}>1. Veri Sorumlusu</h3>
          <p className="text-muted" style={{ lineHeight: 1.65 }}>
            Afyon Reklam, Kurtuluş Caddesi No:45/3, Merkez / Afyon. Veri sorumlusuna
            <a href="mailto:kadirayb@icloud.com">kadirayb@icloud.com</a> adresinden ulaşılabilir.
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
            KVKK m.11 kapsamındaki taleplerinizi <a href="mailto:kadirayb@icloud.com">kadirayb@icloud.com</a>
            adresine iletebilirsiniz; talepler 30 gün içinde yanıtlanır.
          </p>
        </div>
      </div>
    </SEO>
  );
}

/* ============ KULLANIM KOŞULLARI ============ */

export function TermsPage() {
  return (
    <SEO title="Kullanım Koşulları | RehberiX">
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
    <SEO title="Sayfa bulunamadı | RehberiX" noindex>
      <div className="section container" style={{ padding: "48px 16px" }}>
        <div className="empty-state">
          <span className="empty-state__icon" aria-hidden="true">
            <Compass size={34} strokeWidth={1.5} />
          </span>
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
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (user) {
    // Zaten giriş yapılmışsa rol sayfasına yönlendir
    return <RoleRedirect role={user.role} />;
  }

  return (
    <SEO title="Giriş | RehberiX Paneller" noindex>
      <div className="auth-wrap">
        <div className="auth-brand">
          <span className="auth-brand__mark" aria-hidden="true">
            <MapPin size={18} strokeWidth={2.1} />
          </span>
          <span className="auth-brand__text">
            <strong>RehberiX</strong>
            <span className="text-muted small">Afyonkarahisar işletme rehberi</span>
          </span>
        </div>
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
              const res = await login(identifier, password);
              setPending(false);
              if (res.ok) {
                navigate(res.role === "admin" ? "/yonetim" : "/temsilci", { replace: true });
              } else {
                setError(res.error ?? "Giriş başarısız.");
              }
            }}
          >
            <label className="field">
              <span className="field__label">E-posta veya telefon</span>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                required
                placeholder="ornek@demo.com veya 0555 000 00 00"
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
