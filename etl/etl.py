"""Download IPCA (IBGE SIDRA, table 7060) by group and write site/data/ipca.json."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

API = "https://servicodados.ibge.gov.br/api/v3/agregados/7060/periodos/-{n}/variaveis/63|66|2265"
GROUPS = [7169, 7170, 7445, 7486, 7558, 7625, 7660, 7712, 7766, 7786]
VARS = {"63": "monthly", "66": "weight", "2265": "acc12"}
OUT = Path(__file__).resolve().parent.parent / "site" / "data" / "ipca.json"


def fetch(months: int = 132) -> list:
    url = API.format(n=months)
    r = requests.get(url, params={"localidades": "N1[all]", "classificacao": f"315[{','.join(map(str, GROUPS))}]"}, timeout=60)
    r.raise_for_status()
    return r.json()


def to_frame(raw: list) -> pd.DataFrame:
    rows = []
    for v in raw:
        for res in v["resultados"]:
            (gid, name), = res["classificacoes"][0]["categoria"].items()
            for period, val in res["series"][0]["serie"].items():
                rows.append((int(gid), name, VARS[v["id"]], period, pd.to_numeric(val, errors="coerce")))
    return pd.DataFrame(rows, columns=["gid", "name", "var", "period", "value"])


def build(df: pd.DataFrame) -> dict:
    df = df.copy()
    df["name"] = df["name"].str.replace(r"^\d+\.", "", regex=True)
    names = df.drop_duplicates("gid").set_index("gid")["name"]
    wide = df.pivot_table(index=["gid", "period"], columns="var", values="value").reset_index()
    wide = wide.reindex(columns=["gid", "period", *VARS.values()])
    months = sorted(wide["period"].unique())
    # keep only months where every group has the monthly figure
    complete = wide.dropna(subset=["monthly"]).groupby("period")["gid"].nunique()
    months = [m for m in months if complete.get(m, 0) == len(GROUPS)]
    groups = []
    for gid in GROUPS:
        g = wide[wide.gid == gid].set_index("period").reindex(months)
        item = {"id": gid, "name": names[gid]}
        for k in ("monthly", "acc12", "weight"):
            item[k] = [None if pd.isna(x) else round(float(x), 2) for x in g[k]]
        groups.append(item)
    groups.sort(key=lambda g: g["id"] != 7169)  # headline index first
    return {
        "source": "IBGE - SIDRA table 7060 (IPCA)",
        "source_url": "https://sidra.ibge.gov.br/tabela/7060",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "months": months,
        "groups": groups,
    }


def main() -> int:
    data = build(to_frame(fetch()))
    if len(data["months"]) < 60:
        print(f"too few months: {len(data['months'])}", file=sys.stderr)
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({len(data['months'])} months, {len(data['groups'])} groups, last {data['months'][-1]})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
