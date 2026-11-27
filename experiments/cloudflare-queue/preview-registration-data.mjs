import { CHECKUP_REASONS, isWorkPermitCheckup, requiresCompanyName } from '../../frontend/src/features/registration/tt25Constants.ts';
import { CONSENT_FORM_VERSION, PREGNANCY_STATUS_LABELS } from '../../frontend/src/features/registration/tt25Types.ts';
import { validateVietnamCccd } from '../../frontend/src/features/registration/form/cccdValidator.ts';
import { isValidPassportName } from '../../supabase/functions/_shared/passportName.ts';
import { testEmail, testPhone, testText } from './preview-data.mjs';

export const clean = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max
  && !/[\x00-\x1f\x7f-\x9f]/.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validReasons = [...CHECKUP_REASONS, 'Khám sức khỏe cá nhân tự nguyện', 'Khám sức khỏe định kỳ theo công ty'];
const examLocations = ['cs_kbcb', 'kham_luu_dong', 'tram_y_te', 'truong_hoc', 'ksk_tai_nha'];

export function previewIdentity(document, type, birthDate, gender) {
  if (typeof document !== 'string') return false;
  if (type === 'passport') return /^DEMO-[A-Z0-9-]{1,24}$/.test(document);
  return type === 'cccd' && /^000\d{9}$/.test(document)
    && !validateVietnamCccd({ cccd: document, identityDocumentType: 'cccd', birthDate, gender, allowPreviewCode: true });
}

export function readTT25(input, gender, preview = true) {
  if (input == null) return {};
  if (!record(input)) return null;
  const result = {};
  for (const key of ['occupation', 'workplaceProvince', 'workplaceWard']) {
    if (input[key] === undefined) continue;
    if (!clean(input[key], 0, 160)) return null;
    result[key] = input[key].trim();
  }
  if (input.identityDocumentType !== undefined) {
    if (!['cccd', 'passport'].includes(input.identityDocumentType)) return null;
    result.identityDocumentType = input.identityDocumentType;
  }
  if (input.checkupReason !== undefined) {
    if (preview ? !validReasons.includes(input.checkupReason) : !clean(input.checkupReason, 0, 160)) return null;
    result.checkupReason = input.checkupReason.trim();
  }
  if (input.pregnancyStatus != null && (typeof input.pregnancyStatus !== 'string'
    || !Object.hasOwn(PREGNANCY_STATUS_LABELS, input.pregnancyStatus))) return null;
  if (gender === 'Nam' || input.pregnancyStatus !== undefined) {
    result.pregnancyStatus = gender === 'Nam' ? null : input.pregnancyStatus;
  }
  if (input.targetPayment !== undefined) {
    const payment = input.targetPayment;
    if (!record(payment) || !['14', '15', '16', 'other'].includes(payment.targetGroup)
      || !['employer', 'self', 'other'].includes(payment.paymentSource)
      || !examLocations.includes(payment.examLocation)
      || !clean(payment.targetOtherDetails, 0, 200) || !clean(payment.paymentOtherDetails, 0, 200)) return null;
    const { targetGroup, paymentSource, examLocation } = payment;
    const targetOtherDetails = payment.targetOtherDetails.trim();
    const paymentOtherDetails = payment.paymentOtherDetails.trim();
    if (preview && ((targetOtherDetails && !testText(targetOtherDetails)) || (paymentOtherDetails && !testText(paymentOtherDetails)))) return null;
    result.targetPayment = { targetGroup, targetOtherDetails, paymentSource, paymentOtherDetails, examLocation };
  }
  return result;
}

function readHistory(input, gender) {
  if (!record(input) || input.commitmentAgreed !== true) return null;
  const {
    familyHistory, personalHistory, personalOtherDetails,
    currentTreatment, pregnancyHistory,
  } = input;
  if (!record(familyHistory) || !record(personalHistory) || !record(currentTreatment)
    || (gender === 'Nữ' && !record(pregnancyHistory))) return null;
  const text = [
    familyHistory.diseaseDetails, personalOtherDetails, currentTreatment.medications, pregnancyHistory?.details ?? '',
  ];
  if (!text.every(value => clean(value, 0, 300) && (!value.trim() || testText(value)))) return null;
  const conditions = Object.fromEntries(Array.from({ length: 22 }, (_, i) => [String(i + 1), personalHistory[i + 1] === true]));
  const result = {
    familyHistory: { hasDisease: familyHistory.hasDisease === true, diseaseDetails: familyHistory.diseaseDetails.trim() },
    personalHistory: conditions, personalOtherDetails: personalOtherDetails.trim(),
    currentTreatment: { isTreating: currentTreatment.isTreating === true, medications: currentTreatment.medications.trim() },
    commitmentAgreed: true,
  };
  if (gender === 'Nữ') result.pregnancyHistory = {
    hasHistory: pregnancyHistory.hasHistory === true, details: pregnancyHistory.details.trim(),
  };
  return result;
}

export function readPreviewRegistration(body, day) {
  const assignments = {
    fullName: [2, 100], addressDetail: [3, 250], province: [1, 120], ward: [1, 120],
    birthDate: [10, 10], phoneNumber: [0, 24], email: [0, 120], companyName: [0, 150], cccd: [1, 29],
  };
  const values = {};
  for (const [key, [min, max]] of Object.entries(assignments)) {
    const value = key === 'email' ? body[key] ?? '' : body[key];
    if (!clean(value, min, max)) return { field: key };
    values[key] = value.trim();
  }
  const { birthDate } = values;
  const { gender } = body;
  if (!['Nam', 'Nữ'].includes(gender)) return { field: 'gender' };
  const age = Number(day.slice(0, 4)) - Number(birthDate.slice(0, 4)) - Number(day.slice(5) < birthDate.slice(5));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || new Date(birthDate).toJSON()?.slice(0, 10) !== birthDate
    || birthDate < '1900-01-01' || age < 18) return { field: 'birthDate' };
  for (const field of ['fullName', 'addressDetail', 'companyName']) {
    if (values[field] && !testText(values[field])) return { field };
  }
  const document = values.cccd.toUpperCase();
  if (!previewIdentity(document, body.identityDocumentType, birthDate, gender)) return { field: 'cccd' };
  if (body.identityDocumentType === 'passport' && !isValidPassportName(values.fullName)) return { field: 'fullName' };
  const tt25 = readTT25(body, gender);
  if (!tt25 || !CHECKUP_REASONS.includes(tt25.checkupReason) || !tt25.targetPayment) return { field: 'checkupReason' };
  if (gender === 'Nữ' && !tt25.pregnancyStatus) return { field: 'pregnancyStatus' };
  const phoneNumber = values.phoneNumber.replace(/\D/g, '');
  if (!(testPhone(phoneNumber) || (!values.phoneNumber && isWorkPermitCheckup(tt25.checkupReason)))) return { field: 'phoneNumber' };
  if (values.email && !testEmail(values.email)) return { field: 'email' };
  if (requiresCompanyName(tt25.checkupReason) && !values.companyName) return { field: 'companyName' };
  const history = readHistory(body.medicalHistory, gender);
  if (!history) return { field: 'medicalHistory' };
  if (typeof body.consentAgreed !== 'boolean' || typeof body.advertisingConsentAgreed !== 'boolean'
    || body.consentFormVersion !== CONSENT_FORM_VERSION || !['vi', 'en', 'ja'].includes(body.language)) return { field: 'consent' };
  for (const [key, limit] of [['ethnicity', 60], ['bloodGroup', 20], ['insuranceNumber', 30]]) {
    if (!clean(body[key] ?? '', 0, limit)) return { field: key };
    tt25[key] = (body[key] ?? '').trim();
  }
  if (tt25.insuranceNumber && !/^0{10}\d{0,5}$/.test(tt25.insuranceNumber)) return { field: 'insuranceNumber' };
  return {
    document,
    details: {
      fullName: values.fullName, birthDate, gender, phoneNumber, email: values.email,
      province: values.province, ward: values.ward, addressDetail: values.addressDetail, workplace: values.companyName,
      tt25: { ...tt25, medicalHistory: history, consentAgreed: body.consentAgreed, advertisingConsentAgreed: body.advertisingConsentAgreed,
        consentFormVersion: CONSENT_FORM_VERSION, language: body.language },
    },
  };
}
