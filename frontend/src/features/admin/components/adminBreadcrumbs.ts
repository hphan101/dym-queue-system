import { createContext } from 'react';

import type { AdminPageKey } from '../AdminSidebar';


export interface AdminBreadcrumbItem {
  label: string;
  href?: string;
  onSelect?: () => void;
}

export function getAdminBreadcrumbs(page: AdminPageKey): AdminBreadcrumbItem[] {
  const labels: Record<AdminPageKey, [string, string]> = {
    dashboard: ['Tiếp đón & hàng đợi', 'Tiếp nhận'],
    registrations: ['Tiếp đón & hàng đợi', 'Danh sách tiếp nhận'],
    'roster-dashboard': ['Điều phối', 'Tổng quan vận hành'],
    'roster-settlement': ['Điều phối', 'Quyết toán chi phí'],
    'roster-insite': ['Điều phối', 'Lịch tại Phòng khám'],
    'roster-onsite': ['Điều phối', 'Đoàn khám Onsite'],
    'roster-personnel': ['Điều phối', 'Danh mục Nhân sự'],
    staff: ['Hệ thống', 'Quản lý nhân viên'],
  };
  return labels[page].map((label) => ({ label }));
}

export const AdminBreadcrumbContext = createContext<AdminBreadcrumbItem[]>([]);


