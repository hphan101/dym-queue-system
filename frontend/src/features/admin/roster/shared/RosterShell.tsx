import { AdminLayout } from '../../components/AdminLayout';
import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

import { type AdminPageKey } from '../../AdminSidebar';
import { getInitialStaffName } from '../../adminIdentity';
import { AdminHeader } from '../../components/AdminHeader';

import { useRosterData } from '../data/useRosterData';
import '../../admin.css';
import '../../staff.css';
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
  authorizedIsAdmin?: boolean;
  headerActions?: ReactNode;
  children: ReactNode;
}

export function RosterShell({
  activePage,
  title,
  authorizedIsAdmin = true,
  headerActions,
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
      <AdminHeader title={title} actions={headerActions} />

      <main className="dym-admin-content">
        {errorBanner && (
          <div
            className="dym-data-error flex items-center justify-between gap-3"
            role="alert"
          >
            <span>{errorBanner}</span>
            <button
              type="button"
              onClick={clearBanners}
              aria-label="Đóng thông báo lỗi"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
        {successBanner && (
          <div className="dym-staff-success" role="status">
            <span>{successBanner}</span>
            <button
              type="button"
              onClick={clearBanners}
              aria-label="Đóng thông báo"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
        {children}
      </main>
    </AdminLayout>
  );
}
