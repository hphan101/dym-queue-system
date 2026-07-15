import React from 'react';
import { CheckCircle2, Calendar, User, Phone, CreditCard, Building, Home, Heart, RefreshCw } from 'lucide-react';
import type { RegistrationData } from '../types';
import { translations } from '../translations';

interface SuccessViewProps {
  queueNumber: string;
  data: RegistrationData;
  onReset: () => void;
  lang: 'vi' | 'en';
}

// Component hiển thị thông tin khi khách hàng đăng ký thành công
export const SuccessView: React.FC<SuccessViewProps> = ({ queueNumber, data, onReset, lang }) => {
  const t = translations[lang];

  // Ghép địa chỉ đầy đủ từ 3 ô: Địa chỉ chi tiết, Phường/Xã, Tỉnh/Thành phố
  const fullAddress = [data.addressDetail, data.ward, data.province].filter(Boolean).join(', ');

  return (
    <div className="text-center space-y-6 animate-fade-in">
      {/* Icon Đăng ký thành công */}
      <div className="flex flex-col items-center justify-center space-y-2">
        <div className="w-16 h-16 rounded-full bg-dym-blue-50 flex items-center justify-center">
          <CheckCircle2 className="w-12 h-12 text-dym-blue-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">{t.successTitle}</h2>
        <p className="text-sm text-slate-500">
          {t.successThanks}
        </p>
      </div>

      {/* Số thứ tự nổi bật */}
      <div className="bg-gradient-to-br from-dym-blue-50 to-white border border-dym-blue-100 rounded-2xl p-6 pulse-soft max-w-sm mx-auto">
        <p className="text-xs font-semibold text-dym-blue-700 uppercase tracking-widest mb-1">
          {t.queueLabel}
        </p>
        <div className="text-5xl font-extrabold text-dym-blue-800 tracking-tight my-2">
          {queueNumber}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {t.successNote}
        </p>
      </div>

      {/* Tóm tắt thông tin đăng ký */}
      <div className="text-left bg-white border border-slate-100 rounded-xl p-4 space-y-3 max-w-md mx-auto text-sm shadow-sm">
        <h3 className="font-bold text-slate-700 border-b border-slate-100 pb-2 flex items-center gap-1.5">
          {t.summaryTitle}
        </h3>

        {/* 1. Họ và tên */}
        <div className="flex items-start gap-2.5">
          <User className="w-4 h-4 text-slate-400 mt-0.5" />
          <div>
            <p className="text-xs text-slate-400">{t.fullName}</p>
            <p className="font-semibold text-slate-700">{data.fullName}</p>
          </div>
        </div>

        {/* 2. Ngày sinh */}
        <div className="flex items-start gap-2.5">
          <Calendar className="w-4 h-4 text-slate-400 mt-0.5" />
          <div>
            <p className="text-xs text-slate-400">{t.birthDate}</p>
            <p className="font-medium text-slate-700">
              {new Date(data.birthDate).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US')}
            </p>
          </div>
        </div>

        {/* 3. Giới tính */}
        <div className="flex items-start gap-2.5">
          <Heart className="w-4 h-4 text-slate-400 mt-0.5" />
          <div>
            <p className="text-xs text-slate-400">{t.gender}</p>
            <p className="font-medium text-slate-700">
              {data.gender === 'Nam' ? t.genderNam : t.genderNu}
            </p>
          </div>
        </div>

        {/* 4. Số CCCD / Hộ chiếu */}
        <div className="flex items-start gap-2.5">
          <CreditCard className="w-4 h-4 text-slate-400 mt-0.5" />
          <div>
            <p className="text-xs text-slate-400">{t.cccd}</p>
            <p className="font-medium text-slate-700">{data.cccd}</p>
          </div>
        </div>

        {/* 5. Số điện thoại */}
        <div className="flex items-start gap-2.5">
          <Phone className="w-4 h-4 text-slate-400 mt-0.5" />
          <div>
            <p className="text-xs text-slate-400">{t.phoneNumber}</p>
            <p className="font-medium text-slate-700">{data.phoneNumber}</p>
          </div>
        </div>

        {/* 6. Địa chỉ */}
        <div className="flex items-start gap-2.5">
          <Home className="w-4 h-4 text-slate-400 mt-0.5" />
          <div>
            <p className="text-xs text-slate-400">{t.address}</p>
            <p className="font-medium text-slate-700 leading-relaxed">{fullAddress}</p>
          </div>
        </div>

        {/* 7. Tên công ty (Chỉ hiển thị nếu người dùng có điền) */}
        {data.companyName && (
          <div className="flex items-start gap-2.5">
            <Building className="w-4 h-4 text-slate-400 mt-0.5" />
            <div>
              <p className="text-xs text-slate-400">{t.companyName}</p>
              <p className="font-semibold text-dym-blue-700">{data.companyName}</p>
            </div>
          </div>
        )}
      </div>

      {/* Hành động tiếp theo */}
      <div className="pt-2">
        <button
          onClick={onReset}
          className="inline-flex items-center gap-2 text-dym-blue-600 hover:text-dym-blue-700 font-semibold text-sm transition-all focus:outline-none"
        >
          <RefreshCw className="w-4 h-4" />
          {t.btnNewTurn}
        </button>
      </div>
    </div>
  );
};
