import { parseDelimited } from "./importLib";

/**
 * DOSYA/TEXT AYIKLAMA — CSV/TSV metin dosyaları ve Excel çalışma kitaplarını
 * ortak "başlık + kayıt" yapısına indirger.
 *
 * Excel desteği: `xlsx` paketi dinamik import edilir — ana pakete dahil edilmez,
 * içe aktarma sayfası ziyaret edilmeyen ziyaretçinin bundle maliyeti sıfırdır.
 */

export interface ParsedSheet {
  headers: string[];
  records: Record<string, string>[];
}

const EXCEL_EXT = /\.(xlsx|xls|xlsm)$/i;

export function isExcelFile(name: string): boolean {
  return EXCEL_EXT.test(name);
}

export async function parseSheetFile(file: File): Promise<ParsedSheet> {
  if (isExcelFile(file.name)) {
    if (file.size > 8 * 1024 * 1024) throw new Error("Excel dosyası 8 MB sınırını aşıyor.");
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("Excel dosyasında çalışma sayfası yok.");
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: "",
    });
    return gridToSheet(grid as string[][]);
  }

  if (file.size > 4 * 1024 * 1024) throw new Error("Metin dosyası 4 MB sınırını aşıyor.");
  const text = await file.text();
  return parseTextBlock(text);
}

/** Yapıştırılmış metin (CSV/TSV/noktalı virgül) → sayfa yapısı. */
export function parseTextBlock(text: string): ParsedSheet {
  const { headers, rows } = parseDelimited(text);
  return { headers, records: zipRecords(headers, rows) };
}

/** Başlık + satır matrisini adlandırılmış kayıtlara çevirir (kısa satırlar boşla doldurulur). */
export function zipRecords(headers: string[], rows: string[][]): Record<string, string>[] {
  return rows.map((row) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h] = (row[i] ?? "").trim();
    });
    return rec;
  });
}

function gridToSheet(grid: string[][]): ParsedSheet {
  const nonEmpty = grid.filter((r) => r.some((c) => String(c ?? "").trim()));
  if (!nonEmpty.length) return { headers: [], records: [] };
  const [headers, ...rows] = nonEmpty;
  const norm = headers.map((h) => String(h ?? "").trim());
  return { headers: norm, records: zipRecords(norm, rows) };
}

/** Örnek şablon dosyasını indirtir (kullanıcının sütun yapısını görmesi için). */
export function downloadTemplate(): void {
  const csv = [
    "Firma Adı;Telefon;Şehir;İlçe;Kategori;Adres",
    "Örnek Fırın;05551112233;Afyonkarahisar;Merkez;Fırınlar;Cumhuriyet Cd. No:5",
    "Örnek Kuyum;905552223344;Afyonkarahisar;Sandıklı;Kuyumculuk;Hükümet Cad. 12/A",
  ].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "firma-rehberi-ice-aktarma-sablonu.csv";
  a.click();
  URL.revokeObjectURL(url);
}
