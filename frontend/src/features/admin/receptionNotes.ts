import { supabase } from '../../lib/supabaseClient';

export async function saveReceptionNote(id: string, note: string, expectedNote: string): Promise<string> {
  const value = note.trim();
  if (!id || value.length > 500) throw new Error('Ghi chú không được vượt quá 500 ký tự.');
  const { data, error } = await supabase.rpc('update_registration_reception_note', {
    p_registration_id: id,
    p_note: value,
    p_expected_note: expectedNote,
  });
  if (error) {
    if (error.message?.includes('NOTE_CHANGED')) {
      throw new Error('Ghi chú đã được sửa ở máy khác. Hãy sao chép nội dung đang nhập và tải lại danh sách trước khi sửa tiếp.');
    }
    throw new Error('Chưa lưu được ghi chú. Kiểm tra kết nối và thử lại.');
  }
  if (typeof data !== 'string') throw new Error('Chưa xác nhận được ghi chú đã lưu. Vui lòng thử lại.');
  return data;
}
