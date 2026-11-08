# Cloudflare Pages

Frontend React/Vite được build từ `frontend/`, xuất ra `frontend/dist/`.
Database, Auth, Storage, Realtime và Edge Functions tiếp tục chạy trên Supabase.

## Triển khai từ máy phát triển

```powershell
cd frontend
npx --yes wrangler@4.158.0 login
npx --yes wrangler@4.158.0 pages project create dym-queue-system --production-branch main
npm run deploy:pages
```

Chỉ tải thư mục `dist`; không tải mã nguồn hay file `.env` lên Pages.
Wrangler dùng cấu hình trong `frontend/wrangler.toml`. Tên project và địa chỉ
`pages.dev` thực tế cần lấy từ kết quả tạo project nếu tên đã được sử dụng.

Đây là project Direct Upload. Cloudflare không cho đổi trực tiếp project này
sang Git integration; nếu muốn tự build từ Git thì tạo project Pages tích hợp
Git riêng. Direct Upload vẫn có thể triển khai qua Wrangler trong CI sau này.

## Biến môi trường build

Vite đọc cấu hình local từ `frontend/.env`:

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

Tài liệu: https://developers.cloudflare.com/pages/get-started/direct-upload/
