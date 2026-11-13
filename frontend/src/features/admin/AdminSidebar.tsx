import { useStaffPermissions, DESTINATION_PERMISSIONS } from './hooks/useStaffPermissions';
import { useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  CalendarRange,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Moon,
  PieChart,
  QrCode,
  Settings2,
  ShieldCheck,
  Sun,
  Truck,
  Tv,
  Users,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import dymLogo from '../../assets/dym-logo.png';
import dymLogoDark from '../../assets/dym-logo-dark.png';
import { BRANCH_NAMES } from '../../config/branches';
import { handleInternalLinkClick, openStaffTab } from '../../lib/navigation';
import type { BranchCode } from '../../types/domain';
import type { StaffRole } from './types';
import { useSidebarDisclosureMotion } from './hooks/useSidebarDisclosureMotion';
import './sidebarMotion.css';

export type AdminThemeMode = 'dark' | 'light';
export type AdminPageKey =
  | 'dashboard'
  | 'registrations'
  | 'roster-dashboard'
  | 'roster-settlement'
  | 'roster-insite'
  | 'roster-onsite'
  | 'roster-personnel'
  | 'staff';

interface AdminSidebarProps {
  activePage: AdminPageKey;
  branch: BranchCode;
  date?: string;
  staffName: string;
  isAdmin: boolean;
  staffRole?: StaffRole;
  themeMode: AdminThemeMode;
  isCollapsed: boolean;
  onCollapsedChange: (isCollapsed: boolean) => void;
  onThemeToggle: () => void;
  onLogout: () => void;
}

function getStaffInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'DY';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function AdminSidebar({
  activePage,
  branch,
  date,
  staffName,
  isAdmin,
  staffRole,
  themeMode,
  isCollapsed,
  onCollapsedChange,
  onThemeToggle,
  onLogout,
}: AdminSidebarProps) {
  const { can } = useStaffPermissions();
  const [isRosterOpen, setIsRosterOpen] = useState(true);
  const [isRosterPointerMotion, setIsRosterPointerMotion] = useState(false);
  const rosterMotion = useSidebarDisclosureMotion(isRosterOpen && !isCollapsed);
  const resolvedRole: StaffRole =
    staffRole ?? (isAdmin ? 'admin' : 'receptionist');
  const canAccessRoster = ['overview','clinic','onsite','settlement','personnel'].some((key) => can(key as 'overview'));

  const scopeQuery = date ? `branch=${branch}&date=${date}` : `branch=${branch}`;
  const adminHref = `/?page=admin&${scopeQuery}`;
  const registrationsHref = `/?page=registrations&${scopeQuery}`;
  const rosterDashboardHref = `/?page=roster-dashboard&${scopeQuery}`;
  const rosterInsiteHref = `/?page=roster-insite&${scopeQuery}`;
  const rosterOnsiteHref = `/?page=roster-onsite&${scopeQuery}`;
  const rosterPersonnelHref = '/?page=roster-personnel';
  const displayHref = `/?page=display&branch=${branch}`;

  const isRosterActive =
    activePage === 'roster-dashboard' ||
    activePage === 'roster-settlement' ||
    activePage === 'roster-insite' ||
    activePage === 'roster-onsite' ||
    activePage === 'roster-personnel';

  const themeToggleLabel =
    themeMode === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
  const themeButtonLabel =
    themeMode === 'dark' ? 'Giao diện sáng' : 'Giao diện tối';
  const roleLabel =
    resolvedRole === 'admin'
      ? 'Quản trị hệ thống'
      : resolvedRole === 'operator'
        ? 'Điều phối vận hành'
        : 'Nhân viên lễ tân';
  const staffInitials = getStaffInitials(staffName);

  const rosterItems = [
    {
      key: 'roster-dashboard' as const,
      label: 'Tổng quan vận hành',
      href: rosterDashboardHref,
      icon: PieChart,
    },
    {
      key: 'roster-settlement' as const,
      label: 'Quyết toán chi phí',
      href: `/?page=roster-settlement&${scopeQuery}`,
      icon: ClipboardList,
    },
    {
      key: 'roster-insite' as const,
      label: 'Lịch tại Phòng khám',
      href: rosterInsiteHref,
      icon: Building2,
    },
    {
      key: 'roster-onsite' as const,
      label: 'Đoàn khám Onsite',
      href: rosterOnsiteHref,
      icon: Truck,
    },
    ...(can('personnel')
      ? [
          {
            key: 'roster-personnel' as const,
            label: 'Danh mục Nhân sự',
            href: rosterPersonnelHref,
            icon: Users,
          },
        ]
      : []),
  ].filter((item) => can(DESTINATION_PERMISSIONS[item.key]));

  return (
    <SidebarProvider
      open={!isCollapsed}
      onOpenChange={(open) => onCollapsedChange(!open)}
      className="min-h-0 w-auto flex-none"
    >
      <Sidebar collapsible="icon" data-roster-motion={isRosterPointerMotion ? 'pointer' : 'instant'} className="dym-sidebar-navigation border-sidebar-border antialiased">
        {/* DYM Brand Logo Header (centered like original) */}
        <SidebarHeader className="gap-2.5 border-b border-sidebar-border p-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-2.5">
          {!isCollapsed ? (
            <div className="flex min-h-[3.75rem] items-center justify-center border-b border-sidebar-border pb-2.5">
              <img
                src={themeMode === 'dark' ? dymLogo : dymLogoDark}
                alt="DYM Medical Center Vietnam"
                className="h-auto w-[8.25rem] object-contain"
              />
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarTrigger
                  aria-label="Mở rộng thanh điều hướng"
                  className="mx-auto size-9 rounded-lg text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                />
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Mở rộng thanh điều hướng (Ctrl+B)
              </TooltipContent>
            </Tooltip>
          )}

          <SidebarMenu>
            {can('registration_qr') && <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Mở màn hình QR đăng ký">
                <button
                  type="button"
                  aria-label="Mở màn hình QR đăng ký"
                  onClick={() => openStaffTab(`/registration-qr?branch=${branch}`)}
                >
                  <QrCode aria-hidden="true" />
                  <span>QR đăng ký tại quầy</span>
                </button>
              </SidebarMenuButton>
            </SidebarMenuItem>}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip={`Mở màn hình chờ: ${BRANCH_NAMES[branch]}`}
                className="border border-sidebar-border bg-sidebar-accent/35 hover:bg-sidebar-accent"
              >
                <a
                  href={displayHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Mở màn hình chờ ${BRANCH_NAMES[branch]}`}
                >
                  <Tv className="size-4 text-sidebar-foreground/70" aria-hidden="true" />
                  <span className="flex-1 truncate">Màn hình chờ TV</span>
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-emerald-500 group-data-[collapsible=icon]:hidden"
                    aria-hidden="true"
                  />
                  <ArrowUpRight
                    className="size-3.5 shrink-0 text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden"
                    aria-hidden="true"
                  />
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        {/* shadcn/ui SidebarContent with Platform & Collapsible Submenu Tree */}
        <SidebarContent className="gap-0">
          <SidebarGroup>
            <SidebarGroupLabel>Tiếp đón & Hàng đợi</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {can('reception') && <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={activePage === 'dashboard'}
                    tooltip="Tiếp nhận"
                  >
                    <a
                      href={adminHref}
                      aria-current={activePage === 'dashboard' ? 'page' : undefined}
                      onClick={(event) => handleInternalLinkClick(event, adminHref)}
                    >
                      <LayoutDashboard aria-hidden="true" />
                      <span>Tiếp nhận</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>}

                {can('registrations') && <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={activePage === 'registrations'}
                    tooltip="Danh sách tiếp nhận"
                  >
                    <a
                      href={registrationsHref}
                      aria-current={activePage === 'registrations' ? 'page' : undefined}
                      onClick={(event) =>
                        handleInternalLinkClick(event, registrationsHref)
                      }
                    >
                      <ClipboardList aria-hidden="true" />
                      <span>Danh sách tiếp nhận</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {canAccessRoster && (
            <>
              <SidebarSeparator />

              <SidebarGroup>
                <SidebarGroupLabel>Điều phối Y khoa</SidebarGroupLabel>
                <SidebarGroupContent>
                  {!isCollapsed ? (
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          isActive={isRosterActive && !isRosterOpen}
                          onClick={(event) => {
                            rosterMotion.prepare(event.detail);
                            setIsRosterPointerMotion(event.detail > 0);
                            setIsRosterOpen((prev) => !prev);
                          }}
                          aria-expanded={isRosterOpen}
                          aria-controls="dym-sidebar-roster-panel"
                        >
                          <CalendarRange aria-hidden="true" />
                          <span>Điều phối & Đoàn khám</span>
                          <ChevronRight
                            className={`dym-sidebar-roster-chevron ml-auto size-4 text-sidebar-foreground/50 ${
                              isRosterOpen ? 'rotate-90' : ''
                            }`}
                            aria-hidden="true"
                          />
                        </SidebarMenuButton>

                        <div id="dym-sidebar-roster-panel" ref={rosterMotion.panelRef} inert={!isRosterOpen} aria-hidden={!isRosterOpen}
                          style={{ height: isRosterOpen ? 'auto' : 0, opacity: isRosterOpen ? 1 : 0, overflow: 'hidden' }}>
                          <SidebarMenuSub>
                            {rosterItems.map((item) => {
                              const Icon = item.icon;
                              const selected = activePage === item.key;
                              return (
                                <SidebarMenuSubItem key={item.key}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={selected}
                                  >
                                    <a
                                      href={item.href}
                                      aria-current={selected ? 'page' : undefined}
                                      onClick={(event) =>
                                        handleInternalLinkClick(event, item.href)
                                      }
                                    >
                                      <Icon aria-hidden="true" />
                                      <span>{item.label}</span>
                                    </a>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        </div>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  ) : (
                    <SidebarMenu>
                      {rosterItems.map((item) => {
                        const Icon = item.icon;
                        const selected = activePage === item.key;
                        return (
                          <SidebarMenuItem key={item.key}>
                            <SidebarMenuButton
                              asChild
                              isActive={selected}
                              tooltip={item.label}
                            >
                              <a
                                href={item.href}
                                aria-current={selected ? 'page' : undefined}
                                onClick={(event) =>
                                  handleInternalLinkClick(event, item.href)
                                }
                              >
                                <Icon aria-hidden="true" />
                                <span>{item.label}</span>
                              </a>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  )}
                </SidebarGroupContent>
              </SidebarGroup>
            </>
          )}

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupLabel>Hệ thống</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {can('staff') && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={activePage === 'staff'}
                      tooltip="Quản lý nhân viên"
                    >
                      <a
                        href="/?page=staff"
                        aria-current={activePage === 'staff' ? 'page' : undefined}
                        onClick={(event) =>
                          handleInternalLinkClick(event, '/?page=staff')
                        }
                      >
                        <ShieldCheck aria-hidden="true" />
                        <span>Quản lý nhân viên</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                <SidebarMenuItem>
                  <SidebarMenuButton disabled tooltip="Cài đặt (sắp có)">
                    <Settings2 aria-hidden="true" />
                    <span>Cài đặt</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge className="text-[11px] font-normal text-sidebar-foreground/50">
                    Sắp có
                  </SidebarMenuBadge>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {/* shadcn/ui NavUser Footer */}
        <SidebarFooter className="gap-1.5 border-t border-sidebar-border p-2 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:py-2.5">
          <div className="flex items-center gap-2 rounded-lg p-1.5 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground group-data-[collapsible=icon]:size-9"
                  aria-label={`${staffName} (${roleLabel})`}
                >
                  {staffInitials}
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                sideOffset={8}
                hidden={!isCollapsed}
              >
                {staffName} ({roleLabel})
              </TooltipContent>
            </Tooltip>
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
              <span
                className="truncate font-semibold text-sidebar-foreground"
                title={staffName}
              >
                {staffName}
              </span>
              <span
                className="truncate text-xs text-sidebar-foreground/70"
                title={roleLabel}
              >
                {roleLabel}
              </span>
            </div>
            {!isCollapsed && (
              <SidebarTrigger
                title="Thu gọn thanh điều hướng (Ctrl+B)"
                aria-label="Thu gọn thanh điều hướng"
                className="size-7 shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              />
            )}
          </div>

          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={themeToggleLabel}
                aria-label={themeToggleLabel}
                aria-pressed={themeMode === 'light'}
                onClick={onThemeToggle}
              >
                {themeMode === 'dark' ? (
                  <Sun aria-hidden="true" />
                ) : (
                  <Moon aria-hidden="true" />
                )}
                <span>{themeButtonLabel}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Đăng xuất"
                aria-label="Đăng xuất"
                onClick={onLogout}
                className="text-sidebar-foreground/80 hover:bg-destructive/15 hover:text-destructive"
              >
                <LogOut aria-hidden="true" />
                <span>Đăng xuất</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>
    </SidebarProvider>
  );
}
