import { rosterPreviewApi } from './roster.mjs';
import { branchAllowed, previewBranches, staffCan } from './staff.mjs';
import { updatePreviewRegistration } from './reception-edits.mjs';

const denied = () => result({ code: 'ACCESS_DENIED', message: 'Tài khoản không có quyền thực hiện thao tác.' }, 403);

function result(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function callNext(db, branch, day, now, actorId = null) {
  return db.prepare(`
    update registrations set called_at = ?3, last_called_at = ?3, first_called_by = ?4, queue_actor_id = ?4
    where id = (
      select id from registrations
      where branch = ?1 and queue_date = ?2 and state = 'active' and called_at is null
      order by queue_number limit 1
    )
    returning id as registration_id, branch, queue_date, queue_number
  `).bind(branch, day, now, actorId).first();
}

export function readDisplay(db, branch) {
  return db.prepare(`
    select branch as branch_id, registration_id, queue_date, queue_number, revision,
      strftime('%Y-%m-%dT%H:%M:%fZ', called_at / 1000.0, 'unixepoch') as called_at
    from display_state where branch = ?
  `).bind(branch).first();
}

export async function registrationNotice(db, branch, id, staff) {
  if (!staff) return result({ code: 'AUTH_REQUIRED' }, 401);
  if (!branchAllowed(staff, branch) || !(staffCan(staff, 'reception') || staffCan(staff, 'registrations'))) return denied();
  if (!/^[0-9a-f-]{36}$/.test(id ?? '')) return result({ code: 'NOT_FOUND' }, 404);
  const row = await db.prepare(`
    select r.id, r.queue_date, r.queue_number,
      coalesce(e.details ->> '$.fullName', 'KHÁCH THỬ ' || r.queue_number) as full_name
    from registrations r left join preview_registration_edits e on e.registration_id = r.id
    where r.id = ? and r.branch = ?
  `).bind(id, branch).first();
  return row ? result(row) : result({ code: 'NOT_FOUND' }, 404);
}

export async function receptionApi(request, env, day, now, notify, staff) {
  const url = new URL(request.url);
  const path = url.pathname.slice('/rest/v1/'.length);
  const preview = !env.DYM_APP_ORIGIN;
  const roster = await rosterPreviewApi(request, env.DB, path, url, day, now, staff, preview);
  if (roster) return roster;
  if (request.method === 'GET') {
    if (path === 'branches') {
      const query = url.searchParams.get('code');
      return result(previewBranches.filter(branch => !query || query === `eq.${branch}`).map(branch => ({ id: branch, code: branch })));
    }
    if (path === 'profiles' || path === 'staff_branch_access') {
      const user = url.searchParams.get('user_id');
      if (user && user !== 'eq.' + staff.id) return result([]);
      return result(path === 'profiles' ? [{
        user_id: staff.id, is_active: true, display_name: staff.displayName, role: staff.role,
        can_edit_roster_history: staff.canEditHistory,
        permissions: env.PERSONNEL_FILES ? staff.permissions : {
          ...staff.permissions, personnel_documents: { view: false, create: false, delete: false },
        },
      }] : staff.branches.map(branch => ({ branch_id: branch, user_id: staff.id })));
    }
    if (path === 'branch_display_state') {
      const branch = url.searchParams.get('branch_id')?.replace(/^eq\./, '');
      if (!previewBranches.includes(branch)) return result([]);
      const state = await readDisplay(env.DB, branch);
      if (!state) return result([]);
      const { registration_id, ...publicState } = state;
      return result([staff ? { registration_id, ...publicState } : publicState]);
    }
  }

  if (request.method !== 'POST') return result({ message: 'Chức năng chưa có trên bản thử.' }, 404);
  if (Number(request.headers.get('Content-Length')) > 64_000) return result({ code: 'INVALID_DATA' }, 413);
  const raw = await request.text();
  if (raw.length > 64_000) return result({ code: 'INVALID_DATA' }, 413);
  let args;
  try { args = JSON.parse(raw); } catch { args = null; }
  if (['rpc/update_registration_reception_note', 'rpc/update_registration_details', 'rpc/update_registration_medical_history'].includes(path)) {
    return updatePreviewRegistration(env.DB, path, args, staff, now, notify, preview);
  }
  if (path === 'rpc/get_reception_trend') {
    if (!staffCan(staff, 'overview')) return denied();
    const branch = args?.p_branch_code;
    const year = args?.p_year;
    if (branch != null && !branchAllowed(staff, branch)) return denied();
    if (!Number.isInteger(year) || year < 1900 || year > 2100) return result({ message: 'Năm không hợp lệ.' }, 400);
    const { results } = await env.DB.prepare(
      "select queue_date, count(*) as total from registrations where queue_date >= ? and queue_date < ? and state <> 'cancelled' " +
      'and branch in (select value from json_each(?)) group by queue_date order by queue_date',
    ).bind(year + '-01-01', (year + 1) + '-01-01', JSON.stringify(branch == null ? staff.branches : [branch])).all();
    return result(results);
  }
  if (path === 'rpc/get_registration_failures') {
    if (!staffCan(staff, 'overview')) return denied();
    const branch = args?.p_branch_code;
    const date = args?.p_queue_date;
    if (branch != null && !branchAllowed(staff, branch)) return denied();
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return result({ message: 'Ngày không hợp lệ.' }, 400);
    const { results } = await env.DB.prepare(`
      select kind, sum(total) as total from registration_failure_counts
      where queue_date = ? and branch in (select value from json_each(?)) group by kind
    `).bind(date, JSON.stringify(branch == null ? staff.branches : [branch])).all();
    return result(results);
  }
  if (path === 'rpc/update_registration_print_status') {
    if (!staffCan(staff, 'printing')) return denied();
    const id = args?.p_registration_id;
    const consent = args?.p_printed_consent;
    const tt25 = args?.p_printed_tt25;
    if (typeof id !== 'string' || (consent !== null && typeof consent !== 'boolean') || (tt25 !== null && typeof tt25 !== 'boolean')) {
      return result({ message: 'Thông tin in không hợp lệ.' }, 400);
    }
    const printed = await env.DB.prepare(`
      insert into preview_print_status (registration_id, consent, tt25)
      select id, coalesce(?2, 0), coalesce(?3, 0) from registrations where id = ?1 and branch in (select value from json_each(?4))
      on conflict (registration_id) do update set consent = coalesce(?2, consent), tt25 = coalesce(?3, tt25)
      returning (select branch from registrations where id = ?1) as branch
    `).bind(id, consent === null ? null : Number(consent), tt25 === null ? null : Number(tt25), JSON.stringify(staff.branches)).first();
    if (!printed) return denied();
    notify(printed.branch);
    return result(null);
  }
  const branch = args?.p_branch_code;
  if (!previewBranches.includes(branch)) return result({ message: 'Chi nhánh không khả dụng.' }, 400);
  if (!branchAllowed(staff, branch)) return denied();

  if (path === 'rpc/get_dashboard_registrations' || path === 'rpc/get_registration_details') {
    const dashboard = path === 'rpc/get_dashboard_registrations';
    const permitted = dashboard ? staffCan(staff, 'reception')
      : staffCan(staff, 'registrations') || (staffCan(staff, 'reception') && staffCan(staff, 'printing'));
    if (!permitted) return denied();
    const date = args.p_queue_date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return result({ message: 'Ngày không hợp lệ.' }, 400);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 1000);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
      return result({ message: 'Khoảng dữ liệu không hợp lệ.' }, 400);
    }
    const { results } = await env.DB.prepare(`
      select id, branch as branch_id, queue_date, queue_number, state,
        coalesce(e.details ->> '$.fullName', 'KHÁCH THỬ ' || queue_number) as full_name,
        coalesce(e.details ->> '$.birthDate', '1990-01-01') as birth_date,
        coalesce(e.details ->> '$.gender', 'Nam') as gender,
        coalesce(e.details ->> '$.phoneNumber', '0000000000') as phone_number,
        coalesce(e.details ->> '$.identityDocument', demo_code) as identity_document,
        'personal' as reason, coalesce(e.details ->> '$.workplace', '') as company_name,
        coalesce(e.details ->> '$.province', 'Thành phố Hồ Chí Minh') as province,
        coalesce(e.details ->> '$.ward', 'Phường Tân Mỹ') as ward,
        coalesce(e.details ->> '$.addressDetail', 'Địa chỉ thử') as address_detail,
        coalesce(e.details ->> '$.receptionNote', '') as reception_note,
        coalesce(e.details ->> '$.email', '') as email,
        coalesce(e.details -> '$.tt25', '{}') as tt25_extras,
        coalesce(printed.consent, 0) as printed_consent, coalesce(printed.tt25, 0) as printed_tt25,
        strftime('%Y-%m-%dT%H:%M:%fZ', registered_at / 1000.0, 'unixepoch') as registered_at,
        strftime('%Y-%m-%dT%H:%M:%fZ', called_at / 1000.0, 'unixepoch') as first_called_at,
        strftime('%Y-%m-%dT%H:%M:%fZ', last_called_at / 1000.0, 'unixepoch') as last_called_at
      from registrations left join preview_print_status printed on printed.registration_id = registrations.id
      left join preview_registration_edits e on e.registration_id = registrations.id
      where branch = ? and queue_date = ? ${dashboard ? "and state = 'active'" : ''}
      order by queue_number limit ? offset ?
    `).bind(branch, date, limit, offset).all();
    return result(results.map(({ printed_consent, printed_tt25, email, tt25_extras, ...row }) => ({
      ...row, tt25_data: { ...(preview ? { identityDocumentType: 'passport' } : {}), ...JSON.parse(tt25_extras), email,
        printedConsent: Boolean(printed_consent), printedTT25: Boolean(printed_tt25) },
    })));
  }

  let row;
  if (!staffCan(staff, 'reception', 'update')) return denied();
  if (path === 'rpc/call_next_queue') {
    row = await callNext(env.DB, branch, day, now, staff.id);
  } else if (path === 'rpc/recall_current_queue') {
    const [display] = await env.DB.batch([
      env.DB.prepare(`
        update display_state set called_at = ?3, revision = revision + 1
        where branch = ?1 and queue_date = ?2 and registration_id is not null
        returning registration_id, queue_number
      `).bind(branch, day, now),
      env.DB.prepare(`
        update registrations set last_called_at = ?3, queue_actor_id = ?4 where id = (
          select registration_id from display_state where branch = ?1 and queue_date = ?2
        )
      `).bind(branch, day, now, staff.id ?? null),
    ]);
    [row] = display.results;
  } else if (path === 'rpc/return_called_queue_to_waiting') {
    const id = args.p_registration_id;
    if (typeof id !== 'string') return result({ message: 'Mã hồ sơ không hợp lệ.' }, 400);
    const [display, returned] = await env.DB.batch([
      env.DB.prepare('select 1 from display_state where branch = ? and registration_id = ?').bind(branch, id),
      env.DB.prepare(`
        update registrations set called_at = null, last_called_at = null, first_called_by = null, queue_actor_id = ?4
        where branch = ?1 and queue_date = ?2 and id = ?3 and state = 'active' and called_at is not null
        returning id as registration_id
      `).bind(branch, day, id, staff.id ?? null),
    ]);
    [row] = returned.results;
    if (row) row.display_cleared = Boolean(display.results.length);
  } else {
    return result({ message: 'Chức năng chưa có trên bản thử.' }, 404);
  }
  if (row) notify(branch);
  return result(row ? [row] : []);
}
