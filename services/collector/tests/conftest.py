"""Ortak fikstürler — sahte kayıt defteri; gerçek ağ erişimi YOK."""

import os
import sys
from typing import Dict

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from adapters import (  # noqa: E402
    BaseSourceAdapter,
    FakeAdapter,
    ScraperAdapter,
    SourceError,
)
from contract import Candidate, SearchRequest  # noqa: E402
from jobs import JobStore  # noqa: E402


class InstantAdapter(BaseSourceAdapter):
    """Hızlı dolu iş — 3 aday, tek hamlede."""

    name = "instant"

    def search(self, req, progress, cancel):  # type: ignore[no-untyped-def]
        out = [
            Candidate(name=f"{req.kategori} A", source=self.name, phone="05551112233", address=f"{req.ilce} Cd."),
            Candidate(name=f"{req.kategori} B", source=self.name, phone="05551112233"),  # aynı telefon → uyarı
            Candidate(name=f"{req.kategori} C", source=self.name, address="beton adres"),  # telefon yok → uyarı
        ]
        progress(3, 3)
        return out


class ExplodingAdapter(BaseSourceAdapter):
    name = "exploding"

    def search(self, req, progress, cancel):  # type: ignore[no-untyped-def]
        raise SourceError("Kaynak patladı (test).")


@pytest.fixture
def store() -> JobStore:
    registry: Dict[str, BaseSourceAdapter] = {
        "instant": InstantAdapter(),
        "fake": FakeAdapter(),
        "exploding": ExplodingAdapter(),
        "maps-scraper": ScraperAdapter(app_env="development", enabled_flag="0"),
    }
    return JobStore(registry, timeout_seconds=5)


@pytest.fixture
def req() -> SearchRequest:
    return SearchRequest(il="Afyonkarahisar", ilce="Merkez", kategori="Kasap", limit=5, source="instant")


def wait_finished(store: JobStore, job_id: str, attempts: int = 100) -> "Job":  # noqa: F821
    import time

    from jobs import STATE_CANCELLED, STATE_DONE, STATE_FAILED

    for _ in range(attempts):
        job = store.get(job_id)
        if job and job.state in {STATE_DONE, STATE_FAILED, STATE_CANCELLED}:
            return job
        time.sleep(0.02)
    raise RuntimeError("İş zamanında bitmedi")
