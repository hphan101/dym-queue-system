export function isValidPassportName(name: string): boolean {
  return /^[A-Za-zÀ-ÖØ-öø-ÿĂăĐđĨĩŨũƠơƯưẠ-ỹ]+(?:[ '’-]+[A-Za-zÀ-ÖØ-öø-ÿĂăĐđĨĩŨũƠơƯưẠ-ỹ]+)*$/.test(name.trim().normalize('NFC'));
}

export function hasChineseOrJapaneseCharacters(name: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(name);
}

export function usesPassport(type: unknown, document: string): boolean {
  return type === 'passport' || (type == null && !/^\d{12}$/.test(document.trim()));
}

export const PASSPORT_NAME_MESSAGE = {
  vi: 'Nhập họ tên bằng chữ Latin đúng như trên hộ chiếu.',
  en: 'Enter your name in Latin letters as shown on your passport.',
  ja: 'パスポートに記載された氏名をラテン文字で入力してください。',
};

export const LATIN_NAME_MESSAGE = {
  vi: 'Vui lòng nhập họ tên bằng chữ Latin theo giấy tờ.',
  en: 'Please enter your name in Latin letters as shown on your ID.',
  ja: '本人確認書類に記載された氏名をラテン文字で入力してください。',
};
