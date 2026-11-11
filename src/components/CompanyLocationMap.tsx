import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, MapPin, Search, Trash2 } from "lucide-react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";

setWorkerUrl(workerUrl);
import "./CompanyLocationMap.css";
import {
  formatCoordinates,
  normalizeCoordinates,
  type Coordinates,
} from "../lib/coordinates";
import {
  buildGeocodeQueries,
  buildGeocodeQuery,
  geocodeAddress,
  isGeocodeReady,
  type GeocodeAddressParts,
} from "../lib/geocode";

export type LocationPinSource = "saved" | "geocode" | "manual";

export type LocationChangeSource = "geocode" | "manual" | "clear";

export interface CompanyLocationMapProps {
  address: string;
  district?: string;
  province?: string;
  latitude?: number;
  longitude?: number;
  /** Konum bulunduğunda/silindiğinde çağrılır. `source` adres değişiminde eski pini koruma kararını verir. */
  onChange: (coords: Coordinates | null, source: LocationChangeSource) => void;
  disabled?: boolean;
  /** Adres değiştiğinde otomatik arama. Kapalıysa yalnızca "Adresi bul" butonu çalışır. */
  autoGeocode?: boolean;
}

type GeocodeStatus = "idle" | "loading" | "found" | "not_found" | "error" | "incomplete";

const TURKEY_CENTER: [number, number] = [35.2, 39.0];
const LIGHT_STYLE = "https://tiles.openfreemap.org/styles/positron";
const DARK_STYLE = "https://tiles.openfreemap.org/styles/dark";
const AUTO_DELAY_MS = 1200;

function preferredStyle(): string {
  if (typeof window === "undefined") return LIGHT_STYLE;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? DARK_STYLE : LIGHT_STYLE;
}

export default function CompanyLocationMap({
  address,
  district,
  province,
  latitude,
  longitude,
  onChange,
  disabled = false,
  autoGeocode = true,
}: CompanyLocationMapProps) {
  const coords = normalizeCoordinates(latitude, longitude);
  const parts: GeocodeAddressParts = { address, district, province };
  const query = buildGeocodeQuery(parts);
  const readyForGeocode = isGeocodeReady(parts);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const moduleRef = useRef<typeof import("maplibre-gl") | null>(null);

  const coordsRef = useRef<Coordinates | null>(coords);
  coordsRef.current = coords;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const requestIdRef = useRef(0);
  /** İlk açılışta kayıtlı adres için istek atılmaz; yalnızca adres DEĞİŞİNCE otomatik aranır. */
  const lastAutoQueryRef = useRef(query);

  const [ready, setReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [status, setStatus] = useState<GeocodeStatus>("idle");
  const [message, setMessage] = useState("");

  /** Marker'ı güncel koordinata taşır; `focus` true ise haritayı da ortalar. */
  const syncMarker = useCallback((focus: boolean) => {
    const maplibregl = moduleRef.current;
    const map = mapRef.current;
    if (!maplibregl || !map) return;

    const current = coordsRef.current;
    if (!current) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (!markerRef.current) {
      const element = document.createElement("div");
      element.className = "fr-map-pin";
      element.setAttribute("aria-hidden", "true");
      element.innerHTML =
        '<span class="fr-map-pin__pulse"></span><span class="fr-map-pin__dot"></span>';
      const marker = new maplibregl.Marker({
        element,
        anchor: "bottom",
        draggable: !disabledRef.current,
      })
        .setLngLat([current.longitude, current.latitude])
        .addTo(map);
      marker.on("dragend", () => {
        const position = marker.getLngLat();
        onChangeRef.current(
          { latitude: position.lat, longitude: position.lng },
          "manual",
        );
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([current.longitude, current.latitude]);
      markerRef.current.setDraggable(!disabledRef.current);
    }

    if (!focus) return;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = [current.longitude, current.latitude] as [number, number];
    const zoom = Math.max(map.getZoom(), 15);
    if (reduceMotion) map.jumpTo({ center: target, zoom });
    else map.flyTo({ center: target, zoom, duration: 800 });
  }, []);

  /* Harita örneği bir kez kurulur; handler'lar ref üzerinden güncel kalır. */
  useEffect(() => {
    let disposed = false;
    let loadTimer: number | undefined;

    void (async () => {
      try {
        const maplibregl = await import("maplibre-gl");
        if (disposed || !containerRef.current) return;
        moduleRef.current = maplibregl;

        const start = coordsRef.current;
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: preferredStyle(),
          center: start ? [start.longitude, start.latitude] : TURKEY_CENTER,
          zoom: start ? 15 : 5.2,
          maxZoom: 19,
          attributionControl: false,
        });
        mapRef.current = map;
        map.addControl(
          new maplibregl.NavigationControl({ showCompass: false }),
          "top-right",
        );

        loadTimer = window.setTimeout(() => {
          if (!disposed && !map.loaded()) setMapFailed(true);
        }, 12000);

        map.on("load", () => {
          if (disposed) return;
          if (loadTimer) window.clearTimeout(loadTimer);
          setMapFailed(false);
          setReady(true);
        });

        map.on("click", (event) => {
          if (disabledRef.current) return;
          const target = event.originalEvent?.target as HTMLElement | null;
          if (target?.closest?.(".fr-map-pin")) return;
          onChangeRef.current(
            { latitude: event.lngLat.lat, longitude: event.lngLat.lng },
            "manual",
          );
        });
      } catch {
        if (!disposed) setMapFailed(true);
      }
    })();

    return () => {
      disposed = true;
      if (loadTimer) window.clearTimeout(loadTimer);
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [syncMarker]);

  /* Koordinat değişimi (kayıtlı / geocode / manuel) marker'a yansır. */
  useEffect(() => {
    if (!ready) return;
    syncMarker(true);
  }, [ready, latitude, longitude, syncMarker]);

  useEffect(() => {
    markerRef.current?.setDraggable(!disabled);
  }, [disabled]);

  /* Tema değişince harita stilini de değiştir (açık/koyu uyumu). */
  useEffect(() => {
    if (!ready) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => mapRef.current?.setStyle(media.matches ? DARK_STYLE : LIGHT_STYLE);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [ready]);

  const runGeocode = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!isGeocodeReady({ address, district, province })) {
      setStatus("incomplete");
      setMessage("Önce mahalle/cadde ve il bilgilerini girin.");
      return;
    }

    setStatus("loading");
    setMessage("");

    // Tam adres bulunamazsa cadde, sonra mahalle düzeyinde dene (kademeli çözümleme).
    const queries = buildGeocodeQueries({ address, district, province });
    let outcome = await geocodeAddress(queries[0]);
    for (let index = 1; index < queries.length && outcome.status === "not_found"; index += 1) {
      if (requestId !== requestIdRef.current) return;
      outcome = await geocodeAddress(queries[index]);
    }
    if (requestId !== requestIdRef.current) return;

    if (outcome.status === "found") {
      setStatus("found");
      setMessage("Konum bulundu. Pini sürükleyerek düzeltebilirsiniz.");
      onChangeRef.current(
        { latitude: outcome.latitude, longitude: outcome.longitude },
        "geocode",
      );
      return;
    }
    if (outcome.status === "not_found") {
      setStatus("not_found");
      setMessage(outcome.message);
      return;
    }
    setStatus("error");
    setMessage(outcome.message);
  }, [address, district, province]);

  /* Adres değiştiğinde (yazma durduktan 1,2 sn sonra) tek istek atılır ve harita yeni konuma uçar. */
  useEffect(() => {
    if (!autoGeocode || disabled || !readyForGeocode) return;
    if (query === lastAutoQueryRef.current) return;

    const timer = window.setTimeout(() => {
      lastAutoQueryRef.current = query;
      void runGeocode();
    }, AUTO_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [query, readyForGeocode, autoGeocode, disabled, runGeocode]);

  function clearPin() {
    requestIdRef.current += 1;
    setStatus("idle");
    setMessage("");
    onChangeRef.current(null, "clear");
  }

  const hasPin = Boolean(coords);
  const statusMessage =
    status === "idle" && !hasPin
      ? "Konum seçilmedi. Adresi bulun veya haritaya dokunun."
      : status === "idle"
        ? "Konum seçildi."
        : message;

  return (
    <section className="fr-map" aria-label="Firma konumu">
      <div className="fr-map__head">
        <div>
          <h4 className="fr-map__title">Harita konumu</h4>
          <p className="fr-map__hint">
            Adres tamamlanınca konum otomatik aranır. Gerekirse pini sürükleyin veya haritaya
            dokunun.
          </p>
        </div>
        <div className="fr-map__actions">
          <button
            type="button"
            className="fr-map__btn fr-map__btn--primary"
            onClick={() => void runGeocode()}
            disabled={disabled || status === "loading"}
          >
            {status === "loading" ? (
              <Loader2 size={15} strokeWidth={2.2} aria-hidden="true" className="fr-map__spin" />
            ) : (
              <Search size={15} strokeWidth={2.2} aria-hidden="true" />
            )}
            Adresi bul
          </button>
          <button
            type="button"
            className="fr-map__btn"
            onClick={clearPin}
            disabled={disabled || !hasPin}
          >
            <Trash2 size={15} strokeWidth={2.1} aria-hidden="true" />
            Pini temizle
          </button>
        </div>
      </div>

      <div className={`fr-map__canvas-wrap${disabled ? " is-disabled" : ""}`}>
        <div
          ref={containerRef}
          className="fr-map__canvas"
          role="application"
          aria-label="Firma konumu haritası; konum seçmek için dokunun"
        />
        {!ready && !mapFailed && (
          <div className="fr-map__overlay" role="status">
            <Loader2 size={18} strokeWidth={2.1} aria-hidden="true" className="fr-map__spin" />
            Harita yükleniyor…
          </div>
        )}
        {mapFailed && (
          <div className="fr-map__overlay fr-map__overlay--warn" role="alert">
            <AlertTriangle size={18} strokeWidth={2} aria-hidden="true" />
            Harita yüklenemedi. Adresi bulmayı deneyin veya sayfayı yenileyin.
          </div>
        )}
      </div>

      <div className="fr-map__footer">
        <div className="fr-map__coords" aria-live="polite">
          <MapPin size={15} strokeWidth={2.1} aria-hidden="true" />
          {coords ? (
            <span>
              <span className="fr-map__coords-label">Seçili konum</span>{" "}
              <code>{formatCoordinates(coords)}</code>
            </span>
          ) : (
            <span className="fr-map__coords-empty">Konum seçilmedi</span>
          )}
        </div>

        {statusMessage && (
          <p
            className={`fr-map__status fr-map__status--${status}`}
            role={status === "error" || status === "not_found" ? "alert" : "status"}
          >
            {status === "found" && (
              <CheckCircle2 size={15} strokeWidth={2.1} aria-hidden="true" />
            )}
            {(status === "error" || status === "not_found" || status === "incomplete") && (
              <AlertTriangle size={15} strokeWidth={2} aria-hidden="true" />
            )}
            <span>{statusMessage}</span>
          </p>
        )}
      </div>

      <p className="fr-map__attr">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          © OpenStreetMap katkıda bulunanlar
        </a>
        {" · "}
        <a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">
          OpenFreeMap
        </a>
        {" · "}
        <a href="https://nominatim.org/" target="_blank" rel="noopener noreferrer">
          Nominatim
        </a>
      </p>
    </section>
  );
}
