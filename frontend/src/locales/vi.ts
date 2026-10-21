import type { TranslationDictionary } from './types';

export const vi: TranslationDictionary = {
  title: 'Đăng Ký Thứ Tự Khám Bệnh',
  subtitle: 'Vui lòng điền thông tin để nhận số thứ tự tự động',
  fullName: 'Họ và tên',
  phoneNumber: 'Số điện thoại',
  birthDate: 'Ngày sinh',
  gender: 'Giới tính',
  genderNam: 'Nam',
  genderNu: 'Nữ',
  cccd: 'Số CCCD / Hộ chiếu',
  address: 'Địa chỉ',
  companyName: 'Tên công ty',

  // Success
  successTitle: 'Đăng ký thành công!',
  successThanks: 'DYM chân thành cảm ơn quý khách.',
  queueLabel: 'Số Thứ Tự Của Quý Khách',
  successNote: 'Vui lòng chụp màn hình hoặc lưu lại số thứ tự này để xuất trình tại quầy lễ tân.',
  btnNewTurn: 'Đăng ký lượt mới',
  summaryTitle: 'Tóm tắt thông tin đăng ký',

  // System & Network
  failedTitle: 'Đăng ký thất bại',
  errorUrl: 'Chưa cấu hình máy chủ đăng ký. Vui lòng liên hệ quản trị viên.',
  requestTimeout: 'Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.',
  saveError: 'Có lỗi xảy ra khi lưu thông tin.',
  networkError: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối mạng.',
  noBranchError: 'Liên kết đăng ký không xác định chi nhánh. Vui lòng quét lại mã QR tại cơ sở DYM.',
};
