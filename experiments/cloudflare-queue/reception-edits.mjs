import { isWorkPermitCheckup, requiresCompanyName } from '../../frontend/src/features/registration/tt25Constants.ts';
import { testPhone, testText } from './preview-data.mjs';
import { clean, previewIdentity, readTT25 } from './preview-registration-data.mjs';
import { staffCan } from './staff.mjs';
import { registrationAudit } from './reception-audit.mjs';
import { PHONE_PATTERN } from '../../supabase/functions/_shared/registrationPayload.ts';
import { validateVietnamCccd } from '../../frontend/src/features/registration/form/cccdValidator.ts';

const response = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const denied = () => response({ code: 'ACCESS_DENIED', message: 'Tài khoản không được sửa hồ sơ này.' }, 403);
const invalid = () => response({ code: 'INVALID_DATA', message: 'Thông tin hồ sơ không hợp lệ.' }, 400);
const testOnly = () => response({ code: 'PREVIEW_DATA_REQUIRED', message: 'Chỉ dùng thông tin giả trên bản thử.' }, 400);

const historySections = [
  ['familyHistory', 'hasDisease', 'diseaseDetails'],
  ['currentTreatment', 'isTreating', 'medications'],
  ['pregnancyHistory', 'hasHistory', 'details'],
];
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const comparableJSON = value => JSON.stringify(value, (_, item) => isObject(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

async function updateMedicalHistory(db, id, branches, args, staff, now, notify, preview) {
  const history = args.p_history;
  if (!isObject(history) || !isObject(history.personalHistory) || !clean(history.personalOtherDetails, 0, 300)
    || Object.keys(history).some(key => !['personalHistory', 'personalOtherDetails'].includes(key)
      && !historySections.some(([section]) => section === key))
    || Object.entries(history.personalHistory).some(([key, value]) => !/^([1-9]|1[0-9]|2[0-2])$/.test(key) || typeof value !== 'boolean')) return invalid();
  for (const [section, answer, notes] of historySections) {
    if (section === 'pregnancyHistory' && !Object.hasOwn(history, section)) continue;
    const value = history[section];
    if (!isObject(value) || Object.keys(value).length !== 2 || (value[answer] !== null && typeof value[answer] !== 'boolean')
      || !clean(value[notes], 0, 300)) return invalid();
  }
  const notes = [history.personalOtherDetails, ...historySections.map(([section, , key]) => history[section]?.[key] ?? '')];
  if (preview && notes.some(value => value.trim() && !testText(value))) return testOnly();

  const read = db.prepare(`select r.branch, json_extract(e.details, '$.tt25.medicalHistory') as history
    from registrations r left join preview_registration_edits e on e.registration_id = r.id
    where r.id = ? and r.branch in (select value from json_each(?))`).bind(id, branches);
  const before = await read.first();
  if (!before) return denied();
  const current = before.history === null ? null : JSON.parse(before.history);
  const next = { ...history, commitmentAgreed: current?.commitmentAgreed === true };
  if (comparableJSON(next) === comparableJSON(current)) return response(current);
  const expected = args.p_expected_history;
  if (comparableJSON(expected) !== comparableJSON(current)) {
    return response({ code: '40001', message: 'MEDICAL_HISTORY_CHANGED' }, 409);
  }
  const [write, , readAfter] = await db.batch([
    db.prepare(`insert into preview_registration_edits (registration_id, details)
      select r.id, json_object('tt25', json_object('medicalHistory', json(?2)))
      from registrations r left join preview_registration_edits e on e.registration_id = r.id
      where r.id = ?1 and r.branch in (select value from json_each(?3))
        and json_extract(e.details, '$.tt25.medicalHistory') is ?4
      on conflict (registration_id) do update set details = json_set(details, '$.tt25',
        json_set(coalesce(json_extract(details, '$.tt25'), '{}'), '$.medicalHistory', json(?2)))`)
      .bind(id, JSON.stringify(next), branches, before.history),
    registrationAudit(db, 'registration.medical_history_updated', now, staff.id, id),
    read,
  ]);
  const saved = readAfter.results[0];
  if (!saved) return denied();
  if (!write.meta.changes && saved.history !== JSON.stringify(next)) {
    return response({ code: '40001', message: 'MEDICAL_HISTORY_CHANGED' }, 409);
  }
  if (write.meta.changes) notify(saved.branch);
  return response(JSON.parse(saved.history));
}

export async function updatePreviewRegistration(db, path, args, staff, now, notify, preview = true) {
  if (!staffCan(staff, 'registrations', 'update')) return denied();
  const id = args?.p_registration_id;
  if (!clean(id, 1, 64)) return invalid();
  const branches = JSON.stringify(staff.branches);
  if (path === 'rpc/update_registration_medical_history') {
    return updateMedicalHistory(db, id, branches, args, staff, now, notify, preview);
  }
  if (path === 'rpc/update_registration_reception_note') {
    const note = typeof args.p_note === 'string' ? args.p_note.trim() : null;
    const expected = args.p_expected_note;
    if (note === null || note.length > 500 || typeof expected !== 'string' || expected.length > 500
      || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(note)) return invalid();
    if (preview && note && !/^[\d\s.,-]+$/.test(note) && !testText(note)) return testOnly();

    const [write, , read] = await db.batch([
      db.prepare(
        "insert into preview_registration_edits (registration_id, details) select r.id, json_object('receptionNote', ?2) " +
        "from registrations r left join preview_registration_edits e on e.registration_id = r.id " +
        "where r.id = ?1 and r.branch in (select value from json_each(?4)) " +
        "and coalesce(e.details ->> '$.receptionNote', '') = ?3 and coalesce(e.details ->> '$.receptionNote', '') <> ?2 " +
        "on conflict(registration_id) do update set details = json_set(details, '$.receptionNote', ?2)",
      ).bind(id, note, expected, branches),
      registrationAudit(db, 'registration.note_updated', now, staff.id, id),
      db.prepare(
        "select r.branch, coalesce(e.details ->> '$.receptionNote', '') as note from registrations r " +
        'left join preview_registration_edits e on e.registration_id = r.id where r.id = ? and r.branch in (select value from json_each(?))',
      ).bind(id, branches),
    ]);
    const row = read.results[0];
    if (!row) return denied();
    if (row.note !== note) return response({ code: '40001', message: 'NOTE_CHANGED' }, 409);
    if (write.meta.changes) notify(row.branch);
    return response(row.note);
  }

  const fields = {
    fullName: ['p_full_name', 2, 100], phoneNumber: ['p_phone_number', 0, 10],
    identityDocument: ['p_identity_document', preview ? 6 : 1, preview ? 29 : 100],
    workplace: ['p_company_name', 0, 150], province: ['p_province', 1, 120], ward: ['p_ward', 1, 120],
    addressDetail: ['p_address_detail', 3, 250],
  };
  const details = {};
  for (const [key, [field, min, max]] of Object.entries(fields)) {
    if (!clean(args[field], min, max)) return invalid();
    details[key] = args[field].trim();
  }
  details.identityDocument = details.identityDocument.toUpperCase();
  const birthDate = args.p_birth_date;
  const gender = args.p_gender;
  if (!['Nam', 'Nữ'].includes(gender) || typeof birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)
    || birthDate < '1900-01-01' || new Date(birthDate).toJSON()?.slice(0, 10) !== birthDate) return invalid();

  const tt25 = readTT25(args.p_tt25_data, gender, preview);
  if (!tt25) return invalid();
  let existing;
  if (preview) {
    if (!testText(details.fullName) || !testText(details.addressDetail) || (details.workplace && !testText(details.workplace))
      || !previewIdentity(details.identityDocument, tt25.identityDocumentType ?? 'passport', birthDate, gender)
      || (!testPhone(details.phoneNumber) && !(details.phoneNumber === '' && isWorkPermitCheckup(tt25.checkupReason ?? '')))) {
      return testOnly();
    }
    if (requiresCompanyName(tt25.checkupReason ?? '') && !details.workplace) return invalid();
  } else {
    existing = await db.prepare(
      "select e.details ->> '$.tt25.identityDocumentType' as type, e.details ->> '$.tt25.checkupReason' as reason " +
      'from registrations r left join preview_registration_edits e on e.registration_id = r.id ' +
      'where r.id = ? and r.branch in (select value from json_each(?))',
    ).bind(id, branches).first();
    if (!existing) return denied();
    const type = tt25.identityDocumentType ?? existing.type;
    const reason = tt25.checkupReason ?? existing.reason ?? '';
    if (validateVietnamCccd({ cccd: details.identityDocument, identityDocumentType: type, birthDate, gender })
      || (!PHONE_PATTERN.test(details.phoneNumber) && !(details.phoneNumber === '' && isWorkPermitCheckup(reason)))) return invalid();
  }

  const [write, , read] = await db.batch([
    db.prepare(`
      insert into preview_registration_edits (registration_id, details)
      select r.id, ?2 from registrations r left join preview_registration_edits e on e.registration_id = r.id
      where r.id = ?1 and r.branch in (select value from json_each(?3)) and r.queue_date >= ?4
        and (?5 or (e.details ->> '$.tt25.identityDocumentType') is ?6)
        and (?7 or (e.details ->> '$.tt25.checkupReason') is ?8)
      on conflict(registration_id) do update set details = json_patch(details, excluded.details)
    `).bind(id, JSON.stringify({ ...details, birthDate, gender, tt25 }), branches, birthDate,
      Number(preview || tt25.identityDocumentType !== undefined), existing?.type ?? null,
      Number(preview || tt25.checkupReason !== undefined), existing?.reason ?? null),
    registrationAudit(db, 'registration.details_updated', now, staff.id, id),
    db.prepare('select branch from registrations where id = ? and branch in (select value from json_each(?))').bind(id, branches),
  ]);
  const row = read.results[0];
  if (!row) return denied();
  if (!write.meta.changes) return invalid();
  notify(row.branch);
  return response(null);
}
