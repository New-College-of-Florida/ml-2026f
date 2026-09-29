#!/usr/bin/env python3
"""Download and verify WikiText-2 from the PyTorch examples repository."""

from __future__ import annotations

import argparse
import hashlib
import shutil
import urllib.request
from pathlib import Path


PYTORCH_EXAMPLES_REVISION = "acc295dc7b90714f1bf47f06004fc19a7fe235c4"
BASE_URL = (
    "https://raw.githubusercontent.com/pytorch/examples/"
    f"{PYTORCH_EXAMPLES_REVISION}/word_language_model/data/wikitext-2"
)
FILES = {
    "train": "9e9fa1ad55b1c2c95b08e37dd8e653f638fac2c6de904b79e813611eefbc985f",
    "valid": "f0737ed31fc1329026e95cb8b98e19c2a182c39c240ab909dc31abf2f8af58e8",
    "test": "d790b833ef8cf03a90db7bf1271b7520b83c45ce07ba3c1a9699df81e239eca0",
}


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=Path("data/wikitext-2"))
    args = parser.parse_args()
    args.data_dir.mkdir(parents=True, exist_ok=True)

    for split, expected_sha256 in FILES.items():
        destination = args.data_dir / f"wiki.{split}.tokens"
        if not destination.exists() or file_sha256(destination) != expected_sha256:
            url = f"{BASE_URL}/{split}.txt"
            partial = destination.with_suffix(".part")
            print(f"Downloading {url}")
            with urllib.request.urlopen(url) as response, partial.open("wb") as target:
                shutil.copyfileobj(response, target)
            partial.replace(destination)

        actual_sha256 = file_sha256(destination)
        if actual_sha256 != expected_sha256:
            raise SystemExit(
                f"Checksum mismatch for {destination}: "
                f"expected {expected_sha256}, got {actual_sha256}"
            )
        print(f"{split:>5}: {destination} ({destination.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
