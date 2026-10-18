import { useState } from "react";
import { PanelHead } from "./AdminLayout";
import { Badge, ErrorBanner, InfoBanner } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatDateTime, formatTRY } from "../lib/format";
import { createReferralCode, getSettings, listReferrals, listReps } from "../lib/repo";

export default function AdminReferrals() {
  const actor = useActor();
  const [repId, setRepId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  void tick;

  const referrals = listReferrals(actor);
  const reps = listReps(actor);

  function run(fn: () => void) {
    setError(null);
    try {
      fn();
      setTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem başarısız.");
    }
  }

  return (
    <div className="panel-content">
      <PanelHead
        title="Referans kayıtları"
        desc="Doğrudan satışta dönüşen işletme referans ödülleri. Temsilciye ait kod, işletme doğrudan üye olduğunda ödüle dönüşür."
      />
      {error && <ErrorBanner message={error} />}

      <InfoBanner>
        <strong>Kavram ayrımı:</strong> "Satış komisyonu" temsilcinin yüz yüze sattığı üyelikten,
        "referans ödülü" ise işletmenin temsilciye verilen kodla kendi başına üye olmasından doğar.
        Her satışta yalnız biri oluşur; üretim idempotenttir.
      </InfoBanner>

      <div className="card card__pad mb-14" style={{ maxWidth: 520 }}>
        <form
          className="form-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!repId) return;
            run(() => {
              createReferralCode(repId, actor);
              setRepId("");
            });
          }}
        >
          <label className="field">
            <span className="field__label">Temsilci seçin</span>
            <select value={repId} onChange={(e) => setRepId(e.target.value)}>
              <option value="">— seçin —</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.code})
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn--primary" type="submit" style={{ alignSelf: "flex-end", marginBottom: 14 }}>
            Referans kodu üret
          </button>
        </form>
      </div>

      <div className="table-wrap" style={{ maxWidth: 760 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Kod</th>
              <th>Temsilci</th>
              <th>Durum</th>
              <th>Kullanım</th>
            </tr>
          </thead>
          <tbody>
            {referrals.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.code}</strong>
                </td>
                <td>{reps.find((rep) => rep.id === r.repId)?.name ?? "—"}</td>
                <td>
                  <Badge tone={r.usedAt ? "green" : "orange"}>
                    {r.usedAt ? "Kullanıldı" : "Bekliyor"}
                  </Badge>
                </td>
                <td className="text-muted small">
                  {r.usedAt
                    ? `${formatDateTime(r.usedAt)} • ${formatTRY(getSettings().referralReward)}`
                    : `${formatDateTime(r.createdAt)} oluşturuldu`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
