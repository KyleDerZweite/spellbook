"""Build the versioned public Demo Catalog from a local Scryfall default JSONL export."""
import argparse
import ast
import gzip
import hashlib
import json
import math
from pathlib import Path
import sys
import uuid

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'worker/src'))
from worker.transform import transform_card


def build(source, output, version):
    # Read the native version without importing the PostgreSQL publisher/dependencies.
    catalog = ROOT / 'worker/src/worker/catalog.py'
    version_node = next(node.value for node in ast.parse(catalog.read_text()).body
                        if isinstance(node, ast.Assign)
                        and any(isinstance(t, ast.Name) and t.id == 'SCHEMA_VERSION' for t in node.targets))
    transform_version = ast.literal_eval(version_node)
    source_hash, payload_hash = hashlib.sha256(), hashlib.sha256()
    counts = {'raw': 0, 'english': 0, 'documents': 0}
    ids, oracles = set(), set()
    size = 0
    with source.open('rb') as stream, output.open('wb') as target, gzip.GzipFile(
            filename='', mode='wb', fileobj=target, mtime=0, compresslevel=9) as compressed:
        for line in stream:
            source_hash.update(line)
            if not line.strip():
                continue
            raw = json.loads(line)
            counts['raw'] += 1
            if raw.get('lang') != 'en':
                continue
            counts['english'] += 1
            doc = transform_card(raw)
            if doc is None:
                continue
            doc['id'] = str(uuid.UUID(doc['id']))
            doc['oracle_id'] = str(uuid.UUID(doc['oracle_id']))
            if isinstance(doc['cmc'], bool) or not isinstance(doc['cmc'], (int, float)) or not math.isfinite(doc['cmc']):
                raise ValueError('Invalid mana value')
            if doc['id'] in ids:
                raise ValueError('Duplicate printing')
            ids.add(doc['id'])
            oracles.add(doc['oracle_id'])
            counts['documents'] += 1
            # Match worker.catalog._printing_row, including localized face search fields.
            search_name = ' '.join((doc['name'], doc['printed_name'])).strip().lower()
            search_text = [search_name, doc['type_line'], doc['oracle_text'], doc['set_name']]
            for face in [raw, *(raw.get('card_faces') or [])]:
                search_text.extend(face.get(field) or '' for field in ('printed_text', 'printed_type_line'))
            record = {'document': doc, 'search_name': search_name, 'search_text': ' '.join(search_text),
                      'raw_oracle_id': str(uuid.UUID(raw['oracle_id'])),
                      'types': doc['card_types'] if isinstance(raw.get('type_line'), str) and raw['type_line'] else None}
            encoded = (json.dumps(record, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode()
            size += len(encoded)
            payload_hash.update(encoded)
            compressed.write(encoded)
    legacy = json.loads((ROOT / 'frontend/scripts/demo/cards.json').read_text())
    if any(card['id'] not in ids for card in legacy):
        raise ValueError('Bundle does not contain every starter printing')
    digest = payload_hash.hexdigest()
    manifest = {
        'formatVersion': 1, 'bundleVersion': version, 'file': output.name,
        'generationId': str(uuid.uuid5(uuid.NAMESPACE_URL, f'spellbook-demo-catalog:1:{transform_version}:' + digest)),
        'sourceType': 'demo-bundle', 'providerUpdatedAt': None,
        'sourceFile': source.name, 'sourceBytes': source.stat().st_size,
        'sourceSHA256': source_hash.hexdigest(),
        'sourceTimeCaveat': 'Export filename time is not a verified upstream source_updated_at.',
        'selection': 'lang=en, then native worker.transform.transform_card exclusions',
        'catalogTransformVersion': transform_version,
        'transformSHA256': hashlib.sha256((ROOT / 'worker/src/worker/transform.py').read_bytes()).hexdigest(),
        'counts': counts, 'canonicalCount': len(oracles), 'starterPrintingCount': len(legacy),
        'jsonlBytes': size, 'jsonlSHA256': digest, 'gzipBytes': output.stat().st_size,
        'gzipSHA256': hashlib.sha256(output.read_bytes()).hexdigest()
    }
    output.with_suffix('').with_suffix('.manifest.json').write_text(json.dumps(manifest, indent='\t') + '\n')
    print(json.dumps(manifest, indent='\t'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--version', required=True, help='Explicit ISO UTC bundle version timestamp, not provider freshness')
    args = parser.parse_args()
    build(args.source, args.output, args.version)
