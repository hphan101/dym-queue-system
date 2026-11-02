# Consent print templates

The source forms are `DYM.PRO.09.FOR.02.02 - VNM.docx` and
`DYM.PRO.09.FOR.02.02 - Song ngữ.docx`. Export them as PDF using Microsoft Word
to preserve their original layout. Vietnamese has two pages (consent, refusal);
bilingual has four pages (two consent, two refusal).

Registration language selects the template: `vi` uses VNM, `en` uses bilingual.
Historical records without a saved language default to Vietnamese. Identity
document type does not determine the form language.

`consentPdfService.ts` fills the original PDF with `pdf-lib` and embedded Arial
fonts. It replaces only the highlighted placeholders and signature date slots.
Text shrinks to fit its field when necessary; fixed content does not reflow.
The registration queue number is added at the top right of the first consent
and refusal pages, with a Vietnamese or bilingual label and a 28pt bold number.
The same service supplies individual previews and bulk printing.

To regenerate template assets after an approved source form change:

1. Export the source DOCX files read-only in Word to
   `tmp/consent-forms/vnm-source.pdf` and `bilingual-source.pdf`.
2. Install `pdfplumber` and `PyMuPDF` in a Python environment.
3. Run `python scripts/prepare_consent_templates.py --input-dir tmp/consent-forms`.
   `--pymupdf-path` optionally points to an isolated PyMuPDF installation.
4. Review all pages of filled PDFs, then run frontend tests and build.

The generator produces the two PDF assets under `frontend/public/templates`
and their field coordinates in `consentTemplateFields.json`. The source DOCX
files are never modified. Viewing or downloading does not mark the form printed;
the app's Print button does.
