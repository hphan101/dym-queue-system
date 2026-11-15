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

Mã nguồn được gom theo chức năng. Xem [bản đồ codebase và quy tắc mở rộng](docs/architecture.md)
để tìm đúng nơi sửa giao diện, API, phân quyền và in biểu mẫu.

```text
frontend/src/
  app/                         Khởi tạo ứng dụng và phân giải URL
  components/ui/               Component shadcn dùng chung
  features/
    auth/                      Đăng nhập và form đăng nhập
    display/                   Màn hình chờ gọi số
    admin/
      AdminApplication.tsx     Kiểm tra phiên và quyền truy cập
      shell/                   Layout, sidebar, header, breadcrumb, theme
      shared/                  Phân quyền, danh tính, định dạng, thông báo chung
      accounts/                Quản lý tài khoản, API, form và kiểu dữ liệu
      reception/               Gọi số, hàng đợi, Realtime
      registrations/           Danh sách tiếp nhận, chỉnh sửa, ghi chú, trạng thái in
      roster/                  Điều phối: clinic, onsite, dashboard, personnel, settlement
    registration/
      access/                  QR và phiên đăng ký
      flow/                    Các bước đăng ký của khách
      form/                    Form TT25, ngày sinh, địa chỉ và kiểm tra CCCD
      printing/                PDF, worker in hàng loạt, preview và metadata mẫu
      tt25Types.ts             Dữ liệu TT25 dùng chung cho form và in
      tt25Constants.ts         Các lựa chọn nghiệp vụ và bản dịch
  lib/                         Supabase client, ngày tháng, điều hướng và Excel
```

Đặt file chỉ dùng bởi một chức năng trong thư mục của chức năng đó. Đưa vào
`shared/` hoặc `components/ui/` khi có nhiều chức năng thật sự cùng dùng.
`accounts/types.ts` chứa kiểu tài khoản; `registrations/types.ts` chứa kiểu hồ sơ
khách; `roster/data/types.ts` chứa kiểu điều phối. Các URL và đường dẫn mẫu trong
`frontend/public/` giữ nguyên.

Bộ kiểm thử nằm trong `frontend/tests/`. Chạy `npm test`, `npm run lint` và
`npm run build` từ thư mục gốc sau khi thay đổi. Các script chuẩn bị mẫu Word/PDF
trong `scripts/` ghi metadata vào `registration/printing/`.

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
│     ├─ app/
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
│     └─ main.tsx
└─ supabase/
   ├─ functions/
   │  ├─ _shared/
   │  ├─ register/
   │  ├─ registration-access/
   │  ├─ manage-staff/
   │  └─ login/
   └─ migrations/
```

Không chỉnh sửa migration đã chạy. Mọi thay đổi database mới phải được thêm bằng một migration mới.
