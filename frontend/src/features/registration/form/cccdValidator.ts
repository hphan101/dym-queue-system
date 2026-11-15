/**
 * Bảng 63 mã tỉnh, thành phố trực thuộc Trung ương trên thẻ CCCD
 * (Ban hành kèm theo Thông tư số 07/2016/TT-BCA ngày 01/02/2016 của Bộ Công an)
 */
export const CCCD_PROVINCE_CODES: Record<string, string> = {
  '001': 'Hà Nội',
  '002': 'Hà Giang',
  '004': 'Cao Bằng',
  '006': 'Bắc Kạn',
  '008': 'Tuyên Quang',
  '010': 'Lào Cai',
  '011': 'Điện Biên',
  '012': 'Lai Châu',
  '014': 'Sơn La',
  '015': 'Yên Bái',
  '017': 'Hòa Bình',
  '019': 'Thái Nguyên',
  '020': 'Lạng Sơn',
  '022': 'Quảng Ninh',
  '024': 'Bắc Giang',
  '025': 'Phú Thọ',
  '026': 'Vĩnh Phúc',
  '027': 'Bắc Ninh',
  '030': 'Hải Dương',
  '031': 'Hải Phòng',
  '033': 'Hưng Yên',
  '034': 'Thái Bình',
  '035': 'Hà Nam',
  '036': 'Nam Định',
  '037': 'Ninh Bình',
  '038': 'Thanh Hóa',
  '040': 'Nghệ An',
  '042': 'Hà Tĩnh',
  '044': 'Quảng Bình',
  '045': 'Quảng Trị',
  '046': 'Thừa Thiên Huế',
  '048': 'Đà Nẵng',
  '049': 'Quảng Nam',
  '051': 'Quảng Ngãi',
  '052': 'Bình Định',
  '054': 'Phú Yên',
  '056': 'Khánh Hòa',
  '058': 'Ninh Thuận',
  '060': 'Bình Thuận',
  '062': 'Kon Tum',
  '064': 'Gia Lai',
  '066': 'Đắk Lắk',
  '067': 'Đắk Nông',
  '068': 'Lâm Đồng',
  '070': 'Bình Phước',
  '072': 'Tây Ninh',
  '074': 'Bình Dương',
  '075': 'Đồng Nai',
  '077': 'Bà Rịa - Vũng Tàu',
  '079': 'Hồ Chí Minh',
  '080': 'Long An',
  '082': 'Tiền Giang',
  '083': 'Bến Tre',
  '084': 'Trà Vinh',
  '086': 'Vĩnh Long',
  '087': 'Đồng Tháp',
  '089': 'An Giang',
  '091': 'Kiên Giang',
  '092': 'Cần Thơ',
  '093': 'Hậu Giang',
  '094': 'Sóc Trăng',
  '095': 'Bạc Liêu',
  '096': 'Cà Mau',
};

export interface CccdValidationParams {
  cccd: string;
  gender: 'Nam' | 'Nữ';
  birthDate?: string; // YYYY-MM-DD
  isEn?: boolean;
}

/**
 * Kiểm tra cấu trúc 12 chữ số CCCD theo quy định Bộ Công an:
 * - 3 số đầu (001–096): Mã tỉnh/thành phố đăng ký khai sinh (63 tỉnh thành)
 * - 1 số tiếp theo (vị trí thứ 4): Mã thế kỷ và giới tính
 *   + Thế kỷ 20 (1900–1999): Nam 0, Nữ 1
 *   + Thế kỷ 21 (2000–2099): Nam 2, Nữ 3
 *   + Thế kỷ 22 (2100–2199): Nam 4, Nữ 5
 *   + Thế kỷ 23 (2200–2299): Nam 6, Nữ 7
 *   + Thế kỷ 24 (2300–2399): Nam 8, Nữ 9
 * - 2 số kế tiếp (vị trí thứ 5–6): 2 số cuối năm sinh
 * - 6 số cuối (vị trí thứ 7–12): Dãy số ngẫu nhiên
 */
export function validateVietnamCccd({
  cccd,
  gender,
  birthDate,
  isEn = false,
}: CccdValidationParams): string | null {
  const clean = cccd.trim().toUpperCase();

  if (!clean) {
    return isEn
      ? 'Please enter your 12-digit Citizen ID (CCCD)'
      : 'Vui lòng nhập số CCCD (12 chữ số)';
  }

  // Allow foreign passport format ONLY if it starts with an uppercase letter (e.g. B1234567)
  if (/^[A-Z][A-Z0-9]{6,11}$/.test(clean)) {
    return null;
  }

  if (!/^\d{12}$/.test(clean)) {
    return isEn
      ? 'Citizen ID (CCCD) must consist of exactly 12 digits'
      : 'Số CCCD phải gồm đúng 12 chữ số tự nhiên';
  }

  // 1. Check first 3 digits: Province code (001 - 096 across 63 provinces)
  const provinceCode = clean.slice(0, 3);
  if (!CCCD_PROVINCE_CODES[provinceCode]) {
    return isEn
      ? `Invalid province code "${provinceCode}" in the first 3 digits of CCCD`
      : `3 số đầu "${provinceCode}" không phải mã tỉnh/thành phố hợp lệ (001–096)`;
  }

  // 2. Check 4th digit (century & gender) and 5th-6th digits (2-digit birth year)
  const centuryGenderDigit = Number(clean[3]);
  const cccdYearTwoDigits = clean.slice(4, 6);

  // Extract birth year if birthDate is valid YYYY-MM-DD
  let birthYear: number | null = null;
  if (birthDate && /^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    const parsedYear = Number(birthDate.slice(0, 4));
    if (parsedYear >= 1900 && parsedYear <= 2399) {
      birthYear = parsedYear;
    }
  }

  if (birthYear !== null) {
    const centuryIndex = Math.floor((birthYear - 1900) / 100); // 0 for 1900s, 1 for 2000s, etc.
    const expectedGenderDigit = centuryIndex * 2 + (gender === 'Nữ' ? 1 : 0);

    if (centuryGenderDigit !== expectedGenderDigit) {
      return isEn
        ? `The 4th digit (${centuryGenderDigit}) does not match ${gender === 'Nam' ? 'Male' : 'Female'} born in ${birthYear} (expected ${expectedGenderDigit})`
        : `Số thứ 4 của CCCD (${centuryGenderDigit}) không khớp với giới tính ${gender} sinh năm ${birthYear} (đúng phải là số ${expectedGenderDigit})`;
    }

    const expectedYearTwoDigits = String(birthYear).slice(-2);
    if (cccdYearTwoDigits !== expectedYearTwoDigits) {
      return isEn
        ? `Digits 5–6 of CCCD (${cccdYearTwoDigits}) do not match birth year ${birthYear} (expected ${expectedYearTwoDigits})`
        : `Hai số thứ 5–6 của CCCD (${cccdYearTwoDigits}) không khớp với năm sinh ${birthYear} (đúng phải là ${expectedYearTwoDigits})`;
    }
  } else {
    // Even without birthDate, check gender parity (Nam = even: 0,2,4,6,8; Nữ = odd: 1,3,5,7,9)
    const isFemaleDigit = centuryGenderDigit % 2 === 1;
    if (gender === 'Nam' && isFemaleDigit) {
      return isEn
        ? `The 4th digit (${centuryGenderDigit}) is for Female, which does not match Male (must be 0, 2, 4, 6, 8)`
        : `Số thứ 4 của CCCD (${centuryGenderDigit}) là mã Nữ, không khớp với giới tính Nam (phải là 0, 2, 4, 6, 8)`;
    }
    if (gender === 'Nữ' && !isFemaleDigit) {
      return isEn
        ? `The 4th digit (${centuryGenderDigit}) is for Male, which does not match Female (must be 1, 3, 5, 7, 9)`
        : `Số thứ 4 của CCCD (${centuryGenderDigit}) là mã Nam, không khớp với giới tính Nữ (phải là 1, 3, 5, 7, 9)`;
    }
  }

  return null;
}
