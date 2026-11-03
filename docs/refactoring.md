# Cleanup and refactoring 2026-11-03

Reviewed frontend imports, shared backend helpers, registration/printing flows,
Excel export in reception and roster, dependencies, scripts and project commands.
This pass preserves business behavior and does not change database migrations,
permissions, source Word/PDF templates, page routes or deployment configuration.

Changes:

- Removed the unused 586-line `TT25PrintTemplate.tsx` HTML recreation. All 109
  remaining frontend TS/TSX modules are reachable from the application entry
  through static imports, type imports or literal dynamic imports.
- Moved print date formatting into `lib/date.ts` and vector tick drawing into
  `pdfDrawing.ts`. TT25 no longer imports the entire consent generator for a date.
- Consolidated checkup reason values/translations in `tt25Constants.ts`.
- Replaced nested registration error and TT25 payment/template conditionals with
  named logic. Reused the access gate condition in the registration page.
- Extracted token-identical Excel ZIP, CRC, XML, column naming and formula
  protection helpers from both exporters into `lib/xlsx.ts`.
- Shared Bearer header parsing between QR access and staff management APIs.
- Removed unused direct dependencies: `@hookform/resolvers`, `react-hook-form`,
  and `zod`. Added root `npm test` and corrected QR navigation documentation.

Validation:

- 30 tests pass, including QR/auth, printing, medical history and Excel safety.
- ZIP hashes match both original exporters byte for byte for empty files,
  empty archives and multiple entries containing Vietnamese text/filenames.
- Rendered all 34 TT25 pages before and after refactoring; pixels match exactly.
- Frontend lint, TypeScript and production build pass.

The original Hanoi PDF generator and form preparation scripts remain because
they have distinct active responsibilities. Large roster components were not
split merely for line count. Supabase APIs were tested through the existing
mocked handler tests; live API deployment and manual clinic/printer testing
were not performed in this pass.
