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


## Sắp xếp theo chức năng — 2026-11-15

- Gom quản trị thành `shell`, `shared`, `accounts`, `reception`, `registrations`
  và giữ các module điều phối hiện có trong `roster`.
- Chia đăng ký khách thành `access`, `flow`, `form`, `printing`. Cập nhật cả
  worker, lazy import, JSON metadata và script chuẩn bị mẫu.
- Tách API tài khoản khỏi page, form nhân sự khỏi danh sách và bộ phân giải URL
  khỏi component ứng dụng. Tách kiểu tài khoản và hồ sơ khách về đúng chức năng.
- Gom banner có nút đóng vào `FeedbackBanner`. Các handler, nội dung, phân quyền,
  kiểm tra trùng và hành vi lưu giữ nguyên.
- Cập nhật test để theo cấu trúc mới, thêm test cho API tài khoản và route;
  không để các file re-export trung gian ở vị trí cũ.

Xem `docs/architecture.md` để tìm nơi sửa và quy tắc mở rộng. Đợt này không sửa
migration, mẫu Word/PDF gốc, URL công khai hay cấu hình triển khai.


Kiểm tra sau sắp xếp:

- 152/152 test đạt, gồm các trường hợp in hỗn hợp, mẫu HN/HCM, phân quyền,
  QR, trạng thái in, API tài khoản và route cũ.
- Lint không có cảnh báo; TypeScript và production build đạt.
- Kiểm tra trình duyệt với dữ liệu giả: entry đăng nhập/đăng ký, chuyển hướng
  khi thiếu phiên, form nhân sự, khóa form khi đang lưu, mobile và đóng banner.
- Chưa triển khai website/API hoặc thực hiện migration trên Supabase thật.
