# Đăng ký bằng QR tại phòng khám

## Phạm vi đã duyệt

Khách quét QR đổi mỗi 60 giây, hiệu lực 90 giây. Quét hợp lệ mở phiên điền form
20 phút. Mỗi phiên cấp số thành công một lần; gửi lại cùng phiên và nội dung trả
lại số đã cấp. Tái sử dụng phiên đã cấp số cho nội dung khác bị từ chối.
QR dùng chung được nhiều khách quét, không dùng hết sau lần quét đầu.
Màn hình `/registration-qr?branch=q1` yêu cầu nhân viên đăng nhập và có quyền chi
nhánh. `/display` vẫn công khai nhưng không cấp hoặc hiển thị QR đăng ký.

## Giao diện

Giữ bản minh họa đã duyệt và thương hiệu DYM: Be Vietnam Pro, xanh y tế, nền sáng,
QR lớn trên nền trắng. Dùng tokens và Button/Card/Badge/Alert/Empty của shadcn.
Màn hình điện thoại giữ form hiện có, thêm trạng thái xác thực và hướng dẫn quét
lại. Mất mạng không hiển thị QR đã hết hạn như mã đang hoạt động.

## Cấu trúc

- Frontend: màn hình QR riêng, API client và hook phiên đăng ký, cổng QR trước form.
- Edge Function `registration-access`: nhân viên lấy QR; khách đổi QR thành phiên.
- Edge Function `register`: bắt buộc phiên, không có đường cấp số không kiểm tra QR.
- Migration mới: phiên chỉ lưu hash token và metadata, không lưu hồ sơ y tế;
  RPC khóa phiên, cấp số và đánh dấu đã dùng trong cùng transaction.
- Dùng HMAC với secret server hiện có, có domain riêng cho QR; không lộ secret
  hoặc token nhân viên qua QR. Thời gian do server quyết định.

## Kiểm tra

`npm --prefix frontend test`, `npm run lint`, `npm run build`.
Kiểm tra SQL trên Postgres khi có môi trường: tranh chấp gửi cùng phiên, replay,
rollback khi dữ liệu sai, phiên hết hạn và chi nhánh không khớp.
Test token: chữ ký giả, sửa chi nhánh, thời điểm hết hạn, QR dùng chung.
Kiểm tra giao diện desktop/mobile, lỗi mạng và đăng nhập không đủ quyền.

## Giới hạn

Ảnh được chia sẻ và mở ngay khi QR còn hạn vẫn có thể đăng ký. Không dùng GPS,
OTP, Wi-Fi bắt buộc hoặc thay đổi luồng điều phối y khoa.
Chỉ deploy sau khi code, migration và kiểm tra đã hoàn thành; không chạy migration
trên production trong quá trình viết tính năng.
