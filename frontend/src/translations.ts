export const translations = {
  vi: {
    title: 'Đăng Ký Thứ Tự Khám Bệnh',
    subtitle: 'Vui lòng điền thông tin để nhận số thứ tự tự động',
    fullName: 'Họ và tên',
    phoneNumber: 'Số điện thoại',
    birthDate: 'Ngày sinh',
    gender: 'Giới tính',
    genderNam: 'Nam',
    genderNu: 'Nữ',
    selectBranch: '-- Chọn chi nhánh --',
    selectService: '-- Chọn dịch vụ khám --',
    branchLabel: 'Chọn chi nhánh khám',
    serviceLabel: 'Dịch vụ / Gói khám',
    btnSubmit: 'Xác nhận Đăng ký',
    btnSubmitting: 'Đang xử lý...',
    
    // Các lỗi validate
    errFullNameRequired: 'Họ và tên không được để trống',
    errFullNameMin: 'Họ và tên phải từ 2 ký tự trở lên',
    errPhoneRequired: 'Số điện thoại không được để trống',
    errPhoneInvalid: 'Số điện thoại không hợp lệ (gồm 10 chữ số)',
    errBirthRequired: 'Ngày sinh không được để trống',
    errBirthPast: 'Ngày sinh phải ở trong quá khứ',
    errGenderRequired: 'Vui lòng chọn giới tính',
    errBranchRequired: 'Vui lòng chọn chi nhánh khám',
    errServiceRequired: 'Vui lòng chọn dịch vụ/gói khám',
    
    // Màn hình thành công
    successTitle: 'Đăng ký thành công!',
    successThanks: 'DYM Medical Center chân thành cảm ơn quý khách.',
    queueLabel: 'Số Thứ Tự Của Quý Khách',
    successNote: 'Vui lòng chụp màn hình hoặc lưu lại số thứ tự này để xuất trình tại quầy lễ tân.',
    btnNewTurn: 'Đăng ký lượt mới',
    summaryTitle: 'Tóm tắt thông tin đăng ký',
    
    // Lỗi hệ thống
    failedTitle: 'Đăng ký thất bại',
    errorUrl: 'Chưa cấu hình URL Google Apps Script. Vui lòng thêm VITE_APPS_SCRIPT_URL vào file .env'
  },
  en: {
    title: 'Medical Registration',
    subtitle: 'Please fill in the information to get your queue number automatically',
    fullName: 'Full Name',
    phoneNumber: 'Phone Number',
    birthDate: 'Date of Birth',
    gender: 'Gender',
    genderNam: 'Male',
    genderNu: 'Female',
    selectBranch: '-- Select Branch --',
    selectService: '-- Select Service --',
    branchLabel: 'Choose Clinic Branch',
    serviceLabel: 'Medical Service / Package',
    btnSubmit: 'Confirm Registration',
    btnSubmitting: 'Processing...',
    
    // Validation errors
    errFullNameRequired: 'Full name is required',
    errFullNameMin: 'Full name must be at least 2 characters',
    errPhoneRequired: 'Phone number is required',
    errPhoneInvalid: 'Invalid phone number (must be 10 digits)',
    errBirthRequired: 'Date of birth is required',
    errBirthPast: 'Date of birth must be in the past',
    errGenderRequired: 'Please select your gender',
    errBranchRequired: 'Please select a clinic branch',
    errServiceRequired: 'Please select a medical service',
    
    // Success View
    successTitle: 'Registration Successful!',
    successThanks: 'DYM Medical Center sincerely thanks you.',
    queueLabel: 'Your Queue Number',
    successNote: 'Please take a screenshot or save this queue number to present at the clinic reception.',
    btnNewTurn: 'Register New Turn',
    summaryTitle: 'Registration Summary',
    
    // Errors
    failedTitle: 'Registration Failed',
    errorUrl: 'Google Apps Script URL is not configured. Please add VITE_APPS_SCRIPT_URL to .env'
  }
};
