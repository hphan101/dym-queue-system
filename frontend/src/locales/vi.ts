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
  province: 'Tỉnh / Thành phố',
  ward: 'Phường / Xã',
  addressDetail: 'Địa chỉ chi tiết (Số nhà, đường...)',
  selectProvince: 'Chọn Tỉnh / Thành phố',
  selectWard: 'Chọn Phường / Xã',
  btnSubmit: 'Xác nhận Đăng ký',
  btnSubmitting: 'Đang xử lý...',
  placeholderCompany: 'Nhập tên công ty',
  placeholderCccd: 'Nhập số CCCD hoặc hộ chiếu',
  placeholderAddressDetail: 'Số nhà, tên đường...',

  // Validation
  errFullNameRequired: 'Họ và tên không được để trống',
  errFullNameMin: 'Họ và tên phải từ 2 ký tự trở lên',
  errPhoneRequired: 'Số điện thoại không được để trống',
  errPhoneInvalid: 'Số điện thoại không hợp lệ (gồm 10 chữ số)',
  errBirthRequired: 'Ngày sinh không được để trống',
  errBirthPast: 'Ngày sinh phải ở trong quá khứ',
  errGenderRequired: 'Vui lòng chọn giới tính',
  errCccdRequired: 'Số CCCD/Hộ chiếu không được để trống',
  errCccdInvalid: 'Số CCCD hoặc Hộ chiếu không hợp lệ',
  errProvinceRequired: 'Vui lòng chọn Tỉnh/Thành phố',
  errWardRequired: 'Vui lòng chọn Phường/Xã',
  errAddressDetailRequired: 'Địa chỉ chi tiết không được để trống',
  loadingLocations: 'Đang tải danh sách địa chỉ…',
  locationLoadError: 'Không thể tải danh sách địa chỉ. Vui lòng chạm lại để thử lại.',

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

