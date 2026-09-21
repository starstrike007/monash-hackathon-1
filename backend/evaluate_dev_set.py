"""Score the hand-checked fallback development set.

The official evaluator is not present in this workspace, so this deliberately
small evaluator measures only the checked cases in ``tests/dev_set.json``. It
does not infer or inspect any private reference data.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any


FIELDS = (
    "shipper",
    "consignee",
    "notify_party",
    "port_of_loading",
    "port_of_discharge",
    "container_count",
    "gross_weight_kg",
)


def _f1(tp: int, fp: int, fn: int) -> float:
    if tp == 0 and fp == 0 and fn == 0:
        return 1.0
    if tp == 0:
        return 0.0
    return 2 * tp / (2 * tp + fp + fn)


def _review_f1(expected: list[dict[str, Any]], actual: dict[str, dict[str, Any]]) -> float:
    tp = fp = fn = 0
    for case in expected:
        want = case["status"] == "NEEDS_REVIEW"
        got = actual[case["email_id"]].get("status") == "NEEDS_REVIEW"
        if want and got:
            tp += 1
        elif got:
            fp += 1
        elif want:
            fn += 1
    return _f1(tp, fp, fn)


def score(dev_set_path: Path, submission_path: Path) -> dict[str, Any]:
    dev_set = json.loads(dev_set_path.read_text(encoding="utf-8"))
    submission = json.loads(submission_path.read_text(encoding="utf-8"))
    cases = dev_set["cases"]
    actual = {case["email_id"]: submission.get(case["email_id"], {}) for case in cases}

    classification_tp = classification_fp = classification_fn = 0
    defect_tp = defect_fp = defect_fn = 0
    exact_rows = 0
    wrong_cases: list[dict[str, Any]] = []

    for case in cases:
        row = actual[case["email_id"]]
        expected_category = case["category"]
        got_category = row.get("category")
        if expected_category == "BL_COMPARISON" and got_category == "BL_COMPARISON":
            classification_tp += 1
        elif got_category == "BL_COMPARISON":
            classification_fp += 1
        elif expected_category == "BL_COMPARISON":
            classification_fn += 1

        expected_defects = set(case["defect_fields"])
        got_defects = set(row.get("defect_fields") or [])
        defect_tp += len(expected_defects & got_defects)
        defect_fp += len(got_defects - expected_defects)
        defect_fn += len(expected_defects - got_defects)

        expected_row = {
            "category": case["category"],
            "status": case["status"],
            "review_reason": case["review_reason"],
            "has_defect": case["has_defect"],
            "defect_fields": case["defect_fields"],
        }
        got_row = {
            "category": row.get("category"),
            "status": row.get("status"),
            "review_reason": row.get("review_reason"),
            "has_defect": row.get("has_defect"),
            "defect_fields": row.get("defect_fields") or [],
        }
        if expected_row == got_row:
            exact_rows += 1
        else:
            wrong_cases.append({"email_id": case["email_id"], "expected": expected_row, "actual": got_row})

    classification_f1 = _f1(classification_tp, classification_fp, classification_fn)
    defect_f1 = _f1(defect_tp, defect_fp, defect_fn)
    end_to_end = exact_rows / len(cases) if cases else 1.0
    review_handling_f1 = _review_f1(cases, actual)
    overall = (classification_f1 + defect_f1 + end_to_end + review_handling_f1) / 4

    return {
        "source": "hand-checked dev set; not the official evaluator",
        "dev_set_path": str(dev_set_path),
        "submission_path": str(submission_path),
        "cases": len(cases),
        "overall": overall,
        "classification_f1": classification_f1,
        "defect_f1": defect_f1,
        "end_to_end": end_to_end,
        "review_handling_f1": review_handling_f1,
        "exact_rows": exact_rows,
        "status_counts_expected": dict(Counter(case["status"] for case in cases)),
        "status_counts_actual": dict(Counter(actual[case["email_id"]].get("status") for case in cases)),
        "review_reason_counts_expected": dict(Counter(case["review_reason"] for case in cases)),
        "review_reason_counts_actual": dict(Counter(actual[case["email_id"]].get("review_reason") for case in cases)),
        "wrong_cases": wrong_cases,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("submission", type=Path)
    parser.add_argument("--dev-set", type=Path, default=Path("tests/dev_set.json"))
    args = parser.parse_args()
    print(json.dumps(score(args.dev_set, args.submission), indent=2))


if __name__ == "__main__":
    main()
