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
