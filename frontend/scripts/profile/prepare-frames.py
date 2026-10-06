"""Prepare the recorded CardCraft frames without changing their RGBA pixels.

Run from the repository root. Pillow is an offline asset tool, not a build dependency.
Use --source-dir to reuse the extracted original PNG directory.
"""

import argparse
import hashlib
import json
import tempfile
import urllib.request
from pathlib import Path

from PIL import Image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path)
    args = parser.parse_args()
    frontend = Path(__file__).resolve().parents[2]
    manifest_path = frontend / 'brand/profile-frames.json'
    manifest = json.loads(manifest_path.read_text())
    output = frontend / 'static/profile/frames'
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.frames-', dir=output.parent) as temporary:
        staged = Path(temporary)
        for asset in manifest['assets']:
            filename = asset['id'] + '.png'
            if args.source_dir:
                data = (args.source_dir / filename).read_bytes()
            else:
                with urllib.request.urlopen(asset['sourceUrl'], timeout=30) as response:
                    data = response.read()
            if hashlib.sha256(data).hexdigest() != asset['sourceSha256']:
                raise ValueError(f'Source changed: {filename}. Review the manifest before replacing it.')
            original = staged / filename
            original.write_bytes(data)
            image = Image.open(original).convert('RGBA')
            if image.size != (asset['width'], asset['height']):
                raise ValueError(f'Unexpected dimensions: {filename}')
            target = staged / (asset['id'] + '.webp')
            image.save(target, 'WEBP', lossless=True, method=6, exact=True)
            if Image.open(target).convert('RGBA').tobytes() != image.tobytes():
                raise ValueError(f'RGBA pixels changed: {filename}')
            asset['sha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
        for target in staged.glob('*.webp'):
            target.replace(output / target.name)
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print(f"Prepared {len(manifest['assets'])} lossless frames; RGBA pixels verified.")


if __name__ == '__main__':
    main()
