import type { TranslationDictionary } from './types';

export const ja: TranslationDictionary = {
  title: '診療受付・順番登録',
  subtitle: '情報を入力して受付番号を取得してください',
  fullName: '氏名',
  phoneNumber: '電話番号',
  birthDate: '生年月日',
  gender: '性別',
  genderNam: '男性',
  genderNu: '女性',
  cccd: '身分証番号 / パスポート',
  address: '住所',
  companyName: '会社名',
  province: '省 / 市',
  ward: '坊 / 社',
  addressDetail: '詳細住所（番地、通りなど）',
  selectProvince: '省 / 市を選択',
  selectWard: '坊 / 社を選択',
  btnSubmit: '登録する',
  btnSubmitting: '処理中...',
  placeholderCompany: '会社名を入力',
  placeholderCccd: '身分証またはパスポート番号',
  placeholderAddressDetail: '番地、通り名など',

  // Validation
  errFullNameRequired: '氏名を入力してください',
  errFullNameMin: '氏名は2文字以上で入力してください',
  errPhoneRequired: '電話番号を入力してください',
  errPhoneInvalid: '電話番号が無効です（10桁）',
  errBirthRequired: '生年月日を入力してください',
  errBirthPast: '生年月日は過去の日付を指定してください',
  errGenderRequired: '性別を選択してください',
  errCccdRequired: '身分証またはパスポート番号を入力してください',
  errCccdInvalid: '身分証またはパスポート番号が無効です',
  errProvinceRequired: '省 / 市を選択してください',
  errWardRequired: '坊 / 社を選択してください',
  errAddressDetailRequired: '詳細住所を入力してください',
  loadingLocations: '住所データを読み込み中…',
  locationLoadError: '住所データを取得できませんでした。再試行してください。',

  // Success
  successTitle: '受付が完了しました！',
  successThanks: 'DYMメディカルセンターをご利用いただき誠にありがとうございます。',
  queueLabel: 'あなたの受付番号',
  successNote: 'この画面のスクリーンショットを保存し、受付でご提示ください。',
  btnNewTurn: '新しい番号を発行',
  summaryTitle: '登録情報の確認',

  // System & Network
  failedTitle: '登録に失敗しました',
  errorUrl: '登録サーバーが設定されていません。管理者にお問い合わせください。',
  requestTimeout: '処理がタイムアウトしました。もう一度お試しください。',
  saveError: '情報の保存中にエラーが発生しました。',
  networkError: 'サーバーに接続できません。ネットワーク接続をご確認ください。',
  noBranchError: 'クリニックの拠点が指定されていません。院内のQRコードを再度読み取ってください。',
};

