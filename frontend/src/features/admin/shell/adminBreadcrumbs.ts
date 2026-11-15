import { createContext } from 'react';

import type { AdminPageKey } from './AdminSidebar';


export interface AdminBreadcrumbItem {
  label: string;
  href?: string;
  onSelect?: () => void;
}

export function getAdminBreadcrumbs(page: AdminPageKey): AdminBreadcrumbItem[] {
  const labels: Record<AdminPageKey, [string, string]> = {
    dashboard: ['Tiếp đón & hàng đợi', 'Tiếp nhận'],
    registrations: ['Tiếp đón & hàng đợi', 'Danh sách tiếp nhận'],
    'roster-dashboard': ['Điều phối Y khoa', 'Tổng quan vận hành'],
    'roster-settlement': ['Điều phối Y khoa', 'Quyết toán chi phí'],
    'roster-insite': ['Điều phối Y khoa', 'Lịch tại Phòng khám'],
    'roster-onsite': ['Điều phối Y khoa', 'Đoàn khám Onsite'],
    'roster-personnel': ['Điều phối Y khoa', 'Nhân sự'],
    staff: ['Hệ thống', 'Quản lý tài khoản'],
  };
  return labels[page].map((label) => ({ label }));
}

export const AdminBreadcrumbContext = createContext<AdminBreadcrumbItem[]>([]);


