import { Badge } from '@/components/ui/badge';
import { ROLE_LABELS, ROLE_SHORT_LABELS, type PersonnelRoleType } from '../data/rosterService';

export function PersonnelRoleBadge({ role, compact = false }: {
  role: PersonnelRoleType;
  compact?: boolean;
}) {
  const shortLabel = role === 'nurse' ? 'Điều dưỡng' : ROLE_SHORT_LABELS[role];
  return (
    <Badge variant="outline" className="personnel-role-badge border-transparent" data-personnel-role={role}>
      {compact ? shortLabel : ROLE_LABELS[role]}
    </Badge>
  );
}
