import { Spinner } from '@/components/ui/spinner';
import dymLogoDark from '@/assets/dym-logo-dark.png';
import dymLogoOnDark from '@/assets/dym-logo.png';
import './adminLoader.css';

export function AdminLoader() {
  return (
    <main className="dym-admin-loader" role="status" aria-live="polite" aria-busy="true" aria-atomic="true">
      <div className="dym-admin-loader-content">
        <img src={dymLogoDark} alt="DYM Medical Center Vietnam" width="176" className="dym-admin-loader-logo dark:hidden" />
        <img src={dymLogoOnDark} alt="DYM Medical Center Vietnam" width="176" className="dym-admin-loader-logo hidden dark:block" />
        <div className="dym-admin-loader-status">
          <Spinner role="presentation" aria-hidden="true" aria-label={undefined} />
          <span>Đang tải hệ thống</span>
        </div>
      </div>
    </main>
  );
}
