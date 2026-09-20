"""Read-only PDF inspection/rendering. Does not create or modify PDF files."""
import hashlib
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

import pypdfium2 as pdfium
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'output/pdf/ui-experience-native'
QA = ROOT / 'evidence/ui-experience/native-pdf'
POPPLER = '/Users/johnsammon/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftoppm'
baseline = json.loads((ROOT / 'evidence/ui-experience/preservation-baseline.json').read_text())
fixtures = {kind: next(r for r in baseline['rows'] if r['display_name'] == f'B15 {kind} fictional day') for kind in ('ordinary', 'long', 'empty')}

fixtures['sparse'] = next(r for r in baseline['rows'] if r['id'] == 'b468aace-fd07-408b-a8f1-197e7eb9b00d')
fixtures['oversized'] = next(r for r in json.loads((ROOT / 'evidence/ui-experience/inspection-fixtures.json').read_text()) if 'oversized' in r['display_name'])

def normalize(s):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKC', s).lower())

provenance = json.loads((QA / 'export-provenance.json').read_text())

def inspect(path):
    origin = provenance[path.name]
    if origin['sha256']:
        assert hashlib.sha256(path.read_bytes()).hexdigest() == origin['sha256'], 'Recorded PDF changed without export provenance update'
    fixture, kind = path.stem.split('-')
    source = fixtures[fixture]
    rows, meta = [r for r in source['document']['rows'] if not r.get('sunLocked')], source['document']['meta']
    reader = PdfReader(path)
    text = '\n\f\n'.join(page.extract_text() or '' for page in reader.pages)
    (QA / (path.stem + '.txt')).write_text(text)
    expected = [source['display_name']]
    if kind == 'schedule':
        expected += [f'END-{label}-{i}' for i in range(1, len(rows) + 1) for label in ('DESC', 'SUB', 'NOTE')]
        expected += ['Action', 'Location', 'Description', 'Notes', 'Time In', 'Duration', 'Time Out', 'Sunrise', 'Sunset']
    elif kind == 'contacts':
        expected += [row.get(key, '') for row in rows for key in ('desc','locName','contactName','contactTitle','contactPhone','contactEmail')]
        if not rows: expected += ['No contacts on this schedule.']
    else:
        expected += list(meta.get('callsheet', {}).values())
        expected += ['General Call', 'Day schedule']
        expected += [row.get('locName','') or row.get('loc','') for row in rows]
        if fixture == 'sparse': expected += ['Date not set', '11:45 PM']
        if fixture in ('ordinary','long'): expected += ['Arrival', 'Production notes', 'Contacts', 'Sunrise', 'Sunset']
    if kind == 'callsheet':
        expected += [row.get(key,'') for row in rows for key in ('contactName', 'contactTitle', 'contactPhone', 'contactEmail')]
    if kind != 'contacts':
        expected += [meta.get(key,'') for key in ('projectName', 'phase', 'prod', 'dir', 'dp', 'town')]
    expected = [line for s in expected if s for line in s.splitlines() if normalize(line)]
    normalized = re.sub(r'[^a-z0-9]', ' ', unicodedata.normalize('NFKC', text).lower())
    flow = text
    if fixture == 'oversized':
        identity = [rows[0].get(k,'') for k in ('contactName','contactTitle','contactEmail')]
        flow = '\n'.join(line for page in reader.pages for line in (page.extract_text() or '').splitlines()[2:] if not any(normalize(v) in normalize(line) for v in identity if v))
    flow_normalized = re.sub(r'[^a-z0-9]', ' ', unicodedata.normalize('NFKC', flow).lower())
    def present(marker):
        letters = normalize(marker)
        pattern = r'\s*'.join(re.escape(c) for c in letters)
        if letters[-1].isdigit():
            pattern += r'(?![0-9])'
        return re.search(pattern, normalized) is not None or re.search(pattern, flow_normalized) is not None
    missing = [marker for marker in expected if not present(marker)]
    page_texts = [page.extract_text() or '' for page in reader.pages]
    furniture = None if kind == 'schedule' else all(normalize(source['display_name']) in normalize(t) and normalize(f'Page {i+1} of {len(reader.pages)}') in normalize(t) for i,t in enumerate(page_texts))
    if furniture is False: missing.append('Running identity/page counters on every page')
    folder = QA / path.stem
    folder.mkdir(exist_ok=True)
    for old in folder.glob('*.png'): old.unlink()
    subprocess.run([POPPLER, '-r', '90', '-png', str(path), str(folder / 'poppler')], check=True, capture_output=True)
    pdf = pdfium.PdfDocument(str(path))
    rendered = []
    for i in range(len(pdf)):
        page = pdf[i]
        image = page.render(scale=1.6).to_pil()
        target = folder / f'page-{i+1:02}.png'
        image.save(target)
        rendered.append(str(target))
    return {
        'file': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'bytes': path.stat().st_size, 'metadata': dict(reader.metadata),
        'applicationCommit': origin['applicationCommit'], 'build': origin['build'], 'previewPort': 3526,
        'fixtureId': source['id'], 'fixtureName': source['display_name'], 'savedVersion': origin['savedVersion'], 'sourceRows': len(rows),
        'printedDraft': 'Saved fixture plus automatic sunrise/sunset rows; draft not saved',
        'printSettings': {'destination': 'Save as PDF', 'paper': 'Letter', 'pages': 'All', 'pagesPerSheet': 1, 'margins': 'Default', 'scale': 'Default', 'headersFooters': False, 'backgroundGraphics': False, 'includeContacts': kind == 'callsheet'},
        'runningFurnitureEveryPage': furniture, 'pages': len(reader.pages), 'pageSizes': [[float(p.mediabox.width), float(p.mediabox.height)] for p in reader.pages],
        'checkedMarkers': len(expected), 'expectedMarkers': expected, 'missingMarkers': missing,
        'pdfiumPages': rendered, 'visualInspection': origin['visualInspection'],
    }

files = sorted(OUT.glob('*.pdf'))
assert len(files) == 9
previous = {Path(r['file']).name:r for r in json.loads((QA/'manifest.json').read_text())}
results = [inspect(path) if len(sys.argv) == 1 or path.name in sys.argv[1:] else previous[path.name] for path in files]
(QA / 'manifest.json').write_text(json.dumps(results, indent=2) + '\n')
for r in results:
    print(json.dumps({k: r[k] for k in ('file', 'pages', 'checkedMarkers', 'missingMarkers')}))
assert all(not r['missingMarkers'] for r in results), 'Missing expected content markers'
