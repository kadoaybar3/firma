import { useState } from "react";
import { PanelHead } from "./AdminLayout";
import { Badge, EmptyState, ErrorBanner, StatCard } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatDateTime, formatTRY } from "../lib/format";
import { getCompanyById, listCommissions, listSales, markCommissionPaid } from "../lib/repo";

const TYPE_LABEL: Record<string, string> = {
  satis: "Satış komisyonu",
  yenileme: "Yenileme komisyonu",
  referans: "Referans ödülü",
};

export default function AdminCommissions() {
  const actor = useActor();
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  void tick;

  const rows = listCommissions(actor);
  const sales = listSales(actor);

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
        title="Komisyon hesapları"
        desc="Komisyonlar yalnızca KESİNLEŞEN satışlardan ve yalnızca bir kez üretilir (idempotent). Bu aşamada komisyon oranı/tutarları temsilci tarafından değiştirilemez."
      />
      {error && <ErrorBanner message={error} />}

      <div className="stats-grid mb-14">
        <StatCard
          icon="🧾"
          label="Ödenmemiş komisyon"
          value={formatTRY(rows.filter((r) => r.com.status !== "odendi").reduce((s, r) => s + r.com.amount, 0))}
          tone="warning"
        />
        <StatCard
          icon="✅"
          label="Ödenmiş komisyon"
          value={formatTRY(rows.filter((r) => r.com.status === "odendi").reduce((s, r) => s + r.com.amount, 0))}
          tone="success"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="🧾" title="Komisyon kaydı yok" description="Kesinleşen satış otomatik olarak komisyon üretir." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Temsilci</th>
                <th>Tip</th>
                <th>Firma</th>
                <th>Tutar</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ com, repName }) => {
                const sale = sales.find((s) => s.id === com.saleId);
                const company = sale ? getCompanyById(sale.companyId) : undefined;
                return (
                  <tr key={com.id}>
                    <td>
                      <strong>{repName}</strong>
                      <div className="text-muted small">{formatDateTime(com.createdAt)}</div>
                    </td>
                    <td>
                      <Badge tone={com.type === "referans" ? "orange" : "blue"}>
                        {TYPE_LABEL[com.type]}
                      </Badge>
                    </td>
                    <td>{company?.name ?? "—"}</td>
                    <td>{formatTRY(com.amount)}</td>
                    <td>
                      <Badge tone={com.status === "odendi" ? "green" : com.status === "onaylandi" ? "blue" : "orange"}>
                        {com.status}
                      </Badge>
                    </td>
                    <td>
                      {com.status !== "odendi" ? (
                        <button
                          className="btn btn--sm btn--primary"
                          onClick={() => run(() => markCommissionPaid(com.id, actor))}
                        >
                          Ödendi işaretle
                        </button>
                      ) : (
                        <span className="text-muted small">
                          {com.paidAt ? `Ödendi: ${formatDateTime(com.paidAt)}` : "Ödendi"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
