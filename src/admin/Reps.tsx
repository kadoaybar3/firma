import { useState } from "react";
import { PanelHead } from "./AdminLayout";
import { Badge, ErrorBanner, Field, MoneyLabel, StatCard } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatTRY } from "../lib/format";
import { createReferralCode, createRep, listCommissions, listReferrals, listReps, updateRep } from "../lib/repo";

export default function AdminRepsPage() {
  return <AdminReps />;
}

function AdminReps() {
  const actor = useActor();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

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
        title="Satış temsilcileri"
        desc="Saha ekibini yönetin. Komisyon oranını temsilci bazında yüzde olarak tanımlayabilirsiniz (boş kalırsa genel tutar uygulanır)."
      />
      {error && <ErrorBanner message={error} />}

      <div className="card card__pad mb-14" style={{ maxWidth: 560 }}>
        <form
          className="form-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => {
              createRep(name, phone, actor);
              setName("");
              setPhone("");
            });
          }}
        >
          <Field label="Ad soyad" required>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Telefon" required>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0555 000 00 00" required />
          </Field>
          <button className="btn btn--primary" type="submit" style={{ alignSelf: "flex-end", marginBottom: 14 }}>
            Temsilci ekle
          </button>
        </form>
      </div>

      {listReps(actor).map((rep) => (
        <div className="card card__pad mb-14" key={rep.id}>
          <div className="flex-between mb-14">
            <h3 style={{ fontWeight: 800 }}>
              👤 {rep.name} <Badge tone="blue">{rep.code}</Badge>{" "}
              <Badge tone={rep.status === "aktif" ? "green" : "gray"}>{rep.status === "aktif" ? "Aktif" : "Pasif"}</Badge>
            </h3>
            <span className="text-muted small">{rep.phone}</span>
          </div>
          <div className="form-row">
            <button
              className="btn btn--sm"
              onClick={() =>
                run(() =>
                  updateRep(
                    rep.id,
                    { status: rep.status === "aktif" ? "pasif" : "aktif" },
                    actor,
                  ),
                )
              }
            >
              {rep.status === "aktif" ? "Pasife al" : "Aktife al"}
            </button>
            <button className="btn btn--sm btn--ghost" onClick={() => run(() => createReferralCode(rep.id, actor))}>
              🎟️ Referans kodu üret
            </button>
            <span className="text-muted small">
              Özel komisyon oranı:{" "}
              <input
                className="input"
                style={{ width: 92, padding: "6px 10px" }}
                type="number"
                min={0}
                max={100}
                placeholder="%"
                defaultValue={rep.customCommissionRate ?? ""}
                onBlur={(e) =>
                  run(() =>
                    updateRep(
                      rep.id,
                      { customCommissionRate: e.target.value === "" ? undefined : Number(e.target.value) },
                      actor,
                    ),
                  )
                }
              />
            </span>
          </div>
        </div>
      ))}
      <div className="stats-grid mt-18">
        <StatCard icon="🎟️" label="Aktif referans kodu" value={listReferrals(actor).filter(r=>!r.usedAt).length} hint="Kullanılmamış kod sayısı" />
        <StatCard icon="🧾" label="Toplam komisyon kaydı" value={listCommissions(actor).length} />
        <StatCard icon="💰" label="Ödenen komisyon toplamı" value={formatTRY(listCommissions(actor).filter(c=>c.com.status==="odendi").reduce((s,c)=>s+c.com.amount,0))} tone="success" />
      </div>
    </div>
  );
}

export function RepCommissionRow({ amount }: { amount: number }) {
  return <MoneyLabel amount={amount} />;
}
