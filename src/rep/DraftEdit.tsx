import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  FileQuestion,
  Info,
  Loader2,
  Lock,
  Save,
} from "lucide-react";
import { AddressFields, type AddressSelection } from "../admin/AddressFields";
import CategorySelect from "../components/CategorySelect";
import CompanyLocationMap, { type LocationPinSource } from "../components/CompanyLocationMap";
import { useActor } from "../lib/auth";
import { findCityByName } from "../lib/location";
import {
  getCategoryById,
  getCityById,
  listCategories,
  listCities,
  listCompanies,
  listLeads,
  updateLead,
} from "../lib/repo";
import { checkDuplicate } from "./duplicate";
import { LeadStatusBadge } from "./repShared";

export default function RepDraftEdit() {
  const { id = "" } = useParams();
  const actor = useActor();
  const navigate = useNavigate();
  const leads = listLeads(actor);
  const lead = leads.find((l) => l.id === id);

  const categories = listCategories();
  const cities = listCities();
  const suggestionCompanies = listCompanies();

  const [companyName, setCompanyName] = useState(lead?.companyName ?? "");
  const [phone, setPhone] = useState(lead?.phone ?? "");
  const [email, setEmail] = useState(lead?.email ?? "");
  const [whatsapp, setWhatsapp] = useState(lead?.socials?.whatsapp ?? lead?.phone ?? "");
  const [instagram, setInstagram] = useState(lead?.socials?.instagram ?? "");
  const [facebook, setFacebook] = useState(lead?.socials?.facebook ?? "");
  const [categoryId, setCategoryId] = useState(lead?.categoryId ?? "");
  const [location, setLocation] = useState<AddressSelection>(() => ({
    cityId: lead?.cityId ?? "",
    province: cities.find((c) => c.id === lead?.cityId)?.name ?? "",
    district: lead?.district ?? "",
    address: lead?.address ?? "",
  }));
  const [coords, setCoords] = useState<{ latitude?: number; longitude?: number }>(() => ({
    latitude: lead?.latitude,
    longitude: lead?.longitude,
  }));
  const [pinSource, setPinSource] = useState<LocationPinSource | null>(() =>
    lead?.latitude !== undefined && lead?.longitude !== undefined ? "saved" : null,
  );
  const [note, setNote] = useState(lead?.note ?? "");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const matchedCity = findCityByName(cities, location.province);
  /** Seçilen il `cities` tablosunda yoksa konum kaydedilemez (şema sınırı). */
  const missingCity = Boolean(location.province && !matchedCity);

  if (!lead) {
    return (
      <div className="rep-card" style={{ maxWidth: 560, margin: "0 auto" }}>
        <div className="rep-empty">
          <span className="rep-empty__icon" aria-hidden="true">
            <FileQuestion size={24} strokeWidth={1.8} />
          </span>
          <strong>Taslak bulunamadı</strong>
          <p>Bu kayıt size ait değil veya kaldırılmış olabilir.</p>
          <Link className="rep-btn rep-btn--primary rep-btn--sm" to="/temsilci/taslaklar">
            Taslaklara dön
          </Link>
        </div>
      </div>
    );
  }

  const locked = lead.status === "anlaşma" || Boolean(lead.convertedToCompanyId);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    if (companyName.trim().length < 2) {
      setError("Firma adı en az 2 karakter olmalıdır.");
      return;
    }

    setBusy(true);
    try {
      const nameChanged = companyName.trim() !== lead!.companyName.trim();
      if (nameChanged) {
        const result = await checkDuplicate(companyName);
        if (result === "exists") {
          setError(
            "Bu isimde bir firma rehberde kayıtlı görünüyor. Lütfen firma adını kontrol edin.",
          );
          return;
        }
      }

      updateLead(
        lead!.id,
        {
          companyName,
          phone,
          email,
          socials: { whatsapp, instagram, facebook },
          categoryId,
          cityId: matchedCity?.id ?? "",
          district: matchedCity ? location.district : "",
          address: location.address,
          // Boş konum da açıkça gönderilir; eski koordinat yanlışlıkla korunmaz.
          latitude: coords.latitude,
          longitude: coords.longitude,
          note,
        },
        actor,
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Taslak güncellenemedi.");
    } finally {
      setBusy(false);
    }
  }

  const category = lead.categoryId ? getCategoryById(lead.categoryId)?.name : undefined;
  const city = lead.cityId ? getCityById(lead.cityId)?.name : undefined;

  return (
    <div className="rep-stack" style={{ maxWidth: 720, margin: "0 auto" }}>
      <div>
        <Link className="rep-backlink" to="/temsilci/taslaklar">
          <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
          Taslaklar
        </Link>
        <div className="rep-pagehead">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0 }}>{lead.companyName}</h1>
            <LeadStatusBadge status={lead.status} />
          </div>
          <p>
            {category ?? "Kategori belirtilmedi"}
            {city ? ` · ${city}` : ""}
            {lead.district ? `, ${lead.district}` : ""}
          </p>
        </div>
      </div>

      {locked ? (
        <>
          <div className="rep-note rep-note--warn">
            <Lock size={16} strokeWidth={2} aria-hidden="true" />
            <span>
              {lead.convertedToCompanyId
                ? "Bu firma onaylandı ve rehbere eklendi; taslak bilgileri artık düzenlenemez."
                : "Anlaşma bildirildi. Ödeme/onay süreci başladığı için firma bilgileri kilitlendi."}
            </span>
          </div>

          <div className="rep-card">
            <dl className="rep-package__rows" style={{ margin: 0 }}>
              <div>
                <dt>Firma adı</dt>
                <dd>{lead.companyName}</dd>
              </div>
              <div>
                <dt>Telefon</dt>
                <dd>{lead.phone || "—"}</dd>
              </div>
              <div><dt>E-posta</dt><dd>{lead.email || "—"}</dd></div>
              <div><dt>WhatsApp</dt><dd>{lead.socials?.whatsapp || lead.phone || "—"}</dd></div>
              <div><dt>Instagram</dt><dd>{lead.socials?.instagram || "—"}</dd></div>
              <div><dt>Facebook</dt><dd>{lead.socials?.facebook || "—"}</dd></div>
              <div>
                <dt>Kategori</dt>
                <dd>{category ?? "—"}</dd>
              </div>
              <div>
                <dt>Konum</dt>
                <dd>{[city, lead.district].filter(Boolean).join(", ") || "—"}</dd>
              </div>
              <div>
                <dt>Adres</dt>
                <dd style={{ textAlign: "right", maxWidth: "60%" }}>{lead.address || "—"}</dd>
              </div>
              <div>
                <dt>Harita konumu</dt>
                <dd style={{ textAlign: "right" }}>
                  {lead.latitude !== undefined && lead.longitude !== undefined
                    ? `${lead.latitude.toFixed(6)}, ${lead.longitude.toFixed(6)}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Not</dt>
                <dd style={{ textAlign: "right", maxWidth: "60%" }}>{lead.note || "—"}</dd>
              </div>
            </dl>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Link className="rep-btn rep-btn--primary" to={`/temsilci/taslak/${lead.id}/odeme`}>
              <CreditCard size={17} strokeWidth={2} aria-hidden="true" />
              Ödeme durumunu görüntüle
            </Link>
            <Link className="rep-btn rep-btn--ghost" to="/temsilci/taslaklar">
              Taslaklara dön
            </Link>
          </div>
        </>
      ) : (
        <form className="rep-card rep-form" onSubmit={onSave} noValidate>
          {saved && (
            <div className="rep-note rep-note--success" role="status">
              <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />
              <span>Taslak güncellendi. Ödeme adımına geçebilirsiniz.</span>
            </div>
          )}

          <div className="rep-field">
            <label htmlFor="companyName">
              Firma adı <span>*</span>
            </label>
            <input
              id="companyName"
              className="rep-input"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
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
                <strong>{location.province}</strong> henüz şehir kayıtlarında tanımlı değil.
                Taslak firma bilgileriyle güncellenecek; il/ilçe bilgisi yönetici firma onayında
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
              Ödeme adımına geçtikten sonra firma bilgileri kilitlenir. Bu nedenle kaydetmeden
              önce bilgileri kontrol edin.
            </span>
          </div>

          {error && (
            <div className="rep-note rep-note--danger" role="alert">
              <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="rep-form__actions">
            <Link className="rep-btn rep-btn--ghost" to="/temsilci/taslaklar">
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
                  <Save size={17} strokeWidth={2.2} aria-hidden="true" />
                  Değişiklikleri kaydet
                </>
              )}
            </button>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Link className="rep-btn rep-btn--soft rep-btn--sm" to={`/temsilci/taslak/${lead.id}/odeme`}>
              <CreditCard size={15} strokeWidth={2} aria-hidden="true" />
              Ödeme adımına geç
            </Link>
          </div>
        </form>
      )}

      <button type="button" className="rep-btn rep-btn--ghost" onClick={() => navigate("/temsilci/taslaklar")}>
        Taslak listesine dön
      </button>
    </div>
  );
}
