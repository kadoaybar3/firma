import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck,
  CircleAlert,
  CreditCard,
  PackageCheck,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { PanelHead } from "../admin/AdminLayout";
import { Badge, EmptyState, ErrorBanner, Field, InfoBanner } from "../components/ui";
import { useActor } from "../lib/auth";
import { getCategoryById, getSettings, listCompanies, listMemberships, listSales } from "../lib/repo";
import { createSale } from "../lib/repo";
import { formatTRY } from "../lib/format";

/**
 * Çalışan — Üyelik Satışı.
 *
 * Dürüstlük ilkesi: Bu ekran satış KAYDINI açar. Ödeme sağlayıcısı bağlı
 * olmadığı için ödeme doğrulaması yönetici tarafından manuel yapılır ve
 * burada otomatik ödeme varmış gibi gösterilmez.
 */
export default function RepMembershipSale() {
  const actor = useActor();
  const settings = getSettings();
  const [q, setQ] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [channel, setChannel] = useState<"temsilci" | "dogrudan">("temsilci");
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  /** Satış açıldıktan sonra firma listesini tazelemek için sayaç. */
  const [tick, setTick] = useState(0);

  const memberships = listMemberships(actor);
  const sales = listSales(actor);

  const available = useMemo(() => {
    const blocked = new Set<string>();
    for (const m of memberships) if (m.status === "aktif") blocked.add(m.companyId);
    // Aynı firma için ikinci kez bekleyen satış açılmasın.
    for (const s of sales) if (s.status !== "iptal") blocked.add(s.companyId);

    const needle = q.trim().toLocaleLowerCase("tr");
    return listCompanies()
      .filter((c) => !blocked.has(c.id))
      .filter((c) => {
        if (!needle) return true;
        return `${c.name} ${c.district}`.toLocaleLowerCase("tr").includes(needle);
      })
      .slice(0, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tick, actor]);

  const selected = available.find((c) => c.id === companyId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);
    try {
      if (!companyId) throw new Error("Satış açmak için bir firma seçin.");
      // Mevcut repo kuralı: temsilci satışı kendi adına açar (actor.repId).
      const sale = createSale({
        companyId,
        channel,
        referralCode: channel === "dogrudan" ? referralCode : undefined,
      }, actor);
      setCreated(sale.id);
      setCompanyId("");
      setReferralCode("");
      setTick((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Satış kaydı açılamadı.");
    }
  }

  return (
    <div className="panel-content">
      <PanelHead
        title="Üyelik satışı"
        desc="Firmayı bulun, paketi onaylayın ve satış kaydını açın. Ödeme onayı yöneticide kalır; bu ekran ödeme tahsil etmez."
      />

      {error && <ErrorBanner message={error} />}
      {created && (
        <InfoBanner>
          <strong>Satış kaydı açıldı.</strong> Ödeme yönetici tarafından doğrulanana kadar satış
          «beklemede» görünür. <Link to="/temsilci/satislarim">Satışlarım</Link> ekranından takip
          edebilirsiniz.
        </InfoBanner>
      )}

      <div className="grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))", gap: 16 }}>
        <section className="card card__pad">
          <div className="flex-between">
            <h3 style={{ fontWeight: 800 }}>1. Firma seç</h3>
            <Badge tone="blue">{available.length} uygun firma</Badge>
          </div>
          <p className="text-muted small" style={{ marginTop: 4 }}>
            Aktif üyeliği olan firmalar listede görünmez; yenileme satışları yönetici ekranından
            yürütülür.
          </p>

          <label className="field" style={{ marginTop: 12 }}>
            <span className="field__label">
              <Search size={14} strokeWidth={2} aria-hidden="true" /> Firmada ara
            </span>
            <input
              className="input"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Firma adı veya ilçe…"
            />
          </label>

          {available.length === 0 ? (
            <EmptyState
              icon={<PackageCheck size={28} strokeWidth={1.6} aria-hidden="true" />}
              title="Satışa uygun firma yok"
              description="Aramayı değiştirin veya yeni firma adayı ekleyin."
            />
          ) : (
            <ul className="pick-list" aria-label="Satışa uygun firmalar">
              {available.map((c) => {
                const isPicked = c.id === companyId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`pick-list__item ${isPicked ? "is-picked" : ""}`}
                      aria-pressed={isPicked}
                      onClick={() => setCompanyId(c.id)}
                    >
                      <span className="pick-list__main">
                        <strong>{c.name}</strong>
                        <span className="text-muted small">
                          {getCategoryById(c.categoryId)?.name ?? "Kategorisiz"} · {c.district}
                        </span>
                      </span>
                      {isPicked && <BadgeCheck size={17} strokeWidth={2} aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card card__pad">
          <h3 style={{ fontWeight: 800 }}>2. Paket ve satış</h3>
          <div className="package-card">
            <div className="package-card__head">
              <span className="package-card__icon" aria-hidden="true">
                <Wallet size={18} strokeWidth={1.9} />
              </span>
              <div>
                <strong>Yıllık üyelik</strong>
                <div className="text-muted small">Rehberde yayın + profil sayfası</div>
              </div>
            </div>
            <div className="package-card__price">{formatTRY(settings.membershipPrice)}</div>
            <dl className="package-card__rows">
              <div>
                <dt>Satış komisyonu</dt>
                <dd>{formatTRY(settings.repCommission)}</dd>
              </div>
              <div>
                <dt>Yenileme komisyonu</dt>
                <dd>{formatTRY(settings.renewalCommission)}</dd>
              </div>
              <div>
                <dt>Ödeme durumu</dt>
                <dd>
                  <Badge tone="orange">Yönetici doğrulaması bekler</Badge>
                </dd>
              </div>
            </dl>
          </div>

          <form onSubmit={submit} style={{ marginTop: 14 }}>
            <Field label="Seçili firma" required hint="Soldaki listeden seçin">
              <input
                className="input"
                readOnly
                value={selected ? `${selected.name} · ${selected.district}` : ""}
                placeholder="Henüz firma seçilmedi"
                aria-label="Seçili firma"
              />
            </Field>
            <Field label="Satış türü" required>
              <select
                className="input"
                value={channel}
                onChange={(e) => setChannel(e.target.value as "temsilci" | "dogrudan")}
              >
                <option value="temsilci">Temsilci tarafından satıldı</option>
                <option value="dogrudan">Doğrudan / referanslı satış</option>
              </select>
            </Field>
            {channel === "dogrudan" && (
              <Field label="Referans kodu" hint="Referans kaydıyla eşleştirilir">
                <input
                  className="input"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                  placeholder="Örn: KADINANA-1001"
                />
              </Field>
            )}
            <button className="btn btn--primary btn--block" type="submit" disabled={!companyId}>
              <CreditCard size={16} strokeWidth={2} aria-hidden="true" />
              Satış kaydını aç
            </button>
          </form>

          <div className="notice-inline" role="note">
            <ShieldCheck size={16} strokeWidth={1.9} aria-hidden="true" />
            <p>
              Bu adım yalnızca satış kaydı oluşturur. Ödeme alınmaz; «ödenmiş» işareti yalnızca
              yönetici ödemeyi doğruladığında oluşur.
            </p>
          </div>
          <div className="notice-inline notice-inline--muted" role="note">
            <CircleAlert size={16} strokeWidth={1.9} aria-hidden="true" />
            <p>Komisyonunuz, ödeme doğrulandıktan sonra kesinleşir ve Satışlarım ekranında görünür.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
