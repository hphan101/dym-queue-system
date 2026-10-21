export type SupportedLanguage = 'vi' | 'en';

export interface TranslationDictionary {
  // Form titles and subtitles
  title: string;
  subtitle: string;

  // Summary field labels
  fullName: string;
  phoneNumber: string;
  birthDate: string;
  gender: string;
  genderNam: string;
  genderNu: string;
  cccd: string;
  address: string;
  companyName: string;

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
