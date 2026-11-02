import {
  createDefaultTT25Data,
  getDefaultTargetPaymentByReason,
  type TT25RegistrationData,
} from '../../registration/tt25Types';
import { formatQueueNumber } from '../../../lib/queueNumber';
import type { BranchCode } from '../../../types/domain';
import type { RegistrationDetails } from '../types';

export function buildPrintData(
  targetRow: RegistrationDetails,
  branch: BranchCode,
): TT25RegistrationData {
  const extras = targetRow.tt25_data ?? {};
  const defaultReason = targetRow.company_name?.trim()
    ? 'Khám sức khỏe định kỳ theo công ty'
    : 'Khám sức khỏe cá nhân tự nguyện';
  const resolvedReason =
    extras.checkupReason && extras.checkupReason !== 'Khám sức khỏe tổng quát'
      ? extras.checkupReason
      : defaultReason;

  const wpWard = extras.workplaceWard || '';
  const wpProv = extras.workplaceProvince || '';
  const resolvedWorkplaceWard =
    wpProv && !wpWard.includes(wpProv)
      ? [wpWard, wpProv].filter(Boolean).join(', ')
      : wpWard;

  const parsedBirthDate =
    targetRow.birth_date && targetRow.birth_date.includes('/')
      ? targetRow.birth_date.split('/').reverse().join('-')
      : targetRow.birth_date;

  const rawId = (targetRow.identity_document || '').trim();
  const detectedLanguage: 'vi' | 'en' = extras.language === 'en' ? 'en' : 'vi';

  return createDefaultTT25Data({
    branch,
    fullName: targetRow.full_name,
    gender: (targetRow.gender as 'Nam' | 'Nữ') || 'Nam',
    birthDate: parsedBirthDate,
    ethnicity: extras.ethnicity || 'Kinh',
    bloodGroup: extras.bloodGroup || 'Chưa rõ',
    cccd: rawId,
    insuranceNumber: extras.insuranceNumber || '',
    province: targetRow.province || '',
    ward: targetRow.ward || '',
    addressDetail: targetRow.address_detail || '',
    occupation: extras.occupation || '',
    workplace: targetRow.company_name || '',
    workplaceWard: resolvedWorkplaceWard,
    phoneNumber: targetRow.phone_number || '',
    email: (extras.email as string) || '',
    checkupReason: resolvedReason,
    medicalHistory: extras.medicalHistory,
    targetPayment:
      extras.targetPayment ?? getDefaultTargetPaymentByReason(resolvedReason),
    consentAgreed: extras.consentAgreed ?? true,
    queueNumber: formatQueueNumber(targetRow.queue_number),
    checkupDate: targetRow.queue_date,
    language: detectedLanguage,
  });
}
