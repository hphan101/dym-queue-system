# Hướng dẫn Cài đặt & Triển khai Hệ thống QR Đăng ký Khám bệnh

Hệ thống này được xây dựng dành riêng cho **DYM Medical Center** để khách hàng quét mã QR tại phòng khám và đăng ký số thứ tự khám bệnh trực tiếp bằng điện thoại di động.

Hệ thống gồm 2 phần:
1. **Frontend (React + Vite + Tailwind CSS)**: Giao diện form đăng ký chạy trên điện thoại khách hàng.
2. **Backend (Google Apps Script)**: Lưu thông tin đăng ký vào Google Sheet và tự động cấp số thứ tự (Queue Number) tăng dần theo ngày.

---

## PHẦN 1: THIẾT LẬP BẢNG GOOGLE SHEET & BACKEND

Vì hệ thống không sử dụng máy chủ riêng phức tạp, toàn bộ dữ liệu sẽ được lưu trực tiếp vào tài khoản Google Drive của bạn.

### Bước 1: Tạo Google Sheet mới
1. Truy cập vào [Google Sheets](https://sheets.google.com) và tạo một bảng tính trống mới.
2. Đặt tên cho Google Sheet (ví dụ: `DYM_DangKyKhamBenh_Queue`).
3. Bạn **không cần** điền gì vào bảng tính. Khi có lượt đăng ký đầu tiên, hệ thống sẽ tự động tạo dòng tiêu đề cột:
   `Số thứ tự | Thời gian submit | Họ tên | Số điện thoại | Ngày sinh | Giới tính | Dịch vụ đăng ký | Chi nhánh | Trạng thái xử lý`

### Bước 2: Dán code vào Google Apps Script
1. Trên thanh công cụ của Google Sheet vừa tạo, chọn **Tiện ích mở rộng** (Extensions) → **Apps Script**.
2. Một cửa sổ viết code sẽ hiện ra. Xóa sạch mọi mã nguồn mặc định có trong đó.
3. Mở file [Code.gs](file:///d:/FIGHT/QueueSystem/backend/Code.gs) trong thư mục dự án này, copy toàn bộ nội dung và dán vào cửa sổ Apps Script.
4. Nhấn nút **Lưu** (biểu tượng đĩa mềm phía trên) hoặc nhấn tổ hợp phím `Ctrl + S`.
5. Bạn có thể đổi tên dự án Apps Script này thành `DYM_Queue_Backend` ở góc trên bên trái.

### Bước 3: Deploy (Triển khai) Apps Script làm Web App
Để React App ở điện thoại có thể gửi dữ liệu tới Google Sheet, bạn cần xuất bản (deploy) script này dưới dạng Web App:
1. Ở góc trên bên phải màn hình Apps Script, nhấn nút **Triển khai** (Deploy) → chọn **Triển khai mới** (New deployment).
2. Nhấn vào biểu tượng bánh răng cưa ở mục *Chọn loại* (Select type) và chọn **Ứng dụng web** (Web app).
3. Điền các cấu hình chính xác như sau:
   - **Mô tả (Description)**: `DYM Queue System V1`
   - **Thực thi dưới dạng (Execute as)**: Chọn **Tôi (tài khoản email của bạn)** - *Me*.
   - **Ai có quyền truy cập (Who has access)**: Chọn **Mọi người** - *Anyone* (đây là cấu hình bắt buộc để điện thoại khách hàng quét QR có thể gửi data lên mà không cần đăng nhập tài khoản Google).
4. Nhấn nút **Triển khai** (Deploy).
5. Nếu là lần đầu tiên, Google sẽ yêu cầu bạn cấp quyền truy cập (**Ủy quyền truy cập** / *Authorize access*):
   - Nhấn chọn tài khoản Google của bạn.
   - Nhấn vào chữ **Nâng cao** (Advanced) ở góc dưới → chọn **Đi tới DYM_Queue_Backend (không an toàn)**.
   - Nhấn **Cho phép** (Allow).
6. Sau khi triển khai thành công, hệ thống sẽ cung cấp cho bạn một **URL ứng dụng web** (Web app URL). Nó có dạng:
   `https://script.google.com/macros/s/AKfycb.../exec`
7. Hãy **sao chép (Copy) URL này** lại để chuẩn bị dán vào cấu hình Frontend ở bước sau.

---

## PHẦN 2: THIẾT LẬP FRONTEND (REACT APP)

### Bước 1: Cấu hình biến môi trường
1. Tìm file [.env](file:///d:/FIGHT/QueueSystem/frontend/.env) trong thư mục `frontend/`.
2. Dán URL ứng dụng web đã copy ở Bước 3 phía trên vào sau dấu `=`, ví dụ:
   ```env
   VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxx/exec
   ```
3. Lưu file lại.

### Bước 2: Chạy thử ở máy tính cá nhân (Local)
Yêu cầu máy tính của bạn đã cài đặt [Node.js](https://nodejs.org/).
1. Mở Terminal/PowerShell tại thư mục `frontend/`.
2. Chạy lệnh cài đặt các thư viện (nếu chưa chạy trước đó):
   ```bash
   npm install
   ```
3. Chạy ứng dụng ở chế độ thử nghiệm:
   ```bash
   npm run dev
   ```
4. Click vào liên kết hiển thị trên màn hình (thường là `http://localhost:5173`) để mở trang web đăng ký trên trình duyệt. Thử điền form và gửi để kiểm tra xem Google Sheet đã nhận dữ liệu và sinh số thứ tự chưa.

---

## PHẦN 3: ĐƯA WEBSITE LÊN INTERNET & TẠO MÃ QR

Để khách hàng có thể quét mã QR bằng điện thoại của họ, website phải được đưa lên Internet (Deploy Online). Dưới đây là cách làm miễn phí, cực kỳ đơn giản và nhanh gọn qua **Vercel** hoặc **Netlify**.

### Cách 1: Deploy bằng Vercel (Khuyên dùng - Cực kỳ nhanh)
1. Truy cập vào trang web [Vercel](https://vercel.com) và đăng ký/đăng nhập bằng tài khoản Github hoặc Email.
2. Cài đặt công cụ Vercel trên máy tính của bạn bằng cách chạy lệnh sau tại thư mục `frontend/`:
   ```bash
   npm install -g vercel
   ```
3. Chạy lệnh deploy:
   ```bash
   vercel
   ```
4. Công cụ sẽ hỏi bạn một số câu hỏi thiết lập ban đầu (chỉ cần bấm Enter để chọn mặc định):
   - *Set up and deploy?* → Nhấn `y` rồi Enter.
   - *Which scope?* → Nhấn Enter.
   - *Link to existing project?* → Nhấn `n` rồi Enter.
   - *What's your project's name?* → Nhập `dym-queue-system` rồi Enter.
   - *In which directory?* → Nhấn Enter (để chọn `./`).
   - *Want to modify settings?* → Nhấn `n` rồi Enter.
5. Vercel sẽ tự động tải dự án lên và build. Khi hoàn thành, bạn sẽ nhận được một đường link Production dạng: `https://dym-queue-system.vercel.app`.
6. **Lưu ý quan trọng**: Bạn cần thêm Biến môi trường lên Vercel. 
   - Truy cập vào Dashboard dự án trên trang vercel.com.
   - Chọn tab **Settings** → **Environment Variables**.
   - Thêm Key: `VITE_APPS_SCRIPT_URL`, Value: *[Đường dẫn URL Google Apps Script của bạn]*.
   - Tiến hành Redeploy lại dự án để nhận biến môi trường mới.

### Cách 2: Deploy thủ công bằng Netlify (Kéo thả không cần gõ lệnh)
Nếu bạn không muốn cài đặt dòng lệnh, bạn có thể tự build file trên máy và kéo thả:
1. Mở Terminal tại thư mục `frontend/` và chạy lệnh build dự án:
   ```bash
   npm run build
   ```
2. Sau khi chạy xong, trong thư mục `frontend/` sẽ xuất hiện thêm một thư mục tên là `dist`. Đây là thư mục chứa toàn bộ trang web đã được đóng gói tối ưu.
3. Truy cập vào trang web [Netlify Drop](https://app.netlify.com/drop).
4. Kéo thư mục `dist` từ máy tính thả vào khung tải lên của Netlify.
5. Trong vòng 10 giây, Netlify sẽ tạo cho bạn một đường link website hoạt động online (ví dụ: `https://xxx-xxxx-xxxx.netlify.app`).
6. Để thêm cấu hình biến môi trường trên Netlify:
   - Vào **Site settings** → **Environment variables** → **Add a variable**.
   - Thêm Key: `VITE_APPS_SCRIPT_URL`, Value: *[Đường dẫn URL Google Apps Script]* và lưu lại.
   - Thực hiện Trigger deploy lại trang web.

---

## PHẦN 4: TẠO MÃ QR CODE CHO PHÒNG KHÁM

Sau khi đã có link website chạy online (từ Vercel hoặc Netlify):
1. Truy cập vào các trang tạo mã QR miễn phí như: [me-qr.com](https://me-qr.com), [qr-code-generator.com](https://www.qr-code-generator.com) hoặc [qrgene.com](https://qrgene.com).
2. Dán link website của bạn vào (ví dụ: `https://dym-queue-system.vercel.app`).
3. Bạn có thể tùy chỉnh mã QR: thêm logo DYM ở giữa, chọn màu xanh y tế chủ đạo để tăng độ tin cậy và thẩm mỹ thương hiệu.
4. Tải file ảnh QR Code về máy tính dưới định dạng PNG hoặc SVG có chất lượng cao.
5. In ảnh QR Code này ra decal hoặc thiết kế trên standee đặt tại quầy tiếp đón của DYM Medical Center kèm theo dòng hướng dẫn: **"Quét mã QR để đăng ký thứ tự khám bệnh nhanh chóng"**.
