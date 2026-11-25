import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Info, Loader2, Plus, ShieldCheck } from "lucide-react";
import { AddressFields, type AddressSelection } from "../admin/AddressFields";
import CategorySelect from "../components/CategorySelect";
import CompanyLocationMap from "../components/CompanyLocationMap";
import { useActor } from "../lib/auth";
import type { GoogleMapsPlace } from "../lib/googleMapsLink";
import {
  emptyHoursDraft,
  hoursDraftError,
  hoursDraftToCompanyHours,
  type HoursDraft,
} from "../lib/hours";
import { findCityByName } from "../lib/location";
import { createLead, listCategories, listCities, listCompanies } from "../lib/repo";
import { checkDuplicate, type DuplicateMatch, type DuplicateResult } from "./duplicate";
import GoogleMapsImport from "./GoogleMapsImport";
import HoursFields from "./HoursFields";

type CheckState = "idle" | "checking" | DuplicateResult["status"];

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
  /** Google Maps'ten aktarılan kesin konum varken adresten otomatik arama yapılmaz. */
  const [importedPin, setImportedPin] = useState(false);
  /** Adres alanlarını aktarılan değerlerle yeniden kurmak için (bileşen kendi durumunu tutar). */
  const [addressVersion, setAddressVersion] = useState(0);
  const [hours, setHours] = useState<HoursDraft>(emptyHoursDraft);
  const [note, setNote] = useState("");

  const [check, setCheck] = useState<CheckState>("idle");
  const [checkMatches, setCheckMatches] = useState<DuplicateMatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const matchedCity = findCityByName(cities, location.province);
  /** Seçilen il `cities` tablosunda yoksa taslak adres/konum yine saklanır; yönetici eşler. */
  const missingCity = Boolean(location.province && !matchedCity);

  /** Google Maps bağlantısından gelen bilgileri forma uygular; elle düzeltmeye açık kalır. */
  function applyMapsPlace(info: GoogleMapsPlace) {
    const hasCoords = info.latitude !== undefined && info.longitude !== undefined;
    setCoords(hasCoords ? { latitude: info.latitude, longitude: info.longitude } : {});
    setImportedPin(hasCoords);
    if (info.placeName && !companyName.trim()) setCompanyName(info.placeName);
    if (info.address) {
      // İl/ilçe bağlantı adresinden ayrıştırıldı; bulunamadıysa boş kalır.
      const province = info.province ?? "";
      setLocation({
        cityId: findCityByName(cities, province)?.id ?? "",
        district: info.district ?? "",
        address: info.address,
        province,
      });
      setAddressVersion((version) => version + 1);
    }
  }

  /** Kontrol sonucu yalnız bilgilendirme içindir; asla kayıt akışını durdurmaz. */
  async function runCheck(name: string) {
    if (name.trim().length < 2) {
      setCheck("idle");
      setCheckMatches([]);
      return;
    }
    setCheck("checking");
    const result = await checkDuplicate(name, actor);
    setCheck(result.status);
    setCheckMatches(result.matches);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (companyName.trim().length < 2) {
      setError("Firma adı en az 2 karakter olmalıdır.");
      return;
    }

    const hoursError = hoursDraftError(hours);
    if (hoursError) {
      setError(hoursError);
      return;
    }
    // Hiç açık gün yoksa saat alanı hiç gönderilmez (firma varsayılanı korunur).
    const savedHours = hoursDraftToCompanyHours(hours);

    setBusy(true);
    try {
      // Mükerrer kontrol sonuç gösterir; "exists" dahil her koşulda kayıt sürer.
      await runCheck(companyName);
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
          ...(savedHours ? { hours: savedHours } : {}),
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
              if (check !== "idle") {
                setCheck("idle");
                setCheckMatches([]);
              }
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
              Benzer kayıt bulundu (bilgilendirme):
              {checkMatches.map((m) => ` ${m.name}${m.district ? ` (${m.district})` : ""}`).join(",")}.
              Yine de kaydedebilirsiniz.
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
            searchOnMobile
          />
        </div>

        <GoogleMapsImport onApply={applyMapsPlace} />

        <AddressFields
          key={addressVersion}
          cities={cities}
          companies={suggestionCompanies}
          initialCityId={location.cityId}
          initialProvince={location.province}
          initialDistrict={location.district}
          initialAddress={location.address}
          onChange={(next) => {
            const addressChanged =
              next.cityId !== location.cityId ||
              next.district !== location.district ||
              next.address !== location.address;
            setLocation(next);
            // Adres değiştiyse eski koordinat artık geçerli değil; harita yeniden arar.
            if (addressChanged) {
              setCoords({});
              setImportedPin(false);
            }
          }}
        />

        <CompanyLocationMap
          address={location.address}
          district={location.district}
          province={location.province}
          latitude={coords.latitude}
          longitude={coords.longitude}
          autoGeocode={!importedPin}
          onChange={(next) => {
            // Pin elle taşınsa bile otomatik adres araması kapalı kalır; yalnız
            // adres alanı değişince yeniden açılır (aktarılan konum korunur).
            setCoords({
              latitude: next?.latitude,
              longitude: next?.longitude,
            });
          }}
        />

        <div className="rep-field">
          <span className="rep-hours__legend">Çalışma saatleri</span>
          <HoursFields value={hours} onChange={setHours} />
          <small>
            Kapalı bırakılan günler firma profilinde “Kapalı” olarak görünür. Hafta içi günleri
            (Pazartesi–Cuma) tek saat aralığı olarak saklanır; birini değiştirdiğinizde hafta içi
            günlerinin tümü aynı olur. Hiç gün açmazsanız firma kaydı yine de tamamlanır.
          </small>
        </div>

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
            kontrol yalnız bilgilendirme amaçlıdır: benzer kayıt bulunsa bile taslak
            kaydedilebilir; karar sizindir.
          </span>
        </div>
      </form>
    </div>
  );
}
