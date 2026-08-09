"""Fine-tune a browser-deployable YOLO26 detector on Pascal VOC."""

from __future__ import annotations

import argparse
import os
import random
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("YOLO_CONFIG_DIR", str(ROOT / "training" / "cache"))

from ultralytics import YOLO, settings  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="yolo26s.pt")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--device", default="0")
    parser.add_argument("--name", default="scenelens-yolo26s-voc")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--data-root", type=Path)
    parser.add_argument("--lr0", type=float, default=0.01)
    parser.add_argument("--warmup-epochs", type=float, default=3.0)
    parser.add_argument("--warmup-bias-lr", type=float, default=0.1)
    parser.add_argument("--patience", type=int, default=12)
    return parser.parse_args()


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


def create_development_split(voc_root: Path, cache_dir: Path) -> Path:
    development_images: list[Path] = []
    for split in ("train2012", "train2007", "val2012", "val2007"):
        development_images.extend(sorted((voc_root / "images" / split).glob("*.jpg")))
    if len(development_images) != 16_551:
        raise RuntimeError(
            f"Expected 16,551 VOC development images, found {len(development_images)}"
        )

    random.Random(42).shuffle(development_images)
    validation_count = round(len(development_images) * 0.1)
    validation_images = development_images[:validation_count]
    training_images = development_images[validation_count:]

    cache_dir.mkdir(parents=True, exist_ok=True)
    train_manifest = cache_dir / "voc-train.txt"
    val_manifest = cache_dir / "voc-val.txt"
    train_manifest.write_text(
        "\n".join(path.as_posix() for path in training_images) + "\n", encoding="utf-8"
    )
    val_manifest.write_text(
        "\n".join(path.as_posix() for path in validation_images) + "\n", encoding="utf-8"
    )
    dataset_yaml = cache_dir / "voc-development.yaml"
    dataset_yaml.write_text(
        yaml.safe_dump(
            {
                "path": voc_root.as_posix(),
                "train": train_manifest.as_posix(),
                "val": val_manifest.as_posix(),
                "names": {index: name for index, name in enumerate(VOC_NAMES)},
            },
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    print(
        f"Development split: {len(training_images)} train, "
        f"{len(validation_images)} validation, 4952 untouched test"
    )
    return dataset_yaml


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
    runs_dir.mkdir(parents=True, exist_ok=True)
    settings.update({"datasets_dir": str(data_dir), "runs_dir": str(runs_dir)})
    data_config = create_development_split(voc_root, ROOT / "training" / "cache")

    checkpoint = runs_dir / args.name / "weights" / "last.pt"
    model = YOLO(str(checkpoint) if args.resume and checkpoint.exists() else args.model)
    model.train(
        data=str(data_config),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        workers=4,
        project=str(runs_dir),
        name=args.name,
        exist_ok=True,
        pretrained=True,
        seed=42,
        deterministic=True,
        patience=args.patience,
        cache="disk",
        cos_lr=True,
        close_mosaic=10,
        amp=True,
        lr0=args.lr0,
        warmup_epochs=args.warmup_epochs,
        warmup_bias_lr=args.warmup_bias_lr,
        plots=True,
        save=True,
        save_period=5,
        verbose=True,
        resume=args.resume and checkpoint.exists(),
    )


if __name__ == "__main__":
    main()
