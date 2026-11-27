import { DOCTOR_SPECIALTIES } from '../../frontend/src/features/admin/roster/personnel/doctorSpecialties.ts';
import { testEmail, testPhone, testText } from './preview-data.mjs';
import { branchAllowed, staffCan } from './staff.mjs';
import { clean as isCleanText } from './preview-registration-data.mjs';

const fields = {
  medical_personnel: 'personnel_code full_name identity_number practicing_certificate specialties role_type phone_number email fixed_cost is_active',
  clinic_rooms: 'branch_code room_name doctor_specialty display_order is_active inactive_from',
  roster_schedules: 'schedule_type branch_code schedule_date campaign_code company_name contact_person company_address notes provisional_cost default_allowance position_list position_order_mode sales_person departure_address campaign_group_id setup_onsite_ids',
  roster_assignments: 'schedule_id room_id daily_override_id position_label personnel_id shift_period start_minute end_minute day_rate_snapshot base_cost_snapshot allowance_cost note sort_order',
  roster_daily_room_overrides: 'schedule_date branch_code override_type room_id custom_room_name display_order',
  roster_position_templates: 'schedule_type positions',
  roster_unavailability: 'personnel_id unavailable_date start_minute end_minute',
};
const onsiteTypes = ['onsite_exam', 'blood_draw', 'setup'];
const defaults = {
  medical_personnel: { identity_number: '', practicing_certificate: '', specialties: [], phone_number: '', email: '', fixed_cost: 0, is_active: true },
  clinic_rooms: { doctor_specialty: null, inactive_from: null, is_active: true, display_order: 100 },
  roster_schedules: {
    provisional_cost: 0, default_allowance: 0, notes: '', sales_person: '', departure_address: '',
    contact_person: '', company_address: '', position_list: [], position_order_mode: 'alphabetical', setup_onsite_ids: [],
  },
  roster_assignments: { room_id: null, daily_override_id: null, start_minute: null, end_minute: null, day_rate_snapshot: null, sort_order: 100, note: '' },
};
const response = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const records = 'select resource, id, record from preview_roster_samples order by id';
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && new Date(value).toJSON()?.slice(0, 10) === value;
const money = value => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000_000;
const names = value => Array.isArray(value) && value.length <= 100 && new Set(value).size === value.length
  && value.every(item => typeof item === 'string' && item.trim() && item.length <= 200);

class InvalidRosterWrite extends Error {
  constructor(message, code = '22023', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function check(valid, message = 'Dữ liệu lịch không hợp lệ.', code, status) {
  if (!valid) throw new InvalidRosterWrite(message, code, status);
}

function load(results, day) {
  const data = Object.fromEntries(Object.keys(fields).map(key => [key, new Map()]));
  const timestamp = day + 'T00:00:00+07:00';
  for (const { resource, id, record } of results) {
    data[resource]?.set(id, { created_at: timestamp, updated_at: timestamp, ...defaults[resource], ...JSON.parse(record), id });
  }
  return data;
}

function where(search) {
  const filters = [];
  for (const [key, expression] of search) {
    if (['select', 'limit', 'offset', 'order', 'columns'].includes(key)) continue;
    const [op] = expression.split('.', 1);
    const v = expression.slice(op.length + 1);
    check(['eq', 'neq', 'gte', 'lte', 'in'].includes(op));
    const values = op === 'in' && /^\(.*\)$/.test(v) && v.length > 2 ? v.slice(1, -1).split(',') : [];
    filters.push(row => {
      const current = typeof row[key] === 'string' ? row[key] : String(row[key]);
      if (op === 'eq') return current === v;
      if (op === 'neq') return current !== v;
      if (op === 'gte') return current >= v;
      if (op === 'lte') return current <= v;
      return values.includes(current);
    });
  }
  return { matches: row => filters.every(filter => filter(row)), count: filters.length };
}

function selectRows(rows, search) {
  const order = search.get('order')?.split(',').map(term => term.split('.')) ?? [];
  const ordered = order.length ? [...rows].sort((a, b) => {
    for (const [field, direction] of order) {
      if (a[field] === b[field]) continue;
      if (a[field] == null) return 1;
      if (b[field] == null) return -1;
      return (a[field] < b[field] ? -1 : 1) * (direction === 'desc' ? -1 : 1);
    }
    return 0;
  }) : rows;
  const offset = Number(search.get('offset') ?? 0);
  const limit = Number(search.get('limit') ?? 1000);
  check(Number.isSafeInteger(offset) && offset >= 0 && Number.isSafeInteger(limit) && limit >= 0 && limit <= 1000);
  return ordered.slice(offset, offset + limit);
}

function scheduleResponse(row, schedules) {
  return { ...row, setup_targets: row.setup_onsite_ids.map(id => schedules.get(id)).filter(Boolean).map(onsite => ({ onsite })) };
}

function scheduleModule(schedule) {
  return schedule?.schedule_type === 'insite' ? 'clinic' : 'onsite';
}

function rosterRows(data, path, staff, select) {
  const combined = staffCan(staff, 'overview') || staffCan(staff, 'settlement');
  const clinic = staffCan(staff, 'clinic') || combined;
  const onsite = staffCan(staff, 'onsite') || combined;
  const personnel = staffCan(staff, 'personnel');
  const inBranch = row => branchAllowed(staff, row.branch_code);
  const schedules = new Map([...data.roster_schedules].filter(([, row]) =>
    inBranch(row) && (scheduleModule(row) === 'clinic' ? clinic : onsite)));
  if (path === 'roster_schedules') return [...schedules.values()].map(row => scheduleResponse(row, schedules));
  if (path === 'roster_assignments') {
    const rows = [...data.roster_assignments.values()];
    if (select === 'personnel_id' && personnel) {
      return rows.filter(row => branchAllowed(staff, data.roster_schedules.get(row.schedule_id)?.branch_code))
        .map(({ personnel_id }) => ({ personnel_id }));
    }
    return rows.filter(row => schedules.has(row.schedule_id));
  }
  if (path === 'roster_setup_links') {
    return [...schedules.values()].flatMap(row => row.setup_onsite_ids.filter(id => schedules.has(id)).map(onsite_id => ({ onsite_id, setup_id: row.id })));
  }
  if (path === 'roster_position_templates') return onsite ? [...data[path].values()] : [];
  if (path === 'roster_unavailability') return staffCan(staff, 'clinic') || staffCan(staff, 'onsite') || personnel ? [...data[path].values()] : [];
  if (path === 'medical_personnel') {
    if (personnel) return [...data[path].values()];
    if (!clinic && !onsite) return [];
    return [...data[path].values()].map(({ identity_number, practicing_certificate, phone_number, email, ...row }) => row);
  }
  return clinic ? [...data[path].values()].filter(inBranch) : [];
}

function mayChange(staff, resource, row, data, action) {
  if (resource === 'medical_personnel') return staffCan(staff, 'personnel', action);
  if (resource === 'roster_unavailability') return staffCan(staff, 'personnel', 'update');
  if (resource === 'roster_position_templates') return staffCan(staff, 'onsite', 'update');
  const schedule = resource === 'roster_assignments' ? data.roster_schedules.get(row.schedule_id) : row;
  const module = ['clinic_rooms', 'roster_daily_room_overrides'].includes(resource) ? 'clinic' : scheduleModule(schedule);
  return branchAllowed(staff, schedule?.branch_code) && staffCan(staff, module, action);
}

function output(request, rows, status = 200) {
  if (request.headers.get('Accept')?.includes('application/vnd.pgrst.object+json')) {
    if (rows.length === 1) return response(rows[0], status);
    return response({ code: 'PGRST116', message: 'Không tìm thấy đúng một bản ghi.', details: 'The result contains ' + rows.length + ' rows' }, 406);
  }
  return response(rows, status);
}

function clean(resource, input) {
  check(input && typeof input === 'object' && !Array.isArray(input));
  const allowed = fields[resource].split(' ');
  const payload = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'updated_at') continue;
    check(allowed.includes(key));
    check(value === null || typeof value === 'boolean' || typeof value === 'number'
      || (typeof value === 'string' && value.length <= 4000)
      || (Array.isArray(value) && names(value)));
    payload[key] = value;
  }
  return payload;
}

function validateChanges(data, previous, changes, day, staff, preview) {
  const schedules = data.roster_schedules;
  const duplicate = (condition, message) => check(!condition, message, '23505', 409);
  const linked = id => [...schedules.values()].some(row => row.setup_onsite_ids.includes(id));
  const affectedDates = new Set();
  const replacements = new Set();
  const personnelCodeCounts = new Map();
  if (changes.some(({ resource, deleted }) => resource === 'medical_personnel' && !deleted)) {
    for (const { personnel_code } of data.medical_personnel.values()) {
      personnelCodeCounts.set(personnel_code, (personnelCodeCounts.get(personnel_code) ?? 0) + 1);
    }
  }
  for (const { resource, row, before, deleted } of changes) {
    if (resource === 'roster_unavailability' && deleted && !data.medical_personnel.has(row.personnel_id)) continue;
    const action = deleted ? 'delete' : before ? 'update' : 'create';
    check((!before || mayChange(staff, resource, before, previous, action))
      && (deleted || mayChange(staff, resource, row, data, action)),
    'Tài khoản không có quyền sửa lịch hoặc danh mục này.', '42501', 403);
    const dateOf = item => item?.schedule_date
      ?? (resource === 'roster_assignments' && (schedules.get(item?.schedule_id) ?? previous.roster_schedules.get(item?.schedule_id))?.schedule_date);
    const dates = [dateOf(before), dateOf(row)].filter(Boolean);
    check(dates.every(date => validDate(date) && (staff.canEditHistory || date >= day)),
      'Lịch ngày đã qua chỉ được xem.', '42501', 403);

    if (resource === 'medical_personnel') {
      if (deleted) {
        check(![...data.roster_assignments.values()].some(item => item.personnel_id === row.id),
          'Nhân sự đã có ca trực.', '23503', 409);
        continue;
      }
      check((preview ? (typeof row.personnel_code === 'string' && /^[A-Z0-9-]{1,40}$/.test(row.personnel_code))
        : isCleanText(row.personnel_code, 1, 100))
        && isCleanText(row.full_name, 1, 100)
        && ['identity_number', 'practicing_certificate', 'phone_number', 'email'].every(field => typeof row[field] === 'string')
        && ['doctor', 'nurse', 'technician', 'ctv'].includes(row.role_type)
        && money(row.fixed_cost) && typeof row.is_active === 'boolean' && names(row.specialties)
        && row.specialties.every(value => DOCTOR_SPECIALTIES.some(item => item.value === value)));
      if (preview) {
        check(testText(row.full_name)
          && (row.identity_number === '' || /^00000000\d{4}$/.test(row.identity_number))
          && (row.practicing_certificate === '' || /^DEMO-[A-Z0-9-]{1,40}$/i.test(row.practicing_certificate))
          && (row.phone_number === '' || testPhone(row.phone_number))
          && (row.email === '' || testEmail(row.email)),
        'Bản thử dùng tên có chữ “thử” hoặc “demo”, số điện thoại dạng 00000000xx và email @example.com. CCCD và CCHN có thể để trống.');
      } else {
        check((row.identity_number === '' || /^\d{12}$/.test(row.identity_number))
          && isCleanText(row.practicing_certificate, 0, 100)
          && isCleanText(row.phone_number, 0, 100) && isCleanText(row.email, 0, 255),
        'Thông tin nhân sự không hợp lệ. CCCD cần đủ 12 chữ số nếu có nhập.');
      }
      duplicate(personnelCodeCounts.get(row.personnel_code) > 1, 'Mã nhân sự đã tồn tại.');
    }

    if (resource === 'roster_schedules') {
      if (before && linked(before.id)) {
        check(!deleted && ['schedule_type', 'branch_code', 'schedule_date', 'company_name', 'campaign_group_id']
          .every(key => before[key] === row[key]), 'Đoàn khám đang có lịch set-up. Vui lòng đổi liên kết trước.', '23503', 409);
      }
      if (before?.schedule_date !== row.schedule_date) dates.forEach(date => affectedDates.add(date));
      if (deleted) continue;
      check(validDate(row.schedule_date) && ['insite', ...onsiteTypes].includes(row.schedule_type)
        && ['q1', 'q7'].includes(row.branch_code) && money(row.provisional_cost) && money(row.default_allowance)
        && ['manual', 'alphabetical'].includes(row.position_order_mode) && names(row.position_list)
        && names(row.setup_onsite_ids) && typeof row.campaign_group_id === 'string');
      check(!before || before.campaign_group_id === row.campaign_group_id, 'Không thể đổi mã đợt khám của lịch đã lưu.');
      if (row.schedule_type === 'insite') duplicate([...schedules.values()].some(other =>
        other.id !== row.id && other.schedule_type === 'insite' && other.branch_code === row.branch_code
        && other.schedule_date === row.schedule_date), 'Phòng khám đã có lịch trong ngày này.');
      else {
        check(typeof row.company_name === 'string' && row.company_name.trim() && typeof row.campaign_code === 'string' && row.campaign_code.trim());
        duplicate([...schedules.values()].some(other => other.id !== row.id && other.campaign_code === row.campaign_code), 'Mã đoàn đã tồn tại.');
      }
      if (row.schedule_type === 'setup') {
        const targets = row.setup_onsite_ids.map(id => schedules.get(id));
        if (!targets.length) {
          check(before?.schedule_type === 'setup' && !before.setup_onsite_ids.length,
            'Vui lòng chọn ngày khám của cùng một đoàn Onsite HC.');
        } else {
          check(targets.every(target => target?.schedule_type === 'onsite_exam'
            && target.branch_code === row.branch_code && target.campaign_group_id === targets[0].campaign_group_id
            && target.company_name === targets[0].company_name), 'Vui lòng chọn ngày khám của cùng một đoàn Onsite HC.');
          row.company_name = targets[0].company_name;
        }
      } else check(!row.setup_onsite_ids.length);
    }

    if (resource === 'clinic_rooms' && !deleted) {
      check(['q1', 'q7'].includes(row.branch_code) && typeof row.room_name === 'string' && row.room_name.trim()
        && typeof row.is_active === 'boolean' && Number.isSafeInteger(row.display_order)
        && (row.inactive_from === null || (validDate(row.inactive_from) && (staff.canEditHistory || row.inactive_from >= day))));
      duplicate([...data.clinic_rooms.values()].some(other =>
        other.id !== row.id && other.branch_code === row.branch_code && other.room_name === row.room_name), 'Phòng đã có trong chi nhánh.');
    }

    if (resource === 'roster_daily_room_overrides' && !deleted) {
      check(validDate(row.schedule_date) && ['q1', 'q7'].includes(row.branch_code) && Number.isSafeInteger(row.display_order));
      check((row.override_type === 'add' && row.room_id === null && typeof row.custom_room_name === 'string' && row.custom_room_name.trim())
        || (row.override_type === 'hide' && data.clinic_rooms.get(row.room_id)?.branch_code === row.branch_code));
      duplicate([...data.roster_daily_room_overrides.values()].some(other => other.id !== row.id
        && other.branch_code === row.branch_code && other.schedule_date === row.schedule_date
        && other.override_type === row.override_type && other.room_id === row.room_id
        && other.custom_room_name === row.custom_room_name), 'Phòng đã có trong ngày này.');
    }

    if (resource === 'roster_position_templates' && !deleted) {
      check(onsiteTypes.includes(row.schedule_type) && names(row.positions));
    }

    if (resource === 'roster_unavailability' && !deleted) {
      check(data.medical_personnel.has(row.personnel_id) && validDate(row.unavailable_date)
        && Number.isInteger(row.start_minute) && Number.isInteger(row.end_minute)
        && ((row.start_minute === 0 && row.end_minute === 1440) || (
          row.start_minute >= 360 && row.end_minute <= 1440 && row.start_minute < row.end_minute
          && row.start_minute % 15 === 0 && row.end_minute % 15 === 0
        )), 'Ngày hoặc khung giờ bận không hợp lệ.');
      duplicate([...data.roster_unavailability.values()].some(other => other.id !== row.id
        && other.personnel_id === row.personnel_id && other.unavailable_date === row.unavailable_date
        && other.start_minute === row.start_minute && other.end_minute === row.end_minute), 'Khung giờ này đã được khai báo.');
    }

    if (resource === 'roster_assignments') {
      dates.forEach(date => affectedDates.add(date));
      if (deleted) continue;
      const schedule = schedules.get(row.schedule_id);
      const person = data.medical_personnel.get(row.personnel_id);
      check(schedule && person, 'Lịch hoặc nhân sự không tồn tại.');
      if (before && before.personnel_id !== row.personnel_id) {
        check(person.is_active, 'Chỉ có thể chọn nhân sự đang hoạt động.');
        replacements.add(row.id);
        if (row.start_minute !== null) row.day_rate_snapshot = person.fixed_cost;
        row.base_cost_snapshot = row.start_minute === null ? person.fixed_cost
          : Math.round(person.fixed_cost * (row.end_minute - row.start_minute) / 480);
      }
      check(['AM', 'PM', 'FULL'].includes(row.shift_period) && money(row.base_cost_snapshot)
        && money(row.allowance_cost) && Number.isSafeInteger(row.sort_order) && typeof row.position_label === 'string');
      const validSlot = Number.isInteger(row.start_minute) && Number.isInteger(row.end_minute)
        && row.start_minute >= 360 && row.end_minute <= 1440 && row.start_minute < row.end_minute
        && row.start_minute % 15 === 0 && row.end_minute % 15 === 0 && money(row.day_rate_snapshot)
        && row.base_cost_snapshot === Math.round(row.day_rate_snapshot * (row.end_minute - row.start_minute) / 480);
      check(validSlot || (row.start_minute === null && row.end_minute === null && row.day_rate_snapshot === null), 'Khung giờ hoặc chi phí ca trực không hợp lệ.');
      const room = data.clinic_rooms.get(row.room_id);
      const override = data.roster_daily_room_overrides.get(row.daily_override_id);
      if (schedule.schedule_type === 'insite') {
        check((row.daily_override_id === null && room?.branch_code === schedule.branch_code)
          || (row.room_id === null && override?.override_type === 'add' && override.branch_code === schedule.branch_code
            && override.schedule_date === schedule.schedule_date), 'Phòng trực không phù hợp với lịch.');
      } else check(row.room_id === null && row.daily_override_id === null && row.position_label.trim());
      row.total_cost = row.base_cost_snapshot + row.allowance_cost;
    }
  }

  const byDayAndPerson = new Map();
  const changedBlocks = new Set(changes.filter(({ resource, deleted }) => resource === 'roster_unavailability' && !deleted).map(({ row }) => row.id));
  const blocksByDayAndPerson = new Map();
  for (const block of data.roster_unavailability.values()) {
    if (!affectedDates.has(block.unavailable_date) && !changedBlocks.has(block.id)) continue;
    const key = block.unavailable_date + '|' + block.personnel_id;
    const blocks = blocksByDayAndPerson.get(key) ?? [];
    blocks.push(block);
    blocksByDayAndPerson.set(key, blocks);
  }
  for (const assignment of data.roster_assignments.values()) {
    const date = schedules.get(assignment.schedule_id)?.schedule_date;
    const key = date + '|' + assignment.personnel_id;
    const start = assignment.start_minute ?? (assignment.shift_period === 'PM' ? 720 : 0);
    const end = assignment.end_minute ?? (assignment.shift_period === 'AM' ? 720 : 1440);
    const conflictingBlock = blocksByDayAndPerson.get(key)?.find(block => block.start_minute < end && start < block.end_minute);
    if (conflictingBlock) {
      throw new InvalidRosterWrite(changedBlocks.has(conflictingBlock.id)
        ? 'Khung giờ bận trùng với ca đã xếp. Vui lòng đổi ca trước khi lưu.'
        : 'Nhân sự đã khai báo bận hoặc nghỉ trong khung giờ này.', '23P01', 409);
    }
    if (!affectedDates.has(date)) continue;
    const prior = byDayAndPerson.get(key) ?? [];
    const strictOverlap = assignment.start_minute != null || replacements.has(assignment.id);
    check(!prior.some(other => (strictOverlap || other.strictOverlap) && other.start < end && start < other.end),
      'Nhân sự đã được xếp trong khung giờ này.', '23P01', 409);
    prior.push({ start, end, strictOverlap });
    byDayAndPerson.set(key, prior);
  }
}

function plan(data, rawPath, method, search, body, timestamp, prefer) {
  const together = rawPath === 'rpc/create_onsite_with_setup';
  const clone = rawPath === 'rpc/create_onsite_with_assignments';
  const resource = together || clone ? 'roster_schedules' : rawPath;
  const rows = data[resource];
  const mergePersonnel = resource === 'medical_personnel' && method === 'POST'
    && search.get('on_conflict') === 'personnel_code' && prefer.includes('resolution=merge-duplicates');
  const personnelByCode = mergePersonnel ? new Map(Array.from(rows.values(), row => [row.personnel_code, row])) : null;
  const changes = [];
  const change = (resource, row, before, deleted = false) => {
    changes.push({ resource, row, before, deleted });
    if (deleted) data[resource].delete(row.id);
    else data[resource].set(row.id, row);
  };
  const insert = (item, collection = resource) => {
    const payload = clean(collection, item);
    const matched = personnelByCode?.get(payload.personnel_code);
    const id = collection === 'roster_position_templates' ? payload.schedule_type : matched?.id ?? crypto.randomUUID();
    const before = data[collection].get(id);
    const row = { ...defaults[collection], ...before, ...payload, id, created_at: before?.created_at ?? timestamp, updated_at: timestamp };
    if (collection === 'roster_schedules') row.campaign_group_id ??= id;
    change(collection, row, before);
    return row;
  };

  if (together) {
    const { p_hc: hc, p_setup: setup } = body ?? {};
    check(Array.isArray(hc) && Array.isArray(setup) && hc.length > 0 && setup.length > 0 && hc.length + setup.length <= 100);
    check(hc.every(item => item?.schedule_type === 'onsite_exam' && item.branch_code === hc[0].branch_code
      && item.company_name === hc[0].company_name) && setup.every(item => item?.schedule_type === 'setup'));
    const campaignGroup = crypto.randomUUID();
    const setupGroup = crypto.randomUUID();
    const days = hc.map(item => insert({ ...item, campaign_group_id: campaignGroup, setup_onsite_ids: [] }));
    setup.forEach(item => insert({ ...item, campaign_group_id: setupGroup, setup_onsite_ids: days.map(day => day.id) }));
  } else if (clone) {
    const { p_schedule: schedule, p_assignments: assignments } = body ?? {};
    check(onsiteTypes.includes(schedule?.schedule_type) && Array.isArray(assignments));
    const saved = insert(schedule);
    for (const assignment of assignments) insert({ ...assignment, schedule_id: saved.id }, 'roster_assignments');
  } else if (method === 'POST') {
    const inputs = Array.isArray(body) ? body : [body];
    check(inputs.length > 0 && (resource === 'medical_personnel' || inputs.length <= 100));
    if (resource === 'medical_personnel')
      check(new Set(inputs.map(item => item?.personnel_code)).size === inputs.length, 'Danh sách có mã nhân sự trùng.');
    inputs.forEach(item => insert(item));
  } else {
    const filter = where(search);
    check(filter.count > 0);
    const matched = [...rows.values()].filter(filter.matches);
    if (method === 'PATCH') {
      const payload = clean(resource, body);
      for (const before of matched) change(resource, { ...before, ...payload, updated_at: timestamp }, before);
    } else {
      for (const row of matched) {
        if (resource === 'clinic_rooms') {
          check(![...data.roster_assignments.values()].some(item => item.room_id === row.id)
            && ![...data.roster_daily_room_overrides.values()].some(item => item.room_id === row.id),
          'Phòng còn dữ liệu phân công.', '23503', 409);
        }
        for (const item of data.roster_assignments.values()) {
          if ((resource === 'roster_schedules' && item.schedule_id === row.id)
            || (resource === 'roster_daily_room_overrides' && item.daily_override_id === row.id)) {
            change('roster_assignments', item, item, true);
          }
        }
        if (resource === 'medical_personnel') {
          for (const block of data.roster_unavailability.values()) {
            if (block.personnel_id === row.id) change('roster_unavailability', block, block, true);
          }
        }
        change(resource, row, row, true);
      }
    }
  }
  return changes;
}

export async function rosterPreviewApi(request, db, path, url, day, now, staff, preview = true) {
  const together = path === 'rpc/create_onsite_with_setup';
  const clone = path === 'rpc/create_onsite_with_assignments';
  const rpcWrite = together || clone;
  const history = path === 'rpc/get_roster_assignment_changes';
  if (!Object.hasOwn(fields, path) && path !== 'roster_setup_links' && !rpcWrite && !history) return null;
  const search = url.searchParams;
  try {
    if (history) {
      check(request.method === 'POST');
      const { p_assignment_id: id } = await request.json();
      check(typeof id === 'string' && id.length <= 80);
      const { results } = await db.prepare(records).all();
      const data = load(results, day);
      const schedule = data.roster_schedules.get(data.roster_assignments.get(id)?.schedule_id);
      if (!schedule || !staffCan(staff, scheduleModule(schedule)) || !branchAllowed(staff, schedule.branch_code)) return response([]);
      const { results: logs } = await db.prepare(`
        select id, created_at, metadata ->> '$.actor_name' as actor_name,
          metadata ->> '$.from_name' as from_name, metadata ->> '$.to_name' as to_name
        from audit_logs where entity_type = 'roster_assignment' and entity_id = ? and branch = ?
          and action = 'roster.assignment_replaced' order by created_at desc, rowid desc limit 50
      `).bind(id, schedule.branch_code).all();
      return response(logs.map(({ created_at, ...log }) => ({ ...log, changed_at: new Date(created_at).toISOString() })));
    }
    if (request.method === 'GET' && !rpcWrite) {
      const { results } = await db.prepare(records).all();
      const data = load(results, day);
      const rows = rosterRows(data, path, staff, search.get('select'));
      const selected = selectRows(rows.filter(where(search).matches), search);
      return output(request, selected);
    }
    check((rpcWrite && request.method === 'POST') || (Object.hasOwn(fields, path) && ['POST', 'PATCH', 'DELETE'].includes(request.method)),
      'Thao tác chưa có trên bản thử.', '42501', 403);
    check(path !== 'roster_position_templates' || request.method === 'POST');
    let body;
    if (request.method !== 'DELETE') {
      const raw = await request.text();
      check(raw.length <= 256_000);
      try { body = JSON.parse(raw); } catch { check(false); }
    }
    const timestamp = new Date(now).toISOString();
    const prefer = request.headers.get('Prefer') ?? '';
    for (let attempt = 0; ; attempt += 1) {
      const [{ results: [version] }, { results }] = await db.batch([
        db.prepare('select revision from preview_roster_revision where id = 1'), db.prepare(records),
      ]);
      const data = load(results, day);
      const changes = plan(data, path, request.method, search, body, timestamp, prefer);
      validateChanges(data, load(results, day), changes, day, staff, preview);
      if (changes.length) {
        // A version mismatch rolls back the batch, so a fresh plan can retry safely.
        const statements = [db.prepare('update preview_roster_revision set revision = case when revision = ? then revision + 1 else null end where id = 1').bind(version.revision)];
        const deleted = changes.filter(item => item.deleted).map(({ resource, row }) => [resource, row.id]);
        const written = changes.filter(item => !item.deleted).map(({ resource, row: { id, ...record } }) => ({ resource, id, record }));
        if (deleted.length) statements.push(db.prepare("delete from preview_roster_samples where (resource, id) in (select value ->> 0, value ->> 1 from json_each(?))").bind(JSON.stringify(deleted)));
        if (written.length) statements.push(db.prepare(
          "insert into preview_roster_samples (resource, id, record) select value ->> '$.resource', value ->> '$.id', value -> '$.record' from json_each(?) where 1 on conflict (resource,id) do update set record = excluded.record",
        ).bind(JSON.stringify(written)));
        for (const { resource, row, before, deleted: removed } of changes) {
          if (resource !== 'roster_assignments' || removed || !before || row.personnel_id === before.personnel_id) continue;
          const schedule = data.roster_schedules.get(row.schedule_id);
          const people = data.medical_personnel;
          statements.push(db.prepare(`insert into audit_logs (branch, actor_id, action, entity_type, entity_id, metadata, created_at)
            values (?, ?, 'roster.assignment_replaced', 'roster_assignment', ?, ?, ?)`)
            .bind(schedule.branch_code, staff.id, row.id, JSON.stringify({
              actor_name: staff.displayName,
              from_id: before.personnel_id, from_name: people.get(before.personnel_id).full_name,
              to_id: row.personnel_id, to_name: people.get(row.personnel_id).full_name,
              before_cost: before.total_cost, after_cost: row.total_cost,
            }), now));
        }
        try {
          await db.batch(statements);
        } catch (error) {
          if (attempt < 2 && String(error).includes('preview_roster_revision.revision')) continue;
          throw error;
        }
      }
      if (!rpcWrite && !prefer.includes('return=representation')) {
        return new Response(null, { status: request.method === 'POST' ? 201 : 204 });
      }
      const rows = changes.filter(item => !item.deleted || path === 'roster_unavailability').map(({ resource, row }) =>
        resource === 'roster_schedules' ? scheduleResponse(row, data.roster_schedules) : row);
      if (clone) return response({ schedule: rows[0], insertedAssignments: rows.slice(1) });
      return output(request, rows, request.method === 'POST' && !rpcWrite ? 201 : 200);
    }
  } catch (error) {
    if (error instanceof InvalidRosterWrite) return response({ message: error.message, code: error.code }, error.status);
    if (String(error).includes('preview_roster_revision.revision')) {
      return response({ message: 'Lịch vừa được cập nhật. Vui lòng tải lại và thử lại.', code: '40001' }, 409);
    }
    if (path === 'medical_personnel' && request.method === 'DELETE' && String(error).includes('FOREIGN KEY')) {
      return response({ message: 'Nhân sự đang có file hồ sơ.', code: '23503' }, 409);
    }
    console.error('Roster staging write failed:', error);
    return response({ message: 'Bản thử chưa xử lý được thay đổi lịch.', code: 'XX000' }, 500);
  }
}
