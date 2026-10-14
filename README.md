# DYM Queue System

Hệ thống đăng ký số thứ tự, điều phối tại lễ tân và màn hình gọi số cho ba chi nhánh DYM.

## Kiến trúc

- `frontend/`: React 19, Vite, TypeScript, Tailwind CSS và Astryx.
- `supabase/functions/register/`: API công khai tiếp nhận đăng ký.
- `supabase/functions/manage-staff/`: API quản trị tài khoản nhân viên.
- `supabase/migrations/`: schema PostgreSQL, RLS, RPC và lịch sử thay đổi database.
- Supabase Auth: đăng nhập nhân viên.
- Supabase Realtime: đồng bộ danh sách và màn hình gọi số.
- Vercel: hosting frontend và security headers.

Google Apps Script và Google Sheet không còn nằm trong luồng chạy hiện tại.

## Chạy local

Yêu cầu Node.js 20 trở lên.

```bash
npm install
npm --prefix frontend install
npm run dev
```

Frontend chạy mặc định tại `http://localhost:5173`.

Tạo `frontend/.env` với các biến:

```dotenv
VITE_REGISTRATION_API_URL=https://<project-ref>.supabase.co/functions/v1/register
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

Publishable key được phép xuất hiện ở frontend. Không đặt service-role key, database password hoặc secret HMAC trong bất kỳ biến `VITE_*` nào.

## Đường dẫn

- Đăng ký: `/?branch=q1`, `/?branch=q7`, `/?branch=hn`
- Đăng nhập: `/login`
- Quản trị: `/admin`
- Danh sách đăng ký: `/registrations`
- Quản lý nhân viên: `/staff` (chỉ quản trị viên)
- Màn hình chờ: `/display?branch=q1`

Mã chi nhánh:

- `q1`: DYM mPlaza Quận 1
- `q7`: DYM The Grace Quận 7
- `hn`: DYM Epic Tower Cầu Giấy

## Lệnh kiểm tra và deploy

```bash
npm run lint
npm run build
npm run db:lint
npm run db:push
npm run deploy:register
npm run deploy:staff
```

Frontend được deploy từ thư mục `frontend/`. Edge Function và migration được deploy độc lập bằng Supabase CLI.

## Quy tắc dữ liệu và bảo mật

- Dữ liệu đăng ký được kiểm tra ở cả frontend, Edge Function và PostgreSQL.
- Trình duyệt không lưu CCCD, SĐT, ngày sinh hoặc địa chỉ trong `localStorage`.
- API đăng ký dùng honeypot, cooldown SĐT + CCCD và giới hạn theo IP đã băm; không dùng CAPTCHA.
- IP gốc không được lưu. Bộ đếm IP băm hết hạn sau 30 ngày.
- RLS giới hạn nhân viên theo trạng thái tài khoản và chi nhánh được cấp quyền.
- Vai trò công khai chỉ đọc metadata chi nhánh và trạng thái số đang gọi; không đọc hồ sơ đăng ký.
- Frontend chỉ dùng Supabase publishable key. Service-role key chỉ tồn tại trong Edge Function secrets.
- CSP, HSTS, chống iframe, `nosniff`, referrer policy và permissions policy được cấu hình trong `frontend/vercel.json`.
- Đăng ký tài khoản nhân viên công khai bị tắt. Tài khoản được tạo và cấp chi nhánh bởi quản trị viên.
- API nhân viên xác thực lại access token, kiểm tra vai trò quản trị ở server và không đưa service-role key ra trình duyệt.
- Quản trị viên không thể tự khóa hoặc tự hạ quyền chính mình; thao tác tạo, sửa và khóa tài khoản được ghi audit log.

## Cấu trúc nguồn

```text
.
├─ frontend/
│  ├─ public/
│  └─ src/
│     ├─ assets/
│     ├─ config/
│     ├─ features/
│     │  ├─ admin/
│     │  ├─ auth/
│     │  ├─ display/
│     │  └─ registration/
│     ├─ lib/
│     ├─ styles/
│     ├─ types/
│     ├─ App.tsx
│     └─ main.tsx
└─ supabase/
   ├─ functions/
   │  ├─ _shared/
   │  └─ register/
   └─ migrations/
```

Không chỉnh sửa migration đã chạy. Mọi thay đổi database mới phải được thêm bằng một migration mới.
