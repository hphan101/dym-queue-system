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
- Cloudflare Pages: hosting frontend, tự build từ GitHub; cấu hình trên dashboard Pages.

Google Apps Script và Google Sheet không còn nằm trong luồng chạy hiện tại.

Hướng dẫn triển khai Cloudflare Pages: [docs/cloudflare-pages.md](docs/cloudflare-pages.md).

### Cấu trúc frontend

Các trang quản trị dùng chung `features/admin/components/AdminLayout.tsx` cho
sidebar, theme và vùng nội dung. `RosterShell` bổ sung tiêu đề và trạng thái riêng
của điều phối. Các module điều phối nằm trong `frontend/src/features/admin/roster/`:

```text
roster/
  clinic/       Lịch tuần, lịch ngày và phòng khám
  onsite/       Đoàn khám, lịch đoàn, set-up và vị trí mẫu
  dashboard/    Tổng quan vận hành và biểu đồ
  personnel/    Danh mục nhân sự và hồ sơ đính kèm
  settlement/   Quyết toán chi phí
  shared/       Khung trang, phân công, kéo thả, dự phòng và xuất Excel
  data/         Context, service Supabase và các kiểu dữ liệu
  index.ts      Điểm nhập cho ứng dụng quản trị
```

Đặt thành phần chỉ dùng bởi một trang vào thư mục chức năng của trang đó;
chuyển sang `shared/` khi có nhiều chức năng cùng sử dụng. Các kiểu dữ liệu nằm
trong `data/types.ts`; `rosterService.ts` giữ API truy cập dữ liệu và tiếp tục
export các kiểu để tương thích với những nơi đang dùng.

Bộ kiểm thử nằm trong `frontend/tests/`. Helper `tests/helpers/roster-modules.cjs`
định vị module và chuẩn hóa tên dependency giả lập khi thay đổi cấu trúc thư mục;
TypeScript và Vite kiểm tra các đường dẫn import thực tế khi build.

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
- Màn hình QR tại quầy: `/registration-qr?branch=q1` (yêu cầu nhân viên đăng nhập)

## QR đăng ký tại phòng khám

Nhân viên mở mục **QR đăng ký tại quầy** trong thanh điều hướng. Mục này mở trong
tab mới, dùng phiên lễ tân/admin đang đăng nhập và chi nhánh đang chọn, không yêu
cầu đăng nhập lại. Tài khoản chỉ thấy các chi nhánh được cấp quyền; tài khoản có
một chi nhánh được chọn tự động. Thiết bị chưa có phiên nhân viên vẫn cần đăng nhập.
Nút **Tiếp nhận** quay lại màn hình quản trị. Có thể dùng nút
toàn màn hình cho tablet/TV. Nút **Khóa** đăng xuất phiên nhân viên trên thiết bị.

QR tự đổi mỗi 60 giây và có hiệu lực tối đa 90 giây. Khách quét hợp lệ được
20 phút điền form; QR thay đổi không làm hết hạn phiên đang điền. Tải lại trang
trong cùng tab khôi phục phiên, không lưu hồ sơ khách vào bộ nhớ trình duyệt.
Mỗi phiên chỉ cấp một số; gửi lại cùng nội dung sau lỗi mạng trả lại số đã cấp.
Màn hình `/display` công khai không hiển thị hoặc cấp QR mới.

Đường dẫn đăng ký cũ `/?branch=q1` vẫn mở được, nhưng phải quét QR hợp lệ tại quầy
để bắt đầu. API cũng kiểm tra phiên; sửa URL hoặc gọi API trực tiếp không bỏ qua
được bước QR. Ảnh được chia sẻ và mở ngay trong thời gian mã còn hạn vẫn có thể
dùng được: tính năng hạn chế chia sẻ, không xác minh vị trí tuyệt đối.

### Đưa tính năng QR lên môi trường thật

Phối hợp triển khai backend và frontend trong cùng đợt vì API mới bắt buộc phiên QR:

1. `npm run db:push` — áp dụng migration phiên đăng ký mới.
2. `npm run deploy:registration-access` — deploy API cấp QR/phiên.
3. `npm run deploy:register` — deploy API đăng ký bắt buộc phiên.
4. Build/deploy frontend từ `frontend/`, rồi kiểm tra quét QR tại từng chi nhánh.

API QR dùng secret server `REGISTRATION_FINGERPRINT_SECRET` và `ALLOWED_ORIGINS`
đã dùng cho API đăng ký. Không thêm secret vào biến `VITE_*`.
Phiên chỉ lưu hash token trong database; khách không thể đọc bảng phiên.
Chi tiết phạm vi và kiểm tra: [docs/registration-qr.md](docs/registration-qr.md).

Mã chi nhánh:

- `q1`: DYM mPlaza Quận 1
- `q7`: DYM The Grace Quận 7
- `hn`: DYM Epic Tower Cầu Giấy

## Lệnh kiểm tra và deploy

```bash
npm run lint
npm test
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
