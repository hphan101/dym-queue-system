import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { User, Phone, Calendar, Heart, Award, MapPin, Loader2 } from 'lucide-react';
import type { RegistrationData } from '../types';
import { translations } from '../translations';

// Danh sách Chi nhánh DYM
export const BRANCHES = [
  'DYM Medical Center Lê Duẩn (Quận 1, TP. HCM)',
  'DYM Medical Center Phú Mỹ Hưng (Quận 7, TP. HCM)',
  'DYM Medical Center Cầu Giấy (Hà Nội)'
];

// Danh sách Gói khám/Dịch vụ
export const SERVICES = [
  'Gói khám sức khỏe tổng quát (General Health Checkup)',
  'Gói khám sức khỏe đi làm (Work Permit / Employment)',
  'Khám chuyên khoa (Nội, Ngoại, Mắt, Tai Mũi Họng, Răng Hàm Mặt)',
  'Tầm soát ung thư (Cancer Screening)',
  'Xét nghiệm & Chẩn đoán hình ảnh (Lab Tests & Imaging)'
];

// Bản dịch nhãn chi nhánh hiển thị trong giao diện
export const BRANCH_TRANSLATIONS: Record<string, { vi: string, en: string }> = {
  'DYM Medical Center Lê Duẩn (Quận 1, TP. HCM)': {
    vi: 'DYM Medical Center Lê Duẩn (Quận 1, TP. HCM)',
    en: 'DYM Medical Center Le Duan (District 1, HCMC)'
  },
  'DYM Medical Center Phú Mỹ Hưng (Quận 7, TP. HCM)': {
    vi: 'DYM Medical Center Phú Mỹ Hưng (Quận 7, TP. HCM)',
    en: 'DYM Medical Center Phu My Hung (District 7, HCMC)'
  },
  'DYM Medical Center Cầu Giấy (Hà Nội)': {
    vi: 'DYM Medical Center Cầu Giấy (Hà Nội)',
    en: 'DYM Medical Center Cau Giay (Ha Noi)'
  }
};

// Bản dịch nhãn gói khám hiển thị trong giao diện
export const SERVICE_TRANSLATIONS: Record<string, { vi: string, en: string }> = {
  'Gói khám sức khỏe tổng quát (General Health Checkup)': {
    vi: 'Gói khám sức khỏe tổng quát (General Health Checkup)',
    en: 'General Health Checkup Package'
  },
  'Gói khám sức khỏe đi làm (Work Permit / Employment)': {
    vi: 'Gói khám sức khỏe đi làm (Work Permit / Employment)',
    en: 'Work Permit / Employment Health Checkup'
  },
  'Khám chuyên khoa (Nội, Ngoại, Mắt, Tai Mũi Họng, Răng Hàm Mặt)': {
    vi: 'Khám chuyên khoa (Nội, Ngoại, Mắt, Tai Mũi Họng, Răng Hàm Mặt)',
    en: 'Specialty Examination (Internal, External, Eye, ENT, Dental)'
  },
  'Tầm soát ung thư (Cancer Screening)': {
    vi: 'Tầm soát ung thư (Cancer Screening)',
    en: 'Cancer Screening Package'
  },
  'Xét nghiệm & Chẩn đoán hình ảnh (Lab Tests & Imaging)': {
    vi: 'Xét nghiệm & Chẩn đoán hình ảnh (Lab Tests & Imaging)',
    en: 'Lab Tests & Diagnostic Imaging'
  }
};

// Định dạng kiểm tra số điện thoại Việt Nam (10 số, bắt đầu bằng 03, 05, 07, 08, 09)
const phoneRegex = /^(0[3|5|7|8|9])+([0-9]{8})$/;

interface RegistrationFormProps {
  onSubmit: (data: RegistrationData) => void;
  isLoading: boolean;
  lang: 'vi' | 'en';
}

export const RegistrationForm: React.FC<RegistrationFormProps> = ({ onSubmit, isLoading, lang }) => {
  const t = translations[lang];

  // Khởi tạo Schema kiểm tra điều kiện (Validation) dựa trên ngôn ngữ hiện tại
  const formSchema = z.object({
    fullName: z
      .string()
      .min(1, t.errFullNameRequired)
      .min(2, t.errFullNameMin)
      .transform((val) => val.trim()),
    phoneNumber: z
      .string()
      .min(1, t.errPhoneRequired)
      .regex(phoneRegex, t.errPhoneInvalid),
    birthDate: z
      .string()
      .min(1, t.errBirthRequired)
      .refine((dateStr) => {
        const birth = new Date(dateStr);
        const today = new Date();
        return birth < today;
      }, t.errBirthPast),
    gender: z.enum(['Nam', 'Nữ'] as const, {
      message: t.errGenderRequired,
    }),
    service: z.string().min(1, t.errServiceRequired),
    branch: z.string().min(1, t.errBranchRequired),
  });

  type FormSchemaType = z.infer<typeof formSchema>;

  // Khởi tạo Form sử dụng react-hook-form kết hợp Zod validation
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormSchemaType>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: '',
      phoneNumber: '',
      birthDate: '',
      gender: undefined,
      service: '',
      branch: '',
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Họ tên */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
          <User className="w-4 h-4 text-dym-blue-500" />
          {t.fullName} <span className="text-red-500">*</span>
        </label>
        <div className="relative rounded-lg shadow-sm">
          <input
            type="text"
            {...register('fullName')}
            disabled={isLoading}
            placeholder={lang === 'vi' ? 'Nguyễn Văn A' : 'John Doe'}
            className={`w-full px-4 py-2.5 bg-white border rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all ${
              errors.fullName
                ? 'border-red-500 focus:ring-red-200'
                : 'border-slate-200 focus:border-dym-blue-500 focus:ring-dym-blue-100'
            }`}
          />
        </div>
        {errors.fullName && (
          <p className="mt-1 text-xs text-red-500 font-medium">{errors.fullName.message}</p>
        )}
      </div>

      {/* Số điện thoại */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
          <Phone className="w-4 h-4 text-dym-blue-500" />
          {t.phoneNumber} <span className="text-red-500">*</span>
        </label>
        <div className="relative rounded-lg shadow-sm">
          <input
            type="tel"
            {...register('phoneNumber')}
            disabled={isLoading}
            placeholder="09xxxxxxxx"
            className={`w-full px-4 py-2.5 bg-white border rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all ${
              errors.phoneNumber
                ? 'border-red-500 focus:ring-red-200'
                : 'border-slate-200 focus:border-dym-blue-500 focus:ring-dym-blue-100'
            }`}
          />
        </div>
        {errors.phoneNumber && (
          <p className="mt-1 text-xs text-red-500 font-medium">{errors.phoneNumber.message}</p>
        )}
      </div>

      {/* Ngày sinh & Giới tính */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Ngày sinh */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-dym-blue-500" />
            {t.birthDate} <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            {...register('birthDate')}
            disabled={isLoading}
            className={`w-full px-4 py-2.5 bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 transition-all ${
              errors.birthDate
                ? 'border-red-500 focus:ring-red-200'
                : 'border-slate-200 focus:border-dym-blue-500 focus:ring-dym-blue-100'
            }`}
          />
          {errors.birthDate && (
            <p className="mt-1 text-xs text-red-500 font-medium">{errors.birthDate.message}</p>
          )}
        </div>

        {/* Giới tính */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
            <Heart className="w-4 h-4 text-dym-blue-500" />
            {t.gender} <span className="text-red-500">*</span>
          </label>
          <div className="w-full px-4 flex items-center gap-6 h-[46px]">
            {['Nam', 'Nữ'].map((g) => (
              <label key={g} className="flex items-center gap-2 cursor-pointer text-slate-700 text-sm">
                <input
                  type="radio"
                  value={g}
                  disabled={isLoading}
                  {...register('gender')}
                  className="w-4 h-4 text-dym-blue-600 border-slate-300 focus:ring-dym-blue-500"
                />
                <span>{g === 'Nam' ? t.genderNam : t.genderNu}</span>
              </label>
            ))}
          </div>
          {errors.gender && (
            <p className="mt-1 text-xs text-red-500 font-medium">{errors.gender.message}</p>
          )}
        </div>
      </div>

      {/* Chi nhánh */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-dym-blue-500" />
          {t.branchLabel} <span className="text-red-500">*</span>
        </label>
        <select
          {...register('branch')}
          disabled={isLoading}
          className={`w-full px-4 py-2.5 bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 transition-all ${
            errors.branch
              ? 'border-red-500 focus:ring-red-200'
              : 'border-slate-200 focus:border-dym-blue-500 focus:ring-dym-blue-100'
          }`}
        >
          <option value="">{t.selectBranch}</option>
          {BRANCHES.map((b) => (
            <option key={b} value={b}>
              {BRANCH_TRANSLATIONS[b][lang]}
            </option>
          ))}
        </select>
        {errors.branch && (
          <p className="mt-1 text-xs text-red-500 font-medium">{errors.branch.message}</p>
        )}
      </div>

      {/* Dịch vụ/Gói khám */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
          <Award className="w-4 h-4 text-dym-blue-500" />
          {t.serviceLabel} <span className="text-red-500">*</span>
        </label>
        <select
          {...register('service')}
          disabled={isLoading}
          className={`w-full px-4 py-2.5 bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 transition-all ${
            errors.service
              ? 'border-red-500 focus:ring-red-200'
              : 'border-slate-200 focus:border-dym-blue-500 focus:ring-dym-blue-100'
          }`}
        >
          <option value="">{t.selectService}</option>
          {SERVICES.map((s) => (
            <option key={s} value={s}>
              {SERVICE_TRANSLATIONS[s][lang]}
            </option>
          ))}
        </select>
        {errors.service && (
          <p className="mt-1 text-xs text-red-500 font-medium">{errors.service.message}</p>
        )}
      </div>

      {/* Nút Submit */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full mt-4 bg-dym-blue-500 hover:bg-dym-blue-600 text-white font-semibold py-3 px-4 rounded-lg shadow-md hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-dym-blue-100 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {t.btnSubmitting}
          </>
        ) : (
          t.btnSubmit
        )}
      </button>
    </form>
  );
};
