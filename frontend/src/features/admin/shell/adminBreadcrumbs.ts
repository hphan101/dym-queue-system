import { createContext } from 'react';

import type { AdminPageKey } from './AdminSidebar';


export interface AdminBreadcrumbItem {
  label: string;
  href?: string;
  onSelect?: () => void;
}

export function getAdminBreadcrumbs(page: AdminPageKey): AdminBreadcrumbItem[] {
  const labels: Record<AdminPageKey, [string, string]> = {
    dashboard: ['Tiếp nhận và Hàng đợi', 'Tiếp nhận'],
    registrations: ['Tiếp nhận và Hàng đợi', 'Danh sách tiếp nhận'],
    'roster-dashboard': ['Điều phối', 'Tổng quan vận hành'],
    'roster-settlement': ['Điều phối', 'Quyết toán chi phí'],
    'roster-insite': ['Điều phối', 'Lịch tại Phòng khám'],
    'roster-onsite': ['Điều phối', 'Đoàn khám Onsite'],
    'roster-personnel': ['Điều phối', 'Nhân sự'],
    staff: ['Hệ thống', 'Quản lý tài khoản'],
  };
  return labels[page].map((label) => ({ label }));
}

export const AdminBreadcrumbContext = createContext<AdminBreadcrumbItem[]>([]);


