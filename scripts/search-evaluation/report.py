"""Assemble captured measurements and explicitly agent-judged relevance."""

import hashlib
import json
from pathlib import Path

from common import ARTIFACTS, ROOT, write_json


def report():
    raw = json.loads((ARTIFACTS / "results.json").read_text())
    result = json.loads((ARTIFACTS / "summary.json").read_text())
    judgments = json.loads(Path(__file__).with_name("judgments.json").read_text())
    current = [
        c
        for c in json.loads(Path(__file__).with_name("cases.json").read_text())["cases"]
        if c["split"] == "test"
    ]
    if current != raw["cases"]:
        raise ValueError("Captured cases do not match the current fixture")
    result.pop("case_sha256")
    result["case_content_sha256"] = hashlib.sha256(
        json.dumps(current, ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()
    lookup = {(row["case"], row["id"]): row for row in judgments["judgments"]}
    if len(lookup) != len(judgments["judgments"]):
        raise ValueError("Duplicate judgments")
    first = {
        (o["case"], o["variant"]): [r["id"] for r in o["results"][:5]]
        for o in raw["observations"]
        if o["trial"] == 0
    }
    result["quality_trial"] = 0
    result["changed_top5_repetitions"] = sum(
        [r["id"] for r in o["results"][:5]] != first[(o["case"], o["variant"])]
        for o in raw["observations"]
        if o["trial"] != 0
    )
    result["judgments"] = {
        "source": judgments["source"],
        "limits": judgments["limits"],
        "count": len(lookup),
        "path": "scripts/search-evaluation/judgments.json",
    }
    result["artifacts"] = {
        name: json.loads((ARTIFACTS / f"{name}.json").read_text())
        for name in [
            "embeddings",
            "hnsw",
            "names",
            "bm25",
            "browser",
            "browser-startup",
            "verification",
            "model-probe",
            "app-fixtures",
            "production-guard",
        ]
    }
    for variant in result["variants"]:
        name_groups = [
            variant["groups"][g] for g in ["exact", "prefix", "joined", "typo"]
        ]
        variant["name_cases"] = sum(row["cases"] for row in name_groups)
        variant["name_hits"] = sum(row["known_hits_at_5"] for row in name_groups)
        samples = [
            o
            for o in raw["observations"]
            if o["variant"] == variant["id"]
            and o["trial"] == 0
            and next(c for c in raw["cases"] if c["id"] == o["case"])["group"]
            in ["rules", "description"]
        ]
        grades = []
        for sample in samples:
            row = [
                lookup[(sample["case"], hit["id"])]["grade"]
                for hit in sample["results"][:5]
            ]
            grades.append(row + [0] * (5 - len(row)))
        variant["pooled_relevant_slots"] = sum(g == 2 for row in grades for g in row)
        variant["pooled_total_slots"] = len(grades) * 5
        variant["pooled_answer_cases"] = sum(2 in row for row in grades)
        variant["pooled_cases"] = len(grades)
    destination = ROOT / "docs/integrations/search-evaluation-results.json"
    write_json(destination, result)
    chart_data = [
        {
            "id": v["id"],
            "names": v["name_hits"],
            "content": v["pooled_relevant_slots"],
            "latency": v["card_warm_p95_ms"],
        }
        for v in result["variants"]
    ]
    template = Path(__file__).with_name("chart.html").read_text()
    (ARTIFACTS / "results.html").write_text(
        template.replace("__DATA__", json.dumps(chart_data))
    )
    print(
        json.dumps(
            {
                "report": str(destination),
                "variants": len(chart_data),
                "judgments": len(lookup),
            }
        )
    )


if __name__ == "__main__":
    report()
