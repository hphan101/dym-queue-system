import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRightStartOnRectangleIcon,
  ArrowTopRightOnSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  HomeIcon,
  MoonIcon,
  SunIcon,
  TvIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { Avatar } from '@astryxdesign/core/Avatar';
import {
  SideNav,
  SideNavItem,
  SideNavSection,
} from '@astryxdesign/core/SideNav';
import dymLogo from '../../assets/dym-logo.png';
import dymLogoDark from '../../assets/dym-logo-dark.png';
import { BRANCH_NAMES } from '../../config/branches';
import { handleInternalLinkClick } from '../../lib/navigation';
import type { BranchCode } from '../../types/domain';

export type AdminThemeMode = 'dark' | 'light';
type AdminPageKey = 'dashboard' | 'registrations' | 'staff';

interface AdminSidebarProps {
  activePage: AdminPageKey;
  branch: BranchCode;
  registrationCount: number;
  staffName: string;
  isAdmin: boolean;
  themeMode: AdminThemeMode;
  isCollapsed: boolean;
  onCollapsedChange: (isCollapsed: boolean) => void;
  onThemeToggle: () => void;
  onLogout: () => void;
}

interface SidebarTooltipProps {
  label: string;
  children: ReactNode;
}

function SidebarTooltip({ label, children }: SidebarTooltipProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const showTimerRef = useRef<number | null>(null);
  const tooltipId = useId();
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [isOpen, setIsOpen] = useState(false);

  const clearShowTimer = () => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  };

  const openTooltip = (delay: number) => {
    clearShowTimer();
    showTimerRef.current = window.setTimeout(() => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;

      setPosition({
        left: rect.right + 8,
        top: rect.top + rect.height / 2,
      });
      setIsOpen(true);
    }, delay);
  };

  const closeTooltip = () => {
    clearShowTimer();
    setIsOpen(false);
  };

  useEffect(
    () => () => {
      clearShowTimer();
    },
    [],
  );

  const portalRoot = anchorRef.current?.closest('.dym-admin-shell');

  return (
    <div
      ref={anchorRef}
      className="dym-sidebar-tooltip-anchor"
      onMouseEnter={() => openTooltip(250)}
      onMouseLeave={closeTooltip}
      onFocusCapture={() => openTooltip(0)}
      onBlurCapture={closeTooltip}
    >
      {children}
      {isOpen &&
        portalRoot &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            className="dym-sidebar-tooltip"
            style={{ left: position.left, top: position.top }}
          >
            {label}
          </div>,
          portalRoot,
        )}
    </div>
  );
}

export function AdminSidebar({
  activePage,
  branch,
  registrationCount,
  staffName,
  isAdmin,
  themeMode,
  isCollapsed,
  onCollapsedChange,
  onThemeToggle,
  onLogout,
}: AdminSidebarProps) {
  const themeToggleLabel =
    themeMode === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
  const themeButtonLabel =
    themeMode === 'dark' ? 'Giao diện sáng' : 'Giao diện tối';

  return (
    <aside className="dym-admin-sidebar">
      <SideNav
        collapsible={{
          isCollapsed,
          onCollapsedChange,
          hasButton: false,
          buttonLabel: 'Thu gọn thanh điều hướng',
        }}
        resizable={{
          defaultWidth: 244,
          minWidth: 224,
          maxWidth: 264,
          autoSaveId: 'dym-admin-sidebar-width-v2',
        }}
        header={
          !isCollapsed ? (
            <div className="dym-side-brand">
              <img
                src={themeMode === 'dark' ? dymLogo : dymLogoDark}
                alt="DYM Medical Center Vietnam"
                className="dym-side-logo"
              />
            </div>
          ) : undefined
        }
        className="dym-side-nav"
        topContent={
          !isCollapsed ? (
            <a
              className="dym-display-shortcut"
              href={`/?page=display&branch=${branch}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="dym-display-shortcut-icon" aria-hidden="true">
                <TvIcon />
              </span>
              <span className="dym-display-shortcut-copy">
                <strong>Mở màn hình chờ</strong>
                <small>{BRANCH_NAMES[branch]}</small>
              </span>
              <ArrowTopRightOnSquareIcon
                className="dym-display-shortcut-arrow"
                aria-hidden="true"
              />
            </a>
          ) : undefined
        }
        footer={
          isCollapsed ? (
            <div className="dym-collapsed-tools">
              <SidebarTooltip label="Mở rộng thanh điều hướng">
                <button
                  type="button"
                  className="dym-sidebar-icon-control"
                  aria-label="Mở rộng thanh điều hướng"
                  onClick={() => onCollapsedChange(false)}
                >
                  <ChevronRightIcon aria-hidden="true" />
                </button>
              </SidebarTooltip>
              <SidebarTooltip label={themeButtonLabel}>
                <button
                  type="button"
                  className="dym-sidebar-icon-control"
                  aria-label={themeToggleLabel}
                  aria-pressed={themeMode === 'light'}
                  onClick={onThemeToggle}
                >
                  {themeMode === 'dark' ? (
                    <SunIcon aria-hidden="true" />
                  ) : (
                    <MoonIcon aria-hidden="true" />
                  )}
                </button>
              </SidebarTooltip>
              <SidebarTooltip label="Đăng xuất">
                <button
                  type="button"
                  className="dym-sidebar-icon-control dym-sidebar-logout-control"
                  aria-label="Đăng xuất"
                  onClick={onLogout}
                >
                  <ArrowRightStartOnRectangleIcon aria-hidden="true" />
                </button>
              </SidebarTooltip>
            </div>
          ) : (
            <div className="dym-sidebar-footer">
              <div className="dym-sidebar-account-row">
                <div className="dym-account">
                  <Avatar name={staffName} size="md" tooltip={false} />
                  <div>
                    <span className="dym-account-name">{staffName}</span>
                    <span className="dym-account-role">
                      {isAdmin ? 'Quản trị hệ thống' : 'Nhân viên lễ tân'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="dym-sidebar-icon-control"
                  aria-label="Thu gọn thanh điều hướng"
                  title="Thu gọn"
                  onClick={() => onCollapsedChange(true)}
                >
                  <ChevronLeftIcon aria-hidden="true" />
                </button>
              </div>
              <div className="dym-sidebar-footer-actions">
                <button
                  type="button"
                  className="dym-sidebar-footer-control"
                  aria-pressed={themeMode === 'light'}
                  onClick={onThemeToggle}
                >
                  {themeMode === 'dark' ? (
                    <SunIcon aria-hidden="true" />
                  ) : (
                    <MoonIcon aria-hidden="true" />
                  )}
                  <span>{themeButtonLabel}</span>
                </button>
                <button
                  type="button"
                  className="dym-sidebar-footer-control dym-sidebar-logout-control"
                  onClick={onLogout}
                >
                  <ArrowRightStartOnRectangleIcon aria-hidden="true" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            </div>
          )
        }
      >
        <SideNavSection title="Vận hành" className="dym-nav-section">
          {isCollapsed ? (
            <>
              <SidebarTooltip label="Tiếp nhận">
                <SideNavItem
                  label="Tiếp nhận"
                  icon={HomeIcon}
                  isSelected={activePage === 'dashboard'}
                  href="/?page=admin"
                  onClick={(event) =>
                    handleInternalLinkClick(event, '/?page=admin')
                  }
                />
              </SidebarTooltip>
              <SidebarTooltip label="Danh sách tiếp nhận">
                <SideNavItem
                  label="Danh sách tiếp nhận"
                  icon={ClipboardDocumentListIcon}
                  isSelected={activePage === 'registrations'}
                  href="/?page=registrations"
                  onClick={(event) =>
                    handleInternalLinkClick(event, '/?page=registrations')
                  }
                />
              </SidebarTooltip>
              <SidebarTooltip label="Màn hình chờ">
                <SideNavItem
                  label="Màn hình chờ"
                  icon={TvIcon}
                  href={`/?page=display&branch=${branch}`}
                />
              </SidebarTooltip>
            </>
          ) : (
            <>
              <SideNavItem
                label="Tiếp nhận"
                icon={HomeIcon}
                isSelected={activePage === 'dashboard'}
                href="/?page=admin"
                onClick={(event) =>
                  handleInternalLinkClick(event, '/?page=admin')
                }
              />
              <SideNavItem
                label="Danh sách tiếp nhận"
                icon={ClipboardDocumentListIcon}
                isSelected={activePage === 'registrations'}
                href="/?page=registrations"
                onClick={(event) =>
                  handleInternalLinkClick(event, '/?page=registrations')
                }
                endContent={
                  <span className="dym-nav-count">{registrationCount}</span>
                }
              />
            </>
          )}
        </SideNavSection>
        <SideNavSection title="Hệ thống" className="dym-nav-section">
          {isCollapsed ? (
            <>
              {isAdmin && (
                <SidebarTooltip label="Quản lý nhân viên">
                  <SideNavItem
                    label="Quản lý nhân viên"
                    icon={UserGroupIcon}
                    isSelected={activePage === 'staff'}
                    href="/?page=staff"
                    onClick={(event) =>
                      handleInternalLinkClick(event, '/?page=staff')
                    }
                  />
                </SidebarTooltip>
              )}
              <SidebarTooltip label="Cài đặt — Sắp có">
                <SideNavItem
                  label="Cài đặt"
                  icon={Cog6ToothIcon}
                  isDisabled
                />
              </SidebarTooltip>
            </>
          ) : (
            <>
              {isAdmin && (
                <SideNavItem
                  label="Quản lý nhân viên"
                  icon={UserGroupIcon}
                  isSelected={activePage === 'staff'}
                  href="/?page=staff"
                  onClick={(event) =>
                    handleInternalLinkClick(event, '/?page=staff')
                  }
                />
              )}
              <SideNavItem
                label="Cài đặt"
                icon={Cog6ToothIcon}
                isDisabled
                endContent={<span className="dym-nav-soon">Sắp có</span>}
              />
            </>
          )}
        </SideNavSection>
      </SideNav>
    </aside>
  );
}
