"""Losslessly split a browser model into small static hosting assets."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output-prefix", type=Path, required=True)
    parser.add_argument("--chunk-size", type=int, default=8_000_000)
    args = parser.parse_args()

    model = args.model.read_bytes()
    parts: list[dict[str, str | int]] = []
    for index, offset in enumerate(range(0, len(model), args.chunk_size), start=1):
        data = model[offset : offset + args.chunk_size]
        output = Path(f"{args.output_prefix}-{index:02d}")
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(data)
        parts.append(
            {
                "file": output.name,
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        )

    manifest = Path(f"{args.output_prefix}.manifest.json")
    manifest.write_text(
        json.dumps(
            {
                "source": args.model.name,
                "bytes": len(model),
                "sha256": hashlib.sha256(model).hexdigest(),
                "parts": parts,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Split {len(model)} bytes into {len(parts)} parts; wrote {manifest}")


if __name__ == "__main__":
    main()
