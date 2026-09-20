from __future__ import annotations

import os
from pathlib import Path

import app.settings as settings_module


OPENAI_ENV_NAMES = (
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "OPENAI_TIMEOUT_SECONDS",
    "OPENAI_REASONING_EFFORT_CLASSIFY",
)


def _restore_environment(original: dict[str, str | None]) -> None:
    for name, value in original.items():
        if value is None:
            os.environ.pop(name, None)
        else:
            os.environ[name] = value


def test_settings_loads_backend_dotenv_and_reports_source(monkeypatch, tmp_path: Path):
    original = {name: os.environ.get(name) for name in OPENAI_ENV_NAMES}
    try:
        for name in OPENAI_ENV_NAMES:
            monkeypatch.delenv(name, raising=False)

        fake_settings_file = tmp_path / "repo" / "backend" / "app" / "settings.py"
        fake_settings_file.parent.mkdir(parents=True)
        env_file = fake_settings_file.parents[1] / ".env"
        env_file.write_text(
            "OPENAI_API_KEY=dotenv-test-key\nOPENAI_MODEL=dotenv-model\n",
            encoding="utf-8",
        )
        monkeypatch.setattr(settings_module, "__file__", str(fake_settings_file))

        configured = settings_module.Settings()

        assert configured.openai_api_key == "dotenv-test-key"
        assert configured.openai_model == "dotenv-model"
        assert configured.openai_key_source == ".env"
        assert configured.env_file_path == env_file
    finally:
        _restore_environment(original)


def test_process_environment_key_takes_precedence_over_dotenv(monkeypatch, tmp_path: Path):
    original = {name: os.environ.get(name) for name in OPENAI_ENV_NAMES}
    try:
        for name in OPENAI_ENV_NAMES:
            monkeypatch.delenv(name, raising=False)

        fake_settings_file = tmp_path / "repo" / "backend" / "app" / "settings.py"
        fake_settings_file.parent.mkdir(parents=True)
        env_file = fake_settings_file.parents[1] / ".env"
        env_file.write_text("OPENAI_API_KEY=dotenv-test-key\n", encoding="utf-8")
        monkeypatch.setattr(settings_module, "__file__", str(fake_settings_file))
        monkeypatch.setenv("OPENAI_API_KEY", "environment-test-key")

        configured = settings_module.Settings()

        assert configured.openai_api_key == "environment-test-key"
        assert configured.openai_key_source == "env"
    finally:
        _restore_environment(original)


def test_missing_dotenv_is_allowed(monkeypatch, tmp_path: Path):
    original = {name: os.environ.get(name) for name in OPENAI_ENV_NAMES}
    try:
        for name in OPENAI_ENV_NAMES:
            monkeypatch.delenv(name, raising=False)

        fake_settings_file = tmp_path / "repo" / "backend" / "app" / "settings.py"
        fake_settings_file.parent.mkdir(parents=True)
        monkeypatch.setattr(settings_module, "__file__", str(fake_settings_file))

        configured = settings_module.Settings()

        assert configured.openai_api_key == ""
        assert configured.openai_key_source is None
    finally:
        _restore_environment(original)
