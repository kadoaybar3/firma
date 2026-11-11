/**
 * ADAY (lead) KAYDINDA ADRES + KOORDİNAT TAŞIMA
 *
 * Şema sınırı: 0007 migration'ı yalnızca `companies` tablosuna koordinat
 * ekler. Personel yeni firma ekranı ise tasarım gereği `leads` satırı
 * oluşturur ve `leads` tablosunda adres/koordinat kolonu yoktur.
 *
 * Çözüm: adres ve koordinatlar, mevcut `leads.note` metninin SONUNA eklenen
 * tek satırlık, makine-okunur bir işaretle taşınır. UI katmanı bu işareti
 * görmez: `leadFromRow` okurken ayıklar, `leadToRow` yazarken yeniden ekler.
 * Şema/RLS değişmez, mevcut kayıtlar bozulmaz.
 */

import { normalizeCoordinates, toFiniteNumber } from "./coordinates";
import type { PackageKey } from "./packages";

const MARKER = "[FR-KONUM v1]";
const MARKER_RE = /\n*\[FR-KONUM v1\]\s*(\{[^\n]*\})\s*$/;

export interface LeadLocationPayload {
  address?: string;
  latitude?: number;
  longitude?: number;
  packageKey?: PackageKey;
}

export interface ParsedLeadNote {
  note: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  packageKey?: PackageKey;
}

export function encodeLeadNote(note: string, location: LeadLocationPayload): string {
  const clean = note.replace(MARKER_RE, "").trim();
  const address = (location.address ?? "").trim();
  const coords = normalizeCoordinates(location.latitude, location.longitude);
  if (!address && !coords && !location.packageKey) return clean;

  const payload: Record<string, string | number> = {};
  if (address) payload.address = address;
  if (coords) {
    payload.latitude = coords.latitude;
    payload.longitude = coords.longitude;
  }
  if (location.packageKey === "normal" || location.packageKey === "featured") {
    payload.packageKey = location.packageKey;
  }
  const marker = `${MARKER} ${JSON.stringify(payload)}`;
  return clean ? `${clean}\n\n${marker}` : marker;
}

export function parseLeadNote(note: string): ParsedLeadNote {
  const match = note.match(MARKER_RE);
  if (!match) return { note: note.trim() };

  let payload: unknown = null;
  try {
    payload = JSON.parse(match[1]) as unknown;
  } catch {
    return { note: note.trim() };
  }

  const clean = note.replace(MARKER_RE, "").trimEnd();
  if (!payload || typeof payload !== "object") return { note: clean };

  const record = payload as Record<string, unknown>;
  const address = typeof record.address === "string" ? record.address.trim() : "";
  const coords = normalizeCoordinates(
    toFiniteNumber(record.latitude),
    toFiniteNumber(record.longitude),
  );
  const packageKey = record.packageKey === "normal" || record.packageKey === "featured" ? record.packageKey : undefined;

  return {
    note: clean,
    address: address || undefined,
    latitude: coords?.latitude,
    longitude: coords?.longitude,
    packageKey,
  };
}
