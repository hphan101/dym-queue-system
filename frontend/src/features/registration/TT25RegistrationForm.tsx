import React, { useState, useEffect } from 'react';
import {
  User,
  Calendar,
  CreditCard,
  Phone,
  Home,
  Building,
  Heart,
  Activity,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Info,
} from 'lucide-react';
import type { BranchCode } from '../../types/domain';
import type { TT25RegistrationData, TT25MedicalHistory } from './tt25Types';
import {
  TT25_PERSONAL_DISEASES,
  INITIAL_TT25_MEDICAL_HISTORY,
} from './tt25Types';
import {
  ETHNIC_GROUPS,
  BLOOD_GROUPS,
  CHECKUP_REASONS,
} from './tt25Constants';
import { SearchableSelect } from './SearchableSelect';

interface Province {
  name: string;
  slug: string;
  type: string;
  name_with_type: string;
  code: string;
}

interface Ward {
  name: string;
  type?: string;
  slug?: string;
  name_with_type: string;
  path?: string;
  path_with_type?: string;
  code: string;
  parent_code: string;
}

let provincesPromise: Promise<Province[]> | null = null;
const wardCache = new Map<string, Promise<Ward[]>>();

function loadProvinces(): Promise<Province[]> {
  if (!provincesPromise) {
    provincesPromise = fetch('/data/provinces.json')
      .then(async (res) => {
        if (!res.ok) throw new Error('PROVINCES_UNAVAILABLE');
        const data = (await res.json()) as Record<string, Province>;
        return Object.values(data).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      })
      .catch((err) => {
        provincesPromise = null;
        throw err;
      });
  }
  return provincesPromise;
}

function loadWardsForProvince(provinceCode: string): Promise<Ward[]> {
  if (!provinceCode) return Promise.resolve([]);
  const cached = wardCache.get(provinceCode);
  if (cached) return cached;

  const nextPromise = fetch(`/data/wards/${provinceCode}.json`)
    .then(async (res) => {
      if (!res.ok) throw new Error('WARDS_UNAVAILABLE');
      const data = (await res.json()) as Record<string, Ward>;
      return Object.values(data).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    })
    .catch((err) => {
      wardCache.delete(provinceCode);
      throw err;
    });

  wardCache.set(provinceCode, nextPromise);
  return nextPromise;
}

interface TT25RegistrationFormProps {
  branch: BranchCode;
  isLoading: boolean;
  onSubmit: (data: TT25RegistrationData) => void;
}

export const TT25RegistrationForm: React.FC<TT25RegistrationFormProps> = ({
  branch,
  isLoading,
  onSubmit,
}) => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Administrative state
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<'Nam' | 'Nữ'>('Nam');
  const [birthDate, setBirthDate] = useState('');
  const [ethnicity, setEthnicity] = useState('Kinh');
  const [bloodGroup, setBloodGroup] = useState('Chưa rõ');
  const [cccd, setCccd] = useState('');
  const [insuranceNumber, setInsuranceNumber] = useState('');
  const [province, setProvince] = useState('');
  const [ward, setWard] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [occupation, setOccupation] = useState('');
  const [workplace, setWorkplace] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [checkupReason, setCheckupReason] = useState(CHECKUP_REASONS[0] || '');

  // Medical History state
  const [medicalHistory, setMedicalHistory] = useState<TT25MedicalHistory>(INITIAL_TT25_MEDICAL_HISTORY);
  const [quickCheckMessage, setQuickCheckMessage] = useState(false);

  // Address lookup state
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [locationsLoaded, setLocationsLoaded] = useState(false);
  const [isLocationLoading, setIsLocationLoading] = useState(false);
  const [_locationError, setLocationError] = useState(false);

  // Step 1 Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let isMounted = true;
    setIsLocationLoading(true);
    setLocationError(false);
    loadProvinces()
      .then((data) => {
        if (!isMounted) return;
        setProvinces(data);
        setLocationsLoaded(true);
      })
      .catch(() => {
        if (!isMounted) return;
        setLocationError(true);
      })
      .finally(() => {
        if (isMounted) setIsLocationLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleProvinceChange = (nextProvince: string) => {
    setProvince(nextProvince);
    setWard('');
    setWards([]);
    const found = provinces.find((p) => p.name === nextProvince || p.name_with_type === nextProvince);
    if (found?.code) {
      loadWardsForProvince(found.code)
        .then((data) => setWards(data))
        .catch(() => setWards([]));
    }
  };

  // Quick Action: "Chọn tất cả là Không"
  const handleSelectAllNegative = () => {
    const cleanPersonal: Record<number, boolean> = {};
    for (let i = 1; i <= 22; i++) {
      cleanPersonal[i] = false;
    }

    setMedicalHistory({
      familyHistory: { hasDisease: false, diseaseDetails: '' },
      personalHistory: cleanPersonal,
      personalOtherDetails: '',
      currentTreatment: { isTreating: false, medications: '' },
      pregnancyHistory: { hasHistory: false, details: '' },
      commitmentAgreed: true,
    });

    setQuickCheckMessage(true);
    setTimeout(() => setQuickCheckMessage(false), 3000);
  };

  // Handle individual personal history disease toggle
  const toggleDisease = (id: number, value: boolean) => {
    setMedicalHistory((prev) => ({
      ...prev,
      personalHistory: {
        ...prev.personalHistory,
        [id]: value,
      },
    }));
  };

  // Validate Step 1
  const validateStep1 = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!fullName.trim()) {
      newErrors.fullName = 'Vui lòng nhập họ và tên';
    } else if (fullName.trim().length < 2) {
      newErrors.fullName = 'Họ và tên phải có ít nhất 2 ký tự';
    }

    if (!birthDate) {
      newErrors.birthDate = 'Vui lòng chọn ngày sinh';
    } else {
      const birth = new Date(birthDate);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      if (age < 18) {
        newErrors.birthDate = 'Thông tư 25 áp dụng cho người từ đủ 18 tuổi trở lên';
      }
    }

    const cleanCccd = cccd.trim();
    if (!cleanCccd) {
      newErrors.cccd = 'Vui lòng nhập số CCCD hoặc số Hộ chiếu';
    } else if (cleanCccd.length < 8) {
      newErrors.cccd = 'Số CCCD/Hộ chiếu không hợp lệ';
    }

    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      newErrors.phoneNumber = 'Vui lòng nhập số điện thoại';
    } else if (!/^0(3|5|7|8|9)[0-9]{8}$/.test(cleanPhone)) {
      newErrors.phoneNumber = 'Số điện thoại gồm 10 số (bắt đầu bằng 03, 05, 07, 08, 09)';
    }

    if (!province) newErrors.province = 'Vui lòng chọn Tỉnh/Thành phố';
    if (!ward) newErrors.ward = 'Vui lòng chọn Phường/Xã';
    if (!addressDetail.trim()) newErrors.addressDetail = 'Vui lòng nhập địa chỉ cụ thể';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNextToStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateStep1()) {
      setCurrentStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNextToStep3 = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalData: TT25RegistrationData = {
      branch,
      fullName: fullName.trim().toUpperCase(),
      gender,
      birthDate,
      ethnicity: ethnicity.trim() || 'Kinh',
      bloodGroup: bloodGroup.trim() || 'Chưa rõ',
      cccd: cccd.trim().toUpperCase(),
      insuranceNumber: insuranceNumber.trim().toUpperCase(),
      province,
      ward,
      addressDetail: addressDetail.trim(),
      occupation: occupation.trim() || 'Tự do',
      workplace: workplace.trim(),
      workplaceWard: '',
      phoneNumber: phoneNumber.replace(/[^0-9]/g, ''),
      checkupReason: checkupReason || 'Khám sức khỏe tổng quát',
      medicalHistory,
    };

    onSubmit(finalData);
  };

  return (
    <div className="w-full">
      {/* Step Indicator Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between max-w-sm mx-auto mb-2 relative">
          <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-0.5 bg-slate-200 -z-0" />
          <div
            className="absolute left-6 top-1/2 -translate-y-1/2 h-0.5 bg-dym-blue-500 transition-all duration-300 -z-0"
            style={{ width: currentStep === 1 ? '0%' : currentStep === 2 ? '50%' : '100%' }}
          />

          {[
            { step: 1, label: 'Hành chính' },
            { step: 2, label: 'Tiền sử bệnh' },
            { step: 3, label: 'Xác nhận' },
          ].map((item) => (
            <div key={item.step} className="flex flex-col items-center z-10">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  currentStep >= item.step
                    ? 'bg-dym-blue-500 text-white shadow-md'
                    : 'bg-white border-2 border-slate-300 text-slate-400'
                }`}
              >
                {currentStep > item.step ? '✓' : item.step}
              </div>
              <span className="text-[11px] font-medium text-slate-600 mt-1">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ================================= STEP 1: HÀNH CHÍNH ================================= */}
      {currentStep === 1 && (
        <form onSubmit={handleNextToStep2} className="space-y-4 animate-fade-in">
          <div className="bg-dym-blue-50/60 border border-dym-blue-100 rounded-xl p-3 text-xs text-dym-blue-900 flex items-start gap-2">
            <Info className="w-4 h-4 text-dym-blue-600 shrink-0 mt-0.5" />
            <p>
              Vui lòng điền chính xác theo CCCD hoặc Hộ chiếu để xuất giấy khám sức khỏe theo mẫu chuẩn Bộ Y tế (Thông tư 25/2026/TT-BYT).
            </p>
          </div>

          {/* Họ và tên */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-slate-400" />
              1. Họ và tên (viết hoa) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value.toUpperCase());
                if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: '' }));
              }}
              placeholder="NGUYỄN VĂN A"
              className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-slate-900 font-semibold uppercase placeholder:normal-case placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-dym-blue-200 transition-all ${
                errors.fullName ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
              }`}
            />
            {errors.fullName && <p className="text-xs text-red-500 mt-1">{errors.fullName}</p>}
          </div>

          {/* Giới tính & Ngày sinh */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Heart className="w-3.5 h-3.5 text-slate-400" />
                2. Giới tính <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['Nam', 'Nữ'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                      gender === g
                        ? 'bg-dym-blue-500 text-white border-dym-blue-500 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                3. Ngày sinh <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => {
                  setBirthDate(e.target.value);
                  if (errors.birthDate) setErrors((prev) => ({ ...prev, birthDate: '' }));
                }}
                className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-dym-blue-200 transition-all ${
                  errors.birthDate ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                }`}
              />
              {errors.birthDate && <p className="text-xs text-red-500 mt-1">{errors.birthDate}</p>}
            </div>
          </div>

          {/* Dân tộc & Nhóm máu */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                4. Dân tộc
              </label>
              <SearchableSelect
                options={ETHNIC_GROUPS.map((e) => ({ value: e, label: e }))}
                value={ethnicity}
                onChange={setEthnicity}
                placeholder="Chọn dân tộc"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                5. Nhóm máu (nếu có)
              </label>
              <SearchableSelect
                options={BLOOD_GROUPS.map((b) => ({ value: b, label: b }))}
                value={bloodGroup}
                onChange={setBloodGroup}
                placeholder="Chọn nhóm máu"
              />
            </div>
          </div>

          {/* Số CCCD & Số BHYT */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                6. Số CCCD / Hộ chiếu <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={cccd}
                onChange={(e) => {
                  setCccd(e.target.value.toUpperCase());
                  if (errors.cccd) setErrors((prev) => ({ ...prev, cccd: '' }));
                }}
                maxLength={12}
                placeholder="12 chữ số CCCD"
                className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-dym-blue-200 transition-all ${
                  errors.cccd ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                }`}
              />
              {errors.cccd && <p className="text-xs text-red-500 mt-1">{errors.cccd}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                7. Số thẻ BHYT (nếu có)
              </label>
              <input
                type="text"
                value={insuranceNumber}
                onChange={(e) => setInsuranceNumber(e.target.value.toUpperCase())}
                maxLength={15}
                placeholder="VD: DN4791234567890"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-dym-blue-200 transition-all"
              />
            </div>
          </div>

          {/* Nơi ở hiện tại: Tỉnh / Huyện / Xã / Địa chỉ */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2.5">
            <span className="block text-xs font-semibold text-slate-800 flex items-center gap-1">
              <Home className="w-3.5 h-3.5 text-slate-500" />
              8. Nơi ở hiện tại <span className="text-red-500">*</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <SearchableSelect
                  options={provinces.map((p) => ({ value: p.name_with_type, label: p.name_with_type }))}
                  value={province}
                  onChange={handleProvinceChange}
                  placeholder="Chọn Tỉnh / Thành phố"
                  disabled={isLocationLoading || !locationsLoaded}
                  isLoadingOptions={isLocationLoading}
                  error={Boolean(errors.province)}
                />
                {errors.province && <p className="text-xs text-red-500 mt-0.5">{errors.province}</p>}
              </div>

              <div>
                <SearchableSelect
                  options={wards.map((w) => ({ value: w.name_with_type, label: w.name_with_type }))}
                  value={ward}
                  onChange={(val) => {
                    setWard(val);
                    if (errors.ward) setErrors((prev) => ({ ...prev, ward: '' }));
                  }}
                  placeholder="Chọn Phường / Xã"
                  disabled={!province || wards.length === 0}
                  error={Boolean(errors.ward)}
                />
                {errors.ward && <p className="text-xs text-red-500 mt-0.5">{errors.ward}</p>}
              </div>
            </div>

            <div>
              <input
                type="text"
                value={addressDetail}
                onChange={(e) => {
                  setAddressDetail(e.target.value);
                  if (errors.addressDetail) setErrors((prev) => ({ ...prev, addressDetail: '' }));
                }}
                placeholder="Số nhà, tên đường, thôn / ấp..."
                className={`w-full px-3 py-2 bg-white border rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-dym-blue-200 transition-all ${
                  errors.addressDetail ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                }`}
              />
              {errors.addressDetail && <p className="text-xs text-red-500 mt-0.5">{errors.addressDetail}</p>}
            </div>
          </div>

          {/* Nghề nghiệp & Nơi làm việc */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                9. Nghề nghiệp
              </label>
              <input
                type="text"
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                placeholder="Nhân viên, Kỹ sư, Sinh viên..."
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-dym-blue-200 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Building className="w-3.5 h-3.5 text-slate-400" />
                10. Nơi làm việc, học tập
              </label>
              <input
                type="text"
                value={workplace}
                onChange={(e) => setWorkplace(e.target.value)}
                placeholder="Tên công ty hoặc trường học"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-dym-blue-200 transition-all"
              />
            </div>
          </div>

          {/* Điện thoại & Lý do khám */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                11. Điện thoại di động <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => {
                  setPhoneNumber(e.target.value);
                  if (errors.phoneNumber) setErrors((prev) => ({ ...prev, phoneNumber: '' }));
                }}
                maxLength={10}
                placeholder="0912345678"
                className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-dym-blue-200 transition-all ${
                  errors.phoneNumber ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                }`}
              />
              {errors.phoneNumber && <p className="text-xs text-red-500 mt-1">{errors.phoneNumber}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                12. Lý do khám sức khỏe
              </label>
              <SearchableSelect
                options={CHECKUP_REASONS.map((r) => ({ value: r, label: r }))}
                value={checkupReason}
                onChange={setCheckupReason}
                placeholder="Chọn lý do khám"
              />
            </div>
          </div>

          {/* Next Button */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3 bg-dym-blue-500 hover:bg-dym-blue-600 active:scale-[0.99] text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Tiếp tục: Khai báo tiền sử bệnh</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* ================================= STEP 2: TIỀN SỬ BỆNH ================================= */}
      {currentStep === 2 && (
        <form onSubmit={handleNextToStep3} className="space-y-5 animate-fade-in">
          {/* Quick Action Button for fast filling */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-3">
            <div>
              <h3 className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                Nếu bạn có sức khỏe hoàn toàn bình thường:
              </h3>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Bấm nút để đánh dấu nhanh tất cả mục là "Không mắc bệnh", sau đó bạn có thể chọn lại mục mình có.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSelectAllNegative}
              className="shrink-0 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              Tất cả đều Bình thường
            </button>
          </div>

          {quickCheckMessage && (
            <div className="p-2.5 bg-emerald-100 text-emerald-800 text-xs rounded-lg flex items-center gap-2 animate-bounce">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              Đã đánh dấu nhanh: Toàn bộ mục tiền sử là "Không". Bạn hãy kiểm tra lại nếu có bệnh lý cần ghi nhận.
            </div>
          )}

          {/* 1. Tiền sử gia đình */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-2">
            <h4 className="text-xs font-bold text-slate-800 leading-snug">
              1. Tiền sử gia đình:
              <span className="font-normal text-slate-600 block mt-0.5">
                Có ai trong gia đình ông (bà) mắc một trong các bệnh: truyền nhiễm, tim mạch, đái tháo đường, lao, hen phế quản, ung thư, động kinh, rối loạn tâm thần, bệnh khác:
              </span>
            </h4>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setMedicalHistory((prev) => ({
                    ...prev,
                    familyHistory: { hasDisease: false, diseaseDetails: '' },
                  }))
                }
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all ${
                  !medicalHistory.familyHistory.hasDisease
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                Không
              </button>
              <button
                type="button"
                onClick={() =>
                  setMedicalHistory((prev) => ({
                    ...prev,
                    familyHistory: { ...prev.familyHistory, hasDisease: true },
                  }))
                }
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all ${
                  medicalHistory.familyHistory.hasDisease
                    ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                Có bệnh
              </button>
            </div>
            {medicalHistory.familyHistory.hasDisease && (
              <div className="pt-1 animate-fade-in">
                <input
                  type="text"
                  value={medicalHistory.familyHistory.diseaseDetails}
                  onChange={(e) =>
                    setMedicalHistory((prev) => ({
                      ...prev,
                      familyHistory: { ...prev.familyHistory, diseaseDetails: e.target.value },
                    }))
                  }
                  placeholder="Ghi cụ thể tên bệnh (VD: Tim mạch, tiểu đường...)"
                  className="w-full px-3 py-1.5 bg-amber-50/50 border border-amber-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200"
                />
              </div>
            )}
          </div>

          {/* 2. Tiền sử bản thân: Bảng 22 bệnh lý */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-2.5">
            <div className="border-b border-slate-100 pb-2">
              <h4 className="text-xs font-bold text-slate-800">
                2. Tiền sử bệnh, tật của bản thân:
              </h4>
              <p className="text-[11px] text-slate-500">
                Ông (bà) đã hoặc đang mắc bệnh, tình trạng nào sau đây không?
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[380px] overflow-y-auto pr-1">
              {TT25_PERSONAL_DISEASES.map((item) => {
                const isSelected = Boolean(medicalHistory.personalHistory[item.id]);
                return (
                  <div
                    key={item.id}
                    className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 transition-all ${
                      isSelected
                        ? 'border-amber-300 bg-amber-50/40'
                        : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50'
                    }`}
                  >
                    <span className="font-medium text-slate-800 leading-snug">
                      <strong className="text-slate-400 mr-1">{item.id}.</strong> {item.name}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleDisease(item.id, false)}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-all ${
                          !isSelected
                            ? 'bg-slate-200 text-slate-800 border-slate-300'
                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Không
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleDisease(item.id, true)}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-all ${
                          isSelected
                            ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Có
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {medicalHistory.personalHistory[22] && (
              <div className="pt-2 animate-fade-in">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Ghi rõ bệnh khác của bạn:
                </label>
                <input
                  type="text"
                  value={medicalHistory.personalOtherDetails}
                  onChange={(e) =>
                    setMedicalHistory((prev) => ({
                      ...prev,
                      personalOtherDetails: e.target.value,
                    }))
                  }
                  placeholder="Ghi rõ tên bệnh lý khác..."
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                />
              </div>
            )}
          </div>

          {/* 3. Câu hỏi khác */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-3">
            <h4 className="text-xs font-bold text-slate-800">3. Câu hỏi khác (nếu có):</h4>

            {/* a) Điều trị bệnh */}
            <div className="space-y-1.5 text-xs">
              <p className="font-medium text-slate-700">a) Bạn có đang điều trị bệnh gì không?</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setMedicalHistory((prev) => ({
                      ...prev,
                      currentTreatment: { isTreating: false, medications: '' },
                    }))
                  }
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all ${
                    !medicalHistory.currentTreatment.isTreating
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  Không
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMedicalHistory((prev) => ({
                      ...prev,
                      currentTreatment: { ...prev.currentTreatment, isTreating: true },
                    }))
                  }
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all ${
                    medicalHistory.currentTreatment.isTreating
                      ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  Có điều trị
                </button>
              </div>
              {medicalHistory.currentTreatment.isTreating && (
                <div className="pt-1 animate-fade-in">
                  <input
                    type="text"
                    value={medicalHistory.currentTreatment.medications}
                    onChange={(e) =>
                      setMedicalHistory((prev) => ({
                        ...prev,
                        currentTreatment: { ...prev.currentTreatment, medications: e.target.value },
                      }))
                    }
                    placeholder="Liệt kê các thuốc đang dùng và liều lượng..."
                    className="w-full px-3 py-1.5 bg-amber-50/50 border border-amber-300 rounded-lg text-xs text-slate-900"
                  />
                </div>
              )}
            </div>

            {/* b) Tiền sử thai sản (Đối với nữ) */}
            {gender === 'Nữ' && (
              <div className="space-y-1.5 text-xs border-t border-slate-100 pt-2.5 animate-fade-in">
                <p className="font-medium text-slate-700">b) Tiền sử thai sản (Đối với phụ nữ):</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setMedicalHistory((prev) => ({
                        ...prev,
                        pregnancyHistory: { hasHistory: false, details: '' },
                      }))
                    }
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all ${
                      !medicalHistory.pregnancyHistory?.hasHistory
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    Không
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setMedicalHistory((prev) => ({
                        ...prev,
                        pregnancyHistory: { hasHistory: true, details: prev.pregnancyHistory?.details || '' },
                      }))
                    }
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all ${
                      medicalHistory.pregnancyHistory?.hasHistory
                        ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    Có
                  </button>
                </div>
                {medicalHistory.pregnancyHistory?.hasHistory && (
                  <div className="pt-1 animate-fade-in">
                    <input
                      type="text"
                      value={medicalHistory.pregnancyHistory?.details || ''}
                      onChange={(e) =>
                        setMedicalHistory((prev) => ({
                          ...prev,
                          pregnancyHistory: { hasHistory: true, details: e.target.value },
                        }))
                      }
                      placeholder="Ghi rõ tình trạng thai sản hoặc thuốc đang dùng..."
                      className="w-full px-3 py-1.5 bg-amber-50/50 border border-amber-300 rounded-lg text-xs text-slate-900"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stepper Navigation */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="py-3 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              Quay lại
            </button>
            <button
              type="submit"
              className="flex-1 py-3 bg-dym-blue-500 hover:bg-dym-blue-600 active:scale-[0.99] text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Xem lại & Xác nhận</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* ================================= STEP 3: XÁC NHẬN ================================= */}
      {currentStep === 3 && (
        <form onSubmit={handleFinalSubmit} className="space-y-4 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3 text-xs">
            <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Tóm tắt hồ sơ khám sức khỏe Thông tư 25
            </h3>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <span className="text-slate-400 block text-[11px]">Họ và tên:</span>
                <span className="font-bold text-slate-800 text-sm">{fullName}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Giới tính & Ngày sinh:</span>
                <span className="font-medium text-slate-700">
                  {gender} — {birthDate.split('-').reverse().join('/')}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Số CCCD / Hộ chiếu:</span>
                <span className="font-medium text-slate-700">{cccd}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Số điện thoại:</span>
                <span className="font-medium text-slate-700">{phoneNumber}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Dân tộc / Nhóm máu:</span>
                <span className="font-medium text-slate-700">
                  {ethnicity} / {bloodGroup}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Thẻ BHYT:</span>
                <span className="font-medium text-slate-700">{insuranceNumber || 'Không có'}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400 block text-[11px]">Nơi ở hiện tại:</span>
                <span className="font-medium text-slate-700">
                  {addressDetail}, {ward}, {province}
                </span>
              </div>
            </div>

            {/* Tóm tắt tiền sử bệnh */}
            <div className="border-t border-slate-100 pt-2.5 mt-2">
              <span className="text-slate-400 block text-[11px] mb-1">Tiền sử y tế:</span>
              {Object.values(medicalHistory.personalHistory).some(Boolean) ||
              medicalHistory.familyHistory.hasDisease ||
              medicalHistory.currentTreatment.isTreating ? (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Có ghi nhận tiền sử bệnh lý.</p>
                    <p className="text-[10px] text-amber-700">
                      Hệ thống đã lưu đầy đủ các mục bạn chọn để điền vào phiếu khám nộp Bác sĩ.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <p className="font-medium">Tiền sử sức khỏe hoàn toàn bình thường.</p>
                </div>
              )}
            </div>
          </div>

          {/* Cam đoan */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={medicalHistory.commitmentAgreed}
                onChange={(e) =>
                  setMedicalHistory((prev) => ({
                    ...prev,
                    commitmentAgreed: e.target.checked,
                  }))
                }
                className="mt-0.5 rounded border-slate-300 text-dym-blue-600 focus:ring-dym-blue-500 w-4 h-4"
              />
              <span className="text-slate-700 leading-relaxed font-medium">
                Tôi xin cam đoan những điều khai trên đây hoàn toàn đúng với sự thật theo sự hiểu biết của tôi.
              </span>
            </label>
          </div>

          {/* Stepper Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="py-3 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              Sửa tiền sử bệnh
            </button>
            <button
              type="submit"
              disabled={isLoading || !medicalHistory.commitmentAgreed}
              className="flex-1 py-3 bg-dym-blue-500 hover:bg-dym-blue-600 active:scale-[0.99] disabled:bg-slate-300 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              <Activity className="w-4 h-4" />
              <span>{isLoading ? 'Đang gửi thông tin...' : 'Xác nhận & Gửi thông tin'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
