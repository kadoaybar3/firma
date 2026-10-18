import { useState } from "react";
import { PanelHead } from "./AdminLayout";
import { Badge, EmptyState, ErrorBanner, InfoBanner, StatCard } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatDateTime, formatTRY } from "../lib/format";
import { getCompanyById, listPayments, listSales, verifyPayment } from "../lib/repo";

export default function AdminPayments() {
  const actor = useActor();
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  void tick;

  const payments = listPayments(actor).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
        title="Ödeme kayıtları"
        desc="Satışlara bağlı ödeme kayıtları ve doğrulama akışı. Sağlayıcı entegrasyonu başlamadan ödemeler manuel doğrulanır; her adım denetim kaydına işlenir."
      />
      {error && <ErrorBanner message={error} />}

      <InfoBanner>
        <strong>Kart verisi saklanmaz:</strong> Uygulama hiçbir koşulda kart bilgisi tutmaz. Sağlayıcı
        entegrasyonu tamamlandığında ödeme, sağlayıcının barındırılmış (3D Secure) sayfasında yapılacak;
        durum yalnızca sunucu tarafındaki imzalı webhook ile güncellenecek ve mükerrer bildirimler
        idempotent şekilde tek kayda dokunacaktır.
      </InfoBanner>

      <div className="stats-grid mb-14">
        <StatCard
          icon="💳"
          label="Ödeme sağlayıcısı"
          value="Yapılandırılmadı"
          tone="warning"
          hint=".env içinden VITE_PAYMENT_* değerleriyle etkinleşir"
        />
        <StatCard
          icon="✅"
          label="Doğrulanmış ödeme"
          value={payments.filter((p) => p.status === "onaylandi").length}
          tone="success"
        />
        <StatCard icon="⏳" label="Beklemede" value={payments.filter((p) => p.status === "beklemede").length} />
      </div>

      {payments.length === 0 ? (
        <EmptyState
          icon="💳"
          title="Ödeme kaydı yok"
          description="Satış kayıtları sayfasında bir satış için 'Ödeme kaydı aç' adımını kullanın."
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Satış / firma</th>
                <th>Tutar</th>
                <th>Sağlayıcı referansı</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const sale = sales.find((s) => s.id === p.saleId);
                const company = sale ? getCompanyById(sale.companyId) : undefined;
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{company?.name ?? "—"}</strong>
                      <div className="text-muted small">{formatDateTime(p.createdAt)}</div>
                    </td>
                    <td>{formatTRY(p.amount)}</td>
                    <td className="text-muted small">{p.providerRef}</td>
                    <td>
                      <Badge
                        tone={
                          p.status === "onaylandi"
                            ? "green"
                            : p.status === "beklemede"
                              ? "orange"
                              : "red"
                        }
                      >
                        {p.status}
                      </Badge>
                    </td>
                    <td>
                      {p.status === "beklemede" ? (
                        <button
                          className="btn btn--sm btn--primary"
                          onClick={() => run(() => verifyPayment(p.id, actor))}
                        >
                          Doğrula (manuel)
                        </button>
                      ) : (
                        <span className="text-muted small">
                          {p.status === "onaylandi"
                            ? `Doğrulandı: ${formatDateTime(p.updatedAt)}`
                            : "İptal/hata"}
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
