# Hệ thống QR Đăng ký Số thứ tự Khám bệnh — DYM Medical Center

Khách hàng quét mã QR tại phòng khám, mở form trên điện thoại, điền thông tin và nhận **số thứ tự khám** (queue number) tự động theo ngày.

## Kiến trúc

| Phần | Công nghệ | Vai trò |
|------|-----------|---------|
| **Frontend** | React 19 + Vite + TypeScript + Tailwind CSS + React Hook Form + Zod | Form đăng ký mobile-first, song ngữ VI/EN |
| **Backend** | Google Apps Script (`backend/Code.gs` v3.0) | Nhận POST JSON, cấp STT, ghi Google Sheet |
| **Dữ liệu** | Google Sheet gắn với Apps Script | Không cần máy chủ riêng |

```
[Điện thoại khách] --POST JSON--> [Google Apps Script Web App] --> [Google Sheet]
        ^
   QR → Frontend (Vercel/Netlify/local)
```

## Trường dữ liệu (đồng bộ Form ↔ Backend ↔ Sheet)

| Cột Sheet | Field JSON | Bắt buộc | Ghi chú |
|-----------|------------|----------|---------|
| Số thứ tự | `queueNumber` (response) | — | `0001`…, **reset mỗi ngày** (múi giờ `Asia/Ho_Chi_Minh`) |
| Thời gian submit | — | — | Backend tự ghi `dd/MM/yyyy HH:mm:ss` |
| Họ tên | `fullName` | Có | |
| Số điện thoại | `phoneNumber` | Có | 10 số VN, đầu `03/05/07/08/09` |
| Ngày sinh | `birthDate` | Có | `YYYY-MM-DD` từ `<input type="date">` |
| Giới tính | `gender` | Có | `Nam` \| `Nữ` (luôn lưu tiếng Việt) |
| CCCD | `cccd` | Có | 12 số CCCD **hoặc** hộ chiếu |
| Tên công ty | `companyName` | Không | |
| Tỉnh/Thành phố | `province` | Có | Tên đầy đủ (vd. `Thành phố Hà Nội`) |
| Phường/Xã | `ward` | Có | Tên đầy đủ |
| Địa chỉ chi tiết | `addressDetail` | Có | Số nhà, đường… |
| Trạng thái xử lý | — | — | Mặc định `Chờ khám` |
| *(không lưu Sheet)* | `honeypot` | Không | Bẫy bot: nếu có giá trị → không ghi Sheet, trả STT giả `0999` |

> **Không còn** field Dịch vụ / Chi nhánh trên form hiện tại. Mọi đăng ký ghi vào **một Sheet** gắn với script đã deploy.

---

## PHẦN 1: Google Sheet & Backend (Apps Script)

### Bước 1: Tạo Google Sheet

1. Vào [Google Sheets](https://sheets.google.com), tạo bảng trống.
2. Đặt tên (vd. `DYM_DangKyKhamBenh_Queue`).
3. **Không cần** tạo header tay. Lượt đăng ký đầu tiên, script sẽ ghi dòng tiêu đề:

   `Số thứ tự | Thời gian submit | Họ tên | Số điện thoại | Ngày sinh | Giới tính | CCCD | Tên công ty | Tỉnh/Thành phố | Phường/Xã | Địa chỉ chi tiết | Trạng thái xử lý`

### Bước 2: Dán code Apps Script

1. Sheet → **Tiện ích mở rộng** → **Apps Script**.
2. Xóa code mặc định, dán toàn bộ nội dung file [`backend/Code.gs`](backend/Code.gs).
3. Lưu (`Ctrl+S`). Đặt tên project (vd. `DYM_Queue_Backend`).

### Bước 3: Deploy Web App

1. **Triển khai** → **Triển khai mới** → loại **Ứng dụng web**.
2. Cấu hình:
   - **Mô tả**: `DYM Queue System V3`
   - **Thực thi dưới dạng**: *Tôi (Me)*
   - **Ai có quyền truy cập**: *Mọi người (Anyone)* — bắt buộc để khách không cần đăng nhập Google.
3. **Triển khai** → ủy quyền lần đầu (Advanced → Đi tới … → Allow).
4. Copy **Web app URL** dạng:

   `https://script.google.com/macros/s/AKfycb.../exec`

5. Kiểm tra nhanh: mở URL trên trình duyệt → phải thấy text  
   `DYM Queue System Backend - Phiên bản 3.0 (Đã tối ưu hóa tốc độ)`  
   (endpoint `doGet`).

> Mỗi lần sửa `Code.gs`, cần **Triển khai** → **Quản lý triển khai** → chỉnh phiên bản → **Phiên bản mới**, nếu không frontend vẫn gọi bản cũ.

---

## PHẦN 2: Frontend (React)

### Bước 1: Biến môi trường

Trong thư mục `frontend/`, tạo/sửa file `.env` (đã có trong `.gitignore`):

```env
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxx/exec
```

### Bước 2: Chạy local

Yêu cầu [Node.js](https://nodejs.org/) (khuyến nghị 20+).

```bash
cd frontend
npm install
npm run dev
```

Mở link Vite in ra (thường `http://localhost:5173`), điền form thử, kiểm tra Google Sheet có dòng mới + STT tăng dần.

Script hữu ích:

```bash
npm run build    # production build (tsc + vite)
npm run preview  # xem bản build
npm run lint     # oxlint
```

### Tính năng frontend đáng chú ý

- Song ngữ **Tiếng Việt / English** (lưu `localStorage`)
- Dropdown Tỉnh/Phường **có tìm kiếm, không dấu** (`province.json` / `ward.json` — đơn vị hành chính mới)
- Honeypot chống bot + cooldown **10 phút** trước khi “Đăng ký lượt mới” (cùng thiết bị)
- Giữ màn success khi reload (localStorage)
- Full-screen loader theo brand DYM

---

## PHẦN 3: Deploy online & QR

### Cách 1: Vercel (khuyên dùng)

```bash
cd frontend
npm install -g vercel
vercel
```

Thêm Environment Variable trên dashboard:

- Key: `VITE_APPS_SCRIPT_URL`
- Value: URL Apps Script Web App

**Redeploy** sau khi thêm biến (Vite nhúng env lúc **build**).

### Cách 2: Netlify Drop

```bash
cd frontend
# PowerShell / bash: export env trước khi build nếu cần
npm run build
```

Kéo thả thư mục `frontend/dist` lên [Netlify Drop](https://app.netlify.com/drop).  
Với Netlify project đầy đủ: set env `VITE_APPS_SCRIPT_URL` rồi rebuild (không chỉ kéo `dist` đã build thiếu env).

### Tạo mã QR

1. Lấy URL production (vd. `https://dym-queue-system.vercel.app`).
2. Tạo QR tại me-qr.com / qr-code-generator.com / tương đương.
3. In decal/standee: *“Quét mã QR để đăng ký thứ tự khám bệnh nhanh chóng”*.

---

## Bảo mật & vận hành (tóm tắt)

| Cơ chế | Nơi | Ghi chú |
|--------|-----|---------|
| Honeypot | FE + BE | Bot điền field ẩn → STT giả `0999`, không ghi Sheet |
| Sanitize formula injection | BE | Prefix `'` nếu giá trị bắt đầu `= + - @` |
| LockService | BE | Tránh trùng STT khi nhiều người submit cùng lúc |
| Cooldown 10 phút | FE only | Chỉ chặn cùng trình duyệt/thiết bị; clear storage vẫn đăng ký lại |
| Web App “Anyone” | GAS | URL Web App coi như secret nhẹ — không public post lung tung nếu không cần |

**Hạn chế hiện tại (cần biết khi vận hành):**

1. **Không chọn chi nhánh / dịch vụ** trên form — 3 cơ sở DYM dùng chung một hàng đợi Sheet nếu dùng 1 deploy.
2. Cooldown & chống spam **không** server-side theo SĐT/CCCD.
3. `fetch` tới Apps Script đôi khi gặp CORS/redirect tùy mạng/browser — nếu submit fail trên mobile thật, cần test kỹ production URL.
4. Bundle frontend ~1MB (chủ yếu JSON địa giới) — lần tải đầu trên 3G có thể chậm; có thể code-split sau.

---

## Cấu trúc thư mục

```
QueueSystem/
├── README.md                 ← file này
├── .gitignore
├── backend/
│   └── Code.gs               ← Google Apps Script (doPost / doGet)
└── frontend/
    ├── .env                  ← VITE_APPS_SCRIPT_URL (không commit)
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx
        ├── translations.ts
        ├── types/index.ts
        ├── assets/           ← logo + province.json + ward.json
        └── components/
            ├── RegistrationForm.tsx
            ├── SearchableSelect.tsx
            └── SuccessView.tsx
```

## API Backend (Apps Script)

**POST** body JSON (các field như bảng trên).

**Response thành công:**

```json
{ "success": true, "queueNumber": "0007" }
```

**Response lỗi:**

```json
{ "success": false, "error": "Vui lòng điền đầy đủ các thông tin bắt buộc!" }
```

**GET** Web App URL: health-check text (không JSON).
