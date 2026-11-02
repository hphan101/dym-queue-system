import { supabase } from '../../lib/supabaseClient';
import type { TT25StoredExtras } from './types';

export interface RegistrationEditableFields {
  full_name: string;
  gender: 'Nam' | 'Nữ';
  birth_date: string;
  phone_number: string;
  identity_document: string;
  company_name: string;
  province: string;
  ward: string;
  address_detail: string;
  tt25_data?: TT25StoredExtras;
}

export async function saveRegistrationEdit(
  id: string,
  fields: RegistrationEditableFields,
): Promise<void> {
  if (!id) throw new Error('Không tìm thấy hồ sơ cần cập nhật.');
  const extras = fields.tt25_data ? { ...fields.tt25_data } : null;
  if (extras) {
    // Editing a profile must not overwrite print events from another workstation.
    delete extras.printedConsent;
    delete extras.printedTT25;
  }
  const { error } = await supabase.rpc('update_registration_details', {
    p_registration_id: id,
    p_full_name: fields.full_name.trim(),
    p_birth_date: fields.birth_date.trim(),
    p_gender: fields.gender,
    p_phone_number: fields.phone_number.replace(/[^0-9]/g, ''),
    p_identity_document: fields.identity_document.trim().toUpperCase(),
    p_company_name: fields.company_name.trim(),
    p_province: fields.province.trim(),
    p_ward: fields.ward.trim(),
    p_address_detail: fields.address_detail.trim(),
    p_tt25_data: extras,
  });
  if (error) {
    throw new Error('Không thể lưu hồ sơ. Vui lòng kiểm tra thông tin và thử lại.');
  }
}
