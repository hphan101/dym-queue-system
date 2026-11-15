import { supabase } from '@/lib/supabaseClient';
import type { StaffAccount } from './types';

interface StaffApiResponse {
  success: boolean;
  permissionSchemaVersion?: number;
  code?: string;
  staff?: StaffAccount[];
}

export function apiErrorMessage(code?: string) {
  switch (code) {
    case 'ACCOUNT_EXISTS':
      return 'Tài khoản đăng nhập này đã tồn tại trên hệ thống.';
    case 'SELF_ADMIN_PROTECTION':
      return 'Bạn không thể tự khóa, tự xóa hoặc tự thu hồi quyền quản lý nhân viên của mình.';
    case 'INVALID_DATA':
      return 'Thông tin không hợp lệ. Vui lòng kiểm tra lại họ tên, tài khoản và mật khẩu.';
    case 'ADMIN_REQUIRED':
      return 'Tài khoản chưa được cấp quyền thực hiện thao tác này.';
    case 'PERMISSION_API_NOT_READY':
      return 'Cần cập nhật database và API phân quyền trước khi lưu. Các quyền hiện tại chưa bị thay đổi.';
    case 'STAFF_NOT_FOUND':
      return 'Không tìm thấy tài khoản nhân viên.';
    case 'CREATE_FAILED':
      return 'Không thể tạo tài khoản trên hệ thống xác thực. Vui lòng kiểm tra lại mật khẩu (tối thiểu 6 ký tự).';
    case 'ORIGIN_NOT_ALLOWED':
      return 'Địa chỉ mạng này chưa được cấp quyền CORS. Vui lòng kiểm tra cấu hình mạng.';
    case 'AUTH_REQUIRED':
      return 'Phiên làm việc đã hết hạn. Vui lòng tải lại trang hoặc đăng nhập lại.';
    case 'SERVER_ERROR':
      return 'Lỗi máy chủ khi xử lý dữ liệu. Vui lòng thử lại sau.';
    default:
      return code && code !== 'REQUEST_FAILED'
        ? `Thao tác không thành công (${code}). Vui lòng thử lại.`
        : 'Không thể thực hiện thao tác. Vui lòng thử lại.';
  }
}

async function getValidAccessToken(forceRefresh = false): Promise<string> {
  if (forceRefresh) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session?.access_token) {
      throw new Error('AUTH_REQUIRED');
    }
    return data.session.access_token;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('AUTH_REQUIRED');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (session.expires_at && session.expires_at - nowSec < 60) {
    const { data } = await supabase.auth.refreshSession();
    if (data.session?.access_token) {
      return data.session.access_token;
    }
  }

  return session.access_token;
}

export async function requestStaffApi(
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const executeFetch = async (accessToken: string) =>
    fetch(`${supabaseUrl}/functions/v1/manage-staff`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: publishableKey,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  let token = await getValidAccessToken(false);
  let response = await executeFetch(token);

  if (response.status === 401) {
    token = await getValidAccessToken(true);
    response = await executeFetch(token);
  }

  let result: StaffApiResponse | null = null;
  try {
    result = (await response.json()) as StaffApiResponse;
  } catch {
    // Non-JSON response
  }

  if (!response.ok || !result?.success) {
    const fallbackCode =
      response.status === 403 ? 'ORIGIN_NOT_ALLOWED' : 'REQUEST_FAILED';
    throw new Error(result?.code ?? fallbackCode);
  }
  return result;
}
