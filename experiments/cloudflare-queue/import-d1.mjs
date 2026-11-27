export async function guardEmptyImport(db, tables) {
  // Callers supply fixed destination table names from the schema.
  const isEmpty = tables.map(table => `not exists (select 1 from ${table})`).join(' and ');
  const target = await db.prepare(`select revision, ${isEmpty} as empty from preview_roster_revision where id = 1`).first();
  if (!target?.empty) throw new Error('Use an initialized empty database for the snapshot.');
  return db.prepare(`update preview_roster_revision set revision =
    case when revision = ? and ${isEmpty} then revision + 1 else null end where id = 1`).bind(target.revision);
}

export function prepareSnapshotRows(db, table, columns, rows) {
  const placeholders = columns.map((_, index) => `json_extract(value, '$[${index}]')`);
  const sql = `insert into ${table} (${columns.join(', ')}) select ${placeholders.join(', ')} from json_each(?)`;
  const statements = [];
  let batch = [];
  let size = 2;
  for (const row of rows) {
    const json = JSON.stringify(columns.map(column => row[column]));
    const bytes = Buffer.byteLength(json) + 1;
    if (bytes + 2 > 2_000_000) throw new Error('A snapshot row exceeds the D1 value limit.');
    if (batch.length && size + bytes > 256_000) {
      statements.push(db.prepare(sql).bind('[' + batch.join(',') + ']'));
      batch = [];
      size = 2;
    }
    batch.push(json);
    size += bytes;
  }
  if (batch.length) statements.push(db.prepare(sql).bind('[' + batch.join(',') + ']'));
  return statements;
}
