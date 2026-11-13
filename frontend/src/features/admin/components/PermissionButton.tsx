import { useContext } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import type { PermissionAction, PermissionModule } from '@/lib/staffPermissions';
import { PermissionModuleContext, useStaffPermissions } from '../hooks/useStaffPermissions';

export function PermissionButton({ permissionAction, permissionModule, disabled, ...props }: ButtonProps & {
  permissionAction?: PermissionAction; permissionModule?: PermissionModule;
}) {
  const currentModule = useContext(PermissionModuleContext);
  const { can } = useStaffPermissions();
  const module = permissionModule ?? currentModule;
  return <Button {...props} disabled={disabled || Boolean(permissionAction && (!module || !can(module, permissionAction)))} />;
}
