# TT25 original HCM forms

The three source DOCX files supplied under `D:/DYM IT/HCM` are exported read-only
using Microsoft Word. Their page structure and fixed clinical content are kept:

| HCM registration | PDF | Pages |
| --- | --- | --- |
| Vietnamese, company or other checkup | `tt25-hcm-vnm.pdf` | 9 |
| English, company or other checkup | `tt25-hcm-bilingual.pdf` | 13 |
| Work Permit, either language | `tt25-hcm-wp.pdf` | 12 |

Hanoi continues using the previous PDF and generator in `tt25PdfService.ts`.
`tt25HcmPdfService.ts` selects the template for individual and bulk printing.
The preview shows only the actual PDF; the old HTML recreation is not offered.

Only administrative data, supplied medical-history answers, applicant signature
name/date, payment/category placeholders and patient identifiers in footers are
filled. Missing history is left unanswered. Clinical results, diagnoses,
classifications, doctor names/signatures and fixed source content remain blank
or exactly as supplied. The source forms already check CS KBCB as the location.

To regenerate after an approved source update:

1. Export the three Word documents to `tmp/tt25-forms/vnm-source.pdf`,
   `bilingual-source.pdf`, and `wp-source.pdf`.
2. Run `python scripts/prepare_tt25_templates.py --input-dir tmp/tt25-forms`
   in an environment with pdfplumber and PyMuPDF. `--pymupdf-path` optionally
   points to an isolated PyMuPDF installation.
3. Review all filled pages, check long fields and checkbox positions, and run
   frontend tests, lint and build. Bump the asset version when replacing PDFs.

The generator removes placeholders and yellow highlighting, records field
coordinates in `tt25TemplateFields.json`, and preserves the source DOCX files.
At the user's request, administrative table borders use uniform continuous
gray 0.35pt lines at their original positions. Answer marks use vector ticks.
Viewing and downloading do not change print status; pressing Print does.
