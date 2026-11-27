// Rehearse a consistent source snapshot in an isolated SQLite database.
export function loadReceptionSnapshot(db, snapshot) {
  const { branches, registrations, daily_queue_counters: counters, branch_display_state: displays,
    queue_calls: calls, audit_logs: logs, registration_access_sessions: sessions } = snapshot;
  if (![branches, registrations, counters, displays, calls, logs, sessions].every(Array.isArray)) {
    throw new Error('The reception snapshot is missing one or more tables.');
  }
  const codes = new Map(branches.map(({ id, code }) => [id, code]));
  const branchCode = id => {
    const code = codes.get(id);
    if (!['q1', 'q7', 'hn'].includes(code)) throw new Error('The reception snapshot contains an unknown branch.');
    return code;
  };
  const millis = (timestamp, nullable = false) => {
    if (timestamp === null && nullable) return null;
    const value = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN;
    if (!Number.isFinite(value)) throw new Error('The reception snapshot contains an invalid timestamp.');
    return value;
  };

  db.exec('begin immediate');
  try {
    if (db.prepare(`select exists(select 1 from registrations) or exists(select 1 from daily_queue_counters)
      or exists(select 1 from display_state) or exists(select 1 from audit_logs)
      or exists(select 1 from preview_registration_sessions) as occupied`).get().occupied) {
      throw new Error('Use a fresh rehearsal database for the reception snapshot.');
    }
    const insertRegistration = db.prepare(`
      insert into registrations (id, branch, queue_date, queue_number, demo_code, registered_at, called_at, state, last_called_at, first_called_by)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertDetails = db.prepare('insert into preview_registration_edits (registration_id, details, locked) values (?, ?, ?)');
    const insertPrinted = db.prepare('insert into preview_print_status (registration_id, consent, tt25) values (?, ?, ?)');
    const calledRegistrations = new Set(calls.map(row => row.registration_id));
    for (const row of registrations) {
      const { printedConsent, printedTT25, email = '', ...tt25 } = row.tt25_data ?? {};
      if (!Number.isInteger(row.queue_number)) {
        throw new Error('The reception snapshot must include the ticket number for every registration.');
      }
      const calledAt = millis(row.first_called_at, true);
      insertRegistration.run(row.id, branchCode(row.branch_id), row.queue_date, row.queue_number, row.identity_document,
        millis(row.registered_at), calledAt, row.state, millis(row.last_called_at, true), row.first_called_by);
      const details = {
        fullName: row.full_name, birthDate: row.birth_date, gender: row.gender,
        phoneNumber: row.phone_number, email, identityDocument: row.identity_document,
        workplace: row.company_name, province: row.province, ward: row.ward,
        addressDetail: row.address_detail, receptionNote: row.reception_note ?? '', tt25,
      };
      const consent = printedConsent === true || printedConsent === 'true';
      const printed = printedTT25 === true || printedTT25 === 'true';
      insertDetails.run(row.id, JSON.stringify(details), Number(row.state !== 'active' || calledAt !== null
        || calledRegistrations.has(row.id) || consent || printed));
      if (consent || printed) insertPrinted.run(row.id, Number(consent), Number(printed));
    }
    const findRegistration = db.prepare('select 1 from registrations where id = ? and branch = ?');
    const insertCall = db.prepare('insert into queue_calls (id, branch, registration_id, call_kind, called_by, called_at) values (?, ?, ?, ?, ?, ?)');
    for (const row of calls) {
      const branch = branchCode(row.branch_id);
      if (!findRegistration.get(row.registration_id, branch)) throw new Error('A source call has no matching registration in its branch.');
      insertCall.run(row.id, branch, row.registration_id, row.call_kind, row.called_by, millis(row.called_at));
    }
    const insertSession = db.prepare('insert into preview_registration_sessions (token_hash, branch, expires_at) values (?, ?, ?)');
    const insertReceipt = db.prepare('insert into preview_registration_submissions (token_hash, registration_id, request_hash) values (?, ?, ?)');
    const digest = /^[a-f0-9]{64}$/;
    for (const row of sessions) {
      const branch = branchCode(row.branch_id);
      if (!digest.test(row.token_hash) || (row.request_hash !== null && !digest.test(row.request_hash))
        || (row.registration_id === null && row.request_hash !== null)
        || (row.registration_id !== null && !findRegistration.get(row.registration_id, branch))) {
        throw new Error('A source QR session has invalid receipt data.');
      }
      insertSession.run(row.token_hash, branch, millis(row.expires_at));
      if (row.registration_id !== null) insertReceipt.run(row.token_hash, row.registration_id, row.request_hash);
    }
    const insertLog = db.prepare('insert into audit_logs (id, branch, actor_id, action, entity_type, entity_id, metadata, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const row of logs) {
      if (typeof row.id !== 'string' || !/^\d+$/.test(row.id)) throw new Error('Source audit IDs must be exported as exact decimal text.');
      insertLog.run(row.id, row.branch_id === null ? null : branchCode(row.branch_id), row.actor_id,
        row.action, row.entity_type, row.entity_id, JSON.stringify(row.metadata), millis(row.created_at));
    }

    const ticketCounter = db.prepare('select last_number from daily_queue_counters where branch = ? and queue_date = ?');
    const setCounter = db.prepare(`
      insert into daily_queue_counters (branch, queue_date, last_number) values (?, ?, ?)
      on conflict (branch, queue_date) do update set last_number = excluded.last_number
    `);
    const seenCounters = new Set();
    for (const row of counters) {
      const branch = branchCode(row.branch_id);
      const key = `${branch}/${row.queue_date}`;
      if (seenCounters.has(key) || row.last_number < (ticketCounter.get(branch, row.queue_date)?.last_number ?? 0)) {
        throw new Error('A source counter is duplicated or behind a registration already issued.');
      }
      seenCounters.add(key);
      setCounter.run(branch, row.queue_date, row.last_number);
    }
    if (db.prepare('select count(*) as n from daily_queue_counters').get().n !== seenCounters.size) {
      throw new Error('The source snapshot is missing a counter for an issued ticket.');
    }

    const findTicket = db.prepare('select 1 from registrations where id = ? and branch = ? and queue_date = ? and queue_number = ?');
    const insertDisplay = db.prepare('insert into display_state (branch, registration_id, queue_date, queue_number, called_at, revision) values (?, ?, ?, ?, ?, ?)');
    for (const row of displays) {
      const branch = branchCode(row.branch_id);
      const calledAt = millis(row.called_at, true);
      if (row.registration_id === null ? row.queue_date !== null || row.queue_number !== null || calledAt !== null
        : calledAt === null || !findTicket.get(row.registration_id, branch, row.queue_date, row.queue_number)) {
        throw new Error('A TV state does not match its ticket in the source snapshot.');
      }
      insertDisplay.run(branch, row.registration_id, row.queue_date, row.queue_number, calledAt, row.revision);
    }
    db.exec('commit');
    return { registrations: registrations.length, counters: counters.length, displays: displays.length,
      calls: calls.length, auditLogs: logs.length, sessions: sessions.length };
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
}
