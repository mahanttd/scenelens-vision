"""Download and convert the public Pascal VOC dataset for SceneLens training."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("YOLO_CONFIG_DIR", str(ROOT / "training" / "cache"))

import ultralytics  # noqa: E402
from ultralytics import settings  # noqa: E402
from ultralytics.data.utils import check_det_dataset  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data-root", type=Path, default=ROOT.parent / "datasets" / "VOC"
    )
    args = parser.parse_args()
    voc_root = args.data_root.resolve()
    data_dir = voc_root.parent
    runs_dir = (ROOT / "training" / "runs").resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    runs_dir.mkdir(parents=True, exist_ok=True)
    settings.update({"datasets_dir": str(data_dir), "runs_dir": str(runs_dir)})

    source_yaml = Path(ultralytics.__file__).parent / "cfg" / "datasets" / "VOC.yaml"
    dataset_config = yaml.safe_load(source_yaml.read_text(encoding="utf-8"))
    dataset_config["path"] = voc_root.as_posix()
    generated_yaml = ROOT / "training" / "cache" / "voc-download.yaml"
    generated_yaml.parent.mkdir(parents=True, exist_ok=True)
    generated_yaml.write_text(
        yaml.safe_dump(dataset_config, sort_keys=False), encoding="utf-8"
    )
    dataset = check_det_dataset(str(generated_yaml), autodownload=True)
    print(f"VOC dataset ready at {dataset['path']}")


if __name__ == "__main__":
    main()
