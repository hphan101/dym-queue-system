"""Prepare original Word-exported TT25 PDFs and field coordinates.

Run with --input-dir tmp/tt25-forms; requires pdfplumber and PyMuPDF.
Source Word files remain unchanged. Only highlighted placeholders are cleared.
"""
import argparse
import json
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--input-dir', type=Path, required=True)
parser.add_argument('--pymupdf-path')
parser.add_argument('--site', choices=['hcm', 'hn'], default='hcm')
args = parser.parse_args()
if args.pymupdf_path:
    sys.path.insert(0, args.pymupdf_path)
import pymupdf
import pdfplumber
from pdf_table_borders import restore_table_row_borders

root = Path(__file__).resolve().parents[1]
layouts = {}
HCM_ADMIN_FIELDS = {
    'tên khách': 'fullName', 'ngày sinh': 'birthDate', 'dân tộc': 'ethnicity',
    'nhóm máu': 'bloodGroup', 'mã định danh': 'cccd', 'số hộ chiếu': 'cccd',
    'số thẻ bhyt': 'insuranceNumber', 'địa chỉ': 'addressDetail', 'nghề nghiệp': 'occupation',
    'sđt': 'phoneNumber', 'email': 'email', 'lý do khám sức khỏe': 'checkupReason',
    'lý do ksk': 'checkupReason',
}
for name, count, history_pages, family_page, questions_page in [
    ('vnm', 9 if args.site == 'hn' else 8, [0, 1], 0, 1),
    ('bilingual', 13 if args.site == 'hn' else 12, [1, 2], 1, 2),
    ('wp', 11 if args.site == 'hn' else 12, [1, 2], 1, 3 if args.site == 'hn' else 2),
]:
    source = args.input_dir / f'{name}-source.pdf'
    doc = pymupdf.open(source)
    fields, checks, masks, highlights, squares = [], {}, [], [], []
    admin_table_bounds = None
    history_borders = []
    personal = [[], [], [], []]
    ward_index = 0

    def clear(page, box):
        doc[page].add_redact_annot(pymupdf.Rect(box), fill=(1, 1, 1))
        masks.append({'page': page, 'box': box})

    def field(page, key, x, y, width, size=11, font='regular', align='left'):
        assert width > 0, (name, key, width)
        fields.append({'page': page, 'field': key, 'x': round(x, 3), 'y': round(y, 3),
                       'width': round(width, 3), 'size': size, 'font': font, 'align': align})

    def mark(page, char):
        return {'page': page, 'x': round((char['x0'] + char['x1']) / 2, 3),
                'y': round(doc[page].rect.height - (char['top'] + char['bottom']) / 2, 3)}

    with pdfplumber.open(source) as pdf:
        assert len(pdf.pages) == count
        for index, page in enumerate(pdf.pages):
            highlighted_boxes = []
            detail_placeholders = []
            for rect in page.rects:
                if rect.get('non_stroking_color') in [(1, 1, 0), [1, 1, 0]]:
                    highlights.append((index, [rect['x0'], rect['top'], rect['x1'], rect['bottom']]))
                    clear(index, [rect['x0'] + .2, rect['top'], rect['x1'] - .2, rect['bottom']])
                    if args.site == 'hcm':
                        chars = [c for c in page.chars
                                 if rect['x0'] - .1 < (c['x0'] + c['x1']) / 2 < rect['x1'] + .1
                                 and rect['top'] < (c['top'] + c['bottom']) / 2 < rect['bottom']]
                        label = ''.join(c['text'] for c in chars).strip().lower()
                        if label == '☐':
                            highlighted_boxes.append(chars[0])
                            squares.append(mark(index, chars[0]))
                        elif label == 'nếu có':
                            detail_placeholders.append(chars[0])
                        elif index == 0 and (label in HCM_ADMIN_FIELDS or label == 'phường'):
                            key = HCM_ADMIN_FIELDS.get(label)
                            if label == 'phường':
                                key = 'homeWard' if ward_index == 0 else 'workplaceWard'
                                ward_index += 1
                            char = chars[0]
                            x = char['x0']
                            field(index, key, x, char['matrix'][5], 552 - x, char['size'],
                                  'bold' if key == 'fullName' else 'regular')
            matches = page.search(r'\[[^\]]+\]')
            for match in matches:
                text = ' '.join(match['text'].lower().split())
                if 'ngaythangnam' in text:
                    key = 'documentNumber'
                elif 'ngày sinh' in text:
                    key = 'birthDate'
                elif 'tên khách' in text:
                    key = 'fullName'
                elif 'dân tộc' in text:
                    key = 'ethnicity'
                elif 'nhóm máu' in text:
                    key = 'bloodGroup'
                elif 'cccd' in text:
                    key = 'cccd'
                elif 'bhyt' in text:
                    key = 'insuranceNumber'
                elif 'địa chỉ' in text:
                    key = 'addressDetail'
                elif 'phường/xã' in text:
                    key = 'homeWard' if ward_index == 0 else 'workplaceWard'
                    ward_index += 1
                elif 'nghề nghiệp' in text:
                    key = 'occupation'
                elif 'nơi làm việc' in text:
                    key = 'workplace'
                elif 'điện thoại' in text:
                    key = 'phoneNumber'
                elif 'email' in text:
                    key = 'email'
                elif 'lý do' in text:
                    key = 'checkupReason'
                elif 'ngày khám' in text:
                    key = 'checkupDate'
                elif 'mã khách' in text:
                    key = 'targetGroup'
                elif 'nguồn khách' in text:
                    key = 'paymentSource'
                else:
                    if args.site == 'hn' and ('thông tin khách' in text):
                        clear(index, [match['x0'], match['top'], match['x1'], match['bottom']])
                        continue
                    raise ValueError(f'Unmapped placeholder: {text}')
                if key == 'documentNumber':
                    baseline = match['chars'][0]['matrix'][5]
                    right_edge = 565 if baseline < 50 else 300
                    suffix = [c for c in page.chars if abs(c['matrix'][5] - baseline) < 1
                              and c['x0'] >= match['x1'] - .5 and c['x1'] <= right_edge]
                    if 'DYM' not in ''.join(c['text'] for c in suffix):
                        continuation = next(m for m in page.search(r'DYM') if m['x0'] < 100
                                            and match['top'] + 8 < m['top'] < match['top'] + 24)
                        suffix.extend(continuation['chars'])
                    assert 'GKSK' in ''.join(c['text'] for c in suffix)
                    chars = match['chars'] + suffix
                else:
                    chars = match['chars']
                lines = []
                for char in chars:
                    group = next((g for g in lines if abs(g[0]['top'] - char['top']) < 2), None)
                    if group is None:
                        lines.append([char])
                    else:
                        group.append(char)
                for line in lines:
                    clear(index, [min(c['x0'] for c in line) + .2, min(c['top'] for c in line) - .2,
                                  max(c['x1'] for c in line) - .2, max(c['bottom'] for c in line) + .2])
                first = match['chars'][0] if key == 'documentNumber' else lines[-1][0]
                end = max(c['x1'] for c in lines[-1])
                next_chars = [c['x0'] for c in page.chars if c['text'].strip()
                              and abs(c['matrix'][5] - first['matrix'][5]) < 1 and c['x0'] >= end + 1]
                right = min([565] + [x - 2 for x in next_chars])
                # Fill the identifier and suffix together to avoid a fixed gap.
                if key == 'documentNumber':
                    right = 565 if first['matrix'][5] < 50 else 300
                signature = 'viết hoa' in text
                font_name = first['fontname']
                font = 'boldItalic' if 'BoldItalic' in font_name else 'bold' if 'Bold' in font_name else 'italic' if 'Italic' in font_name else 'regular'
                field(index, key, (first['x0'] + end) / 2 if signature else first['x0'], first['matrix'][5],
                      210 if signature else right - first['x0'], round(first['size'], 3), font, 'center' if signature else 'left')

            boxes = highlighted_boxes if args.site == 'hcm' else [c for c in page.chars if c['text'] in ['\u2610', '\uf0a8']]
            if index == 0:
                admin = page.find_tables()[0]
                if args.site == 'hcm':
                    admin_table_bounds = admin.bbox
                gender = sorted((c for c in boxes if admin.bbox[1] < c['top'] < admin.bbox[3]), key=lambda c: (round(c['top'], 1), c['x0']))
                assert len(gender) == (5 if args.site == 'hcm' and name != 'wp' else 2)
                checks['gender'] = {g: mark(index, c) for g, c in zip(['Nam', 'Nữ'], gender[:2])}
                if len(gender) == 5:
                    checks['pregnancyStatus'] = {key: mark(index, c) for key, c in
                                                 zip(['not_pregnant', 'suspected', 'pregnant'], gender[2:])}
                # Bilingual source forms intentionally contain blank fields.
                if args.site == 'hn':
                    rows = [r for r in admin.rows if r.bbox[3] - r.bbox[1] > 10]
                    keys = ['fullName', None, 'birthDate', 'ethnicity', 'bloodGroup', 'cccd',
                            'insuranceNumber', 'addressDetail', 'occupation', 'workplace', 'phoneNumber', 'checkupReason']
                    if name == 'wp':
                        keys = ['fullName', None, 'birthDate', 'cccd', None, 'ethnicity',
                                'targetGroup', 'paymentSource', 'bloodGroup', 'addressDetail', 'occupation', 'workplace', 'checkupReason']
                    assert len(rows) == len(keys), (name, len(rows))
                    for row, key in zip(rows, keys):
                        if key is None:
                            continue
                        chars = [c for c in page.chars if row.bbox[1] < c['top'] < row.bbox[3] and c['x0'] > 48]
                        baseline = max(c['matrix'][5] for c in chars)
                        if name != 'vnm' and key in ['fullName', 'cccd', 'checkupReason', 'ethnicity', 'bloodGroup', 'insuranceNumber', 'birthDate']:
                            # Use the English label line; the bilingual ID row also has a foreigner-ID line below it.
                            anchor = next((m for m in page.search(r'Passport No\.:') if row.bbox[1] < m['top'] < row.bbox[3]), None) if key == 'cccd' else None
                            baseline = anchor['chars'][0]['matrix'][5] if anchor else min(c['matrix'][5] for c in chars)
                        line = [c for c in chars if abs(c['matrix'][5] - baseline) < 1]
                        x = max(c['x1'] for c in line) + 5
                        field(index, key, x, baseline, 562 - x, 11, 'bold' if key == 'fullName' else 'regular')
                        if key in ['addressDetail', 'workplace', 'phoneNumber']:
                            lower = min(c['matrix'][5] for c in chars)
                            subline = [c for c in chars if abs(c['matrix'][5] - lower) < 1]
                            x = max(c['x1'] for c in subline) + 5
                            field(index, {'addressDetail': 'homeWard', 'workplace': 'workplaceWard', 'phoneNumber': 'email'}[key], x, lower, 562 - x)
                else:
                    workplace = next(line for line in page.extract_text_lines() if line['text'].startswith('10. Nơi làm việc'))
                    field(index, 'workplace', workplace['x1'] + 5, workplace['chars'][0]['matrix'][5], 547 - workplace['x1'])
                    if name == 'wp':
                        ward = next(line for line in page.extract_text_lines()
                                    if line['top'] > workplace['top'] and line['text'].startswith('Xã/Phường'))
                        field(index, 'workplaceWard', ward['x1'] + 5, ward['chars'][0]['matrix'][5], 547 - ward['x1'])

            if index in history_pages:
                if args.site == 'hcm':
                    heading = page.search('STT Tên bệnh, tật Có Không', regex=False)[0]
                    table = next(t for t in page.find_tables() if t.bbox[1] < heading['top'] < t.bbox[3])
                    table_bounds = pymupdf.Rect(table.bbox) + (-1, -1, 1, 1)
                    # Redraw the source grid above the white backgrounds around the checkboxes.
                    for rect in page.rects:
                        if not rect['fill'] or rect.get('non_stroking_color') != 0 or min(rect['width'], rect['height']) > .5:
                            continue
                        border = pymupdf.Rect(rect['x0'], rect['top'], rect['x1'], rect['bottom'])
                        if table_bounds.contains(border):
                            history_borders.append((index, border))
                else:
                    table = next(t for t in page.find_tables() if len(t.rows[0].cells) >= 8)
                table_boxes = [c for c in boxes if table.bbox[1] < c['top'] < table.bbox[3] and c['x0'] > 180]
                xs = sorted(set(round(c['x0'], 1) for c in table_boxes))
                assert len(xs) == 4, (name, index, xs)
                for col, x in enumerate(xs):
                    personal[col].extend(mark(index, c) for c in table_boxes if abs(c['x0'] - x) < .1)
            if index == family_page:
                pair = [c for c in boxes if c['x0'] < 40]
                assert len(pair) == 2
                checks['familyHistory'] = {'no': mark(index, pair[0]), 'yes': mark(index, pair[1])}
                yes = pair[1]
                line = [c for c in page.chars if abs(c['matrix'][5] - yes['matrix'][5]) < 1]
                x = max(c['x1'] for c in line) + 5
                if args.site == 'hn':
                    label = r'Có, ghi cụ thể tên bệnh:' if name == 'vnm' else r'please specify the disease:'
                    x = page.search(label)[0]['x1'] + 5
                else:
                    detail = detail_placeholders[0]
                    x = detail['x0']
                    yes = detail
                field(index, 'familyDetails', x, yes['matrix'][5], 562 - x, 10)
            if args.site == 'hn' and name == 'wp' and index in [2, 3]:
                pair = [c for c in boxes if 40 < c['x0'] < 60]
                assert len(pair) == 2, (name, index, len(pair))
                key = 'currentTreatment' if index == 2 else 'pregnancyHistory'
                checks[key] = {'no': mark(index, pair[0]), 'yes': mark(index, pair[1])}
                anchor = page.search(r'medications you are taking and their dosages:')[0]
                dots = [c for c in page.chars if c['text'] in '.…' and anchor['bottom'] < c['top'] < anchor['bottom'] + 25]
                assert dots
                y = dots[0]['matrix'][5]
                clear(index, [min(c['x0'] for c in dots), min(c['top'] for c in dots), max(c['x1'] for c in dots), max(c['bottom'] for c in dots)])
                field(index, 'medications' if index == 2 else 'pregnancyDetails', 45, y, 510, 9)
            elif index == questions_page:
                pair = [c for c in boxes if 40 < c['x0'] < 60]
                assert len(pair) == 4, (name, len(pair))
                checks['currentTreatment'] = {'no': mark(index, pair[0]), 'yes': mark(index, pair[1])}
                checks['pregnancyHistory'] = {'no': mark(index, pair[2]), 'yes': mark(index, pair[3])}
                for key, yes in [('medications', pair[1]), ('pregnancyDetails', pair[3])]:
                    if args.site == 'hcm':
                        detail = next(c for c in detail_placeholders if c['top'] >= yes['top'] - 2)
                        x = detail['x0']
                        field(index, key, x, detail['matrix'][5], 562 - x, 9)
                        continue
                    anchors = page.search(r'liều lượng:' if name == 'vnm' else r'taking and their dosages:')
                    anchor = next(m for m in anchors if m['top'] >= yes['top'] - 2)
                    y = anchor['chars'][0]['matrix'][5]
                    x = anchor['x1'] + 5
                    dots = [c for c in page.chars if c['text'] in '.…' and c['x0'] > x
                            and abs(c['matrix'][5] - y) < 1]
                    if dots:
                        clear(index, [min(c['x0'] for c in dots), min(c['top'] for c in dots),
                                      max(c['x1'] for c in dots), max(c['bottom'] for c in dots)])
                    field(index, key, x, y, 562 - x, 9)

        assert all(len(col) == 11 for col in personal), (name, [len(c) for c in personal])
        checks['personalHistory'] = {str(i + 1): {'yes': personal[0][i], 'no': personal[1][i]} for i in range(11)}
        checks['personalHistory'].update({str(i + 12): {'yes': personal[2][i], 'no': personal[3][i]} for i in range(11)})
        # Other disease detail belongs only in the history section, never diagnosis.
        other = personal[2][-1]
        page = pdf.pages[other['page']]
        if args.site == 'hcm':
            table = next(t for t in page.find_tables() if t.bbox[1] < page.height - other['y'] < t.bbox[3])
        else:
            table = next(t for t in page.find_tables() if len(t.rows[0].cells) == 8)
        label_chars = [c for c in page.chars if 350 < c['x0'] < other['x'] - 10
                       and table.bbox[3] - 55 < c['top'] < table.bbox[3]
                       and c['top'] >= page.height - other['y'] - 8]
        last_y = min(c['matrix'][5] for c in label_chars)
        x = max(c['x1'] for c in label_chars if abs(c['matrix'][5] - last_y) < 1) + 4
        field(other['page'], 'personalOtherDetails', x, last_y, other['x'] - x - 8, 9)

        # Treat the adjacent footer placeholders as one fill-in line so a full
        # patient name stays readable without colliding with the birth date.
        for index, page in enumerate(pdf.pages):
            footer = [f for f in fields if f['page'] == index and f['field'] in ['fullName', 'birthDate'] and f['y'] < 50]
            if not footer:
                continue
            assert len(footer) == 2
            x = min(f['x'] for f in footer)
            y = footer[0]['y']
            chars = [c for c in page.chars if c['x0'] >= x and c['x1'] < 300 and abs(c['matrix'][5] - y) < 1]
            clear(index, [x, min(c['top'] for c in chars) - .2, max(c['x1'] for c in chars), max(c['bottom'] for c in chars) + .2])
            fields = [f for f in fields if f not in footer]
            field(index, 'footerIdentity', x, y, 275, 10, 'italic')

    for page in doc:
        page.apply_redactions(images=0, graphics=0)
    for index, box in highlights:
        doc[index].draw_rect(pymupdf.Rect(box), color=None, fill=(1, 1, 1))
        masks.append({'page': index, 'box': box})
    for index, border in history_borders:
        doc[index].draw_rect(border, color=None, fill=(0, 0, 0))
    if admin_table_bounds:
        with pdfplumber.open(source) as pdf:
            restore_table_row_borders(pdf.pages[0], doc[0], admin_table_bounds)
    for square in squares:
        page = doc[square['page']]
        x, y = square['x'], page.rect.height - square['y']
        page.draw_rect(pymupdf.Rect(x - 4, y - 4, x + 4, y + 4), color=(0, 0, 0), width=.7)
    filename = f'tt25-{args.site}-{name}.pdf'
    if args.site == 'hn' and name in ('vnm', 'bilingual'):
        doc.delete_page(len(doc) - 1)
        fields = [field for field in fields if field['page'] < len(doc)]
        masks = [mask for mask in masks if mask['page'] < len(doc)]
    elif len(doc) % 2:
        size = doc[-1].rect
        doc.new_page(width=size.width, height=size.height)
    count = len(doc)
    doc.save(root / 'frontend/public/templates' / filename, garbage=4, deflate=True)
    doc.close()
    layouts[name] = {'template': filename, 'pageCount': count, 'fields': fields, 'checks': checks}
    (args.input_dir / f'{name}-masks.json').write_text(json.dumps(masks), encoding='utf-8')
    print(f'{name}: {len(fields)} fields, 22 personal history check pairs, {count} pages')

metadata_path = root / 'frontend/src/features/registration/printing/tt25TemplateFields.json'
if args.site == 'hn':
    layouts = {**json.loads(metadata_path.read_text(encoding='utf-8')), **{f'hn_{name}': layout for name, layout in layouts.items()}}
elif metadata_path.exists():
    layouts = {**{key: value for key, value in json.loads(metadata_path.read_text(encoding='utf-8')).items() if key.startswith('hn_')}, **layouts}
metadata_path.write_text(
    json.dumps(layouts, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
