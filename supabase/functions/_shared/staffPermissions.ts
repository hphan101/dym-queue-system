export const PERMISSION_ACTIONS = ['view', 'create', 'update', 'delete'] as const;
export type PermissionAction = typeof PERMISSION_ACTIONS[number];
export const PERMISSION_MODULES = [
  { key: 'reception', label: 'Tiếp nhận & gọi số', actions: ['view', 'update'] },
  { key: 'registrations', label: 'Danh sách tiếp nhận', actions: ['view', 'create', 'update', 'delete'] },
  { key: 'registration_qr', label: 'Màn hình QR đăng ký', actions: ['view'] },
  { key: 'printing', label: 'In hồ sơ', actions: ['view'] },
  { key: 'overview', label: 'Tổng quan vận hành', actions: ['view'] },
  { key: 'clinic', label: 'Lịch tại Phòng khám', actions: ['view', 'create', 'update', 'delete'] },
  { key: 'onsite', label: 'Đoàn khám Onsite & vị trí mẫu', actions: ['view', 'create', 'update', 'delete'] },
  { key: 'personnel', label: 'Danh mục Nhân sự', actions: ['view', 'create', 'update', 'delete'] },
  { key: 'personnel_documents', label: 'File hồ sơ nhân sự', actions: ['view', 'create', 'delete'] },
  { key: 'settlement', label: 'Quyết toán chi phí', actions: ['view'] },
  { key: 'export', label: 'Xuất Excel', actions: ['view'] },
  { key: 'staff', label: 'Quản lý nhân viên & phân quyền', actions: ['view', 'create', 'update', 'delete'] },
] as const;
export type PermissionModule = typeof PERMISSION_MODULES[number]['key'];
export type StaffPermissions = Record<PermissionModule, Partial<Record<PermissionAction, boolean>>>;

export function getDefaultPermissions(role: string): StaffPermissions {
  return Object.fromEntries(PERMISSION_MODULES.map(({ key, actions }) => [key,
    Object.fromEntries(actions.map((action) => [action, role === 'admin' || (role === 'viewer' && action === 'view' && key !== 'printing') ||
      (['operator', 'receptionist'].includes(role) && ['reception', 'registrations', 'registration_qr', 'printing', 'export'].includes(key) && action !== 'delete') ||
      (role === 'operator' && ['overview', 'clinic', 'onsite', 'settlement'].includes(key))])),
  ])) as StaffPermissions;
}

export function parsePermissions(value: unknown): StaffPermissions | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !PERMISSION_MODULES.some((module) => module.key === key))) return null;
  const result = getDefaultPermissions('none');
  for (const { key, actions } of PERMISSION_MODULES) {
    const row = input[key];
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    for (const [action, allowed] of Object.entries(row)) {
      if (!(actions as readonly string[]).includes(action) || typeof allowed !== 'boolean') return null;
      result[key][action as PermissionAction] = allowed;
    }
    if (PERMISSION_ACTIONS.some((action) => action !== 'view' && result[key][action]) && !result[key].view) return null;
  }
  return result;
}

export function hasPermission(role: string, permissions: StaffPermissions | null | undefined, module: PermissionModule, action: PermissionAction = 'view'): boolean {
  return (permissions ?? getDefaultPermissions(role))[module]?.[action] === true;
}
