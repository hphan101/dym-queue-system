import { useContext } from 'react';
import { ChevronRight } from 'lucide-react';
import { handleInternalLinkClick } from '@/lib/navigation';
import { AdminBreadcrumbContext, type AdminBreadcrumbItem } from './adminBreadcrumbs';

export function AdminBreadcrumb({ items }: { items?: AdminBreadcrumbItem[] }) {
  const defaults = useContext(AdminBreadcrumbContext);
  const trail = items ?? defaults;
  if (!trail.length) return null;
  return (
    <nav className="dym-breadcrumb" aria-label="Đường dẫn điều hướng">
      <ol>
        {trail.map((item, index) => {
          const current = index === trail.length - 1;
          return (
            <li key={`${index}:${item.label}`}>
              {index > 0 && <ChevronRight aria-hidden="true" />}
              {current ? <span aria-current="page">{item.label}</span>
                : item.onSelect ? <button type="button" onClick={item.onSelect}>{item.label}</button>
                  : item.href ? <a href={item.href} onClick={(event) => handleInternalLinkClick(event, item.href!)}>{item.label}</a>
                    : <span>{item.label}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

