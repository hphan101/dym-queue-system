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
  province: 'Province / City',
  ward: 'Ward / Commune',
  addressDetail: 'Detailed Address (Street, No...)',
  selectProvince: 'Select Province / City',
  selectWard: 'Select Ward / Commune',
  btnSubmit: 'Confirm Registration',
  btnSubmitting: 'Processing...',
  placeholderCompany: 'Enter company name',
  placeholderCccd: 'Enter ID or passport number',
  placeholderAddressDetail: 'House number, alley, street name...',

  // Validation
  errFullNameRequired: 'Full name is required',
  errFullNameMin: 'Full name must be at least 2 characters',
  errPhoneRequired: 'Phone number is required',
  errPhoneInvalid: 'Invalid phone number (must be 10 digits)',
  errBirthRequired: 'Date of birth is required',
  errBirthPast: 'Date of birth must be in the past',
  errGenderRequired: 'Please select your gender',
  errCccdRequired: 'Citizen ID/Passport is required',
  errCccdInvalid: 'Invalid Citizen ID or Passport',
  errProvinceRequired: 'Please select a Province/City',
  errWardRequired: 'Please select a Ward/Commune',
  errAddressDetailRequired: 'Detailed address is required',
  loadingLocations: 'Loading the address list…',
  locationLoadError: 'The address list could not be loaded. Please tap again to retry.',

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

