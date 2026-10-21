import type { TranslationDictionary } from './types';

export const en: TranslationDictionary = {
  title: 'Medical Registration',
  subtitle: 'Please fill in the information to get your queue number automatically',
  fullName: 'Full Name',
  phoneNumber: 'Phone Number',
  birthDate: 'Date of Birth',
  gender: 'Gender',
  genderNam: 'Male',
  genderNu: 'Female',
  cccd: 'Citizen ID / Passport',
  address: 'Address',
  companyName: 'Company Name',

  // Success
  successTitle: 'Registration Successful!',
  successThanks: 'DYM sincerely thanks you.',
  queueLabel: 'Your Queue Number',
  successNote: 'Please take a screenshot or save this queue number to present at the clinic reception.',
  btnNewTurn: 'Register New Turn',
  summaryTitle: 'Registration Summary',

  // System & Network
  failedTitle: 'Registration Failed',
  errorUrl: 'The registration server is not configured. Please contact an administrator.',
  requestTimeout: 'The request took too long. Please try again.',
  saveError: 'An error occurred while saving information.',
  networkError: 'Unable to connect to the server. Please check your network connection.',
  noBranchError: 'This registration link does not identify a branch. Please scan the QR code at the DYM location.',
};
