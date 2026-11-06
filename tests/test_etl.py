import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "etl"))
import etl  # noqa: E402


def fake(var, gid, name, series):
    return {"id": var, "resultados": [{"classificacoes": [{"categoria": {str(gid): name}}], "series": [{"serie": series}]}]}


def test_build_drops_incomplete_months_and_orders_headline_first():
    raw = []
    for gid in etl.GROUPS:
        raw.append(fake("63", gid, f"{gid}.G{gid}", {"202401": "0.5", "202402": "0.4"}))
        raw.append(fake("66", gid, f"{gid}.G{gid}", {"202401": "10", "202402": "..."}))
    raw.append(fake("63", 7169, "Índice geral", {"202403": "0.3"}))  # month 3 exists for one group only
    out = etl.build(etl.to_frame(raw))
    assert out["months"] == ["202401", "202402"]
    assert out["groups"][0]["id"] == 7169
    assert out["groups"][1]["weight"] == [10.0, None]
    assert out["groups"][1]["name"] == f"G{etl.GROUPS[1]}"
