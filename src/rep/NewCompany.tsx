import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Info, Loader2, Plus, ShieldCheck } from "lucide-react";
import { AddressFields, type AddressSelection } from "../admin/AddressFields";
import CategorySelect from "../components/CategorySelect";
import CompanyLocationMap, { type LocationPinSource } from "../components/CompanyLocationMap";
import { useActor } from "../lib/auth";
import { findCityByName } from "../lib/location";
import { createLead, listCategories, listCities, listCompanies } from "../lib/repo";
import { checkDuplicate } from "./duplicate";

type CheckState = "idle" | "checking" | "none" | "exists" | "unavailable";

export default function RepNewCompany() {
  const actor = useActor();
  const navigate = useNavigate();
  const categories = listCategories();
  const cities = listCities();
  const suggestionCompanies = listCompanies();

  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [location, setLocation] = useState<AddressSelection>({
    cityId: "",
    district: "",
    address: "",
    province: "",
  });
  const [coords, setCoords] = useState<{ latitude?: number; longitude?: number }>({});
  const [pinSource, setPinSource] = useState<LocationPinSource | null>(null);
  const [note, setNote] = useState("");

  const [check, setCheck] = useState<CheckState>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const matchedCity = findCityByName(cities, location.province);
  /** Seçilen il `cities` tablosunda yoksa taslak adres/konum yine saklanır; yönetici eşler. */
  const missingCity = Boolean(location.province && !matchedCity);

  async function runCheck(name: string) {
    if (name.trim().length < 2) {
      setCheck("idle");
      return "none" as const;
    }
    setCheck("checking");
    const result = await checkDuplicate(name);
    setCheck(result);
    return result;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (companyName.trim().length < 2) {
      setError("Firma adı en az 2 karakter olmalıdır.");
      return;
    }

    setBusy(true);
    try {
      const result = await runCheck(companyName);
      if (result === "exists") {
        setError(
          "Bu firma rehberde kayıtlı görünüyor. Mükerrer kayıt oluşturulmadı; gerekirse yöneticiyle iletişime geçin.",
        );
        return;
      }
      createLead(
        {
          companyName,
          categoryId,
          cityId: matchedCity?.id ?? "",
          district: matchedCity ? location.district : "",
          phone,
          email,
          socials: { whatsapp, instagram, facebook },
          address: location.address,
          ...(coords.latitude !== undefined && coords.longitude !== undefined
            ? { latitude: coords.latitude, longitude: coords.longitude }
            : {}),
          note,
        },
        actor,
      );
      navigate("/temsilci/taslaklar", { state: { created: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Taslak kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rep-stack" style={{ maxWidth: 720, margin: "0 auto" }}>
      <div>
        <Link className="rep-backlink" to="/temsilci">
          <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
          Ana sayfa
        </Link>
        <div className="rep-pagehead">
          <h1>Yeni firma ekle</h1>
          <p>
            Firma bilgilerini girin. Kayıt taslak olarak size bağlanır; yönetici onayı olmadan
            rehberde yayınlanmaz.
          </p>
        </div>
      </div>

      <form className="rep-card rep-form" onSubmit={onSubmit} noValidate>
        <div className="rep-field">
          <label htmlFor="companyName">
            Firma adı <span>*</span>
          </label>
          <input
            id="companyName"
            className="rep-input"
            value={companyName}
            onChange={(e) => {
              setCompanyName(e.target.value);
              if (check !== "idle") setCheck("idle");
            }}
            onBlur={() => {
              if (companyName.trim().length >= 3) void runCheck(companyName);
            }}
            placeholder="Örn. Aybar Mimarlık"
            autoComplete="organization"
            required
          />
          {check === "checking" && (
            <small>
              <Loader2 size={12} strokeWidth={2.2} aria-hidden="true" /> Rehberde kontrol ediliyor…
            </small>
          )}
          {check === "exists" && (
            <small style={{ color: "var(--rep-danger)", fontWeight: 600 }}>
              Bu isimde bir firma rehberde kayıtlı görünüyor.
            </small>
          )}
          {check === "none" && (
            <small style={{ color: "var(--rep-success)", fontWeight: 600 }}>
              Benzer kayıt bulunamadı.
            </small>
          )}
          {check === "unavailable" && (
            <small style={{ color: "var(--rep-warning)", fontWeight: 600 }}>
              Mükerrer kontrolü yapılamadı; kayıt işlemi yine de devam edebilir.
            </small>
          )}
        </div>

        <div className="rep-field">
          <label htmlFor="phone">Telefon</label>
          <input
            id="phone"
            className="rep-input"
            value={phone}
            onChange={(e) => {
              const nextPhone = e.target.value;
              setPhone(nextPhone);
              setWhatsapp((current) => (!current || current === phone ? nextPhone : current));
            }}
            placeholder="05xx xxx xx xx"
            inputMode="tel"
            autoComplete="tel"
          />
        </div>

        <div className="rep-field">
          <label htmlFor="email">E-posta</label>
          <input id="email" className="rep-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="firma@ornek.com" autoComplete="email" />
        </div>

        <div className="rep-field">
          <label htmlFor="whatsapp">WhatsApp numarası</label>
          <input id="whatsapp" className="rep-input" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="Telefonla aynıysa boş bırakabilirsiniz" inputMode="tel" />
          <small>Boş bırakırsanız firma telefonu WhatsApp numarası olarak kullanılır.</small>
        </div>

        <div className="rep-field">
          <label htmlFor="instagram">Instagram</label>
          <input id="instagram" className="rep-input" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="Kullanıcı adı veya profil bağlantısı" autoComplete="url" />
        </div>

        <div className="rep-field">
          <label htmlFor="facebook">Facebook</label>
          <input id="facebook" className="rep-input" value={facebook} onChange={(e) => setFacebook(e.target.value)} placeholder="Sayfa adı veya profil bağlantısı" autoComplete="url" />
        </div>

        <div className="rep-field">
          <label>Kategori</label>
          <CategorySelect
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            placeholder="Seçiniz"
            ariaLabel="Kategori"
          />
        </div>

        <AddressFields
          cities={cities}
          companies={suggestionCompanies}
          initialCityId={location.cityId}
          initialDistrict={location.district}
          initialAddress={location.address}
          onChange={(next) => {
            const addressChanged =
              next.cityId !== location.cityId ||
              next.district !== location.district ||
              next.address !== location.address;
            setLocation(next);
            if (addressChanged && pinSource !== "manual") {
              setCoords({});
              setPinSource(null);
            }
          }}
        />

        <CompanyLocationMap
          address={location.address}
          district={location.district}
          province={location.province}
          latitude={coords.latitude}
          longitude={coords.longitude}
          onChange={(next, source) => {
            setCoords({
              latitude: next?.latitude,
              longitude: next?.longitude,
            });
            setPinSource(next ? (source === "manual" ? "manual" : "geocode") : null);
          }}
        />

        {missingCity && (
          <div className="rep-note rep-note--warn" role="note">
            <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" />
            <span>
              <strong>{location.province}</strong> henüz şehir kayıtlarında tanımlı değil. Taslak
              firma bilgileriyle kaydedilecek; il/ilçe bilgisi yönetici firma onayında
              tamamlanacak.
            </span>
          </div>
        )}

        <div className="rep-field">
          <label htmlFor="note">Not</label>
          <textarea
            id="note"
            className="rep-textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Yetkili kişi, görüşme notu veya diğer bilgiler"
          />
        </div>

        <div className="rep-note">
          <Info size={16} strokeWidth={1.9} aria-hidden="true" />
          <span>
            İletişim ve sosyal medya bilgileri taslakla birlikte saklanır; yönetici onayı sırasında
            firma kaydına aktarılır. WhatsApp alanını boş bırakırsanız telefon numarası kullanılır.
          </span>
        </div>

        {error && (
          <div className="rep-note rep-note--danger" role="alert">
            <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className="rep-form__actions">
          <Link className="rep-btn rep-btn--ghost" to="/temsilci">
            Vazgeç
          </Link>
          <button type="submit" className="rep-btn rep-btn--primary" disabled={busy}>
            {busy ? (
              <>
                <Loader2 size={17} strokeWidth={2.2} aria-hidden="true" />
                Kaydediliyor…
              </>
            ) : (
              <>
                <Plus size={17} strokeWidth={2.2} aria-hidden="true" />
                Taslak olarak kaydet
              </>
            )}
          </button>
        </div>

        <div className="rep-note rep-note--success">
          <ShieldCheck size={16} strokeWidth={1.9} aria-hidden="true" />
          <span>
            Bu form rehberde arama yapmaz ve başka firmaların bilgilerini göstermez. Mükerrer
            kontrolü sunucuda yalnızca “var / yok” olarak yanıtlanır.
          </span>
        </div>
      </form>
    </div>
  );
}
