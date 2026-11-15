import { createContext, useContext } from 'react';
import { getDefaultPermissions, hasPermission, type PermissionModule, type PermissionAction, type StaffPermissions } from '@/lib/staffPermissions';

export const StaffPermissionsContext = createContext<StaffPermissions>(getDefaultPermissions('none'));
export const PermissionModuleContext = createContext<PermissionModule | undefined>(undefined);
export const DESTINATION_PERMISSIONS: Record<string, PermissionModule> = {
  dashboard: 'reception', registrations: 'registrations', 'roster-dashboard': 'overview',
  'roster-insite': 'clinic', 'roster-onsite': 'onsite', 'roster-personnel': 'personnel',
  'roster-settlement': 'settlement', staff: 'staff',
};
export function useStaffPermissions() {
  const permissions = useContext(StaffPermissionsContext);
  return { permissions, can: (module: PermissionModule, action: PermissionAction = 'view') => hasPermission('', permissions, module, action) };
}
