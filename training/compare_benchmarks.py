"""Create the public SceneLens benchmark summary from raw evaluator reports."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
METRICS = [
    "map50",
    "map50_95",
    "precision_at_025_iou50",
    "recall_at_025_iou50",
    "average_gpu_inference_ms",
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--trained", type=Path, required=True)
    parser.add_argument("--previous", type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "public" / "benchmarks" / "scenelens-v3.json",
    )
    args = parser.parse_args()

    baseline = json.loads(args.baseline.read_text(encoding="utf-8"))
    trained = json.loads(args.trained.read_text(encoding="utf-8"))
    previous = (
        json.loads(args.previous.read_text(encoding="utf-8"))
        if args.previous
        else None
    )
    deltas = {
        metric: round(trained[metric] - baseline[metric], 6) for metric in METRICS
    }
    class_deltas = {
        name: {
            "ap50": round(
                trained["per_class"][name]["ap50"]
                - baseline["per_class"][name]["ap50"],
                6,
            ),
            "map50_95": round(
                trained["per_class"][name]["map50_95"]
                - baseline["per_class"][name]["map50_95"],
                6,
            ),
        }
        for name in trained["per_class"]
    }
    summary = {
        "protocol": {
            "dataset": "Pascal VOC 2007 test",
            "images": 4952,
            "training_images": 14896,
            "validation_images": 1655,
            "image_size": 640,
            "note": "The test split was excluded from training and checkpoint selection.",
        },
        "previous_app_fallback": previous,
        "pretrained_baseline": baseline,
        "scenelens_v3": trained,
        "delta_vs_pretrained": deltas,
        "per_class_delta_vs_pretrained": class_deltas,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps({"delta_vs_pretrained": deltas}, indent=2))


if __name__ == "__main__":
    main()
