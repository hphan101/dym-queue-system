import { isRecord, isSafeText } from "./http.ts";
import { isValidPassportName, usesPassport } from "./passportName.ts";

export const PHONE_PATTERN = /^0(3|5|7|8|9)[0-9]{8}$/;
export const EMAIL_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
const IDENTITY_PATTERN = /^([0-9]{12}|[A-Z][A-Z0-9]{6,12})$/;
const BRANCHES = new Set(["q1", "q7", "hn"]);
const GENDERS = new Set(["Nam", "Nữ"]);
const PREGNANCY_STATUSES = new Set(["not_pregnant", "suspected", "pregnant"]);
const CONSENT_FORM_VERSION = "DYM.PRO.09.FOR.02.03-2026-11-19";
const VALID_CCCD_PROVINCE_CODES = new Set([
  "001", "002", "004", "006", "008", "010", "011", "012", "014", "015",
  "017", "019", "020", "022", "024", "025", "026", "027", "030", "031",
  "033", "034", "035", "036", "037", "038", "040", "042", "044", "045",
  "046", "048", "049", "051", "052", "054", "056", "058", "060", "062",
  "064", "066", "067", "068", "070", "072", "074", "075", "077", "079",
  "080", "082", "083", "084", "086", "087", "089", "091", "092", "093",
  "094", "095", "096",
]);

export interface RegistrationPayload {
  branch: string;
  fullName: string;
  phoneNumber: string;
  birthDate: string;
  gender: string;
  cccd: string;
  province: string;
  ward: string;
  addressDetail: string;
  companyName: string;
  honeypot: string;
  tt25Extras: Record<string, unknown>;
}

function stringField(
  source: Record<string, unknown>,
  key: string,
  optional = false,
): string | null {
  const value = source[key];
  if (value === undefined && optional) return "";
  return typeof value === "string" ? value.trim().normalize("NFC") : null;
}

function sanitizeNestedText(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .trim()
    .slice(0, maxLen);
  return isSafeText(cleaned, 0, maxLen) ? cleaned : "";
}

function sanitizeMedicalHistory(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const familyRaw = isRecord(raw.familyHistory) ? raw.familyHistory : {};
  const personalRaw = isRecord(raw.personalHistory) ? raw.personalHistory : {};
  const treatmentRaw = isRecord(raw.currentTreatment)
    ? raw.currentTreatment
    : {};
  const pregnancyRaw = isRecord(raw.pregnancyHistory)
    ? raw.pregnancyHistory
    : null;

  const personalHistory: Record<string, boolean> = {};
  for (let i = 1; i <= 22; i++) {
    const key = String(i);
    personalHistory[key] = Boolean(personalRaw[key]);
  }

  const result: Record<string, unknown> = {
    familyHistory: {
      hasDisease: Boolean(familyRaw.hasDisease),
      diseaseDetails: sanitizeNestedText(familyRaw.diseaseDetails, 300),
    },
    personalHistory,
    personalOtherDetails: sanitizeNestedText(raw.personalOtherDetails, 300),
    currentTreatment: {
      isTreating: Boolean(treatmentRaw.isTreating),
      medications: sanitizeNestedText(treatmentRaw.medications, 300),
    },
    commitmentAgreed: Boolean(raw.commitmentAgreed),
  };

  if (pregnancyRaw) {
    result.pregnancyHistory = {
      hasHistory: Boolean(pregnancyRaw.hasHistory),
      details: sanitizeNestedText(pregnancyRaw.details, 300),
    };
  }

  return result;
}

function sanitizeTargetPayment(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const validGroups = new Set(["14", "15", "16", "other"]);
  const validSources = new Set(["employer", "self", "other"]);
  const validLocations = new Set([
    "cs_kbcb",
    "kham_luu_dong",
    "tram_y_te",
    "truong_hoc",
    "ksk_tai_nha",
  ]);

  const targetGroup =
    typeof raw.targetGroup === "string" && validGroups.has(raw.targetGroup)
      ? raw.targetGroup
      : "15";
  const paymentSource =
    typeof raw.paymentSource === "string" && validSources.has(raw.paymentSource)
      ? raw.paymentSource
      : "employer";
  const examLocation =
    typeof raw.examLocation === "string" && validLocations.has(raw.examLocation)
      ? raw.examLocation
      : "cs_kbcb";

  return {
    targetGroup,
    targetOtherDetails: sanitizeNestedText(raw.targetOtherDetails, 200),
    paymentSource,
    paymentOtherDetails: sanitizeNestedText(raw.paymentOtherDetails, 200),
    examLocation,
  };
}

export function parsePayload(value: unknown, invalidFields: string[] = []): RegistrationPayload | null {
  if (!isRecord(value)) return null;

  const branch = stringField(value, "branch");
  const fullName = stringField(value, "fullName");
  const phoneNumber = stringField(value, "phoneNumber", true);
  const cleanPhone = (phoneNumber ?? "").replace(/[^0-9]/g, "");
  const email = stringField(value, "email", true);
  const birthDate = stringField(value, "birthDate");
  const gender = stringField(value, "gender");
  const pregnancyStatus = stringField(value, "pregnancyStatus", true);
  const usesCurrentConsentForm = value.consentFormVersion === CONSENT_FORM_VERSION;
  const cccd = stringField(value, "cccd");
  const identityDocumentType = value.identityDocumentType;
  const province = stringField(value, "province");
  const ward = stringField(value, "ward");
  const addressDetail = stringField(value, "addressDetail");
  const companyName = stringField(value, "companyName", true);
  const honeypot = stringField(value, "honeypot", true);

  if (email === null || (email !== "" && (!isSafeText(email, 1, 120) || !EMAIL_PATTERN.test(email)))) {
    invalidFields.push("email");
    return null;
  }
  if (gender === "Nữ" && (usesCurrentConsentForm || value.pregnancyStatus !== undefined)
    && (pregnancyStatus === null || !PREGNANCY_STATUSES.has(pregnancyStatus))) {
    invalidFields.push("pregnancyStatus");
    return null;
  }

  if (
    branch === null ||
    fullName === null ||
    phoneNumber === null ||
    (phoneNumber !== "" && !cleanPhone) ||
    birthDate === null ||
    gender === null ||
    cccd === null ||
    (identityDocumentType !== undefined && identityDocumentType !== "cccd" && identityDocumentType !== "passport") ||
    province === null ||
    ward === null ||
    addressDetail === null ||
    companyName === null ||
    honeypot === null
  ) {
    return null;
  }

  const tt25Extras: Record<string, unknown> = {};
  if (identityDocumentType) tt25Extras.identityDocumentType = identityDocumentType;
  if (gender === "Nữ" && pregnancyStatus) tt25Extras.pregnancyStatus = pregnancyStatus;
  const optionalTextFields: Array<[string, number]> = [
    ["ethnicity", 60],
    ["bloodGroup", 20],
    ["insuranceNumber", 30],
    ["occupation", 120],
    ["workplaceProvince", 120],
    ["workplaceWard", 160],
    ["checkupReason", 160],
    ["language", 20],
  ];

  for (const [key, maxLen] of optionalTextFields) {
    const val = stringField(value, key, true);
    if (val !== null && val.length <= maxLen && isSafeText(val, 0, maxLen)) {
      tt25Extras[key] = val;
    }
  }
  if (email) tt25Extras.email = email;

  if (isRecord(value.medicalHistory)) {
    tt25Extras.medicalHistory = sanitizeMedicalHistory(value.medicalHistory);
  }
  if (isRecord(value.targetPayment)) {
    tt25Extras.targetPayment = sanitizeTargetPayment(value.targetPayment);
  }
  if (typeof value.consentAgreed === "boolean") {
    tt25Extras.consentAgreed = value.consentAgreed;
  }
  if (typeof value.advertisingConsentAgreed === "boolean") {
    tt25Extras.advertisingConsentAgreed = value.advertisingConsentAgreed;
    tt25Extras.consentFormVersion = usesCurrentConsentForm
      ? CONSENT_FORM_VERSION
      : "DYM.PRO.09.FOR.02.03-2026-11-18";
  }

  return {
    branch: branch.toLowerCase(),
    fullName,
    phoneNumber: cleanPhone,
    birthDate,
    gender,
    cccd: cccd.toUpperCase(),
    province,
    ward,
    addressDetail,
    companyName,
    honeypot,
    tt25Extras,
  };
}

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    year >= 1900 &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isValidIdentityDocument(
  cccd: string,
  gender: string,
  birthDate: string,
): boolean {
  if (!IDENTITY_PATTERN.test(cccd)) return false;

  // Foreign passport starting with an uppercase letter
  if (/^[A-Z][A-Z0-9]{6,12}$/.test(cccd)) {
    return true;
  }

  // 12-digit Vietnamese CCCD rules
  if (!/^\d{12}$/.test(cccd)) return false;

  const provinceCode = cccd.slice(0, 3);
  if (!VALID_CCCD_PROVINCE_CODES.has(provinceCode)) return false;

  const birthYear = Number(birthDate.slice(0, 4));
  if (!Number.isFinite(birthYear) || birthYear < 1900 || birthYear > 2399) {
    return false;
  }

  const centuryIndex = Math.floor((birthYear - 1900) / 100);
  const expectedGenderDigit = centuryIndex * 2 + (gender === "Nữ" ? 1 : 0);
  if (Number(cccd[3]) !== expectedGenderDigit) {
    return false;
  }

  const expectedYearCode = String(birthYear).slice(-2);
  if (cccd.slice(4, 6) !== expectedYearCode) {
    return false;
  }

  return true;
}

export function getInvalidPayloadField(payload: RegistrationPayload): string | undefined {
  const checkupReason = String(payload.tt25Extras.checkupReason ?? "");
  if (!BRANCHES.has(payload.branch)) return "branch";
  if (!isSafeText(payload.fullName, 2, 100)) return "fullName";
  if (!isValidDate(payload.birthDate)) return "birthDate";
  if (!GENDERS.has(payload.gender)) return "gender";
  const validDocument = payload.tt25Extras.identityDocumentType === "passport"
    ? isSafeText(payload.cccd, 1, 100)
    : (payload.tt25Extras.identityDocumentType !== "cccd" || /^\d{12}$/.test(payload.cccd)) &&
      isValidIdentityDocument(payload.cccd, payload.gender, payload.birthDate);
  if (!validDocument) return "cccd";
  if (usesPassport(payload.tt25Extras.identityDocumentType, payload.cccd)
    && !isValidPassportName(payload.fullName)) return "fullName";
  if (!PHONE_PATTERN.test(payload.phoneNumber)
    && (payload.phoneNumber !== "" || !/work permit/i.test(checkupReason))) return "phoneNumber";
  if (!isSafeText(payload.companyName, /công ty|doanh nghiệp/i.test(checkupReason) ? 1 : 0, 150)) return "companyName";
  if (!isSafeText(payload.province, 1, 120)) return "province";
  if (!isSafeText(payload.ward, 1, 120)) return "ward";
  if (!isSafeText(payload.addressDetail, 3, 250)) return "addressDetail";
  if (!isSafeText(payload.honeypot, 0, 200)) return "honeypot";
}
