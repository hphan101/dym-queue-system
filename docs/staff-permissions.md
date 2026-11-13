# Phân quyền theo tài khoản

Trong Quản lý nhân viên, mở Thêm hoặc Sửa rồi chọn Quyền theo chức năng.
Vai trò Lễ tân, Vận hành, Quản trị chỉ tạo mẫu quyền. Quyền riêng có thể cấp
thêm hoặc thu hồi từng chức năng, không phụ thuộc tên vai trò.

- Các mẫu chọn nhanh: Bỏ chọn tất cả, Chỉ xem, Lễ tân, Vận hành, Toàn quyền.
- Chọn Thêm/Sửa/Xóa tự bật Xem; bỏ Xem sẽ bỏ các quyền ghi tương ứng.
- Bấm tên cột để chọn/bỏ cả cột. Ô không áp dụng không thể chọn.
- Mẫu Chỉ xem không bật In hồ sơ vì thao tác in tự ghi trạng thái Đã in.
- Tiếp nhận, đăng ký và lịch áp dụng theo chi nhánh đã chọn.
- Danh mục nhân sự, file hồ sơ và quản lý tài khoản là dữ liệu chung hệ thống.
- Quyền quản lý nhân viên cho phép cấp quyền cho tài khoản khác. Không thể
  tự xóa/khóa hoặc thu hồi quyền Xem/Sửa quản lý nhân viên của chính mình.
- Sửa lịch từ hôm qua trở về trước vẫn cần quyền sửa lịch cũ riêng, bên cạnh
  quyền ghi của Clinic/Onsite và quyền truy cập chi nhánh.
- Tài khoản chưa có ma trận (`profiles.permissions IS NULL`) tiếp tục dùng
  quyền mặc định theo vai trò. Quản trị cũ giữ phạm vi toàn hệ thống; sau khi
  lưu ma trận, phạm vi chi nhánh được chọn áp dụng cả cho vai trò Quản trị.
- In và xuất Excel có mục quyền riêng. Đây là quyền dùng thao tác của ứng
  dụng, không thể ngăn người đã xem/tải dữ liệu tự sao chép hoặc in bằng trình duyệt.

## Cập nhật môi trường

Triển khai theo thứ tự database → API → frontend:

1. Áp dụng `supabase/migrations/20261113150000_add_staff_permission_matrix.sql`.
2. Deploy hai Edge Functions `manage-staff` và `registration-access`, gồm
   module dùng chung `_shared/staffPermissions.ts`.
3. Build/deploy frontend. Tải lại trang để nhận quyền mới; quay lại tab cũng
   tải lại quyền. Server kiểm tra quyền hiện tại cho mỗi thao tác.

Frontend mới kiểm tra `permissionSchemaVersion: 1` trước khi lưu nhân viên.
Nếu API cũ chưa hỗ trợ, form báo cần cập nhật và không gửi yêu cầu ghi.
Không báo lưu thành công khi backend chưa nhận ma trận.

## Kiểm tra

```powershell
cd frontend
node --test tests/staff-permissions.test.cjs tests/roster-history.test.cjs tests/registration-qr.test.cjs
npm run build
```

Kiểm thử database nạp toàn bộ migration vào PostgreSQL giả lập (PGlite),
kiểm tra quyền mặc định/riêng, tài khoản bị khóa, phạm vi chi nhánh, RLS và
trigger bảo vệ các hàm SECURITY DEFINER. Không dùng tài khoản hay dữ liệu thật.
