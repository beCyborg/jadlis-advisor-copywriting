#!/usr/bin/env python3
"""check-generated.py — fail when this generated council repo was edited outside the generator.

Recomputes the content hash over every tracked file except SHARED_FROM.txt and compares it with
the `content-sha256` line written by `tools/split-councils.py` in the source repo.
"""
import hashlib, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXCLUDE_FILES = {"SHARED_FROM.txt", ".gitignore"}
EXCLUDE_DIRS = {".git", ".github", "__pycache__"}


def content_hash(root: Path) -> str:
    h = hashlib.sha256()
    for p in sorted(root.rglob("*")):
        if not p.is_file() or set(p.relative_to(root).parts[:-1]) & EXCLUDE_DIRS or p.name in EXCLUDE_FILES:
            continue
        h.update(str(p.relative_to(root)).encode()); h.update(b"\0"); h.update(p.read_bytes()); h.update(b"\0")
    return h.hexdigest()


def main() -> int:
    shared = (ROOT / "SHARED_FROM.txt").read_text(encoding="utf-8")
    want = next((l.split()[1] for l in shared.splitlines() if l.startswith("content-sha256 ")), None)
    if not want:
        print("SHARED_FROM.txt has no content-sha256 line"); return 1
    got = content_hash(ROOT)
    if got != want:
        print(f"generated content drifted: expected {want[:12]}…, got {got[:12]}… — edit the source repo and re-run tools/split-councils.py")
        return 1
    print("generated content matches SHARED_FROM.txt"); return 0


if __name__ == "__main__":
    sys.exit(main())
