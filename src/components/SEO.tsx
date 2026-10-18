import { useEffect } from "react";
import type { ReactNode } from "react";

/*
 * SEO bileşeni: başlık, açıklama, canonical, OpenGraph, Twitter Card ve
 * JSON-LD yönetimi. Tüm yönetilen düğümler `data-seo` imzalıdır — her effect
 * çalışmasında önce imzalı düğümler silinir, sonra yeniden yazılır
 * (React 19 StrictMode ve çoklu mount güvenli). Yalnız kendi eklediği
 * düğümlere dokunulur; site harici head içeriği korunur.
 */

/** index.html'in ilk yükteki varsayılan açıklaması — unmount'ta geri dönüş değeri */
const fallbackDescription =
  typeof document !== "undefined"
    ? document.querySelector<HTMLMetaElement>('meta[name="description"]')?.getAttribute("content") ?? ""
    : "";

export type SeoOptions = {
  title: string;
  description?: string;
  /** "/firma/x" gibi site-içi yol; mutlak URL location.origin'den üretilir. */
  canonicalPath?: string;
  /** Gerçek görsel URL'si varsa OpenGraph/Twitter görseli (emoji veriyle üretilmez). */
  ogImage?: string;
  ogType?: "website" | "article";
  /** Yapılandırılmış veri düğümleri — her biri ayrı ld+json script'i olur. */
  jsonLd?: Array<Record<string, unknown>>;
  /** Utility sayfaları için arama motoru indeksi iptali. */
  noindex?: boolean;
};

/** HTML-duyarlı karakterleri kaçırarak güvenli JSON-LD metni üretir. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Yolu mutlak adrese çevirir; site-içi / ile başlamayan veya origin kaçışı riskli değer reddedilir. */
function absoluteUrl(path?: string): string | null {
  const clean = path && path.startsWith("/") && !path.startsWith("//") ? path : null;
  if (!clean) return null;
  try {
    const u = new URL(clean, location.origin);
    return u.origin === location.origin ? u.href : null;
  } catch {
    return null;
  }
}

export function useSEO(options: SeoOptions): void {
  const { title, description, canonicalPath, ogImage, ogType = "website", jsonLd, noindex } = options;

  useEffect(() => {
    // 1) Önceki yönetilen düğümleri kaldır (idempotent upsert)
    document.head.querySelectorAll("[data-seo]").forEach((n) => n.remove());

    // 2) Başlık ve açıklama
    document.title = title;
    const descriptionMeta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    descriptionMeta?.setAttribute("content", description ?? fallbackDescription);

    // 3) Canonical
    const canonical = absoluteUrl(canonicalPath ?? location.pathname);
    if (canonical) {
      const link = document.createElement("link");
      link.rel = "canonical";
      link.href = canonical;
      link.setAttribute("data-seo", "1");
      document.head.appendChild(link);
      const ogUrl = document.createElement("meta");
      ogUrl.setAttribute("property", "og:url");
      ogUrl.setAttribute("content", canonical);
      ogUrl.setAttribute("data-seo", "1");
      document.head.appendChild(ogUrl);
    }

    // 4) OpenGraph
    const ogEntries: Array<[string, string]> = [
      ["og:title", title],
      ["og:description", description ?? fallbackDescription],
      ["og:type", ogType],
      ["og:site_name", "Firma Rehberi"],
      ["og:locale", "tr_TR"],
    ];
    if (ogImage) ogEntries.push(["og:image", ogImage]);
    for (const [property, content] of ogEntries) {
      const meta = document.createElement("meta");
      meta.setAttribute("property", property);
      meta.setAttribute("content", content);
      meta.setAttribute("data-seo", "1");
      document.head.appendChild(meta);
    }

    // 5) Twitter Card
    const twitterEntries: Array<[string, string]> = [
      ["twitter:card", ogImage ? "summary_large_image" : "summary"],
      ["twitter:title", title],
      ["twitter:description", description ?? fallbackDescription],
    ];
    for (const [name, content] of twitterEntries) {
      const meta = document.createElement("meta");
      meta.setAttribute("name", name);
      meta.setAttribute("content", content);
      meta.setAttribute("data-seo", "1");
      document.head.appendChild(meta);
    }

    // 6) İndeks iptali (utility sayfaları)
    if (noindex) {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      meta.setAttribute("content", "noindex");
      meta.setAttribute("data-seo", "1");
      document.head.appendChild(meta);
    }

    // 7) JSON-LD
    for (const node of jsonLd ?? []) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.text = serializeJsonLd(node);
      script.setAttribute("data-seo", "1");
      document.head.appendChild(script);
    }

    // Temizlik: yalnızca kendi imzaladığımız düğümleri kaldır; açıklamayı varsayılana döndür
    return () => {
      document.head.querySelectorAll("[data-seo]").forEach((n) => n.remove());
      document
        .querySelector<HTMLMetaElement>('meta[name="description"]')
        ?.setAttribute("content", fallbackDescription);
    };
  }, [title, description, canonicalPath, ogImage, ogType, noindex, jsonLd]);
}

export function SEO(props: SeoOptions & { children?: ReactNode }) {
  useSEO(props);
  return <>{props.children}</>;
}
