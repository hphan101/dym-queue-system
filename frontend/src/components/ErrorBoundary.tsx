import { Component, type ErrorInfo, type ReactNode } from 'react';
import dymLogoDark from '../assets/dym-logo-dark.png';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#f4f9fc] p-6 text-center">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
            <img
              src={dymLogoDark}
              alt="DYM Medical Center"
              className="mx-auto mb-6 h-10 w-auto object-contain"
            />
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-800">
              {this.props.fallbackTitle || 'Đã có lỗi xảy ra trong quá trình xử lý'}
            </h2>
            <p className="mt-2 text-xs text-slate-500 leading-relaxed">
              {this.state.error?.message ||
                'Hệ thống gặp sự cố không mong muốn. Vui lòng thử tải lại trang hoặc liên hệ quản trị viên.'}
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                onClick={this.handleReload}
                className="w-full sm:w-auto rounded-lg bg-[#0088cc] px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#0077b3] transition-colors"
              >
                Tải lại trang
              </button>
              <a
                href="/"
                className="w-full sm:w-auto rounded-lg border border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Về trang chủ
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

