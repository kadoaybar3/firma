import { useState } from "react";
import { PanelHead } from "./AdminLayout";
import { Badge, ErrorBanner, Field } from "../components/ui";
import { useActor } from "../lib/auth";
import { addDistrict, createCity, districtCount, listCities, removeDistrict } from "../lib/repo";

export default function AdminCities() {
  const actor = useActor();
  const [cityName, setCityName] = useState("");
  const newDistricts: Record<string, string> = {};
  const [districtInputs, setDistrictInputs] = useState<Record<string, string>>(newDistricts);
  const [error, setError] = useState<string | null>(null);
  void newDistricts;

  function run(fn: () => void) {
    setError(null);
    try {
      fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem başarısız.");
    }
  }

  return (
    <div className="panel-content">
      <PanelHead
        title="Şehir ve ilçeler"
        desc="Hizmet bölgelerini yönetin. Şayfanın 'Merkez' ilçesi silinemez."
      />
      {error && <ErrorBanner message={error} />}

      <div className="card card__pad mb-14" style={{ maxWidth: 520 }}>
        <form
          className="form-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => {
              createCity(cityName, actor);
              setCityName("");
            });
          }}
        >
          <Field label="Yeni şehir adı" required>
            <input value={cityName} onChange={(e) => setCityName(e.target.value)} placeholder="Örn: Konya" required />
          </Field>
          <button className="btn btn--primary" type="submit" style={{ alignSelf: "flex-end", marginBottom: 14 }}>
            Şehir ekle
          </button>
        </form>
      </div>

      {listCities().map((city) => (
        <div className="card card__pad mb-14" key={city.id}>
          <div className="flex-between mb-14">
            <h3 style={{ fontWeight: 800 }}>
              {city.name} <Badge tone="blue">{city.districts.length} ilçe</Badge>
            </h3>
            <span className="text-muted small">/sehir/{city.slug}</span>
          </div>
          <div className="chip-row mb-14">
            {city.districts.map((d) => (
              <span key={d} className="chip">
                {d}
                <span className="text-muted small">({districtCount(city.id, d)})</span>
                <button
                  type="button"
                  aria-label={`${d} ilçesini kaldır`}
                  style={{ all: "unset", cursor: "pointer", marginLeft: 2 }}
                  onClick={() =>
                    run(() => removeDistrict(city.id, d, actor))
                  }
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <form
            className="form-row"
            onSubmit={(e) => {
              e.preventDefault();
              const value = districtInputs[city.id] ?? "";
              run(() => addDistrict(city.id, value, actor));
              setDistrictInputs((prev) => ({ ...prev, [city.id]: "" }));
            }}
          >
            <input
              className="input"
              style={{ maxWidth: 280 }}
              placeholder="Yeni ilçe adı…"
              value={districtInputs[city.id] ?? ""}
              onChange={(e) => setDistrictInputs((prev) => ({ ...prev, [city.id]: e.target.value }))}
            />
            <button className="btn btn--sm btn--primary" type="submit">
              İlçe ekle
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}
