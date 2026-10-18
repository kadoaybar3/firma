import { describe, expect, it } from "vitest";
import { isChunkLoadError } from "./ErrorBoundary";

describe("isChunkLoadError", () => {
  // Gerçek dünya hata metinleri: Chrome/Edge, Safari, Firefox, webpack
  const realWorldMessages = [
    { name: null, message: "Failed to fetch dynamically imported module: https://site/assets/FirmDetailPage-abc123.js" },
    { name: null, message: "Importing a module script failed." },
    { name: "ChunkLoadError", message: "ChunkLoadError: Loading chunk 5 failed." },
  ];

  it("bilinen tüm tarayıcı/derleyici chunk hata biçimlerini tanır", () => {
    for (const m of realWorldMessages) {
      expect(isChunkLoadError(m)).toBe(true);
    }
  });

  it("chunk dışı normal render hatalarını reddeder", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(new TypeError("x is not a function"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});
