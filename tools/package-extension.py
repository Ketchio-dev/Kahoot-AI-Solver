#!/usr/bin/env python3
"""Create a versioned, extension-only ZIP without overwriting past releases."""
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
FILES = (
    "manifest.json", "background.js", "models.js", "content.js", "popup.html",
    "popup.js", "styles.css", "icon16.png", "icon48.png", "icon128.png",
)


def package():
    manifest = json.loads((ROOT / "manifest.json").read_text())
    version = manifest["version"]
    parts = version.split(".")
    if not 1 <= len(parts) <= 4 or any(
        not part.isascii() or not part.isdecimal() or
        (len(part) > 1 and part.startswith("0")) or int(part) > 65535
        for part in parts
    ) or not any(int(part) for part in parts):
        raise ValueError("Invalid Chrome extension version")
    if manifest.get("manifest_version") != 3:
        raise ValueError("Expected a Manifest V3 extension")
    if not 1 <= len(manifest.get("description", "")) <= 132:
        raise ValueError("Manifest description must be 1–132 characters")
    content = {name: (ROOT / name).read_bytes() for name in FILES}
    output = ROOT / "store-assets" / f"kahoot-ai-solver-{version}.zip"
    output.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(output, "x", zipfile.ZIP_DEFLATED) as archive:
        for name, data in content.items():
            archive.writestr(name, data)
    with zipfile.ZipFile(output) as archive:
        if archive.testzip() is not None or tuple(archive.namelist()) != FILES:
            raise ValueError("ZIP contents failed verification")
        for name, data in content.items():
            if archive.read(name) != data:
                raise ValueError(f"Packaged bytes differ: {name}")
        if json.loads(archive.read("manifest.json"))["version"] != version:
            raise ValueError("Packaged version differs")
    print(f"Created and verified {output.relative_to(ROOT)} ({output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    package()
