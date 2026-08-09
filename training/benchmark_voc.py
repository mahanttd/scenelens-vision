"""Evaluate any YOLO detector on the held-out VOC 2007 test split by class name."""

from __future__ import annotations

import argparse
import json
import os
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("YOLO_CONFIG_DIR", str(ROOT / "training" / "cache"))

from ultralytics import YOLO, settings  # noqa: E402

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

NAME_ALIASES = {
    "airplane": "aeroplane",
    "dining table": "diningtable",
    "motorcycle": "motorbike",
    "potted plant": "pottedplant",
    "couch": "sofa",
    "tv": "tvmonitor",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--device", default="0")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--data-root", type=Path)
    return parser.parse_args()


def iou(box: np.ndarray, boxes: np.ndarray) -> np.ndarray:
    if boxes.size == 0:
        return np.empty(0, dtype=np.float32)
    left = np.maximum(box[0], boxes[:, 0])
    top = np.maximum(box[1], boxes[:, 1])
    right = np.minimum(box[2], boxes[:, 2])
    bottom = np.minimum(box[3], boxes[:, 3])
    intersection = np.maximum(0, right - left) * np.maximum(0, bottom - top)
    box_area = max(0, box[2] - box[0]) * max(0, box[3] - box[1])
    areas = np.maximum(0, boxes[:, 2] - boxes[:, 0]) * np.maximum(
        0, boxes[:, 3] - boxes[:, 1]
    )
    union = box_area + areas - intersection
    return np.divide(intersection, union, out=np.zeros_like(intersection), where=union > 0)


def average_precision(recall: np.ndarray, precision: np.ndarray) -> float:
    mrec = np.concatenate(([0.0], recall, [1.0]))
    mpre = np.concatenate(([0.0], precision, [0.0]))
    mpre = np.maximum.accumulate(mpre[::-1])[::-1]
    changing = np.where(mrec[1:] != mrec[:-1])[0]
    return float(np.sum((mrec[changing + 1] - mrec[changing]) * mpre[changing + 1]))


def load_ground_truth(
    images: list[Path], labels_dir: Path
) -> dict[str, dict[str, list[np.ndarray]]]:
    ground_truth: dict[str, dict[str, list[np.ndarray]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for image_path in images:
        with Image.open(image_path) as image:
            width, height = image.size
        label_path = labels_dir / f"{image_path.stem}.txt"
        if not label_path.exists():
            continue
        for line in label_path.read_text(encoding="utf-8").splitlines():
            class_id, cx, cy, box_width, box_height = map(float, line.split()[:5])
            name = VOC_NAMES[int(class_id)]
            x1 = (cx - box_width / 2) * width
            y1 = (cy - box_height / 2) * height
            x2 = (cx + box_width / 2) * width
            y2 = (cy + box_height / 2) * height
            ground_truth[name][image_path.stem].append(
                np.array([x1, y1, x2, y2], dtype=np.float32)
            )
    return ground_truth


def match_predictions(
    predictions: list[tuple[str, float, np.ndarray]],
    ground_truth: dict[str, list[np.ndarray]],
    threshold: float,
) -> tuple[np.ndarray, np.ndarray]:
    matched = {
        image_id: np.zeros(len(boxes), dtype=bool)
        for image_id, boxes in ground_truth.items()
    }
    true_positive = np.zeros(len(predictions), dtype=np.float32)
    false_positive = np.zeros(len(predictions), dtype=np.float32)
    for index, (image_id, _, box) in enumerate(predictions):
        boxes = np.asarray(ground_truth.get(image_id, []), dtype=np.float32)
        overlaps = iou(box, boxes)
        if overlaps.size == 0:
            false_positive[index] = 1
            continue
        best = int(np.argmax(overlaps))
        if overlaps[best] >= threshold and not matched[image_id][best]:
            true_positive[index] = 1
            matched[image_id][best] = True
        else:
            false_positive[index] = 1
    return true_positive, false_positive


def evaluate(
    predictions: dict[str, list[tuple[str, float, np.ndarray]]],
    ground_truth: dict[str, dict[str, list[np.ndarray]]],
) -> dict[str, Any]:
    thresholds = np.arange(0.5, 0.96, 0.05)
    per_class: dict[str, dict[str, float | int]] = {}
    micro_tp = micro_fp = micro_gt = 0
    for name in VOC_NAMES:
        class_predictions = sorted(
            predictions.get(name, []), key=lambda item: item[1], reverse=True
        )
        class_gt = ground_truth.get(name, {})
        gt_count = sum(len(boxes) for boxes in class_gt.values())
        aps: list[float] = []
        for threshold in thresholds:
            tp, fp = match_predictions(class_predictions, class_gt, float(threshold))
            cumulative_tp = np.cumsum(tp)
            cumulative_fp = np.cumsum(fp)
            recall = cumulative_tp / max(gt_count, 1)
            precision = cumulative_tp / np.maximum(cumulative_tp + cumulative_fp, 1e-9)
            aps.append(average_precision(recall, precision))

        report_predictions = [item for item in class_predictions if item[1] >= 0.25]
        tp, fp = match_predictions(report_predictions, class_gt, 0.5)
        micro_tp += int(tp.sum())
        micro_fp += int(fp.sum())
        micro_gt += gt_count
        per_class[name] = {
            "ap50": round(aps[0], 6),
            "map50_95": round(float(np.mean(aps)), 6),
            "ground_truth_objects": gt_count,
            "predictions": len(class_predictions),
        }

    return {
        "map50": round(float(np.mean([item["ap50"] for item in per_class.values()])), 6),
        "map50_95": round(
            float(np.mean([item["map50_95"] for item in per_class.values()])), 6
        ),
        "precision_at_025_iou50": round(micro_tp / max(micro_tp + micro_fp, 1), 6),
        "recall_at_025_iou50": round(micro_tp / max(micro_gt, 1), 6),
        "per_class": per_class,
    }


def main() -> None:
    args = parse_args()
    candidate_roots = [
        args.data_root,
        ROOT / "training" / "data" / "VOC",
        ROOT.parent / "datasets" / "VOC",
    ]
    voc_root = next(
        (
            path.resolve()
            for path in candidate_roots
            if path is not None and (path / "images" / "test2007").exists()
        ),
        None,
    )
    if voc_root is None:
        checked = ", ".join(str(path) for path in candidate_roots if path is not None)
        raise FileNotFoundError(f"VOC dataset not found. Checked: {checked}")

    data_dir = voc_root.parent
    runs_dir = (ROOT / "training" / "runs").resolve()
    settings.update({"datasets_dir": str(data_dir), "runs_dir": str(runs_dir)})
    images_dir = voc_root / "images" / "test2007"
    labels_dir = voc_root / "labels" / "test2007"
    images = sorted(images_dir.glob("*.jpg"))
    if args.limit > 0:
        images = images[: args.limit]
    if not images:
        raise FileNotFoundError(f"No VOC test images found in {images_dir}")

    ground_truth = load_ground_truth(images, labels_dir)
    model = YOLO(args.model)
    predictions: dict[str, list[tuple[str, float, np.ndarray]]] = defaultdict(list)
    inference_times: list[float] = []
    for start in range(0, len(images), args.batch):
        image_batch = images[start : start + args.batch]
        results = model.predict(
            source=[str(path) for path in image_batch],
            stream=False,
            imgsz=args.imgsz,
            conf=0.001,
            iou=0.7,
            max_det=300,
            device=args.device,
            verbose=False,
        )
        for image_path, result in zip(image_batch, results, strict=True):
            # Ultralytics renames list inputs to image0.jpg, image1.jpg, etc.; keep
            # the original VOC stem so predictions match held-out annotations.
            image_id = image_path.stem
            inference_times.append(float(result.speed.get("inference", 0.0)))
            for box, confidence, class_id in zip(
                result.boxes.xyxy.cpu().numpy(),
                result.boxes.conf.cpu().numpy(),
                result.boxes.cls.cpu().numpy(),
                strict=True,
            ):
                raw_name = str(result.names[int(class_id)]).lower()
                name = NAME_ALIASES.get(raw_name, raw_name)
                if name in VOC_NAMES:
                    predictions[name].append(
                        (image_id, float(confidence), box.astype(np.float32))
                    )

    metrics = evaluate(predictions, ground_truth)
    metrics.update(
        {
            "label": args.label,
            "model": args.model,
            "dataset": "Pascal VOC 2007 test",
            "images": len(images),
            "imgsz": args.imgsz,
            "confidence_floor": 0.001,
            "average_gpu_inference_ms": round(float(np.mean(inference_times)), 3),
        }
    )
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in metrics.items() if key != "per_class"}, indent=2))


if __name__ == "__main__":
    main()
