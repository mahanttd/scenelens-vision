"""Export the trained SceneLens specialist to browser-ready ONNX."""

from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path

import onnx

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("YOLO_CONFIG_DIR", str(ROOT / "training" / "cache"))

from ultralytics import YOLO  # noqa: E402

VOC_NAMES = [
    "aeroplane",
    "bicycle",
    "bird",
    "boat",
    "bottle",
    "bus",
    "car",
    "cat",
    "chair",
    "cow",
    "diningtable",
    "dog",
    "horse",
    "motorbike",
    "person",
    "pottedplant",
    "sheep",
    "sofa",
    "train",
    "tvmonitor",
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--output", default="public/models/scenelens-v3-voc.onnx")
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()

    model = YOLO(args.model)
    exported = Path(
        model.export(
            format="onnx",
            imgsz=640,
            simplify=True,
            opset=18,
            dynamic=False,
            half=False,
            nms=False,
            batch=1,
            device=args.device,
        )
    )
    output = (ROOT / args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(exported, output)
    output.with_suffix(".labels.json").write_text(
        json.dumps(VOC_NAMES, indent=2), encoding="utf-8"
    )
    exported_model = onnx.load(output)
    onnx.checker.check_model(exported_model)
    output_shape = [
        dimension.dim_value or dimension.dim_param
        for dimension in exported_model.graph.output[0].type.tensor_type.shape.dim
    ]
    print(
        f"Exported {output} ({output.stat().st_size / 1_000_000:.1f} MB), "
        f"output shape {output_shape}"
    )


if __name__ == "__main__":
    main()
