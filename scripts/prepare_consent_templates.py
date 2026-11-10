"""Prepare fill-in PDFs exported by Microsoft Word without rebuilding their layout.

Requires pdfplumber and PyMuPDF. Original DOCX files are opened read-only in Word
and exported to <input-dir>/vnm-source.pdf and bilingual-source.pdf first.
"""
import argparse
import json
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--input-dir', type=Path, required=True)
parser.add_argument('--pymupdf-path')
args = parser.parse_args()
if args.pymupdf_path:
    sys.path.insert(0, args.pymupdf_path)
import pymupdf
import pdfplumber

root = Path(__file__).resolve().parents[1]
result = {}
for language, label, page_count, consent_pages, refusal_pages in [
    ('vi', 'vnm', 2, [0], [1]),
    ('bilingual', 'bilingual', 4, [0, 1], [2, 3]),
]:
    source = args.input_dir / f'{label}-source.pdf'
    document = pymupdf.open(source)
    fields, masks, gender_marks, borders = [], [], {}, []
    placeholder_count = 0
    with pdfplumber.open(source) as pdf:
        assert len(pdf.pages) == page_count, f'Unexpected page count: {label}'
        for index, page in enumerate(pdf.pages):
            # Restore original table rules after blanking placeholders: Word's
            # highlight rectangles can touch the thin dotted row separators.
            if index == 0:
                borders = [line for line in page.lines if abs(line['top'] - line['bottom']) < .01
                           and line['x1'] - line['x0'] > 400 and line['top'] < 310]
            # Word highlighting extends above the glyph bounds. Clear the entire
            # highlighted placeholder so no yellow edge survives the replacement.
            for rect in page.rects:
                if tuple(rect.get('non_stroking_color') or ()) == (1, 1, 0):
                    box = [rect['x0'], rect['top'], rect['x1'], rect['bottom']]
                    document[index].add_redact_annot(pymupdf.Rect(box), fill=(1, 1, 1))
                    masks.append({'page': index, 'box': box})
            matches = page.search(r'\[[^\]]+\]')
            for match in matches:
                placeholder_count += 1
                text = ' '.join(match['text'].lower().split())
                field = ('fullName' if 'tên khách' in text else
                         'birthDate' if 'ngày sinh' in text else
                         'identityDocument' if 'cccd' in text or 'hộ chiếu' in text else
                         'phoneNumber' if 'điện thoại' in text else
                         'email' if 'email' in text else
                         'workplace' if 'nơi làm việc' in text else
                         'checkupDate' if 'ngày khám' in text else None)
                assert field, f'Unmapped placeholder: {text}'
                lines = []
                for char in match['chars']:
                    line = next((group for group in lines if abs(group[0]['top'] - char['top']) < 2), None)
                    if line is None:
                        lines.append([char])
                    else:
                        line.append(char)
                for line in lines:
                    box = [min(c['x0'] for c in line) - .15, min(c['top'] for c in line) - .4,
                           max(c['x1'] for c in line) + .15, max(c['bottom'] for c in line) + .4]
                    document[index].add_redact_annot(pymupdf.Rect(box), fill=(1, 1, 1))
                    masks.append({'page': index, 'box': box})
                # Wrapped placeholders are filled on their continuation line, never over a label.
                line = lines[-1]
                first = line[0]
                end = max(c['x1'] for c in line)
                next_text = [c['x0'] for c in page.chars if c['text'].strip()
                             and abs(c['top'] - first['top']) < 2 and c['x0'] > end + 2]
                right = min([544] + [x - 7 for x in next_text])
                signature = 'viết hoa' in text
                font_name = first['fontname']
                font = 'boldItalic' if 'BoldItalic' in font_name else 'bold' if 'Bold' in font_name else 'italic' if 'Italic' in font_name else 'regular'
                fields.append({'page': index, 'field': field,
                               'x': round((min(c['x0'] for c in line) + end) / 2 if signature else first['x0'], 3),
                               'y': round(first['matrix'][5], 3),
                               'width': 225 if signature else round(right - first['x0'], 3),
                               'size': 12 if label == 'vnm' and index == 0 and field == 'identityDocument' else round(first['size'], 3), 'font': font,
                               'align': 'center' if signature else 'left'})

            if index == 0:
                boxes = [c for c in page.chars if 'Wingdings' in c['fontname'] and c['text'] == '\uf0a8' and c['top'] < 220]
                assert len(boxes) == 2
                gender_marks = {gender: {'x': round((c['x0'] + c['x1']) / 2, 3),
                                         'y': round(page.height - (c['top'] + c['bottom']) / 2, 3)}
                                for gender, c in zip(['Nam', 'Nữ'], boxes)}

            if index == refusal_pages[-1]:
                band = (703, 718) if label == 'vnm' else (323, 350)
                dots = [c for c in page.chars if c['text'] in '.…' and band[0] < c['top'] < band[1] and c['x0'] > 400]
                groups = []
                for c in dots:
                    if not groups or abs(c['top'] - groups[-1][0]['top']) > 2 or c['x0'] - groups[-1][-1]['x1'] > 4:
                        groups.append([c])
                    else:
                        groups[-1].append(c)
                assert len(groups) == 3, f'Expected date slots: {label}'
                if label == 'vnm':
                    # Fill the signature date as one string so original slashes
                    # cannot leave uneven gaps between day, month and year.
                    date_chars = [c for c in page.chars if c['text'] in '.…/'
                                  and abs(c['matrix'][5] - groups[0][0]['matrix'][5]) < 1
                                  and c['x0'] >= groups[0][0]['x0']]
                    box = [min(c['x0'] for c in date_chars) - .1, min(c['top'] for c in date_chars) - .3,
                           max(c['x1'] for c in date_chars) + .1, max(c['bottom'] for c in date_chars) + .3]
                    document[index].add_redact_annot(pymupdf.Rect(box), fill=(1, 1, 1))
                    masks.append({'page': index, 'box': box})
                    fields.append({'page': index, 'field': 'checkupDate', 'x': round(groups[0][0]['x0'], 3),
                                   'y': round(groups[0][0]['matrix'][5], 3), 'width': round(box[2] - box[0], 3),
                                   'size': 11.04, 'font': 'italic', 'align': 'left'})
                    continue
                for name, group in zip(['checkupDay', 'checkupMonth', 'checkupYear'], groups):
                    box = [group[0]['x0'] - .1, min(c['top'] for c in group) - .3,
                           max(c['x1'] for c in group) + .1, max(c['bottom'] for c in group) + .3]
                    document[index].add_redact_annot(pymupdf.Rect(box), fill=(1, 1, 1))
                    masks.append({'page': index, 'box': box})
                    fields.append({'page': index, 'field': name, 'x': round(group[0]['x0'], 3),
                                   'y': round(group[0]['matrix'][5], 3), 'width': round(box[2] - box[0], 3),
                                   'size': round(group[0]['size'], 3), 'font': 'italic', 'align': 'left'})
    assert placeholder_count == 13, f'Unexpected placeholders: {label}'
    for page in document:
        page.apply_redactions(images=0, graphics=0)
    for line in borders:
        dash = line.get('dash')
        dashes = f"[{' '.join(str(n) for n in dash[0])}] {dash[1]}" if dash and dash[0] else None
        document[0].draw_line(pymupdf.Point(line['x0'], line['top']),
                              pymupdf.Point(line['x1'], line['bottom']),
                              color=(0, 0, 0), width=line['linewidth'], dashes=dashes)
    filename = f'dong-thuan-{label}.pdf'
    document.save(root / 'frontend/public/templates' / filename, garbage=4, deflate=True)
    document.close()
    result[language] = {'template': filename, 'pageCount': page_count,
                        'consentPages': consent_pages, 'refusalPages': refusal_pages,
                        'fields': fields, 'genderMarks': gender_marks}
    (args.input_dir / f'{label}-masks.json').write_text(json.dumps(masks), encoding='utf-8')

(root / 'frontend/src/features/registration/consentTemplateFields.json').write_text(
    json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Prepared original consent PDFs and fill-in coordinates.')
