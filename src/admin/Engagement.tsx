import { useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Eye,
  MousePointerClick,
} from "lucide-react";
import { PanelHead } from "./AdminLayout";
import { EmptyState, StatCard } from "../components/ui";
import { formatDateTime } from "../lib/format";
import { listCompanies, listEngagementCounters } from "../lib/repo";
import { ENGAGEMENT_KINDS } from "../lib/engagement";
import type { EngagementKind } from "../lib/types";

/*
 * ZİYARET VE ETKİLEŞİMLER
 *
 * Veri doğrudan 0018 sayaç tablolarından gelir (`engagementCounters`): her
 * firma + tür için birikimli tek satır. Sayaçlar toplam değer tuttuğu için
 * tarih aralığı filtresi bu altyapıda karşılığı yoktur; yalnız son güncelleme
 * zamanı gösterilir. Hesaplama/bildirim mantığı burada tekrarlanmaz.
 */

type SortKey = "name" | EngagementKind | "total";
type SortDir = "asc" | "desc";

const COLUMNS: Array<{ kind: EngagementKind; short: string; full: string }> = [
  { kind: "profil", short: "Profil", full: "Profil görüntülenmesi" },
  { kind: "telefon", short: "Telefon", full: "Telefon tıklaması" },
  { kind: "whatsapp", short: "WhatsApp", full: "WhatsApp tıklaması" },
  { kind: "yol", short: "Yol tarifi", full: "Yol tarifi tıklaması" },
  { kind: "instagram", short: "Instagram", full: "Instagram tıklaması" },
  { kind: "web", short: "Web sitesi", full: "Web sitesi tıklaması" },
];

interface EngagementRow {
  id: string;
  name: string;
  published: boolean;
  counts: Record<EngagementKind, number>;
  total: number;
}

function emptyCounts(): Record<EngagementKind, number> {
  const counts = {} as Record<EngagementKind, number>;
  for (const kind of ENGAGEMENT_KINDS) counts[kind] = 0;
  return counts;
}

const numberFormat = new Intl.NumberFormat("tr-TR");

function compareRows(a: EngagementRow, b: EngagementRow, key: SortKey): number {
  if (key === "name") return a.name.localeCompare(b.name, "tr");
  if (key === "total") return a.total - b.total;
  return a.counts[key] - b.counts[key];
}

function SortButton({
  label,
  sortKey,
  active,
  dir,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "end";
}) {
  return (
    <button
      type="button"
      className={`adm-sort ${active ? "is-active" : ""}`}
      style={align === "end" ? { justifyContent: "flex-end" } : undefined}
      onClick={() => onSort(sortKey)}
      aria-label={`${label} sütununa göre sırala`}
    >
      <span>{label}</span>
      {active ? (
        dir === "desc" ? (
          <ArrowDown size={12} strokeWidth={2.4} aria-hidden="true" />
        ) : (
          <ArrowUp size={12} strokeWidth={2.4} aria-hidden="true" />
        )
      ) : (
        <ChevronsUpDown size={12} strokeWidth={2} aria-hidden="true" className="adm-sort__idle" />
      )}
    </button>
  );
}

export default function AdminEngagement() {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const companies = listCompanies({ includeUnpublished: true });
  const counters = listEngagementCounters();

  const countsByCompany = new Map<string, Record<EngagementKind, number>>();
  for (const counter of counters) {
    let counts = countsByCompany.get(counter.companyId);
    if (!counts) {
      counts = emptyCounts();
      countsByCompany.set(counter.companyId, counts);
    }
    counts[counter.kind] = counter.count;
  }

  const rows: EngagementRow[] = [];
  for (const company of companies) {
    const counts = countsByCompany.get(company.id);
    if (!counts) continue;
    const total = ENGAGEMENT_KINDS.reduce((sum, kind) => sum + counts[kind], 0);
    // Sayaç satırı olup tümü 0 olan firma tabloda gösterilmez.
    if (total === 0) continue;
    rows.push({ id: company.id, name: company.name, published: company.published, counts, total });
  }

  const profileTotal = counters
    .filter((counter) => counter.kind === "profil")
    .reduce((sum, counter) => sum + counter.count, 0);
  const interactionTotal = counters.reduce((sum, counter) => sum + counter.count, 0);
  const lastUpdated = counters.reduce<string | null>(
    (latest, counter) => (!latest || counter.updatedAt > latest ? counter.updatedAt : latest),
    null,
  );

  const needle = query.trim().toLocaleLowerCase("tr");
  const filtered = needle
    ? rows.filter((row) => row.name.toLocaleLowerCase("tr").includes(needle))
    : rows;

  const direction = sortDir === "desc" ? -1 : 1;
  const visible = [...filtered].sort((a, b) => {
    const order = compareRows(a, b, sortKey) * direction;
    return order !== 0 ? order : a.name.localeCompare(b.name, "tr");
  });

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    // Metin alfabetik başlar; sayısal sütunlar en yüksekten aşağı sıralanır.
    setSortDir(key === "name" ? "asc" : "desc");
  };

  const ariaSort = (key: SortKey): "ascending" | "descending" | "none" =>
    sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : "none";

  return (
    <div className="panel-content">
      <PanelHead
        title="Ziyaret ve Etkileşimler"
        desc="Firma profillerindeki gerçek görüntülenme ve tıklamalar; firma ve tür bazında."
      />

      <div className="stats-grid">
        <StatCard
          icon={<Eye size={20} strokeWidth={1.9} />}
          label="Toplam profil ziyareti"
          value={numberFormat.format(profileTotal)}
          hint={`${rows.length} firmada sayım var`}
        />
        <StatCard
          icon={<MousePointerClick size={20} strokeWidth={1.9} />}
          label="Toplam etkileşim"
          value={numberFormat.format(interactionTotal)}
          tone="primary"
          hint="Profil görüntülenmesi ve tüm tıklamalar"
        />
        <StatCard
          icon={<Activity size={20} strokeWidth={1.9} />}
          label="Son güncelleme"
          value={lastUpdated ? formatDateTime(lastUpdated) : "—"}
          hint="Sayaçlar birikimli toplam tutar"
        />
      </div>

      <div className="adm-filterbar">
        <div className="adm-filtergrid">
          <label className="adm-filter" style={{ gridColumn: "1 / -1" }}>
            <span>Firma adına göre ara</span>
            <input
              type="search"
              value={query}
              placeholder="Firma adı yazın"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        <div className="adm-filterbar__foot">
          <span>
            {visible.length} firma
            {needle ? ` · “${query.trim()}” araması` : ""} · Sıralamak için sütun başlığına dokunun
          </span>
        </div>
      </div>

      <div className="card card__pad">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Activity size={30} strokeWidth={1.5} aria-hidden="true" />}
            title="Henüz sayılmış ziyaret veya etkileşim yok"
            description="Firma profilleri görüntülendikçe ve iletişim bağlantılarına tıklandıkça sayaçlar burada firma bazında görünür. Yalnız yayındaki firmalarda sayım işler."
          />
        ) : visible.length === 0 ? (
          <EmptyState
            title="Aramanızla eşleşen firma yok"
            description="Farklı bir firma adı deneyin veya aramayı temizleyin."
            action={
              <button type="button" className="btn btn--sm" onClick={() => setQuery("")}>
                Aramayı temizle
              </button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 880 }}>
              <caption className="sr-only">
                Firma bazında profil görüntülenmesi, iletişim tıklamaları ve toplam etkileşim
              </caption>
              <thead>
                <tr>
                  <th scope="col" aria-sort={ariaSort("name")}>
                    <SortButton
                      label="Firma"
                      sortKey="name"
                      active={sortKey === "name"}
                      dir={sortDir}
                      onSort={onSort}
                    />
                  </th>
                  {COLUMNS.map((column) => (
                    <th key={column.kind} scope="col" aria-sort={ariaSort(column.kind)}>
                      <SortButton
                        label={column.short}
                        sortKey={column.kind}
                        active={sortKey === column.kind}
                        dir={sortDir}
                        onSort={onSort}
                      />
                    </th>
                  ))}
                  <th scope="col" aria-sort={ariaSort("total")}>
                    <SortButton
                      label="Toplam etkileşim"
                      sortKey="total"
                      active={sortKey === "total"}
                      dir={sortDir}
                      onSort={onSort}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.name}</strong>
                      {!row.published && (
                        <span className="text-muted small"> · yayında değil</span>
                      )}
                    </td>
                    {COLUMNS.map((column) => (
                      <td key={column.kind}>{numberFormat.format(row.counts[column.kind])}</td>
                    ))}
                    <td>
                      <strong>{numberFormat.format(row.total)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-muted small mt-14">
        Sayaçlar birikimli toplamlardır; her firma ve etkileşim türü bağımsız sayılır. Tarih aralığı
        filtresi için olay bazlı kayıt tutulmadığından yalnız son güncelleme zamanı gösterilir.
        Bildirim eşikleri <strong>Ayarlar → Firma etkileşim sayaçları</strong> bölümünden yönetilir.
      </p>
    </div>
  );
}
