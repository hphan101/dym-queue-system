import { cn } from '@/lib/utils';
import { useState,type ReactNode } from 'react';
import { FeedbackBanner } from '../../shared/FeedbackBanner';
import { AdminLayout } from '../../shell/AdminLayout';

import { getInitialStaffName } from '../../shared/adminIdentity';
import { AdminHeader } from '../../shell/AdminHeader';
import { type AdminPageKey } from '../../shell/AdminSidebar';
import type { AdminBreadcrumbItem } from '../../shell/adminBreadcrumbs';

import '../../accounts/staff.css';
import '../../shell/admin.css';
import { useRosterData } from '../data/useRosterData';
import './roster.css';

export interface RosterShellProps {
  activePage: Extract<
    AdminPageKey,
    | 'roster-dashboard'
    | 'roster-settlement'
    | 'roster-insite'
    | 'roster-onsite'
    | 'roster-personnel'
  >;
  title: string;
  breadcrumbs?: AdminBreadcrumbItem[];
  authorizedIsAdmin?: boolean;
  headerActions?: ReactNode;
  contentClassName?: string;
  children: ReactNode;
}

export function RosterShell({
  activePage,
  title,
  breadcrumbs,
  authorizedIsAdmin = true,
  headerActions,
  contentClassName,
  children,
}: RosterShellProps) {
  const [staffName] = useState(getInitialStaffName);
  const {
    selectedBranch,
    selectedDate,
    errorBanner,
    successBanner,
    clearBanners,
  } = useRosterData();

  return (
    <AdminLayout
      activePage={activePage}
      branch={selectedBranch}
      date={selectedDate}
      staffName={staffName}
      isAdmin={authorizedIsAdmin}
      staffRole={authorizedIsAdmin ? 'admin' : 'operator'}
    >
      <AdminHeader title={title} breadcrumbs={breadcrumbs} actions={headerActions} />

      <main className={cn('dym-admin-content', contentClassName)}>
        {errorBanner && (
          <FeedbackBanner variant="destructive" message={errorBanner} onDismiss={clearBanners} />
        )}
        {successBanner && (
          <FeedbackBanner variant="success" message={successBanner} onDismiss={clearBanners} />
        )}
        {children}
      </main>
    </AdminLayout>
  );
}
