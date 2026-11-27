import { createHash } from 'node:crypto';
import { guardEmptyImport, prepareSnapshotRows } from './import-d1.mjs';

export const rosterSnapshotTables = ['preview_roster_samples', 'preview_personnel_documents'];

const resources = [
  'medical_personnel', 'clinic_rooms', 'roster_schedules', 'roster_assignments',
  'roster_daily_room_overrides', 'roster_position_templates', 'roster_unavailability',
];
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const fileTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const checksum = bytes => createHash('sha256').update(bytes).digest('hex');

function uniqueRows(rows, key) {
  const mapped = new Map(rows.map(row => [row[key], row]));
  if (mapped.size !== rows.length) throw new Error('The roster snapshot contains a duplicate key.');
  return mapped;
}

function readSnapshot(snapshot) {
  snapshot = { roster_unavailability: [], ...snapshot };
  const documents = snapshot.personnel_documents;
  const rawLinks = snapshot.roster_setup_links;
  if (![...resources.map(name => snapshot[name]), documents, rawLinks].every(Array.isArray)) {
    throw new Error('The roster snapshot is missing one or more tables.');
  }
  const source = Object.fromEntries(resources.map(resource => [
    resource, uniqueRows(snapshot[resource], resource === 'roster_position_templates' ? 'schedule_type' : 'id'),
  ]));
  const schedules = source.roster_schedules;
  const people = source.medical_personnel;
  const rooms = source.clinic_rooms;
  const overrides = source.roster_daily_room_overrides;
  for (const block of source.roster_unavailability.values()) {
    if (!people.has(block.personnel_id)) throw new Error('A source unavailability entry points to missing personnel.');
  }
  const links = new Map();
  for (const { setup_id, onsite_id } of rawLinks) {
    const setup = schedules.get(setup_id);
    const onsite = schedules.get(onsite_id);
    const targets = links.get(setup_id) ?? new Set();
    if (setup?.schedule_type !== 'setup' || onsite?.schedule_type !== 'onsite_exam'
      || setup.branch_code !== onsite.branch_code || targets.has(onsite_id)) {
      throw new Error('The roster snapshot contains an invalid set-up link.');
    }
    targets.add(onsite_id);
    links.set(setup_id, targets);
  }
  for (const schedule of schedules.values()) {
    const targetIds = links.get(schedule.id) ?? new Set();
    if (!Array.isArray(schedule.setup_onsite_ids) || new Set(schedule.setup_onsite_ids).size !== targetIds.size
      || schedule.setup_onsite_ids.length !== targetIds.size || schedule.setup_onsite_ids.some(id => !targetIds.has(id))) {
      throw new Error('A source schedule does not match its set-up links.');
    }
  }
  for (const row of overrides.values()) {
    if (row.room_id !== null && rooms.get(row.room_id)?.branch_code !== row.branch_code) {
      throw new Error('A room override points to a missing room or another branch.');
    }
  }
  for (const row of source.roster_assignments.values()) {
    const schedule = schedules.get(row.schedule_id);
    const room = rooms.get(row.room_id);
    const override = overrides.get(row.daily_override_id);
    if (!schedule || !people.has(row.personnel_id)
      || (row.room_id !== null && room?.branch_code !== schedule.branch_code)
      || (row.daily_override_id !== null && (override?.branch_code !== schedule.branch_code
        || override.schedule_date !== schedule.schedule_date))) {
      throw new Error('A source assignment points to a missing or mismatched record.');
    }
    const costs = [row.base_cost_snapshot, row.allowance_cost, row.total_cost];
    if (costs.some(cost => !Number.isSafeInteger(cost) || cost < 0) || costs[0] + costs[1] !== costs[2]
      || (row.day_rate_snapshot !== null && (!Number.isSafeInteger(row.day_rate_snapshot) || row.day_rate_snapshot < 0))) {
      throw new Error('A source assignment has invalid cost totals.');
    }
  }
  uniqueRows(documents, 'id');
  uniqueRows(documents, 'object_path');
  for (const row of documents) {
    if (!uuid.test(row.id) || !people.has(row.personnel_id) || !['identity', 'certificate'].includes(row.kind)
      || typeof row.object_path !== 'string' || !row.object_path.startsWith(row.personnel_id + '/' + row.kind + '/')
      || typeof row.file_name !== 'string' || !row.file_name.trim() || !fileTypes.has(row.mime_type)
      || !Number.isInteger(row.file_size) || row.file_size < 1 || row.file_size > 10 * 1024 * 1024
      || !Number.isFinite(Date.parse(row.created_at))) {
      throw new Error('The roster snapshot contains invalid document metadata.');
    }
  }
  const rows = resources.flatMap(resource => [...source[resource]].map(([id, { id: ignored, ...record }]) => {
    if (resource === 'roster_position_templates' ? !['onsite_exam', 'blood_draw', 'setup'].includes(id) : !uuid.test(id)) {
      throw new Error('The roster snapshot contains an invalid record ID.');
    }
    return { resource, id, record };
  }));
  return { rows, documents };
}

export async function loadRosterSnapshot({ DB, PERSONNEL_FILES }, snapshot, readSourceObject) {
  const guard = await guardEmptyImport(DB, rosterSnapshotTables);
  const { statements, counts } = await prepareRosterSnapshot({ DB, PERSONNEL_FILES }, snapshot, readSourceObject);
  await DB.batch([guard, ...statements]);
  return counts;
}

export async function prepareRosterSnapshot({ DB, PERSONNEL_FILES }, snapshot, readSourceObject) {
  const { rows, documents } = readSnapshot(snapshot);
  const statements = prepareSnapshotRows(DB, 'preview_roster_samples', ['resource', 'id', 'record'],
    rows.map(row => ({ ...row, record: JSON.stringify(row.record) })));

  const copied = [];
  for (const row of documents) {
    const bytes = await readSourceObject(row.object_path);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== row.file_size) {
      throw new Error('A source personnel document is missing or has a different size.');
    }
    const path = 'imported-personnel/' + row.id;
    // Leave verified private copies available for retry if metadata has not committed.
    await PERSONNEL_FILES.put(path, bytes, {
      onlyIf: new Headers({ 'If-None-Match': '*' }), httpMetadata: { contentType: row.mime_type },
    });
    const stored = await PERSONNEL_FILES.get(path);
    if (!stored || stored.size !== bytes.byteLength || stored.httpMetadata?.contentType !== row.mime_type
      || checksum(await stored.arrayBuffer().then(buffer => new Uint8Array(buffer))) !== checksum(bytes)) {
      throw new Error('The R2 copy differs from the source personnel document.');
    }
    copied.push({ ...row, object_path: path });
  }
  const columns = ['id', 'personnel_id', 'kind', 'object_path', 'file_name', 'mime_type', 'file_size', 'created_at'];
  statements.push(...prepareSnapshotRows(DB, 'preview_personnel_documents', columns, copied));
  return { statements, counts: { rosterRecords: rows.length, personnelDocuments: documents.length } };
}
