import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Eye,
  MessageCircle,
  MousePointerClick,
  Phone,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { formatDateTime } from "../lib/format";
import { listCompanies, listEngagementCounters } from "../lib/repo";
import { ENGAGEMENT_KINDS } from "../lib/engagement";
import type { EngagementKind } from "../lib/types";

/*
 * DİJİTAL GÖRÜNÜRLÜK — İşlem Merkezi'nin kompakt ölçüm şeridi
 *
 * Veri yalnız mevcut 0018 sayaç tablosundan (`listEngagementCounters`) ve
 * firma adları için `listCompanies` üzerinden okunur. Sayaçlar firma + tür
 * başına BİRİKİMLİ toplam tutar; olay geçmişi saklanmadığı için günlük ya da
 * haftalık büyüme grafiği bu bölümde de üretilmez.
 *
 * Panel `useAdminLiveUpdates` + `emitLiveDataChanged` ile yenilenen repo
 * belleğini okur; "Yenile" düğmesi aynı okumayı isteğe bağlı olarak tekrar
 * çalıştırır (yeni bir veri yolu veya RPC eklenmez).
 *
 * Yerleşim: dört sayaç tek şeritte; ilk 5 firma yalnız gerçek ziyaret verisi
 * varsa listelenir. Yöntem notu katlanır `details` içinde tutulur ki sıfır
 * veride panel gereksiz yükseklik kaplamasın.
 */

const numberFormat = new Intl.NumberFormat("tr-TR");

interface TopRow {
  id: string;
  name: string;
  visits: number;
  total: number;
}

function emptyTotals(): Record<EngagementKind, number> {
  const totals = {} as Record<EngagementKind, number>;
  for (const kind of ENGAGEMENT_KINDS) totals[kind] = 0;
  return totals;
}

export default function DigitalVisibility() {
  const [, setTick] = useState(0);

  const counters = listEngagementCounters();
  const companies = listCompanies({ includeUnpublished: true });

  const totals = emptyTotals();
  const perCompany = new Map<string, { visits: number; total: number }>();
  for (const counter of counters) {
    totals[counter.kind] += counter.count;
    let entry = perCompany.get(counter.companyId);
    if (!entry) {
      entry = { visits: 0, total: 0 };
      perCompany.set(counter.companyId, entry);
    }
    entry.total += counter.count;
    if (counter.kind === "profil") entry.visits += counter.count;
  }

  const nameById = new Map(companies.map((company) => [company.id, company.name]));

  const top: TopRow[] = [];
  for (const [companyId, entry] of perCompany) {
    if (entry.visits <= 0) continue;
    top.push({
      id: companyId,
      name: nameById.get(companyId) ?? "Firma kaydı yok",
      visits: entry.visits,
      total: entry.total,
    });
  }
  top.sort((a, b) => b.visits - a.visits || b.total - a.total || a.name.localeCompare(b.name, "tr"));
  const leaders = top.slice(0, 5);
  const peak = leaders[0]?.visits ?? 0;

  const visitTotal = totals.profil;
  const interactionTotal = counters.reduce((sum, counter) => sum + counter.count, 0);
  const lastUpdated = counters.reduce<string | null>(
    (latest, counter) => (!latest || counter.updatedAt > latest ? counter.updatedAt : latest),
    null,
  );
  const share = (value: number) =>
    interactionTotal > 0 ? Math.round((value / interactionTotal) * 100) : 0;

  return (
    <section className="dv dv--compact" aria-labelledby="dv-title">
      <header className="dv__head">
        <div className="dv__intro">
          <p className="dv__eyebrow">
            <TrendingUp size={13} strokeWidth={2.2} aria-hidden="true" />
            Dijital Görünürlük
          </p>
          <h2 id="dv-title" className="dv__title">
            Ziyaret ve etkileşim özeti
          </h2>
        </div>
        <div className="dv__head-actions">
          <button
            type="button"
            className="dv__refresh"
            onClick={() => setTick((tick) => tick + 1)}
            title="Sayaçları yeniden oku"
          >
            <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
            Yenile
          </button>
          <Link className="dv__all" to="/yonetim/etkilesimler">
            Tümünü Gör
            <ArrowRight size={14} strokeWidth={2.1} aria-hidden="true" />
          </Link>
        </div>
      </header>

      {/* Dört sayaç — tek satırda, sıfır veride de aynı yükseklik. */}
      <div className="dv__strip">
        <div className="dv__stat">
          <span className="dv__stat-icon">
            <Eye size={16} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <span className="dv__stat-body">
            <span className="dv__stat-label">Profil ziyareti</span>
            <span className="dv__stat-value">{numberFormat.format(visitTotal)}</span>
          </span>
        </div>

        <div className="dv__stat dv__stat--accent">
          <span className="dv__stat-icon">
            <MousePointerClick size={16} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <span className="dv__stat-body">
            <span className="dv__stat-label">Toplam etkileşim</span>
            <span className="dv__stat-value">{numberFormat.format(interactionTotal)}</span>
          </span>
        </div>

        <div className="dv__stat">
          <span className="dv__stat-icon dv__stat-icon--phone">
            <Phone size={15} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="dv__stat-body">
            <span className="dv__stat-label">Telefon</span>
            <span className="dv__stat-value">{numberFormat.format(totals.telefon)}</span>
          </span>
          <span
            className="dv__stat-share"
            aria-label={`Etkileşimlerin yüzde ${share(totals.telefon)}`}
          >
            %{share(totals.telefon)}
          </span>
        </div>

        <div className="dv__stat">
          <span className="dv__stat-icon dv__stat-icon--whatsapp">
            <MessageCircle size={15} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="dv__stat-body">
            <span className="dv__stat-label">WhatsApp</span>
            <span className="dv__stat-value">{numberFormat.format(totals.whatsapp)}</span>
          </span>
          <span
            className="dv__stat-share"
            aria-label={`Etkileşimlerin yüzde ${share(totals.whatsapp)}`}
          >
            %{share(totals.whatsapp)}
          </span>
        </div>
      </div>

      {leaders.length === 0 ? (
        <p className="dv__zero">
          Henüz ziyaret sayımı yok. Yayındaki firma profilleri görüntülendikçe burada listelenir.
        </p>
      ) : (
        <div className="dv__top">
          <h3 className="dv__top-title">
            En çok ziyaret edilen
            <span>İlk 5 firma</span>
          </h3>
          <ol className="dv__list">
            {leaders.map((row, index) => {
              const width = peak > 0 ? Math.max(6, Math.round((row.visits / peak) * 100)) : 0;
              return (
                <li key={row.id} className="dv__row">
                  <span className="dv__rank">{String(index + 1).padStart(2, "0")}</span>
                  <span className="dv__row-body">
                    <span className="dv__row-line">
                      <Link className="dv__row-name" to="/yonetim/etkilesimler">
                        {row.name}
                      </Link>
                      <span className="dv__row-count">
                        {numberFormat.format(row.visits)}
                        <em>ziyaret</em>
                      </span>
                    </span>
                    <span className="dv__track" aria-hidden="true">
                      <span className="dv__fill" style={{ width: `${width}%` }} />
                    </span>
                    <span className="dv__row-meta">
                      {numberFormat.format(row.total)} etkileşim
                      {index === 0 ? " · en yüksek" : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <details className="dv__more">
        <summary>Sayaç ayrıntıları ve yöntem</summary>
        <p>
          Sayaçlar firma ve tür başına birikimli toplamdır; olay geçmişi tutulmadığı için günlük ya
          da haftalık büyüme grafiği gösterilmez.
          {lastUpdated ? <> Son güncelleme: {formatDateTime(lastUpdated)}.</> : null}
        </p>
      </details>
    </section>
  );
}
