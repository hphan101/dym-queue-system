import { Fragment, useContext } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { handleInternalLinkClick } from '@/lib/navigation';
import { AdminBreadcrumbContext, type AdminBreadcrumbItem } from './adminBreadcrumbs';

export function AdminBreadcrumb({ items }: { items?: AdminBreadcrumbItem[] }) {
  const defaults = useContext(AdminBreadcrumbContext);
  const trail = items ?? defaults;
  if (!trail.length) return null;
  return (
    <Breadcrumb className="dym-breadcrumb" aria-label="Đường dẫn điều hướng">
      <BreadcrumbList>
        {trail.map((item, index) => (
          <Fragment key={`${index}:${item.label}`}>
            {index > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem className="min-w-0 [overflow-wrap:anywhere]">
              {index === trail.length - 1 ? (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              ) : item.onSelect ? (
                <BreadcrumbLink asChild>
                  <button type="button" onClick={item.onSelect}>{item.label}</button>
                </BreadcrumbLink>
              ) : item.href ? (
                <BreadcrumbLink asChild>
                  <a href={item.href} onClick={(event) => handleInternalLinkClick(event, item.href!)}>{item.label}</a>
                </BreadcrumbLink>
              ) : <span>{item.label}</span>}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
