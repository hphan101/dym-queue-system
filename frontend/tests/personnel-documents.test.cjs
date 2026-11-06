const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '../..');
const personnelId = '00000000-0000-4000-8000-000000000001';
function load(supabase = {}) {
  const result = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'frontend/src/features/admin/roster/personnelDocuments.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('exports', 'require', code)(result, () => ({ supabase }));
  return result;
}
const pdf = () => new File(['%PDF-1.7\nTest'], 'scan.pdf', { type: 'application/pdf' });

test('scan validation rejects empty, oversized, unsupported and disguised files', async () => {
  const { validatePersonnelFile } = load();
  assert.equal((await validatePersonnelFile(pdf())).mime, 'application/pdf');
  await assert.rejects(validatePersonnelFile(new File([], 'scan.pdf')), /nội dung/);
  await assert.rejects(validatePersonnelFile(new File([new Uint8Array(10485761)], 'scan.pdf')), /10 MB/);
  await assert.rejects(validatePersonnelFile(new File(['<html>'], 'scan.html')), /PDF/);
  await assert.rejects(validatePersonnelFile(new File(['<html>'], 'scan.pdf', { type: 'application/pdf' })), /khớp/);
  await assert.rejects(validatePersonnelFile(new File(['%PDF-'], 'scan.pdf', { type: 'text/html' })), /PDF/);
});

test('upload stores opaque paths without overwriting and signed links expire in 60 seconds', async () => {
  let uploadedPath, payload, signedExpiry;
  const bucket = {
    async upload(objectPath, file, options) { uploadedPath = objectPath; assert.equal(options.upsert, false); assert.equal(file.name, 'scan.pdf'); return {}; },
    async createSignedUrl(objectPath, expiry) { assert.equal(objectPath, uploadedPath); signedExpiry = expiry; return { data: { signedUrl: 'https://example.test/signed' } }; },
  };
  const service = load({
    storage: { from(name) { assert.equal(name, 'personnel-documents'); return bucket; } },
    from() { return { insert(input) { payload = input; return this; }, select() { return this; }, async single() { return { data: { id: 'document', ...payload } }; } }; },
  });
  const document = await service.uploadPersonnelDocument(personnelId, 'identity', pdf());
  assert.match(uploadedPath, new RegExp(`^${personnelId}/identity/[a-f0-9]{32}\\.pdf$`));
  assert.equal(payload.personnel_id, personnelId);
  assert.equal(payload.file_name, 'scan.pdf');
  assert.equal(await service.getPersonnelDocumentUrl(document), 'https://example.test/signed');
  assert.equal(signedExpiry, 60);
});

test('a lost metadata response preserves committed files; definite failures clean only unlinked uploads', async () => {
  for (const committed of [true, false]) {
    let removed = false;
    const document = { id: 'saved-document' };
    const query = {
      insert() { return this; }, select() { return this; }, eq() { return this; },
      async single() { return { error: new Error('lost response') }; },
      async maybeSingle() { return { data: committed ? document : null }; },
    };
    const service = load({ from: () => query, storage: { from: () => ({ upload: async () => ({}), remove: async () => { removed = true; return {}; } }) } });
    const upload = service.uploadPersonnelDocument(personnelId, 'certificate', pdf());
    if (committed) assert.equal((await upload).id, document.id);
    else await assert.rejects(upload, /tải lại/);
    assert.equal(removed, !committed);
  }
});

test('private document policies deny non-admin access and only admins can remove stored files and metadata', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema storage;
      grant usage on schema storage to authenticated;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      grant select, insert, delete on storage.objects to authenticated;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1, '/'))[1:array_length(string_to_array($1, '/'),1)-1] $$;
      create function public.is_admin() returns boolean language sql stable as $$ select coalesce(current_setting('app.is_admin',true),'false') = 'true' $$;
      create table public.medical_personnel (id uuid primary key);
      grant select on public.medical_personnel to authenticated;
      insert into public.medical_personnel values ('${personnelId}');
    `);
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261103100000_add_personnel_documents.sql'), 'utf8'));
    assert.equal((await db.query('select public from storage.buckets')).rows[0].public, false);
    await db.exec("set role authenticated; set app.is_admin = 'true'");
    const objectPath = `${personnelId}/identity/file.pdf`;
    await db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', ['personnel-documents', objectPath]);
    await db.query(`insert into public.personnel_documents(personnel_id,kind,object_path,file_name,mime_type,file_size) values ($1,'identity',$2,'scan.pdf','application/pdf',10)`, [personnelId, objectPath]);
    await db.query('delete from storage.objects where name=$1', [objectPath]);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 1);
    await db.exec("set app.is_admin = 'false'");
    assert.equal((await db.query('select * from public.personnel_documents')).rows.length, 0);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
    await assert.rejects(db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', ['personnel-documents', `${personnelId}/certificate/test.pdf`]), /row-level security/);
    await assert.rejects(db.query(`insert into public.personnel_documents(personnel_id,kind,object_path,file_name,mime_type,file_size) values ($1,'identity',$2,'scan.pdf','application/pdf',10)`, [personnelId, `${personnelId}/identity/other.pdf`]), /row-level security/);
    await db.exec('reset role');
    await assert.rejects(db.query('delete from public.medical_personnel where id=$1', [personnelId]), /foreign key/);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.personnel_documents'), /permission denied/);
    await db.exec('reset role');
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261103110000_allow_admin_delete_personnel_documents.sql'), 'utf8'));
    await db.exec("set role authenticated; set app.is_admin = 'false'");
    assert.equal((await db.query('delete from storage.objects returning *')).rows.length, 0);
    assert.equal((await db.query('delete from public.personnel_documents returning *')).rows.length, 0);
    await db.exec("set app.is_admin = 'true'");
    assert.equal((await db.query('delete from storage.objects where name=$1 returning *', [objectPath])).rows.length, 1);
    assert.equal((await db.query('delete from public.personnel_documents where object_path=$1 returning *', [objectPath])).rows.length, 1);
  } finally { await db.close(); }
});

test('deletion stops on storage errors and keeps failed metadata deletion retryable', async () => {
  for (const failure of ['storage', 'metadata', null]) {
    const calls = [];
    const document = { id: 'document-id', object_path: `${personnelId}/identity/file.pdf` };
    const service = load({
      storage: { from: () => ({ async remove(paths) {
        calls.push('storage'); assert.deepEqual(paths, [document.object_path]);
        return { error: failure === 'storage' ? new Error('blocked') : null };
      } }) },
      from: () => ({
        delete() { calls.push('metadata'); return this; },
        eq(key, value) { assert.equal(value, key === 'id' ? document.id : document.object_path); return this; },
        then(resolve) { return Promise.resolve({ error: failure === 'metadata' ? new Error('lost response') : null }).then(resolve); },
      }),
    });
    if (failure) await assert.rejects(service.deletePersonnelDocument(document), failure === 'storage' ? /Không thể xóa/ : /xác nhận xóa lại/);
    else await service.deletePersonnelDocument(document);
    assert.deepEqual(calls, failure === 'storage' ? ['storage'] : ['storage', 'metadata']);
  }
});
