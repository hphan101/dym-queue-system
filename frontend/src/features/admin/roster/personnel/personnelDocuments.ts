import { supabase } from '../../../../lib/supabaseClient';

export type PersonnelDocumentKind = 'identity' | 'certificate';
export interface PersonnelDocument {
  id: string;
  personnel_id: string;
  kind: PersonnelDocumentKind;
  object_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}

const BUCKET = 'personnel-documents';
export const PERSONNEL_FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png';
const FILE_TYPES: Record<string, { mime: string; extension: string }> = {
  pdf: { mime: 'application/pdf', extension: 'pdf' },
  jpg: { mime: 'image/jpeg', extension: 'jpg' },
  jpeg: { mime: 'image/jpeg', extension: 'jpg' },
  png: { mime: 'image/png', extension: 'png' },
};

export async function validatePersonnelFile(file: File) {
  const type = FILE_TYPES[file.name.split('.').pop()?.toLowerCase() ?? ''];
  if (!type || (file.type && file.type !== type.mime))
    throw new Error('Chỉ nhận file PDF, JPG hoặc PNG.');
  if (!file.size || file.size > 10 * 1024 * 1024)
    throw new Error('File phải có nội dung và không vượt quá 10 MB.');
  if (file.name.length > 255)
    throw new Error('Tên file không được vượt quá 255 ký tự.');
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const signatures = {
    pdf: [0x25, 0x50, 0x44, 0x46, 0x2d],
    jpg: [0xff, 0xd8, 0xff],
    png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  };
  if (
    !signatures[type.extension as keyof typeof signatures].every(
      (value, i) => header[i] === value,
    )
  ) {
    throw new Error('Nội dung file không khớp định dạng PDF/JPG/PNG.');
  }
  return type;
}

export async function fetchPersonnelDocuments(
  personnelId: string,
): Promise<PersonnelDocument[]> {
  const { data, error } = await supabase
    .from('personnel_documents')
    .select('*')
    .eq('personnel_id', personnelId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Không thể tải file hồ sơ. Vui lòng thử lại.');
  return data as PersonnelDocument[];
}

export async function uploadPersonnelDocument(
  personnelId: string,
  kind: PersonnelDocumentKind,
  file: File,
): Promise<PersonnelDocument> {
  if (
    !/^[0-9a-f-]{36}$/i.test(personnelId) ||
    !['identity', 'certificate'].includes(kind)
  ) {
    throw new Error('Nhân sự hoặc loại hồ sơ không hợp lệ.');
  }
  const type = await validatePersonnelFile(file);
  // getRandomValues also works on HTTP LAN, where randomUUID is unavailable.
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const objectPath = `${personnelId}/${kind}/${token}.${type.extension}`;
  const bucket = supabase.storage.from(BUCKET);
  const { error: uploadError } = await bucket.upload(objectPath, file, {
    contentType: type.mime,
    upsert: false,
  });
  if (uploadError)
    throw new Error(
      'Không thể tải file lên. Kiểm tra kết nối và quyền admin rồi thử lại.',
    );

  const { data, error } = await supabase
    .from('personnel_documents')
    .insert({
      personnel_id: personnelId,
      kind,
      object_path: objectPath,
      file_name: file.name,
      mime_type: type.mime,
      file_size: file.size,
    })
    .select('*')
    .single();
  if (!error) return data as PersonnelDocument;

  // A lost response may still have committed; never remove a linked file.
  const existing = await supabase
    .from('personnel_documents')
    .select('*')
    .eq('object_path', objectPath)
    .maybeSingle();
  if (existing.data) return existing.data as PersonnelDocument;
  if (!existing.error) await bucket.remove([objectPath]);
  throw new Error(
    'Chưa xác nhận được việc lưu file hồ sơ. Hãy tải lại danh sách trước khi thử lại.',
  );
}

export async function getPersonnelDocumentUrl(
  document: PersonnelDocument,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(document.object_path, 60);
  if (error || !data?.signedUrl)
    throw new Error(
      'Không thể mở file. Kiểm tra kết nối và quyền admin rồi thử lại.',
    );
  return data.signedUrl;
}

export async function deletePersonnelDocument(
  document: PersonnelDocument,
): Promise<void> {
  // Keep the row on storage failure so the file remains visible and retryable.
  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([document.object_path]);
  if (storageError) throw new Error('Không thể xóa file. Vui lòng thử lại.');
  const { error } = await supabase
    .from('personnel_documents')
    .delete()
    .eq('id', document.id)
    .eq('object_path', document.object_path);
  if (error)
    throw new Error(
      'File đã được xóa khỏi kho nhưng chưa cập nhật được danh sách. Vui lòng bấm xác nhận xóa lại để hoàn tất.',
    );
}
