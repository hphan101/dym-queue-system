import { getInvalidPayloadField, parsePayload } from '../../supabase/functions/_shared/registrationPayload.ts';

export function readRegistration(body, day) {
  const invalidFields = [];
  const payload = parsePayload(body, invalidFields);
  if (!payload) return { field: invalidFields[0] ?? 'form' };
  const field = getInvalidPayloadField(payload);
  if (field) return { field };
  if (payload.birthDate > day) return { field: 'birthDate' };
  const { email = '', ...tt25 } = payload.tt25Extras;
  tt25.identityDocumentType ??= /^\d{12}$/.test(payload.cccd) ? 'cccd' : 'passport';
  return {
    payload,
    document: payload.cccd,
    details: {
      fullName: payload.fullName.toUpperCase(),
      birthDate: payload.birthDate,
      gender: payload.gender,
      phoneNumber: payload.phoneNumber,
      email,
      province: payload.province,
      ward: payload.ward,
      addressDetail: payload.addressDetail,
      workplace: payload.companyName,
      tt25,
    },
  };
}
