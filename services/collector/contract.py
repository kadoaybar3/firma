"""
Veri sözleşmesi — React paneli ile koleksiyon servisi arasındaki tek kaynak.

KURAL: JSON alan adları JS paneliyle birebir aynıdır (camelCase); bu yüzden
pydantic modellerinde alan adları doğrudan camelCase seçilmiştir.
"""

import threading
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

# Kaynak tanımlayıcıları — adaptör kayıt defteriyle birebir
SOURCE_PLACES = "google-places"
SOURCE_CSV = "csv"
SOURCE_FAKE = "fake"
SOURCE_SCRAPER = "maps-scraper"
SOURCE_SCRAPER_CSV = "maps-scraper-csv"

# Üretimde yasaklı kaynak (ToS ihlali — bkz. docs/SCRAPER-DEGERLENDIRMESI.md)
# NOT: SOURCE_SCRAPER (canlı harita taraması) yasak; SOURCE_SCRAPER_CSV ise
# çevrimdışı bir dosya adaptörüdür (canlı istek yok) — O-3 izole testinin
# ürettiği CSV gibi SADECE kullanıcının elinde olan dosyaları okur.
FORBIDDEN_SOURCES = {SOURCE_SCRAPER}

# Arama işi üst sınırları
MAX_LIMIT = 20
JOB_TIMEOUT_SECONDS = 120


class SearchRequest(BaseModel):
    """İş oluşturma gövdesi (POST /jobs)."""

    il: str = Field(min_length=2, max_length=40)
    ilce: str = Field(min_length=2, max_length=40)
    kategori: str = Field(min_length=2, max_length=60)
    limit: int = Field(default=10, ge=1, le=MAX_LIMIT)
    source: str = Field(default=SOURCE_PLACES)
    # Kaynağa özel parametreler (örn. csv: {"content": "..."})
    sourceConfig: dict = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")


class Candidate(BaseModel):
    """Aday kayıt — içe aktarma önizlemesine olduğu gibi taşınır."""

    name: str
    source: str
    phone: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    placeId: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)


class JobProgress(BaseModel):
    done: int = 0
    total: int = 0


class JobStatus(BaseModel):
    jobId: str
    state: str  # queued | running | done | failed | cancelled
    source: str
    progress: JobProgress = Field(default_factory=JobProgress)
    error: Optional[str] = None


class HealthReport(BaseModel):
    ok: bool = True
    version: str = "v1"
    adapters: List[str] = Field(default_factory=list)
    scraperEnabled: bool = False


def phone_key(raw: Optional[str]) -> str:
    """TS phoneKey ile aynı kural: yalnız rakamlar; TR ülke kodu/baş sıfır gider."""
    if not raw:
        return ""
    digits = "".join(ch for ch in raw if ch.isdigit())
    if digits.startswith("00"):
        digits = digits[2:]
    if len(digits) == 12 and digits.startswith("90"):
        digits = digits[2:]
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits
