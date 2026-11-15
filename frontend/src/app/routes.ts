import type { AdminDestination } from '../features/admin/AdminApplication';

export type AppRoute =
  | { kind: 'registration-qr' }
  | { kind: 'display' }
  | { kind: 'login' }
  | { kind: 'admin'; destination: AdminDestination }
  | { kind: 'registration' };

export function resolveAppRoute(rawPathname: string, search: string): AppRoute {
  const pathname = rawPathname.replace(/\/+$/, '') || '/';
  const requestedPage = new URLSearchParams(search).get('page');

  if (pathname === '/registration-qr' || requestedPage === 'registration-qr') {
    return { kind: 'registration-qr' };
  }

  if (pathname === '/display' || requestedPage === 'display') {
    return { kind: 'display' };
  }
  if (pathname === '/login' || requestedPage === 'login') {
    return { kind: 'login' };
  }
  if (
    pathname === '/staff' ||
    pathname.startsWith('/admin/staff') ||
    requestedPage === 'staff'
  ) {
    return { kind: 'admin', destination: 'staff' };
  }
  if (
    pathname === '/roster-personnel' ||
    pathname.startsWith('/admin/roster-personnel') ||
    requestedPage === 'roster-personnel'
  ) {
    return { kind: 'admin', destination: 'roster-personnel' };
  }
  if (
    pathname === '/roster-onsite' ||
    pathname.startsWith('/admin/roster-onsite') ||
    requestedPage === 'roster-onsite'
  ) {
    return { kind: 'admin', destination: 'roster-onsite' };
  }
  if (
    pathname === '/roster-insite' ||
    pathname.startsWith('/admin/roster-insite') ||
    requestedPage === 'roster-insite'
  ) {
    return { kind: 'admin', destination: 'roster-insite' };
  }
  if (
    pathname === '/roster-settlement' ||
    pathname.startsWith('/admin/roster-settlement') ||
    requestedPage === 'roster-settlement'
  ) {
    return { kind: 'admin', destination: 'roster-settlement' };
  }
  if (
    pathname === '/roster' ||
    pathname === '/roster-dashboard' ||
    pathname.startsWith('/admin/roster') ||
    requestedPage === 'roster' ||
    requestedPage === 'roster-dashboard'
  ) {
    return { kind: 'admin', destination: 'roster-dashboard' };
  }
  if (
    pathname === '/registrations' ||
    pathname.startsWith('/admin/registrations') ||
    requestedPage === 'registrations'
  ) {
    return { kind: 'admin', destination: 'registrations' };
  }
  if (
    pathname === '/admin' ||
    pathname.startsWith('/admin') ||
    requestedPage === 'admin'
  ) {
    return { kind: 'admin', destination: 'dashboard' };
  }

  return { kind: 'registration' };
}
