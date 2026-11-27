# Cloudflare Pages

Frontend React/Vite được build từ `frontend/`, xuất ra `frontend/dist/`.
Database, Auth, Storage, Realtime và Edge Functions tiếp tục chạy trên Supabase.

## Triển khai tự động từ GitHub

Project Pages kết nối repository hphan101/dym-queue-system, nhánh production main.
Mỗi lần push main, Cloudflare tự build và deploy.

Thiết lập trong Pages → Settings → Builds & deployments:

- Root directory: frontend
- Framework preset: React (Vite)
- Build command: npm run build
- Build output directory: dist
- Production URL: https://dym-queue-system.pages.dev

Không thêm wrangler.toml vào dự án Pages này. Nếu có file Wrangler, Cloudflare
có thể lấy file đó làm nguồn cấu hình thay dashboard và bỏ qua các biến Vite
đã nhập, làm bản build dừng với lỗi cấu hình Supabase khi mở trang.

## Biến môi trường build

Khi chạy local, Vite đọc `frontend/.env`. Khi build trên Cloudflare, khai báo
ba biến sau trong Pages → Settings → Variables and Secrets cho Production
và Preview (nếu dùng). Không commit file `.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_REGISTRATION_API_URL`

Chỉ dùng publishable key ở frontend. Không đặt service-role key, access token
triển khai hoặc secret HMAC vào biến `VITE_*`.

## Kết nối địa chỉ mới với Supabase

Sau khi biết chính xác URL production:

1. Đặt secret `PUBLIC_APP_ORIGIN` của Supabase bằng origin HTTPS chính xác của
   website mới, rồi deploy các Edge Functions dùng `_shared/http.ts`.
   Giá trị này bổ sung origin của frontend; giữ nguyên `ALLOWED_ORIGINS` đang dùng.
   Không mở toàn bộ `*.pages.dev` cho mọi project.
2. Thêm URL mới vào Auth Redirect URLs và cập nhật Site URL khi chuyển chính thức.
3. Nếu đổi project Supabase, cập nhật cả biến Vite lẫn `connect-src` trong
   `frontend/public/_headers` trước khi build lại.
4. Kiểm tra đăng nhập, mở QR đúng chi nhánh, đăng ký và xem/in PDF trên URL mới.

Pages tự phục vụ `index.html` cho đường dẫn SPA không khớp file khi không có
`404.html` ở gốc. Các header bảo mật được lấy từ `public/_headers` và được Vite
chép vào `dist/_headers`.

Tài liệu: https://developers.cloudflare.com/pages/get-started/git-integration/

## Diễn tập chuyển dữ liệu vào Worker local

Chạy các lệnh dưới đây từ thư mục `experiments/cloudflare-queue`. File cấu
hình local cần có hai binding `DB` và `PERSONNEL_FILES`. Thay các tên trong
ví dụ bằng file cấu hình, tên D1 và đường dẫn của bản diễn tập.

```powershell
node rehearse-snapshot.mjs --source-query
npm exec -- wrangler d1 execute dym-local --local --config dym-local.jsonc --persist-to .wrangler/rehearsal --file schema.sql
node rehearse-snapshot.mjs dym-local.jsonc .wrangler/rehearsal snapshot.json source-objects
```

Lệnh đầu in một truy vấn PostgreSQL để lấy cùng thời điểm dữ liệu tiếp nhận,
tài khoản, lịch và metadata của tệp. Khi tạo bộ dữ liệu diễn tập, dùng dữ liệu
mẫu và đặt tệp theo `object_path` trong thư mục nguồn. Nếu Wrangler được cài
qua npm exec, có thể đặt `DYM_WRANGLER_PACKAGE` thành đường dẫn tới
`wrangler/package.json` để Node tìm được thư viện.

Trước khi nhập, đặt `DYM_MIGRATION_ADMIN_LOGIN` và
`DYM_MIGRATION_ADMIN_PASSWORD` cho quản trị viên đã có quyền quản lý nhân viên
ở tất cả chi nhánh hoạt động. Các tài khoản còn lại cần được cấp mật khẩu mới.
Lệnh nhập kiểm tra tệp đã sao chép lên R2 trước khi ghi dữ liệu vào D1. Dùng
cùng thư mục trạng thái với Wrangler dev để mở giao diện trên bộ dữ liệu đã nhập.

## Bản dựng Pages dùng backend Cloudflare

`npm run build -- --mode cloudflare-pages` thêm một Pages Function vào
`dist/`. Pages tiếp tục phục vụ giao diện, phông chữ và mẫu PDF. Function
chuyển tiếp API và WebSocket qua service binding `QUEUE_BACKEND`. Vì trình
duyệt dùng cùng địa chỉ cho giao diện và API, link QR, đường dẫn TV và cookie
đăng nhập cùng dùng địa chỉ Pages.

Bản dựng này cần một Worker backend riêng có D1, R2 và Durable Object.
Worker đặt `DYM_APP_ORIGIN` bằng địa chỉ HTTPS của Pages và cấu hình
`REGISTRATION_FINGERPRINT_SECRET` bằng secret của môi trường đó. Trong bản
diễn tập có nhập phiên QR từ hệ thống cũ, giá trị secret phải khớp nguồn thì
yêu cầu gửi lại mới nhận được số cũ. Pages cấu hình `QUEUE_BACKEND` trỏ tới
Worker cùng môi trường. Worker phục vụ qua binding có thể tắt
`workers_dev` và `preview_urls`.

Bản dựng mặc định `npm run build` tiếp tục dùng cấu hình Supabase ở đầu tài
liệu. Chế độ `cloudflare-pages` được kiểm thử riêng trước khi đổi cấu hình
triển khai của dự án chính.
