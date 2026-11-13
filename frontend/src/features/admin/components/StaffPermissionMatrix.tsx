import { Button } from '@/components/ui/button';
import { PERMISSION_ACTIONS, PERMISSION_MODULES, getDefaultPermissions, type PermissionAction, type PermissionModule, type StaffPermissions } from '@/lib/staffPermissions';

const LABELS = { view: 'Xem', create: 'Thêm', update: 'Sửa', delete: 'Xóa' };
export function StaffPermissionMatrix({ value, onChange, disabled }: {
  value: StaffPermissions; onChange: (value: StaffPermissions) => void; disabled: boolean;
}) {
  const toggle = (module: PermissionModule, action: PermissionAction, checked: boolean) => {
    const row = { ...value[module], [action]: checked };
    if (checked && action !== 'view') row.view = true;
    if (!checked && action === 'view') for (const key of Object.keys(row) as PermissionAction[]) row[key] = false;
    onChange({ ...value, [module]: row });
  };
  return <fieldset className="dym-staff-permission-matrix" disabled={disabled}>
    <legend>Quyền theo chức năng</legend>
    <div className="flex flex-wrap gap-2">
      {([['none', 'Bỏ chọn tất cả'], ['viewer', 'Chỉ xem'], ['receptionist', 'Lễ tân'], ['operator', 'Vận hành'], ['admin', 'Toàn quyền']] as const).map(([role, label]) =>
        <Button key={role} type="button" variant="outline" size="sm" disabled={disabled}
          onClick={() => onChange(getDefaultPermissions(role))}>{label}</Button>)}
    </div>
    <div className="dym-staff-permission-scroll" tabIndex={0} role="region" aria-label="Ma trận quyền theo chức năng">
      <table>
        <thead><tr><th scope="col">Chức năng</th>{PERMISSION_ACTIONS.map((action) => <th key={action} scope="col">
          <button type="button" disabled={disabled} title={`Chọn hoặc bỏ cả cột ${LABELS[action]}`} onClick={() => {
            const eligible = PERMISSION_MODULES.filter((module) => (module.actions as readonly string[]).includes(action));
            const checked = !eligible.every(({ key }) => value[key][action]);
            const next = structuredClone(value);
            for (const { key } of eligible) {
              next[key][action] = checked;
              if (checked && action !== 'view') next[key].view = true;
              if (!checked && action === 'view') for (const item of Object.keys(next[key]) as PermissionAction[]) next[key][item] = false;
            }
            onChange(next);
          }}>{LABELS[action]}</button>
        </th>)}</tr></thead>
        <tbody>{PERMISSION_MODULES.map(({ key, label, actions }) => <tr key={key}>
          <th scope="row">{label}</th>{PERMISSION_ACTIONS.map((action) => <td key={action}>
            {(actions as readonly string[]).includes(action)
              ? <input type="checkbox" aria-label={`${label}: ${LABELS[action]}`} checked={Boolean(value[key][action])}
                onChange={(event) => toggle(key, action, event.target.checked)} />
              : <span aria-label="Không áp dụng">·</span>}
          </td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <small>Chọn Thêm / Sửa / Xóa sẽ tự bật Xem. Bỏ Xem sẽ bỏ các quyền còn lại của chức năng đó. Vai trò chỉ là mẫu quyền.</small>
    <small>Quyền quản lý nhân viên cho phép quản lý tài khoản và cấp quyền cho người khác.</small>
  </fieldset>;
}
