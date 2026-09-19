from __future__ import annotations

from pathlib import Path

import pytest

from app.adapters.dataset_loader import DatasetLoader


FIXTURE_DATA_DIR = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture
def fixture_loader() -> DatasetLoader:
    return DatasetLoader(FIXTURE_DATA_DIR)
