import { useState } from 'react';
import { RegistrationForm } from './components/RegistrationForm';
import { SuccessView } from './components/SuccessView';
import type { RegistrationData, RegistrationResponse } from './types';
import { AlertCircle, Phone, Mail, MapPin, Clock } from 'lucide-react';
import dymLogo from './assets/dym-logo.png';
import dymLogoDark from './assets/dym-logo-dark.png';
import { translations } from './translations';

function App() {
  // Quản lý trạng thái ngôn ngữ (mặc định là tiếng Việt 'vi')
  const [lang, setLang] = useState<'vi' | 'en'>(() => {
    return (localStorage.getItem('dym_registration_lang') as 'vi' | 'en') || 'vi';
  });

  // Quản lý các bước hiển thị (form đăng ký hoặc màn hình thành công), tự động tải lại trạng thái nếu có
  const [step, setStep] = useState<'form' | 'success'>(() => {
    return (localStorage.getItem('dym_registration_step') as 'form' | 'success') || 'form';
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredData, setRegisteredData] = useState<RegistrationData | null>(() => {
    const saved = localStorage.getItem('dym_registration_data');
    return saved ? JSON.parse(saved) : null;
  });
  const [queueNumber, setQueueNumber] = useState<string>(() => {
    return localStorage.getItem('dym_registration_queue') || '';
  });

  // Lấy URL Google Apps Script từ biến môi trường (.env)
  const appsScriptUrl = import.meta.env.VITE_APPS_SCRIPT_URL;

  // Thay đổi ngôn ngữ và lưu vào localStorage
  const handleLangChange = (newLang: 'vi' | 'en') => {
    setLang(newLang);
    localStorage.setItem('dym_registration_lang', newLang);
  };

  // Xử lý khi người dùng submit form
  const handleFormSubmit = async (formData: RegistrationData) => {
    setIsLoading(true);
    setError(null);

    // Kiểm tra cấu hình URL
    if (!appsScriptUrl) {
      setError(translations[lang].errorUrl);
      setIsLoading(false);
      return;
    }

    try {
      // Gửi request POST tới Google Apps Script (không gửi header đặc biệt để tránh lỗi CORS OPTIONS)
      const response = await fetch(appsScriptUrl, {
        method: 'POST',
        mode: 'cors',
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error(`Server response error: ${response.status} ${response.statusText}`);
      }

      const result: RegistrationResponse = await response.json();

      if (result.success && result.queueNumber) {
        setQueueNumber(result.queueNumber);
        setRegisteredData(formData);
        setStep('success'); // Chuyển sang màn hình thành công
        
        // Lưu trạng thái đăng ký vào localStorage để không bị mất khi tải lại trang (reload)
        localStorage.setItem('dym_registration_step', 'success');
        localStorage.setItem('dym_registration_data', JSON.stringify(formData));
        localStorage.setItem('dym_registration_queue', result.queueNumber);
      } else {
        throw new Error(result.error || (lang === 'vi' ? 'Có lỗi xảy ra khi lưu thông tin.' : 'An error occurred while saving information.'));
      }
    } catch (err: any) {
      console.error('Lỗi khi gửi đăng ký:', err);
      setError(
        err.message || (lang === 'vi' ? 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối mạng.' : 'Unable to connect to the server. Please check your network connection.')
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Quay lại màn hình đăng ký lượt mới và xóa session cũ
  const handleReset = () => {
    setStep('form');
    setRegisteredData(null);
    setQueueNumber('');
    setError(null);
    
    // Xóa sạch dữ liệu trong localStorage
    localStorage.removeItem('dym_registration_step');
    localStorage.removeItem('dym_registration_data');
    localStorage.removeItem('dym_registration_queue');
  };

  return (
    <div className="min-h-screen bg-[#f4f9fc] flex flex-col justify-between pt-6">
      {/* Full-screen Loading Overlay đồng bộ 100% với website dymmedicalcenter.com.vn */}
      {isLoading && (
        <div className="page-loader animate-fade-in">
          <img
            src={dymLogoDark}
            alt="DYM Medical Center"
            className="page-loader-logo object-contain"
          />
          <div className="page-loader-dots"></div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-grow max-w-md md:max-w-lg w-full mx-auto px-4 py-6 flex flex-col justify-center">
        {/* Nút chuyển đổi ngôn ngữ Anh / Việt */}
        <div className="flex justify-end mb-3">
          <div className="inline-flex rounded-lg border border-slate-200/60 bg-white/90 p-0.5 shadow-sm text-[11px] backdrop-blur-sm">
            <button
              onClick={() => handleLangChange('vi')}
              className={`px-3 py-1 rounded-md font-semibold transition-all ${
                lang === 'vi'
                  ? 'bg-dym-blue-500 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tiếng Việt
            </button>
            <button
              onClick={() => handleLangChange('en')}
              className={`px-3 py-1 rounded-md font-semibold transition-all ${
                lang === 'en'
                  ? 'bg-dym-blue-500 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              English
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 sm:p-8 medical-card">
          {/* Tiêu đề phụ */}
          {step === 'form' && (
            <div className="mb-6 text-center">
              <h2 className="text-xl font-extrabold text-slate-800">
                {translations[lang].title}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {translations[lang].subtitle}
              </p>
            </div>
          )}

          {/* Hiển thị lỗi nếu có */}
          {error && (
            <div className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-100 flex items-start gap-2.5 text-xs text-red-700 animate-shake">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{translations[lang].failedTitle}</p>
                <p className="mt-0.5 leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          {/* Hiển thị màn hình Form hoặc màn hình Thành công */}
          {step === 'form' ? (
            <RegistrationForm onSubmit={handleFormSubmit} isLoading={isLoading} lang={lang} />
          ) : (
            registeredData && (
              <SuccessView
                queueNumber={queueNumber}
                data={registeredData}
                onReset={handleReset}
                lang={lang}
              />
            )
          )}
        </div>
      </main>

      {/* Footer liên hệ đồng bộ 100% với website dymmedicalcenter.com.vn (Responsive) */}
      <footer className="bg-[#111833] text-slate-300 py-10 text-xs border-t border-slate-800/80">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
            {/* Cột 1: Logo & Thông tin chung */}
            <div className="space-y-4">
              <div>
                <img src={dymLogo} alt="DYM Medical Center Vietnam" className="h-10 w-auto object-contain" />
              </div>
              <div className="space-y-2.5 text-slate-300">
                {/* Hotline */}
                <div className="flex items-start gap-2.5">
                  <Phone className="w-4 h-4 text-[#63c4e8] shrink-0 mt-0.5" />
                  <p>
                    <span className="font-semibold text-white">Hotline:</span>{' '}
                    <a href="tel:1900292937" className="hover:text-white transition-colors">1900 29 29 37</a>
                  </p>
                </div>
                {/* Email */}
                <div className="flex items-start gap-2.5">
                  <Mail className="w-4 h-4 text-[#63c4e8] shrink-0 mt-0.5" />
                  <p>
                    <span className="font-semibold text-white">Email:</span>{' '}
                    <a href="mailto:info@dymmedicalcenter.com.vn" className="hover:text-[#63c4e8] transition-colors">info@dymmedicalcenter.com.vn</a>
                  </p>
                </div>
                {/* Thời gian hoạt động */}
                <div className="flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-[#63c4e8] shrink-0 mt-0.5" />
                  <p>
                    <span className="font-semibold text-white">Thời gian hoạt động:</span> 8:00 - 18:00
                  </p>
                </div>
              </div>
            </div>

            {/* Cột 2: Chi nhánh TP. Hồ Chí Minh */}
            <div className="space-y-4">
              <h4 className="font-bold text-white text-[13px] uppercase tracking-wider border-b border-slate-800 pb-1.5">
                Cơ sở TP. Hồ Chí Minh
              </h4>
              <div className="space-y-3">
                {/* Chi nhánh Sài Gòn */}
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-[#63c4e8] shrink-0 mt-0.5" />
                  <a
                    href="https://www.google.com/maps/search/?api=1&query=DYM+Medical+Center+Sài+Gòn+mPlaza+Saigon"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white hover:underline transition-all leading-relaxed"
                  >
                    <span className="font-semibold text-white">DYM mPlaza Quận 1:</span> Phòng B101–B103, Tầng hầm 1, tòa nhà mPlaza Saigon, số 39 Lê Duẩn, Phường Bến Nghé, Quận 1, TP Hồ Chí Minh.
                  </a>
                </div>
                {/* Chi nhánh Phú Mỹ Hưng */}
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-[#63c4e8] shrink-0 mt-0.5" />
                  <a
                    href="https://www.google.com/maps/search/?api=1&query=DYM+Medical+Center+Phú+Mỹ+Hưng+The+Grace"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white hover:underline transition-all leading-relaxed"
                  >
                    <span className="font-semibold text-white">DYM The Grace Quận 7:</span> Phòng 3A01, Tầng 3A, Tòa nhà The Grace, 71 Hoàng Văn Thái, Phường Tân Phú, Quận 7, TP Hồ Chí Minh.
                  </a>
                </div>
              </div>
            </div>

            {/* Cột 3: Chi nhánh Hà Nội */}
            <div className="space-y-4">
              <h4 className="font-bold text-white text-[13px] uppercase tracking-wider border-b border-slate-800 pb-1.5">
                Cơ sở Hà Nội
              </h4>
              <div className="space-y-3">
                {/* Chi nhánh Hà Nội */}
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-[#63c4e8] shrink-0 mt-0.5" />
                  <a
                    href="https://maps.app.goo.gl/hrh2TypSzWQJGnyq9"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white hover:underline transition-all leading-relaxed"
                  >
                    <span className="font-semibold text-white">DYM Epic Tower Cầu Giấy:</span> Tầng Hầm B1, Toà Epic Tower, Ngõ 19 Duy Tân, Phường Cầu Giấy, TP Hà Nội.
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Bản quyền */}
          <div className="border-t border-slate-800/60 mt-8 pt-4 text-center text-[10px] text-slate-500">
            <p>&copy; 2026 DYM Medical Center. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
