"""Read-only PDF inspection/rendering. Does not create or modify PDF files."""
import hashlib
import json
import re
import subprocess
import unicodedata
from pathlib import Path

import pypdfium2 as pdfium
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'output/pdf/pre-review-native'
QA = ROOT / 'evidence/pre-review/native-pdf'
POPPLER = '/Users/johnsammon/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftoppm'
baseline = json.loads((ROOT / 'evidence/pre-review/baseline.json').read_text())
fixtures = {kind: next(r for r in baseline['retainedReviewSchedules'] if r['display_name'] == f'B15 {kind} fictional day') for kind in ('ordinary', 'long')}

def normalize(s):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKC', s).lower())

def inspect(path):
    fixture, kind = path.stem.split('-')
    source = fixtures[fixture]
    rows, meta = source['document']['rows'], source['document']['meta']
    reader = PdfReader(path)
    text = '\n\f\n'.join(page.extract_text() or '' for page in reader.pages)
    (QA / (path.stem + '.txt')).write_text(text)
    expected = []
    if kind == 'schedule':
        expected += [f'END-{label}-{i}' for i in range(1, len(rows) + 1) for label in ('DESC', 'SUB', 'NOTE')]
        expected += ['Action', 'Location', 'Description', 'Notes', 'Time In', 'Duration', 'Time Out', 'Sunrise', 'Sunset']
    elif kind == 'contacts':
        expected += [f'END-DESC-{i}' for i in range(1, len(rows) + 1)]
    else:
        expected += list(meta['callsheet'].values())
        expected += ['END-CALL-NOTES', 'General Call', 'Schedule', 'Key Information', 'Contacts']
        expected += [row['locName'] for row in rows]
    if kind in ('contacts', 'callsheet'):
        expected += [row[key] for row in rows for key in ('contactName', 'contactEmail')]
    if kind != 'contacts':
        expected += [meta[key] for key in ('projectName', 'phase', 'prod', 'dir', 'dp', 'town')]
    normalized = re.sub(r'[^a-z0-9]', ' ', unicodedata.normalize('NFKC', text).lower())
    def present(marker):
        letters = normalize(marker)
        pattern = r'\s*'.join(re.escape(c) for c in letters)
        if letters[-1].isdigit():
            pattern += r'(?![0-9])'
        return re.search(pattern, normalized) is not None
    missing = [marker for marker in expected if not present(marker)]
    folder = QA / path.stem
    folder.mkdir(exist_ok=True)
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
        'applicationCommit': '8965ba8', 'build': 'R2Sn1Vtshobzqmgm-abnr', 'previewPort': 3524,
        'fixtureId': source['id'], 'fixtureName': source['display_name'], 'savedVersion': source['document_version'], 'sourceRows': len(rows),
        'printedDraft': 'Saved fixture plus automatic sunrise/sunset rows; draft not saved',
        'printSettings': {'destination': 'Save as PDF', 'paper': 'Letter', 'pages': 'All', 'pagesPerSheet': 1, 'margins': 'Default', 'scale': 'Default', 'headersFooters': False, 'backgroundGraphics': False, 'includeContacts': kind == 'callsheet'},
        'pages': len(reader.pages), 'pageSizes': [[float(p.mediabox.width), float(p.mediabox.height)] for p in reader.pages],
        'checkedMarkers': len(expected), 'expectedMarkers': expected, 'missingMarkers': missing,
        'pdfiumPages': rendered, 'visualInspection': 'pending',
    }

files = sorted(OUT.glob('*.pdf'))
assert len(files) == 6
results = [inspect(path) for path in files]
(QA / 'manifest.json').write_text(json.dumps(results, indent=2) + '\n')
for r in results:
    print(json.dumps({k: r[k] for k in ('file', 'pages', 'checkedMarkers', 'missingMarkers')}))
assert all(not r['missingMarkers'] for r in results), 'Missing expected content markers'
