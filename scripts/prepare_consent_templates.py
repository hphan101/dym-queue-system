"""Build print assets from the 19.11.2026 consent/refusal revision exported by Word."""

import argparse
import json
import sys
from pathlib import Path

import pdfplumber
from pdf_table_borders import restore_table_row_borders


PLACEHOLDERS = {
    'tên khách': 'fullName',
    'giới tính': 'gender',
    'ngày sinh': 'birthDate',
    'mã định danh': 'identityDocument',
    'danh': 'identityDocument',  # Continuation of the wrapped bilingual placeholder.
    'sđt': 'phoneNumber',
    'email': 'email',
    'công ty': 'workplace',
    'ngày khám': 'checkupDate',
}

CHECKBOX_LABELS = {
    'Nam': 'male', 'Nữ': 'female',
    'Không mang thai': 'not_pregnant',
    'Nghi ngờ mang thai': 'suspected',
    'Đang mang thai': 'pregnant',
    'Đồng ý khám': 'exam_agree', 'Không đồng ý khám': 'exam_decline',
    'Đồng ý nhận': 'ads_agree', 'Không đồng ý thông tin': 'ads_decline',
}


def prepare(label, folder, output, pymupdf, consent_pages, refusal_pages):
    source = folder / f'{label}-source.pdf'
    fields, marks = [], {}
    with pdfplumber.open(source) as pdf, pymupdf.open(source) as document:
        assert len(pdf.pages) == len(consent_pages) + len(refusal_pages), f'Unexpected page count: {label}'
        for index, page in enumerate(pdf.pages):
            target = document[index]
            squares = []
            phone = None
            email_label = None
            workplace_label = None
            for rect in page.rects:
                if tuple(rect.get('non_stroking_color') or ()) != (1, 1, 0):
                    continue
                left, top, right, bottom = (rect[k] for k in ('x0', 'top', 'x1', 'bottom'))
                chars = [c for c in page.chars if left - .5 < (c['x0'] + c['x1']) / 2 < right + .5
                         and top < (c['top'] + c['bottom']) / 2 < bottom]
                text = ''.join(c['text'] for c in chars).strip().lower()
                target.add_redact_annot(pymupdf.Rect(left, top, right, bottom), fill=(1, 1, 1))
                if text == '\uf0a8':
                    center = (left + 5, page.height - chars[0]['top'] - 5)
                    squares.append(center)
                    baseline = chars[0]['matrix'][5]
                    following = ''.join(c['text'] for c in page.chars
                                        if abs(c['matrix'][5] - baseline) < 1 and c['x0'] >= right - .1).lstrip()
                    key = next(key for prefix, key in CHECKBOX_LABELS.items() if following.startswith(prefix))
                    assert key not in marks, (label, key)
                    marks[key] = {'page': index, 'x': round(center[0], 3), 'y': round(center[1], 3)}
                    continue
                if text == 'mã định':  # Draw the complete ID on the next line.
                    continue
                field = PLACEHOLDERS[text]
                first = chars[0]
                same_line = [c for c in page.chars if c['text'].strip()
                             and abs(c['matrix'][5] - first['matrix'][5]) < 1 and c['x0'] >= right - .1]
                limit = min([550] + [c['x0'] - 2 for c in same_line])
                if field == 'phoneNumber':
                    phone = (left, right)
                    limit = left + 68
                elif field == 'email' and phone:
                    # Move the printed email label to make room for a full phone number.
                    target.add_redact_annot(pymupdf.Rect(phone[1], top, right, bottom), fill=(1, 1, 1))
                    email_label = (phone[0] + 72, page.height - first['matrix'][5])
                    left, limit = phone[0] + 115, 550
                elif field == 'workplace' and label == 'bilingual':
                    english = page.search('/ Workplace, place of study (if any):', regex=False)[0]
                    target.add_redact_annot(pymupdf.Rect(english['x0'] - .2, top, right, bottom), fill=(1, 1, 1))
                    size = 8.5
                    workplace_label = ((english['x0'], page.height - first['matrix'][5]), english['text'], size)
                    left = english['x0'] + pymupdf.get_text_length(english['text'], fontname='heit', fontsize=size) + 4
                centered = index == refusal_pages[-1] and field == 'fullName' and top > 300
                fields.append({
                    'page': index, 'field': field,
                    'x': round((left + right) / 2 if centered else left, 3),
                    'y': round(first['matrix'][5], 3),
                    'width': 220 if centered else round(limit - left, 3),
                    'size': round(first['size'], 3),
                    'font': 'bold' if 'Bold' in first['fontname'] else 'regular',
                    'align': 'center' if centered else 'left',
                })
            target.apply_redactions(images=0, graphics=0)
            if index == consent_pages[0]:
                restore_table_row_borders(page, target, page.find_tables()[0].bbox)
            if email_label:
                target.insert_text(email_label, '; Email:', fontsize=11)
            if workplace_label:
                point, label_text, size = workplace_label
                target.insert_text(point, label_text, fontname='heit', fontsize=size, color=(0, .44, .75))
            for x, y in squares:
                cy = page.height - y
                target.draw_rect(pymupdf.Rect(x - 4, cy - 4, x + 4, cy + 4), color=(0, 0, 0), width=.8)
        assert len(fields) == (14 if label == 'bilingual' else 13) and len(marks) == len(CHECKBOX_LABELS), (label, len(fields), len(marks))
        assert all(field['width'] > 0 for field in fields)
        filename = f'dong-thuan-{label}.pdf'
        document.save(output / filename, garbage=4, deflate=True)
    return {'template': filename, 'pageCount': len(consent_pages) + len(refusal_pages),
            'consentPages': consent_pages, 'refusalPages': refusal_pages, 'fields': fields,
            'genderMarks': {'Nam': marks['male'], 'Nữ': marks['female']},
            'pregnancyMarks': {key: marks[key] for key in ('not_pregnant', 'suspected', 'pregnant')},
            'consentMarks': {'examination': {'agree': marks['exam_agree'], 'decline': marks['exam_decline']},
                             'advertising': {'agree': marks['ads_agree'], 'decline': marks['ads_decline']}}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input-dir', type=Path, required=True)
    parser.add_argument('--pymupdf-path')
    args = parser.parse_args()
    if args.pymupdf_path:
        sys.path.insert(0, args.pymupdf_path)
    import pymupdf

    frontend = Path(__file__).resolve().parents[1] / 'frontend'
    output = frontend / 'public/templates'
    layouts = {
        'vi': prepare('vnm', args.input_dir, output, pymupdf, [0], [1]),
        'bilingual': prepare('bilingual', args.input_dir, output, pymupdf, [0, 1], [2, 3]),
    }
    (frontend / 'src/features/registration/printing/consentTemplateFields.json').write_text(
        json.dumps(layouts, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
