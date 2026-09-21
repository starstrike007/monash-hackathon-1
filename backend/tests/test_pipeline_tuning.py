from app.pipeline.normalize import normalize_port


def test_port_normalization_keeps_explicit_place_when_codes_conflict():
    assert normalize_port("Mombasa, Kenya (KEMBA)") != normalize_port("Tuticorin, India (KEMBA)")


def test_port_normalization_collapses_harmless_terminal_aliases():
    assert normalize_port("Port Klang, Malaysia (MYPKG)") == normalize_port("Port Klang (Westport) (MYPKG)")
    assert normalize_port("Singapore") == normalize_port("Singapore (SGSIN)")
