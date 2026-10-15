export type SupportedLanguage = 'vi' | 'en' | 'ja';

export interface TranslationDictionary {
  // Form titles and subtitles
  title: string;
  subtitle: string;

  // Form field labels
  fullName: string;
  phoneNumber: string;
  birthDate: string;
  gender: string;
  genderNam: string;
  genderNu: string;
  cccd: string;
  address: string;
  companyName: string;
  province: string;
  ward: string;
  addressDetail: string;
  selectProvince: string;
  selectWard: string;

  // Form actions & placeholders
  btnSubmit: string;
  btnSubmitting: string;
  placeholderCompany: string;
  placeholderCccd: string;
  placeholderAddressDetail: string;

  // Validation errors
  errFullNameRequired: string;
  errFullNameMin: string;
  errPhoneRequired: string;
  errPhoneInvalid: string;
  errBirthRequired: string;
  errBirthPast: string;
  errGenderRequired: string;
  errCccdRequired: string;
  errCccdInvalid: string;
  errProvinceRequired: string;
  errWardRequired: string;
  errAddressDetailRequired: string;
  loadingLocations: string;
  locationLoadError: string;

  // Success view
  successTitle: string;
  successThanks: string;
  queueLabel: string;
  successNote: string;
  btnNewTurn: string;
  summaryTitle: string;

  // System & Network errors
  failedTitle: string;
  errorUrl: string;
  requestTimeout: string;
  saveError: string;
  networkError: string;
  noBranchError: string;
}

