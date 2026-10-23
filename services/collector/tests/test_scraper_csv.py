"""maps-scraper-csv adaptörü testleri — O-3 çıktısı + sentetik kenar durumları.

HIÇBIR test gerçek ağ isteği yapmaz: O-3'te izole testte üretilen /tmp/gms-afyon.csv
makinede varsa onunla, yoksa aynı sütun yapısına sahip ikame sahte CSV ile çalışılır.
"""

import csv
import io
import threading
from pathlib import Path

import pytest

from adapters import MapsScraperCsvAdapter, SourceError, default_registry
from contract import FORBIDDEN_SOURCES, SOURCE_SCRAPER_CSV, SearchRequest
from jobs import JobStore, enrich
from tests.conftest import wait_finished

O3_CSV = Path("/tmp/gms-afyon.csv")


def fake_scraper_csv(overrides: "list[dict] | None" = None) -> str:
    """Aynı sütun yapısına sahip, hizalaması csv.writer'la kesin sahte çıktı."""
    header = ["name", "category", "address", "phone", "phone_intl", "website", "email",
              "rating", "review_count", "lat", "lng", "plus_code", "hours", "price_level",
              "business_status", "google_maps_url", "place_id", "query", "added"]
    rows = overrides or [
        {"name": "Ali Usta Kasap", "category": "Kasap,Türk restoranı",
         "address": "Burmalı, 22. Sk., 03200 Afyonkarahisar Merkez",
         "phone": "0546 971 67 69", "phone_intl": "05469716769", "website": "https://ikramaliusta.com/",
         "lat": "38.7563391", "lng": "30.5388658",
         "google_maps_url": "https://maps.google.com/?cid=16255466053927681153",
         "place_id": "ChIJBVnWLc4XzxQRgbzHOkAEl-E", "query": "kasap in Merkez, Afyonkarahisar"},
        {"name": "Ördekçioğlu Et Market", "category": "Kasap",
         "address": "Örnek Cd., 03200 Afyonkarahisar Merkez",
         "lat": "38.75", "lng": "30.55",
         "google_maps_url": "https://maps.google.com/?cid=1100", "place_id": ""},
        {"name": "Şivetoğlu Kasabı", "category": "Kasap",
         "address": "Dumlupınar, 03200 Afyonkarahisar Merkez",
         "phone": "0532 425 10 30", "phone_intl": "05324251030",
         "lat": "38.7561274", "lng": "30.5404501",
         "google_maps_url": "https://maps.google.com/?cid=936336144916517416",
         "place_id": "ChIJbzcVEc4XzxQRKJIbTMOI_gw"},
    ]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=header, restval="")
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return buf.getvalue()


FAKE_SCRAPER_CSV = fake_scraper_csv()


def run_adapter(content: str):  # type: ignore[no-untyped-def]
    adapter = MapsScraperCsvAdapter()
    req = SearchRequest(il="Afyonkarahisar", ilce="Merkez", kategori="Kasap", limit=20,
                        source=SOURCE_SCRAPER_CSV, sourceConfig={"content": content})
    progress_kayitlar: list[tuple[int, int]] = []
    cands = adapter.search(req, progress=lambda d, t: progress_kayitlar.append((d, t)),
                           cancel=threading.Event())
    return cands, progress_kayitlar


# ---------- O-3 gerçeği (dosya mevcutsa) ----------
def test_o3_gercek_csv_adaptorden_gecer():
    if not O3_CSV.exists():
        pytest.skip("O-3 çıktısı /tmp/gms-afyon.csv bu makinede yok — ikame testlerle devam")
    cands, _ = run_adapter(O3_CSV.read_text(encoding="utf-8"))
    assert len(cands) == 20
    assert all(c.source == "maps-scraper-csv" for c in cands)
    assert len({c.placeId for c in cands}) == 20
    assert any(c.phone for c in cands)
    for c in cands:
        assert (c.latitude is None) == (c.longitude is None)  # çift halde


# ---------- temel eşleme ----------
def test_esleme_isim_telefon_adres_web_koordinat_placeid():
    cands, _ = run_adapter(FAKE_SCRAPER_CSV)
    first = cands[0]
    assert first.name == "Ali Usta Kasap"
    assert first.phone == "05469716769"  # phone_intl öncelikli
    assert first.website == "https://ikramaliusta.com/"  # web boş olan → None
    assert "Afyonkarahisar Merkez" in (first.address or "")
    assert first.latitude == 38.7563391 and first.longitude == 30.5388658
    assert first.placeId == "ChIJBVnWLc4XzxQRgbzHOkAEl-E"


def test_web_bos_olursa_none_kayit():
    cands, _ = run_adapter(FAKE_SCRAPER_CSV)
    iki = [c for c in cands if c.name == "Ördekçioğlu Et Market"][0]
    assert iki.website is None
    assert iki.phone is None  # telefon sütunları boş
    assert iki.warnings == []  # eksik uyarıları jobs.enrich ekler (adaptör değil)


def test_phone_intl_yoksa_phone_kullanilir():
    content = fake_scraper_csv([
        {"name": "Sadece görünen tel", "phone": "0532 425 10 30", "lat": "38.7", "lng": "30.5",
         "place_id": "pp1"},
    ])
    cands, _ = run_adapter(content)
    assert cands[0].phone == "0532 425 10 30"


# ---------- category SÖZLEŞMEYE ALINMAZ ----------
def test_category_olani_hicbir_candidate_alanina_girmez():
    cands, _ = run_adapter(FAKE_SCRAPER_CSV)
    for c in cands:
        assert "category" not in c.model_dump()
        assert "category" not in c.model_dump(exclude_none=True)
    assert not any("Türk restoranı" in c.name for c in cands)


# ---------- koordinat kuralları ----------
def test_lat_sifir_veya_gecersiz_koordinat_cift_halde_none():
    content = fake_scraper_csv([{"name": "Sıfır Enlem", "lat": "0", "lng": "30.55", "place_id": "p1"}])
    cands, _ = run_adapter(content)
    assert cands[0].latitude is None and cands[0].longitude is None
    content2 = fake_scraper_csv([{"name": "Yarım Koordinat", "lat": "38.75", "lng": "", "place_id": "p2"}])
    cands2, _ = run_adapter(content2)
    assert cands2[0].latitude is None and cands2[0].longitude is None


def test_hatali_koordinat_degeri_none_olur_ve_is_cokmez():
    content = fake_scraper_csv([{"name": "Bozuk Koordinat", "lat": "abc", "lng": "xyz", "place_id": "p3"}])
    cands, _ = run_adapter(content)
    assert cands[0].latitude is None and cands[0].longitude is None


def test_parse_coord_birimleri():
    p = MapsScraperCsvAdapter.parse_coord
    assert p("38.75") == 38.75
    assert p("38,75") == 38.75  # virgül ondalığı
    assert p("") is None
    assert p("  ") is None
    assert p("0") is None and p("0.0") is None
    assert p("abc") is None


def test_parse_place_id_cid_fallback():
    pid = MapsScraperCsvAdapter.parse_place_id
    assert pid({"place_id": "ChIJx"}) == "ChIJx"
    assert pid({"place_id": "", "google_maps_url": "https://maps.google.com/?cid=936336144916517416"}) == "936336144916517416"
    assert pid({"place_id": "", "google_maps_url": "https://maps.google.com/?cid=123&hl=tr"}) == "123"
    assert pid({"google_maps_url": "https://maps.google.com/?api=1"}) is None
    assert pid({}) is None


# ---------- eksik place_id uyarısı ----------
def test_eksik_place_id_uyari_uretir_is_cokmez():
    """place_id ve cid kaynaklarının İKİSİ de yokken uyarı üretilir."""
    content = fake_scraper_csv([
        {"name": "PlaceIdsiz", "address": "Bir yer",
         "google_maps_url": "https://maps.google.com/?api=1", "place_id": ""},
    ])
    cands, _ = run_adapter(content)
    assert cands[0].placeId is None
    assert "place_id yok" in cands[0].warnings[0]


# ---------- bozuk satır dayanıklılığı ----------
def test_bozuk_satirlar_atlanir_gecerliler_korunur():
    corrupted = FAKE_SCRAPER_CSV + (
        ",,,,\n"                  # name boş → atlanır
        ",Yine boş ad,z,z,z\n"    # name boş → atlanır
    )
    cands, _ = run_adapter(corrupted)
    assert [c.name for c in cands] == ["Ali Usta Kasap", "Ördekçioğlu Et Market", "Şivetoğlu Kasabı"]


def test_tum_satirlar_bozukysa_source_err():
    content = "bununda,basligi,bulunmuyor\na,1,2\n"
    with pytest.raises(SourceError) as ei:
        run_adapter(content)
    assert "geçerli satır yok" in str(ei.value)


def test_bos_icerik_source_err():
    with pytest.raises(SourceError):
        run_adapter("   ")


# ---------- jobs.enrich entegrasyonu (telefon mükerrerliği vb.) ----------
def test_enrich_telefon_mukerrer_ve_eksik_uyarilari():
    cands, _ = run_adapter(FAKE_SCRAPER_CSV)
    for c in cands:
        if c.name == "Şivetoğlu Kasabı":
            c.phone = cands[0].phone  # iş içi mükerrer telefon üret
    enriched = enrich(cands)
    sifeto = [c for c in enriched if c.name == "Şivetoğlu Kasabı"][0]
    assert "Aynı iş içinde telefonu tekrar eden aday" in sifeto.warnings
    telefonsuz = [c for c in enriched if not c.phone]
    assert {c.name for c in telefonsuz} == {"Ördekçioğlu Et Market"}
    assert all("Telefon yok" in c.warnings for c in telefonsuz)


def test_jobstore_tum_akis_scraper_csv_kaynagi():
    """Registry'den gerçek akış: jobs.start → done → candidates (ağ yok)."""
    store = JobStore(default_registry(), timeout_seconds=5)
    req = SearchRequest(il="Afyonkarahisar", ilce="Merkez", kategori="Kasap", limit=20,
                        source=SOURCE_SCRAPER_CSV, sourceConfig={"content": FAKE_SCRAPER_CSV})
    job_id, error = store.start(req)
    assert job_id and error is None
    job = wait_finished(store, job_id)
    assert job.state == "done"
    assert len(job.candidates) == 3
    assert all(c.source == "maps-scraper-csv" for c in job.candidates)


def test_scraper_csv_yasakli_kaynak_degil():
    """maps-scraper-csv OFFLINE dosya → yasaklı listede değil; canlı maps-scraper yasak."""
    assert "maps-scraper-csv" not in FORBIDDEN_SOURCES
    assert "maps-scraper" in FORBIDDEN_SOURCES


# ---------- seslendirme: registry'de yer aldığını doğrula ----------
def test_registry_maps_scraper_csv_icerir():
    reg = default_registry()
    assert "maps-scraper-csv" in reg
    assert reg["maps-scraper-csv"].is_configured() is True
