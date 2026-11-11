import { useMemo, useState } from "react";
import { BadgeCheck, Building2, CircleAlert, Search, Target } from "lucide-react";
import { PanelHead } from "../admin/AdminLayout";
import { Badge, EmptyState, ErrorBanner, Field, InfoBanner } from "../components/ui";
import LocationSelect, { type LocationValue } from "../components/LocationSelect";
import CompanyLocationMap from "../components/CompanyLocationMap";
import { useActor } from "../lib/auth";
import { LeadBoard } from "../admin/Leads";
import { findCityByName } from "../lib/location";
import { createLead, listCities, listCompanies } from "../lib/repo";

const STEPS = ["Rehberde ara", "Mükerrer kontrolü", "Firma bilgileri"] as const;

/**
 * Çalışan — Firma Bul / Ekle.
 *
 * Mevcut güvenli akış korunur: çalışan firma ADAYI oluşturur (createLead),
 * firmayı yönetici onayıyla yayına alır (convertLead). `companies` tablosuna
 * doğrudan temsilci INSERT'i RLS ile kapalıdır — bu ekran o sınırı aşmaz.
 */
export default function RepLeads() {
  const actor = useActor();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [location, setLocation] = useState<LocationValue>(() => {
    const first = listCities()[0];
    return { province: first?.name ?? "", district: first?.districts[0] ?? "" };
  });
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string; address?: string }>({});

  const matchedCity = findCityByName(listCities(), location.province);
  /** Seçilen il `cities` tablosunda yoksa konum kaydedilemez (şema sınırı). */
  const missingCity = Boolean(location.province && !matchedCity);
  const normalizedPhone = phone.replace(/\D/g, "");
  const needle = q.trim().toLocaleLowerCase("tr");

  const searchHits = useMemo(() => {
    if (needle.length < 2) return [];
    return listCompanies()
      .filter((c) =>
        `${c.name} ${c.district}`.toLocaleLowerCase("tr").includes(needle),
      )
      .slice(0, 6);
  }, [needle]);

  const duplicates = useMemo(() => {
    const nameKey = name.trim().toLocaleLowerCase("tr");
    return listCompanies({ includeUnpublished: true }).filter(
      (c) =>
        (normalizedPhone.length >= 7 &&
          c.phone.replace(/\D/g, "").includes(normalizedPhone)) ||
        (nameKey.length >= 3 && c.name.toLocaleLowerCase("tr").includes(nameKey)),
    );
  }, [name, normalizedPhone]);

  function resetForm() {
    setStep(0);
    setQ("");
    setName("");
    setPhone("");
    setAddress("");
    setCoords(null);
    setNote("");
    setFieldErrors({});
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const errs: { name?: string; phone?: string; address?: string } = {};
    if (!name.trim()) errs.name = "Firma adı zorunludur.";
    if (!phone.trim()) errs.phone = "Telefon zorunludur (mevcut doğrulama kuralı).";
    else if (normalizedPhone.length < 10) errs.phone = "Geçerli bir telefon girin (en az 10 hane).";
    if (!address.trim() && !coords) errs.address = "Konum bilgisi zorunludur. Adres girin veya haritada konum seçin.";
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    try {
      createLead(
        {
          companyName: name,
          categoryId: "",
          cityId: matchedCity?.id ?? "",
          district: matchedCity ? location.district : "",
          phone,
          note,
          address: address.trim(),
          latitude: coords?.latitude,
          longitude: coords?.longitude,
        },
        actor,
      );
      setSaved(name.trim());
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aday kaydedilemedi.");
    }
  }

  return (
    <div className="panel-content">
      <PanelHead
        title="Firma bul / ekle"
        desc="Önce rehberde arayın; mükerrer kayıt riskini kontrol edin. Yeni firmalar yönetici onayıyla yayına alınır."
        action={
          <button
            className="btn btn--primary"
            type="button"
            onClick={() => {
              setSaved(null);
              setError(null);
              resetForm();
            }}
          >
            <Target size={16} strokeWidth={2} aria-hidden="true" />
            Yeni arama başlat
          </button>
        }
      />

      {error && <ErrorBanner message={error} />}
      {saved && (
        <InfoBanner>
          <strong>{saved}</strong> aday olarak kaydedildi ve yönetici onayına iletildi. Firma
          bilgileri doğrulandıktan sonra rehberde yayına alınır.
        </InfoBanner>
      )}

      <div className="card card__pad mb-14">
        <ol className="stepper" aria-label="Firma ekleme adımları">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={`stepper__item ${step === i ? "is-current" : ""} ${step > i ? "is-done" : ""}`}
              aria-current={step === i ? "step" : undefined}
            >
              <span className="stepper__num">{step > i ? <BadgeCheck size={14} strokeWidth={2.2} aria-hidden="true" /> : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="mt-14">
            <Field label="Rehberde firma ara" hint="En az 2 karakter — ad veya ilçe">
              <input
                className="input"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Örn: Oto Tamir veya Merkez"
                autoFocus
              />
            </Field>

            {needle.length >= 2 && searchHits.length === 0 && (
              <p className="text-muted small mt-8">
                <Search size={14} strokeWidth={2} aria-hidden="true" /> Rehberde eşleşme yok — yeni
                kayıt için devam edebilirsiniz.
              </p>
            )}

            {searchHits.length > 0 && (
              <ul className="pick-list" aria-label="Rehberde bulunan firmalar">
                {searchHits.map((c) => (
                  <li key={c.id}>
                    <div className="pick-list__item" style={{ cursor: "default" }}>
                      <span className="pick-list__main">
                        <strong>{c.name}</strong>
                        <span className="text-muted small">
                          {c.district} · {c.phone} · {c.published ? "Yayında" : "Yayın dışı"}
                        </span>
                      </span>
                      <Badge tone={c.published ? "green" : "gray"}>Kayıtlı</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="form-row mt-14">
              <button className="btn btn--primary" type="button" onClick={() => setStep(1)}>
                Devam et
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="mt-14">
            <p className="text-muted small">
              Aynı firma adı veya telefonla kayıt var mı diye tüm firma listesi (yayın dışı dahil)
              kontrol edilir.
            </p>
            {duplicates.length > 0 ? (
              <>
                <InfoBanner>
                  {duplicates.length} olası mükerrer kayıt bulundu. Önce mevcut kaydı kullanmayı
                  değerlendirin; mükerrer kayıt oluşturmayın.
                </InfoBanner>
                <ul className="pick-list" aria-label="Mükerrer olabilecek kayıtlar">
                  {duplicates.map((c) => (
                    <li key={c.id}>
                      <div className="pick-list__item" style={{ cursor: "default" }}>
                        <span className="pick-list__main">
                          <strong>{c.name}</strong>
                          <span className="text-muted small">{c.phone} · {c.district}</span>
                        </span>
                        <Badge tone="orange">Benzer</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyState
                icon={<Building2 size={28} strokeWidth={1.6} aria-hidden="true" />}
                title="Mükerrer kayıt bulunamadı"
                description="Devam edip firma bilgilerini girebilirsiniz."
              />
            )}
            <div className="form-row mt-14">
              <button className="btn" type="button" onClick={() => setStep(0)}>
                Geri
              </button>
              <button className="btn btn--primary" type="button" onClick={() => setStep(2)}>
                Firma bilgilerine geç
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <form className="mt-14" onSubmit={submit} noValidate>
            <div className="form-grid">
              <Field label="Firma adı" required error={fieldErrors.name}>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Firma adı"
                  aria-invalid={Boolean(fieldErrors.name)}
                  autoFocus
                />
              </Field>
              <Field label="Telefon" required error={fieldErrors.phone} hint="En az 10 hane">
                <input
                  className="input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0555 000 00 00"
                  inputMode="tel"
                  aria-invalid={Boolean(fieldErrors.phone)}
                />
              </Field>
              <Field label="Adres" hint="Mahalle, cadde/ sokak, bina/kapi numarası">
                <input
                  className="input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Örn. Merkez, Afyonkarahisar Mah. Kurtuluş Cd. No:45"
                />
              </Field>
              <LocationSelect
                className="address-location"
                value={location}
                onChange={setLocation}
                required
                extraDistricts={matchedCity?.districts ?? []}
              />
              <CompanyLocationMap
                address={address}
                district={location.district}
                province={location.province}
                latitude={coords?.latitude}
                longitude={coords?.longitude}
                onChange={(nextCoords) => setCoords(nextCoords)}
                disabled={!location.province}
              />
              <Field label="Görüşme notu" hint="Sahada not ettiğiniz bilgi (opsiyonel)">
                <textarea
                  className="input"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Örn: Sahibiyle görüşüldü, üyelikle ilgileniyor."
                />
              </Field>
            </div>

            {missingCity && (
              <p className="notice-inline notice-inline--muted" role="note">
                <CircleAlert size={16} strokeWidth={1.9} aria-hidden="true" />
                <span>
                  <strong>{location.province}</strong> henüz şehir kayıtlarında tanımlı değil.
                  Aday firma bilgileriyle kaydedilecek; il/ilçe bilgisi yönetici onayında
                  tamamlanacak.
                </span>
              </p>
            )}

            {duplicates.length > 0 && (
              <p className="notice-inline notice-inline--muted" role="note">
                <CircleAlert size={16} strokeWidth={1.9} aria-hidden="true" />
                <span>
                  {duplicates.length} benzer kayıt var. Yine de kaydederseniz yönetici kontrol
                  ederken mükerrerliği değerlendirir.
                </span>
              </p>
            )}

            <div className="form-row mt-14">
              <button className="btn" type="button" onClick={() => setStep(1)}>
                Geri
              </button>
              <button className="btn btn--primary" type="submit">
                Adayı kaydet
              </button>
            </div>
          </form>
        )}
      </div>

      <h3 style={{ fontWeight: 800, marginBottom: 10 }}>Adaylarım</h3>
      <LeadBoard actor={actor} />
    </div>
  );
}
