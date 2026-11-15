# Bản đồ codebase

## Tìm đúng nơi sửa

| Cần sửa | File hoặc thư mục |
| --- | --- |
| URL, route cũ và `?page=` | `frontend/src/app/routes.ts` |
| Lazy loading và đồng bộ lịch sử trình duyệt | `frontend/src/app/App.tsx` |
| Kiểm tra phiên, chọn trang theo quyền | `frontend/src/features/admin/AdminApplication.tsx` |
| Sidebar, breadcrumb, header, màn hình tải | `frontend/src/features/admin/shell/` |
| Quyền truy cập ở frontend | `frontend/src/lib/staffPermissions.ts`, `admin/shared/useStaffPermissions.ts` |
| Form và thao tác tài khoản | `admin/accounts/StaffPage.tsx`, các `Staff*Modal.tsx` cùng thư mục |
| Gọi API tài khoản, làm mới token, thông báo lỗi | `admin/accounts/staffApi.ts` |
| Thông báo lỗi/thành công có nút đóng | `admin/shared/FeedbackBanner.tsx` |
| Thông báo khách đăng ký mới | `admin/shared/CustomerNoticeModal.tsx` |
| Tiếp nhận, gọi số, Realtime | `admin/reception/` |
| Danh sách khách, ghi chú, chỉnh sửa, trạng thái in | `admin/registrations/` |
| Tổng quan, lịch Clinic, đoàn Onsite, quyết toán | Các thư mục tương ứng trong `admin/roster/` |
| Danh sách nhân sự | `admin/roster/personnel/RosterPersonnelPage.tsx` |
| Form thêm/sửa nhân sự | `admin/roster/personnel/PersonnelFormDialog.tsx` |
| Truy vấn và thao tác điều phối | `admin/roster/data/rosterService.ts`, `RosterContext.tsx` |
| QR và phiên đăng ký của khách | `registration/access/` |
| Luồng chọn ngôn ngữ, lý do khám, đồng thuận, nhận số | `registration/flow/` |
| Trường nhập thông tin khách, ngày sinh, địa chỉ | `registration/form/` |
| Điền PDF TT25, Đồng thuận, Từ chối | `registration/printing/` |
| Mẫu PDF và font dùng khi in | `frontend/public/`, xem `docs/tt25-templates.md` và `docs/consent-templates.md` |
| API Supabase và xác thực phía server | `supabase/functions/` |
| Schema, RLS và RPC | `supabase/migrations/` |

Các đường dẫn bắt đầu bằng `admin/` và `registration/` trong bảng là tương đối
với `frontend/src/features/`.

## Ranh giới trách nhiệm

- `app/` lắp ghép ứng dụng và phân giải URL. Phân quyền vẫn được kiểm tra tại
  `AdminApplication` và ở server, không suy ra quyền từ việc hiển thị sidebar.
- Mỗi thư mục chức năng sở hữu page, component riêng, service và kiểu dữ liệu
  của nó. Page điều phối state và tác vụ; form nhận dữ liệu và callback qua props.
- Component shadcn nằm trong `components/ui/`. Component nghiệp vụ tái sử dụng
  giữa các trang quản trị nằm trong `admin/shared/`.
- API, cache và logic nghiệp vụ không được đưa vào component giao diện dùng chung.
  Kiểu dữ liệu dùng `import type` để không kéo thêm module vào bundle.
- Mã in chạy độc lập với UI. `bulkPrintPdf.worker.ts` và bộ tạo PDF ở cùng
  `registration/printing/`; metadata JSON và script chuẩn bị mẫu phải đi cùng nhau.
- Giữ `lib/` cho tiện ích và hạ tầng dùng xuyên chức năng. Không tạo thêm thư mục
  `utils/`, lớp service tổng quát hoặc barrel export khi chưa có nhu cầu cụ thể.

## Thay đổi thường gặp

### Thêm một trang quản trị

1. Đặt page và các component riêng trong thư mục chức năng phù hợp.
2. Bổ sung route trong `app/routes.ts`, destination trong `AdminApplication`,
   nhãn sidebar/breadcrumb trong `admin/shell/`.
3. Khai báo quyền trong permission model và kiểm tra ở API/RLS khi có thao tác
   dữ liệu; chỉ ẩn nút là chưa đủ.
4. Thêm kiểm thử URL, quyền và hành vi mới; chạy test, lint, build.

### Thêm trường hoặc sửa form

Sửa kiểu dữ liệu của chức năng và form sở hữu trường. Giữ kiểm tra đầu vào tại
service/API; giữ lỗi và giá trị người dùng nhập khi gửi thất bại. Form nhân sự
chỉ nhận callback, còn lưu dữ liệu và kiểm tra trùng nằm ở page/service.

### Sửa mẫu in

Đọc tài liệu mẫu trước, sửa script trong `scripts/` khi cần và kiểm tra cả metadata
ở `registration/printing/`. Chạy các test PDF, in hỗn hợp, số bộ, trang trắng và
trạng thái in. Không đổi URL file trong `public/` chỉ vì sắp xếp mã nguồn.

## Kiểm tra trước khi bàn giao

```sh
npm test
npm run lint
npm run build
```

Test dùng dữ liệu giả và PGlite, không ghi vào Supabase thật. Build kiểm tra các
import, worker, lazy import và tài nguyên đóng gói. Với thay đổi giao diện, kiểm
tra thêm sáng/tối, màn hình nhỏ, bàn phím và trạng thái đang lưu/lỗi.

Không sửa migration đã áp dụng; thêm migration mới khi cần thay đổi database.
Việc refactor mã nguồn không tự triển khai API hoặc website.
