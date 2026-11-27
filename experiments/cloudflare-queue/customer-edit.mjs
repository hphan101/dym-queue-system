import { hashRegistrationSession, SESSION_TOKEN_PATTERN } from '../../supabase/functions/_shared/registrationAccess.ts';
import { isWorkPermitCheckup, requiresCompanyName } from '../../frontend/src/features/registration/tt25Constants.ts';
import { testEmail, testPhone, testText } from './preview-data.mjs';
import { registrationAudit } from './reception-audit.mjs';
import { EMAIL_PATTERN, PHONE_PATTERN } from '../../supabase/functions/_shared/registrationPayload.ts';
import { isValidPassportName, usesPassport } from '../../supabase/functions/_shared/passportName.ts';

const editWindowMs = 10 * 60_000;
const fields = { fullName: 100, phoneNumber: 24, email: 120, province: 120, ward: 120, addressDetail: 250, workplace: 150 };
const requiredLengths = { fullName: 2, addressDetail: 3, province: 1, ward: 1 };
const response = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const lookup = 'from preview_registration_submissions p join preview_registration_sessions s using (token_hash) join registrations r on r.id = p.registration_id';
const eligible = 's.token_hash = ?1 and r.branch = ?2 and s.branch = r.branch';

export async function editPreviewRegistration(db, branch, body, now, notify, preview = true) {
  if (typeof body.sessionToken !== 'string' || !SESSION_TOKEN_PATTERN.test(body.sessionToken)) {
    return response({ code: 'EDIT_SESSION_INVALID' }, 403);
  }
  const session = await hashRegistrationSession(body.sessionToken);
  const read = db.prepare(
    "select r.queue_number, r.registered_at, r.demo_code, (r.state <> 'active' or coalesce(e.locked, r.called_at is not null)) as locked, e.details " +
    lookup + ' left join preview_registration_edits e on e.registration_id = r.id where ' + eligible,
  ).bind(session, branch);

  let row;
  if (body.changes === undefined) {
    row = await read.first();
  } else {
    if (!body.changes || typeof body.changes !== 'object' || Array.isArray(body.changes)) {
      return response({ code: 'INVALID_DATA' }, 400);
    }
    const changes = {};
    for (const [field, input] of Object.entries(body.changes)) {
      if (!Object.hasOwn(fields, field) || typeof input !== 'string') return response({ code: 'INVALID_DATA' }, 400);
      let value = input.trim().normalize('NFC');
      if (value.length < (requiredLengths[field] ?? 0) || value.length > fields[field] || /[\x00-\x1f\x7f-\x9f]/.test(value)) {
        return response({ code: 'INVALID_DATA', field }, 400);
      }
      if (field === 'phoneNumber') {
        if (value && !/^[0-9 ()+.-]+$/.test(value)) return response({ code: 'INVALID_DATA', field }, 400);
        if (value) {
          value = value.replace(/\D/g, '');
          if (!(preview ? testPhone(value) : PHONE_PATTERN.test(value))) return response({ code: 'INVALID_DATA', field }, 400);
        }
      }
      if (field === 'email' && value && !(preview ? testEmail(value) : EMAIL_PATTERN.test(value))) {
        return response({ code: 'INVALID_DATA', field }, 400);
      }
      if (preview && (field === 'fullName' || field === 'addressDetail' || (field === 'workplace' && value)) && !testText(value)) {
        return response({ code: 'INVALID_DATA', field }, 400);
      }
      changes[field] = value;
    }
    const [write, , saved] = await db.batch([
      db.prepare(
        'insert into preview_registration_edits (registration_id, details) select r.id, ?3 ' + lookup +
        ' left join preview_registration_edits e on e.registration_id = r.id where ' + eligible +
        " and r.registered_at > ?4 and r.state = 'active' and r.called_at is null and ?3 <> '{}'" +
        " and (not ?5 or (?3 ->> '$.fullName') = (e.details ->> '$.fullName') or" +
        " coalesce(e.details ->> '$.tt25.identityDocumentType', case when length(trim(r.demo_code)) = 12" +
        " and trim(r.demo_code) not glob '*[^0-9]*' then 'cccd' else 'passport' end) <> 'passport')" +
        " and (coalesce(?3 ->> '$.phoneNumber', '-') <> '' or lower(e.details ->> '$.tt25.checkupReason') like '%work permit%')" +
        " and (coalesce(?3 ->> '$.workplace', '-') <> '' or (" +
        " coalesce(e.details ->> '$.tt25.checkupReason', '') not like '%doanh nghiệp%'" +
        " and coalesce(e.details ->> '$.tt25.checkupReason', '') not like '%công ty%'))" +
        ' on conflict (registration_id) do update set details = json_patch(details, excluded.details)' +
        ' where locked = 0 and details <> json_patch(details, excluded.details)',
      ).bind(session, branch, JSON.stringify(changes), now - editWindowMs,
        Number(changes.fullName !== undefined && !isValidPassportName(changes.fullName))),
      registrationAudit(db, 'registration.customer_details_updated', now, null, session),
      read,
    ]);
    row = saved.results[0];
    if (write.meta.changes > 0) notify(branch);
  }
  if (!row) return response({ code: 'EDIT_SESSION_INVALID' }, 403);
  if (row.registered_at + editWindowMs <= now) return response({ code: 'EDIT_SESSION_EXPIRED' }, 409);
  if (row.locked) return response({ code: 'EDIT_LOCKED' }, 409);
  const stored = JSON.parse(row.details ?? '{}');
  const changedName = body.changes?.fullName?.trim();
  if (changedName !== undefined && changedName !== stored.fullName && !isValidPassportName(changedName)
    && usesPassport(stored.tt25?.identityDocumentType, row.demo_code)) {
    return response({ code: 'INVALID_PASSPORT_NAME', field: 'fullName' }, 400);
  }
  const reason = stored.tt25?.checkupReason ?? '';
  const phoneRequired = !isWorkPermitCheckup(reason);
  const companyRequired = requiresCompanyName(reason);
  if (phoneRequired && body.changes?.phoneNumber?.trim() === '') return response({ code: 'INVALID_DATA', field: 'phoneNumber' }, 400);
  if (companyRequired && body.changes?.workplace?.trim() === '') return response({ code: 'INVALID_DATA', field: 'workplace' }, 400);
  const details = {
    fullName: 'KHÁCH THỬ ' + row.queue_number, phoneNumber: '0000000000', email: '',
    province: 'Thành phố Hồ Chí Minh', ward: 'Phường Tân Mỹ', addressDetail: 'Địa chỉ thử', workplace: '',
  };
  for (const field of Object.keys(fields)) {
    if (Object.hasOwn(stored, field)) details[field] = stored[field];
  }
  return response({
    success: true,
    phoneRequired,
    companyRequired,
    details,
  });
}
