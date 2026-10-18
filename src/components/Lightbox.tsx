import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * Hafif galeri lightbox'ı — harici kütüphane yok.
 * Emoji/gradient rozetler ve ileride gerçek fotoğraf URL'leri aynı bileşeni kullanır.
 */
export function Lightbox({
  items,
  index,
  onClose,
  onNavigate,
}: {
  /** Her öğe için içinde gösterilecek içerik (emoji, <img> vb.) */
  items: ReactNode[];
  index: number;
  onClose: () => void;
  onNavigate: (next: number) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < items.length - 1) onNavigate(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose, onNavigate]);

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Firma fotoğraf galerisi"
      onClick={onClose}
    >
      <div className="lightbox__stage-wrap" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox__stage">{items[index]}</div>
        <div className="lightbox__counter">
          {index + 1} / {items.length}
        </div>
      </div>
      <button ref={closeRef} className="lightbox__close" onClick={onClose} aria-label="Kapat">
        ✕
      </button>
      {index > 0 && (
        <button
          className="lightbox__nav lightbox__nav--prev"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(index - 1);
          }}
          aria-label="Önceki fotoğraf"
        >
          ‹
        </button>
      )}
      {index < items.length - 1 && (
        <button
          className="lightbox__nav lightbox__nav--next"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(index + 1);
          }}
          aria-label="Sonraki fotoğraf"
        >
          ›
        </button>
      )}
    </div>
  );
}
