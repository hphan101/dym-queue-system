import React, { useState, useEffect } from 'react';
import {
  Activity,
  Check,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Info,
} from 'lucide-react';
import type { BranchCode } from '../../types/domain';
import type { SupportedLanguage } from '../../locales';
import type {
  TT25RegistrationData,
  TT25MedicalHistory,
  TT25TargetPaymentInfo,
  TT25TargetGroup,
  TT25PaymentSource,
} from './tt25Types';
import {
  TT25_PERSONAL_DISEASES,
  INITIAL_TT25_MEDICAL_HISTORY,
  getDefaultTargetPaymentByReason,
} from './tt25Types';
import {
  ETHNIC_GROUPS,
  BLOOD_GROUPS,
  CHECKUP_REASONS,
} from './tt25Constants';
import { SearchableSelect } from './SearchableSelect';
import { BirthDateInput } from './BirthDateInput';
import { validateVietnamCccd } from './cccdValidator';
import {
  loadOccupations,
  loadProvinces,
  loadWardsForProvince,
  type Province,
  type Ward,
} from './locationService';

interface TT25RegistrationFormProps {
  branch: BranchCode;
  isLoading: boolean;
  onSubmit: (data: TT25RegistrationData) => void;
  lang?: SupportedLanguage;
  initialCheckupReason?: string;
}

export const TT25RegistrationForm: React.FC<TT25RegistrationFormProps> = ({
  branch,
  isLoading,
  onSubmit,
  lang = 'vi',
  initialCheckupReason,
}) => {
  const isEn = lang === 'en';
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

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
  const [workplaceProvince, setWorkplaceProvince] = useState('');
  const [workplaceWard, setWorkplaceWard] = useState('');
  const [workplaceWards, setWorkplaceWards] = useState<Ward[]>([]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [checkupReason, setCheckupReason] = useState(
    initialCheckupReason || CHECKUP_REASONS[0] || '',
  );

  useEffect(() => {
    if (initialCheckupReason) {
      setCheckupReason(initialCheckupReason);
      setTargetPayment(getDefaultTargetPaymentByReason(initialCheckupReason));
    }
  }, [initialCheckupReason]);

  // Medical History state
  const [medicalHistory, setMedicalHistory] = useState<TT25MedicalHistory>(INITIAL_TT25_MEDICAL_HISTORY);

  // Target & Payment Info state (Địa điểm khám mặc định auto tick CS KBCB)
  const [targetPayment, setTargetPayment] = useState<TT25TargetPaymentInfo>(() =>
    getDefaultTargetPaymentByReason(initialCheckupReason || CHECKUP_REASONS[0]),
  );

  // Address & occupation lookup state
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [occupations, setOccupations] = useState<string[]>([]);
  const [locationsLoaded, setLocationsLoaded] = useState(false);
  const [isLocationLoading, setIsLocationLoading] = useState(false);

  // Step 1 Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let isMounted = true;
    setIsLocationLoading(true);
    loadProvinces()
      .then((data) => {
        if (!isMounted) return;
        setProvinces(data);
        setLocationsLoaded(true);
      })
      .catch(() => {
        // Location loading will remain retryable
      })
      .finally(() => {
        if (isMounted) setIsLocationLoading(false);
      });

    loadOccupations()
      .then((data) => {
        if (!isMounted) return;
        setOccupations(data);
      })
      .catch(() => {
        // Occupation loading will remain retryable
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

  const handleWorkplaceProvinceChange = (nextProvince: string) => {
    setWorkplaceProvince(nextProvince);
    setWorkplaceWard('');
    setWorkplaceWards([]);
    const found = provinces.find((p) => p.name === nextProvince || p.name_with_type === nextProvince);
    if (found?.code) {
      loadWardsForProvince(found.code)
        .then((data) => setWorkplaceWards(data))
        .catch(() => setWorkplaceWards([]));
    }
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
      newErrors.fullName = isEn ? 'Please enter your full name' : 'Vui lòng nhập họ và tên';
    } else if (fullName.trim().length < 2) {
      newErrors.fullName = isEn ? 'Full name must be at least 2 characters' : 'Họ và tên phải có ít nhất 2 ký tự';
    }

    if (!birthDate) {
      newErrors.birthDate = isEn
        ? 'Please enter your date of birth (DD/MM/YYYY)'
        : 'Vui lòng nhập ngày sinh (định dạng ngày/tháng/năm)';
    } else {
      const birth = new Date(birthDate);
      if (isNaN(birth.getTime()) || birth.getFullYear() < 1900) {
        newErrors.birthDate = isEn ? 'Invalid date of birth' : 'Ngày sinh không hợp lệ';
      } else {
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
          age--;
        }
        if (age < 18) {
          newErrors.birthDate = isEn
            ? 'Circular 25 applies to individuals aged 18 and above'
            : 'Thông tư 25 áp dụng cho người từ đủ 18 tuổi trở lên';
        }
      }
    }

    const cccdError = validateVietnamCccd({
      cccd,
      gender,
      birthDate,
      isEn,
    });
    if (cccdError) {
      newErrors.cccd = cccdError;
    }

    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      newErrors.phoneNumber = isEn ? 'Please enter your phone number' : 'Vui lòng nhập số điện thoại';
    } else if (!/^0(3|5|7|8|9)[0-9]{8}$/.test(cleanPhone)) {
      newErrors.phoneNumber = isEn
        ? 'Phone number must be 10 digits (starting with 03, 05, 07, 08, 09)'
        : 'Số điện thoại gồm 10 số (bắt đầu bằng 03, 05, 07, 08, 09)';
    }

    if (!province) newErrors.province = isEn ? 'Please select a Province / City' : 'Vui lòng chọn Tỉnh/Thành phố';
    if (!ward) newErrors.ward = isEn ? 'Please select a Ward / Commune' : 'Vui lòng chọn Phường/Xã';
    if (!addressDetail.trim()) {
      newErrors.addressDetail = isEn ? 'Please enter your street address' : 'Vui lòng nhập địa chỉ cụ thể';
    }

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

  const handleNextToStep4 = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentStep(4);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const formattedWorkplaceLocation = [workplaceWard, workplaceProvince]
    .filter(Boolean)
    .join(', ');

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
      workplaceWard: formattedWorkplaceLocation,
      phoneNumber: phoneNumber.replace(/[^0-9]/g, ''),
      checkupReason: checkupReason || 'Khám sức khỏe tổng quát',
      medicalHistory,
      targetPayment: {
        ...targetPayment,
        targetOtherDetails: targetPayment.targetOtherDetails.trim(),
        paymentOtherDetails: targetPayment.paymentOtherDetails.trim(),
        examLocation: 'cs_kbcb',
      },
    };

    onSubmit(finalData);
  };

  return (
    <div className="w-full">
      {/* Step Indicator Header */}
      <div className="mb-7">
        <div className="max-w-md mx-auto relative">
          {/* Connecting Track Line: aligned to center of 32px circle (top-4) */}
          <div className="absolute top-4 left-6 right-6 -translate-y-1/2 h-[2.5px] bg-slate-200 rounded-full overflow-hidden pointer-events-none">
            <div
              className="h-full bg-dym-blue-500 rounded-full transition-all duration-300 ease-out"
              style={{
                width:
                  currentStep === 1
                    ? '0%'
                    : currentStep === 2
                      ? '33.33%'
                      : currentStep === 3
                        ? '66.66%'
                        : '100%',
              }}
            />
          </div>

          {/* Step Items */}
          <div className="flex items-start justify-between relative z-10">
            {([
              { step: 1, label: isEn ? 'Personal Info' : 'Hành chính' },
              { step: 2, label: isEn ? 'Medical History' : 'Tiền sử bệnh' },
              { step: 3, label: isEn ? 'Target & Payment' : 'Đối tượng - Chi trả' },
              { step: 4, label: isEn ? 'Confirm' : 'Xác nhận' },
            ] as const).map((item) => {
              const isCompleted = currentStep > item.step;
              const isCurrent = currentStep === item.step;
              const isClickable = item.step < currentStep;

              return (
                <button
                  key={item.step}
                  type="button"
                  disabled={!isClickable}
                  onClick={() => {
                    if (isClickable) {
                      setCurrentStep(item.step);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                  className={`flex flex-col items-center group transition-all ${
                    isClickable ? 'cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 ${
                      isCompleted
                        ? 'bg-dym-blue-500 text-white shadow-sm ring-2 ring-dym-blue-100 group-hover:bg-dym-blue-600'
                        : isCurrent
                          ? 'bg-dym-blue-600 text-white shadow-md ring-4 ring-dym-blue-100 scale-105'
                          : 'bg-white border-2 border-slate-300 text-slate-400'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
                    ) : (
                      item.step
                    )}
                  </div>
                  <span
                    className={`text-xs mt-1.5 transition-colors ${
                      isCurrent
                        ? 'font-bold text-dym-blue-700'
                        : isCompleted
                          ? 'font-medium text-slate-700 group-hover:text-dym-blue-600'
                          : 'font-medium text-slate-400'
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ================================= STEP 1: HÀNH CHÍNH ================================= */}
      {currentStep === 1 && (
        <form onSubmit={handleNextToStep2} className="space-y-4 animate-fade-in">
          <div className="bg-dym-blue-50/60 border border-dym-blue-100 rounded-md p-3 text-xs text-dym-blue-900 flex items-start gap-2">
            <Info className="w-4 h-4 text-dym-blue-600 shrink-0 mt-0.5" />
            <p>
              {isEn
                ? 'Please fill in your details accurately according to your Citizen ID or Passport to issue the Ministry of Health standard medical examination form (Circular 25/2026/TT-BYT).'
                : 'Vui lòng điền chính xác theo CCCD hoặc Hộ chiếu để xuất giấy khám sức khỏe theo mẫu chuẩn Bộ Y tế (Thông tư 25/2026/TT-BYT).'}
            </p>
          </div>

          {/* Họ và tên */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {isEn ? '1. Full Name (e.g. NGUYEN VAN A)' : '1. Họ và tên (ví dụ: NGUYỄN VĂN A)'}{' '}
              <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: '' }));
              }}
              className={`w-full px-3 py-2 bg-white border rounded text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-dym-blue-200 transition-all ${
                errors.fullName ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
              }`}
            />
            {errors.fullName && <p className="text-xs text-red-500 mt-1">{errors.fullName}</p>}
          </div>

          {/* Giới tính & Ngày sinh */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
            <div className="min-w-0">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isEn ? '2. Gender' : '2. Giới tính'} <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['Nam', 'Nữ'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      setGender(g);
                      if (cccd.trim().length === 12) {
                        const err = validateVietnamCccd({
                          cccd,
                          gender: g,
                          birthDate,
                          isEn,
                        });
                        setErrors((prev) => ({ ...prev, cccd: err || '' }));
                      }
                    }}
                    className={`py-2 px-3 rounded text-xs font-semibold border transition-all ${
                      gender === g
                        ? 'bg-dym-blue-500 text-white border-dym-blue-500 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {isEn ? (g === 'Nam' ? 'Male' : 'Female') : g}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-w-0">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isEn ? '3. Date of Birth' : '3. Ngày sinh'} <span className="text-red-500">*</span>
              </label>
              <BirthDateInput
                value={birthDate}
                onChange={(val) => {
                  setBirthDate(val);
                  setErrors((prev) => {
                    const nextCccdErr =
                      cccd.trim().length === 12
                        ? validateVietnamCccd({
                            cccd,
                            gender,
                            birthDate: val,
                            isEn,
                          }) || ''
                        : prev.cccd;
                    return {
                      ...prev,
                      birthDate: '',
                      cccd: nextCccdErr,
                    };
                  });
                }}
                error={errors.birthDate}
                onErrorClear={() => {
                  if (errors.birthDate) setErrors((prev) => ({ ...prev, birthDate: '' }));
                }}
              />
              {errors.birthDate && <p className="text-xs text-red-500 mt-1">{errors.birthDate}</p>}
            </div>
          </div>

          {/* Dân tộc & Nhóm máu */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isEn ? '4. Ethnicity' : '4. Dân tộc'}
              </label>
              <SearchableSelect
                options={ETHNIC_GROUPS.map((e) => ({
                  value: e,
                  label: isEn && e === 'Người nước ngoài' ? 'Foreigner (Người nước ngoài)' : e,
                }))}
                value={ethnicity}
                onChange={setEthnicity}
                placeholder={isEn ? 'Select ethnicity' : 'Chọn dân tộc'}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isEn ? '5. Blood Type (optional)' : '5. Nhóm máu (nếu có)'}
              </label>
              <SearchableSelect
                options={BLOOD_GROUPS.map((b) => ({
                  value: b,
                  label: isEn && b === 'Chưa rõ' ? 'Unknown' : b,
                }))}
                value={bloodGroup}
                onChange={setBloodGroup}
                placeholder={isEn ? 'Select blood type' : 'Chọn nhóm máu'}
              />
            </div>
          </div>

          {/* Số CCCD & Số BHYT */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isEn ? '6. Citizen ID / Passport No.' : '6. Số CCCD / Hộ chiếu'}{' '}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={cccd}
                onChange={(e) => {
                  const nextVal = e.target.value.toUpperCase();
                  setCccd(nextVal);
                  if (nextVal.trim().length === 12) {
                    const err = validateVietnamCccd({
                      cccd: nextVal,
                      gender,
                      birthDate,
                      isEn,
                    });
                    setErrors((prev) => ({ ...prev, cccd: err || '' }));
                  } else if (errors.cccd) {
                    setErrors((prev) => ({ ...prev, cccd: '' }));
                  }
                }}
                onBlur={() => {
                  if (cccd.trim()) {
                    const err = validateVietnamCccd({
                      cccd,
                      gender,
                      birthDate,
                      isEn,
                    });
                    setErrors((prev) => ({ ...prev, cccd: err || '' }));
                  }
                }}
                maxLength={12}
                placeholder={isEn ? 'Citizen ID / Passport number' : '12 chữ số CCCD'}
                className={`w-full px-3 py-2 bg-white border rounded text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-dym-blue-200 transition-all ${
                  errors.cccd ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                }`}
              />
              {errors.cccd && <p className="text-xs text-red-500 mt-1">{errors.cccd}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isEn ? '7. Health Insurance No. (optional)' : '7. Số thẻ BHYT (nếu có)'}
              </label>
              <input
                type="text"
                value={insuranceNumber}
                onChange={(e) => setInsuranceNumber(e.target.value.toUpperCase())}
                maxLength={15}
                placeholder={isEn ? 'e.g. DN4791234567890' : 'VD: DN4791234567890'}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-dym-blue-200 transition-all"
              />
            </div>
          </div>

          {/* Nơi ở hiện tại: Tỉnh / Huyện / Xã / Địa chỉ */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-md space-y-2.5">
            <span className="block text-xs font-semibold text-slate-800">
              {isEn ? '8. Current Residence Address' : '8. Nơi ở hiện tại'}{' '}
              <span className="text-red-500">*</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <SearchableSelect
                  options={provinces.map((p) => ({ value: p.name_with_type, label: p.name_with_type }))}
                  value={province}
                  onChange={handleProvinceChange}
                  placeholder={isEn ? 'Select Province / City' : 'Chọn Tỉnh / Thành phố'}
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
                  placeholder={isEn ? 'Select Ward / Commune' : 'Chọn Phường / Xã'}
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
                placeholder={isEn ? 'House number, street name...' : 'Số nhà, tên đường, thôn / ấp...'}
                className={`w-full px-3 py-2 bg-white border rounded text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-dym-blue-200 transition-all ${
                  errors.addressDetail ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                }`}
              />
              {errors.addressDetail && <p className="text-xs text-red-500 mt-0.5">{errors.addressDetail}</p>}
            </div>
          </div>

          {/* Nghề nghiệp */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {isEn ? '9. Occupation' : '9. Nghề nghiệp'}
            </label>
            <SearchableSelect
              options={occupations.map((occ) => ({ value: occ, label: occ }))}
              value={occupation}
              onChange={setOccupation}
              placeholder={
                isEn
                  ? 'Select or type to search occupation...'
                  : 'Chọn hoặc nhập để tìm nghề nghiệp...'
              }
              isLoadingOptions={occupations.length === 0 && isLocationLoading}
            />
          </div>

          {/* Nơi làm việc, học tập & Xã phường */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-md space-y-2.5">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                {isEn
                  ? '10. Workplace / School (Full company/school name)'
                  : '10. Nơi làm việc, học tập (Tên đầy đủ công ty/trường)'}
              </label>
              <input
                type="text"
                value={workplace}
                onChange={(e) => setWorkplace(e.target.value)}
                placeholder={
                  isEn
                    ? 'Enter company or school name...'
                    : 'Nhập tên đầy đủ công ty hoặc trường học...'
                }
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-dym-blue-200 transition-all"
              />
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-1">
                {isEn
                  ? 'Ward / Province of workplace or school'
                  : 'Xã, phường nơi làm việc, học tập'}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <SearchableSelect
                  options={provinces.map((p) => ({
                    value: p.name_with_type,
                    label: p.name_with_type,
                  }))}
                  value={workplaceProvince}
                  onChange={handleWorkplaceProvinceChange}
                  placeholder={isEn ? 'Select Province / City' : 'Chọn Tỉnh / Thành phố'}
                  disabled={isLocationLoading || !locationsLoaded}
                  isLoadingOptions={isLocationLoading}
                />

                <SearchableSelect
                  options={workplaceWards.map((w) => ({
                    value: w.name_with_type,
                    label: w.name_with_type,
                  }))}
                  value={workplaceWard}
                  onChange={setWorkplaceWard}
                  placeholder={isEn ? 'Select Ward / Commune' : 'Chọn Phường / Xã'}
                  disabled={!workplaceProvince || workplaceWards.length === 0}
                />
              </div>
            </div>
          </div>

          {/* Điện thoại di động */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {isEn ? '11. Mobile Phone Number' : '11. Điện thoại di động'}{' '}
              <span className="text-red-500">*</span>
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
              className={`w-full px-3 py-2 bg-white border rounded text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-dym-blue-200 transition-all ${
                errors.phoneNumber ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
              }`}
            />
            {errors.phoneNumber && <p className="text-xs text-red-500 mt-1">{errors.phoneNumber}</p>}
          </div>

          {/* Next Button */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3 bg-dym-blue-500 hover:bg-dym-blue-600 active:scale-[0.99] text-white font-bold text-sm rounded shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>
                {isEn ? 'Next: Medical History Declaration' : 'Tiếp tục: Khai báo tiền sử bệnh'}
              </span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* ================================= STEP 2: TIỀN SỬ BỆNH ================================= */}
      {currentStep === 2 && (
        <form onSubmit={handleNextToStep3} className="space-y-5 animate-fade-in">
          {/* 1. Tiền sử gia đình */}
          <div className="bg-white border border-slate-200 rounded-md p-3.5 shadow-sm space-y-2">
            <h4 className="text-xs font-bold text-slate-800 leading-snug">
              {isEn ? '1. Family Medical History:' : '1. Tiền sử gia đình:'}
              <span className="font-normal text-slate-600 block mt-0.5">
                {isEn
                  ? 'Has anyone in your family been diagnosed with: infectious diseases, cardiovascular disease, diabetes, tuberculosis, bronchial asthma, cancer, epilepsy, mental disorders, or other hereditary conditions?'
                  : 'Có ai trong gia đình ông (bà) mắc một trong các bệnh: truyền nhiễm, tim mạch, đái tháo đường, lao, hen phế quản, ung thư, động kinh, rối loạn tâm thần, bệnh khác:'}
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
                className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold border transition-all ${
                  !medicalHistory.familyHistory.hasDisease
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {isEn ? 'No' : 'Không'}
              </button>
              <button
                type="button"
                onClick={() =>
                  setMedicalHistory((prev) => ({
                    ...prev,
                    familyHistory: { ...prev.familyHistory, hasDisease: true },
                  }))
                }
                className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold border transition-all ${
                  medicalHistory.familyHistory.hasDisease
                    ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {isEn ? 'Yes' : 'Có bệnh'}
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
                  placeholder={
                    isEn
                      ? 'Specify condition name (e.g., Heart disease, diabetes...)'
                      : 'Ghi cụ thể tên bệnh (VD: Tim mạch, tiểu đường...)'
                  }
                  className="w-full px-3 py-1.5 bg-amber-50/50 border border-amber-300 rounded text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200"
                />
              </div>
            )}
          </div>

          {/* 2. Tiền sử bản thân: Bảng 22 bệnh lý */}
          <div className="bg-white border border-slate-200 rounded-md p-3.5 shadow-sm space-y-2.5">
            <div className="border-b border-slate-100 pb-2">
              <h4 className="text-xs font-bold text-slate-800">
                {isEn ? '2. Personal Medical History:' : '2. Tiền sử bệnh, tật của bản thân:'}
              </h4>
              <p className="text-[11px] text-slate-500">
                {isEn
                  ? 'Have you ever had or do you currently have any of the following conditions?'
                  : 'Ông (bà) đã hoặc đang mắc bệnh, tình trạng nào sau đây không?'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[380px] overflow-y-auto pr-1">
              {TT25_PERSONAL_DISEASES.map((item) => {
                const isSelected = Boolean(medicalHistory.personalHistory[item.id]);
                return (
                  <div
                    key={item.id}
                    className={`p-2.5 rounded border text-xs flex items-center justify-between gap-2 transition-all ${
                      isSelected
                        ? 'border-amber-300 bg-amber-50/40'
                        : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50'
                    }`}
                  >
                    <span className="font-medium text-slate-800 leading-snug">
                      <strong className="text-slate-400 mr-1">{item.id}.</strong>{' '}
                      {isEn ? item.nameEn : item.name}
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
                        {isEn ? 'No' : 'Không'}
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
                        {isEn ? 'Yes' : 'Có'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {medicalHistory.personalHistory[22] && (
              <div className="pt-2 animate-fade-in">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  {isEn ? 'Please specify other conditions:' : 'Ghi rõ bệnh khác của bạn:'}
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
                  placeholder={isEn ? 'Specify other medical conditions...' : 'Ghi rõ tên bệnh lý khác...'}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded text-xs"
                />
              </div>
            )}
          </div>

          {/* 3. Câu hỏi khác */}
          <div className="bg-white border border-slate-200 rounded-md p-3.5 shadow-sm space-y-3">
            <h4 className="text-xs font-bold text-slate-800">
              {isEn ? '3. Additional Questions (if applicable):' : '3. Câu hỏi khác (nếu có):'}
            </h4>

            {/* a) Điều trị bệnh */}
            <div className="space-y-1.5 text-xs">
              <p className="font-medium text-slate-700">
                {isEn
                  ? 'a) Are you currently receiving treatment for any medical condition?'
                  : 'a) Bạn có đang điều trị bệnh gì không?'}
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setMedicalHistory((prev) => ({
                      ...prev,
                      currentTreatment: { isTreating: false, medications: '' },
                    }))
                  }
                  className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold border transition-all ${
                    !medicalHistory.currentTreatment.isTreating
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {isEn ? 'No' : 'Không'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMedicalHistory((prev) => ({
                      ...prev,
                      currentTreatment: { ...prev.currentTreatment, isTreating: true },
                    }))
                  }
                  className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold border transition-all ${
                    medicalHistory.currentTreatment.isTreating
                      ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {isEn ? 'Yes, currently under treatment' : 'Có điều trị'}
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
                    placeholder={
                      isEn
                        ? 'List current medications and dosages...'
                        : 'Liệt kê các thuốc đang dùng và liều lượng...'
                    }
                    className="w-full px-3 py-1.5 bg-amber-50/50 border border-amber-300 rounded text-xs text-slate-900"
                  />
                </div>
              )}
            </div>

            {/* b) Tiền sử thai sản (Đối với nữ) */}
            {gender === 'Nữ' && (
              <div className="space-y-1.5 text-xs border-t border-slate-100 pt-2.5 animate-fade-in">
                <p className="font-medium text-slate-700">
                  {isEn ? 'b) Obstetric / Pregnancy History (For women):' : 'b) Tiền sử thai sản (Đối với phụ nữ):'}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setMedicalHistory((prev) => ({
                        ...prev,
                        pregnancyHistory: { hasHistory: false, details: '' },
                      }))
                    }
                    className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold border transition-all ${
                      !medicalHistory.pregnancyHistory?.hasHistory
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    {isEn ? 'No' : 'Không'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setMedicalHistory((prev) => ({
                        ...prev,
                        pregnancyHistory: { hasHistory: true, details: prev.pregnancyHistory?.details || '' },
                      }))
                    }
                    className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold border transition-all ${
                      medicalHistory.pregnancyHistory?.hasHistory
                        ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    {isEn ? 'Yes' : 'Có'}
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
                      placeholder={
                        isEn
                          ? 'Specify pregnancy status or obstetric history...'
                          : 'Ghi rõ tình trạng thai sản hoặc thuốc đang dùng...'
                      }
                      className="w-full px-3 py-1.5 bg-amber-50/50 border border-amber-300 rounded text-xs text-slate-900"
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
              className="py-3 px-4 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              {isEn ? 'Back' : 'Quay lại'}
            </button>
            <button
              type="submit"
              className="flex-1 py-3 bg-dym-blue-500 hover:bg-dym-blue-600 active:scale-[0.99] text-white font-bold text-sm rounded shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>
                {isEn
                  ? 'Next: Target & Payment Info'
                  : 'Tiếp tục: Thông tin đối tượng - chi trả'}
              </span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* ================================= STEP 3: THÔNG TIN ĐỐI TƯỢNG - CHI TRẢ ================================= */}
      {currentStep === 3 && (
        <form onSubmit={handleNextToStep4} className="space-y-4 animate-fade-in">
          <div className="bg-dym-blue-50/60 border border-dym-blue-100 rounded-md p-3 text-xs text-dym-blue-900 flex items-start gap-2">
            <Info className="w-4 h-4 text-dym-blue-600 shrink-0 mt-0.5" />
            <p>
              {isEn
                ? 'Please select your target category and payment source in accordance with Circular 25/2026/TT-BYT. Examination location is automatically set to Medical Facility (CS KBCB).'
                : 'Vui lòng chọn thông tin đối tượng và nguồn chi trả theo mẫu Thông tư 25/2026/TT-BYT. Địa điểm khám được tự động tích chọn là Cơ sở KBCB (CS KBCB).'}
            </p>
          </div>

          {/* 1. Đối tượng */}
          <div className="bg-white border border-slate-200 rounded-md p-4 shadow-sm space-y-2.5">
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                {isEn ? '1. Target Category' : '1. Đối tượng khám sức khỏe'}
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isEn
                  ? 'Target code from 1 to 17 according to the Circular appendix:'
                  : 'Đối tượng (ghi số từ 1 đến 17 theo mã đối tượng tại phụ lục):'}
              </p>
            </div>

            <div className="space-y-2">
              {([
                {
                  id: '14' as TT25TargetGroup,
                  labelVi: '14 – Sinh viên, học viên',
                  labelEn: '14 – Student / Trainee',
                },
                {
                  id: '15' as TT25TargetGroup,
                  labelVi: '15 – Người lao động chính thức (theo Luật An toàn, Vệ sinh lao động)',
                  labelEn: '15 – Official employee (under Law on Occupational Safety and Health)',
                },
                {
                  id: '16' as TT25TargetGroup,
                  labelVi: '16 – Người lao động phi chính thức',
                  labelEn: '16 – Informal worker',
                },
                {
                  id: 'other' as TT25TargetGroup,
                  labelVi: 'Các đối tượng khác',
                  labelEn: 'Other target category',
                },
              ]).map((opt) => {
                const isSelected = targetPayment.targetGroup === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      setTargetPayment((prev) => ({
                        ...prev,
                        targetGroup: opt.id,
                      }))
                    }
                    className={`w-full p-2.5 rounded border text-left text-xs flex items-center gap-2.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-dym-blue-500 bg-dym-blue-50/50 text-dym-blue-900 font-semibold shadow-xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-xs border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-dym-blue-600 border-dym-blue-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </span>
                    <span className="leading-snug">{isEn ? opt.labelEn : opt.labelVi}</span>
                  </button>
                );
              })}
            </div>

            {targetPayment.targetGroup === 'other' && (
              <div className="pt-1 animate-fade-in">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  {isEn ? 'Specify other target category:' : 'Ghi rõ đối tượng khác:'}
                </label>
                <input
                  type="text"
                  value={targetPayment.targetOtherDetails}
                  onChange={(e) =>
                    setTargetPayment((prev) => ({
                      ...prev,
                      targetOtherDetails: e.target.value,
                    }))
                  }
                  placeholder={
                    isEn
                      ? 'Enter target category or code (1 - 17)...'
                      : 'Nhập cụ thể đối tượng khác...'
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-dym-blue-200"
                />
              </div>
            )}
          </div>

          {/* 2. Nguồn chi trả */}
          <div className="bg-white border border-slate-200 rounded-md p-4 shadow-sm space-y-2.5">
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                {isEn ? '2. Payment Source' : '2. Nguồn chi trả'}
              </h4>
            </div>

            <div className="space-y-2">
              {([
                {
                  id: 'employer' as TT25PaymentSource,
                  labelVi: 'Người sử dụng lao động chi trả',
                  labelEn: 'Paid by employer',
                },
                {
                  id: 'self' as TT25PaymentSource,
                  labelVi: 'Người dân tự chi trả',
                  labelEn: 'Self-paid by examinee',
                },
                {
                  id: 'other' as TT25PaymentSource,
                  labelVi: 'Nguồn khác',
                  labelEn: 'Other payment source',
                },
              ]).map((opt) => {
                const isSelected = targetPayment.paymentSource === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      setTargetPayment((prev) => ({
                        ...prev,
                        paymentSource: opt.id,
                      }))
                    }
                    className={`w-full p-2.5 rounded border text-left text-xs flex items-center gap-2.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-dym-blue-500 bg-dym-blue-50/50 text-dym-blue-900 font-semibold shadow-xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-xs border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-dym-blue-600 border-dym-blue-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </span>
                    <span className="leading-snug">{isEn ? opt.labelEn : opt.labelVi}</span>
                  </button>
                );
              })}
            </div>

            {targetPayment.paymentSource === 'other' && (
              <div className="pt-1 animate-fade-in">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  {isEn ? 'Specify other payment source:' : 'Ghi rõ nguồn chi trả khác:'}
                </label>
                <input
                  type="text"
                  value={targetPayment.paymentOtherDetails}
                  onChange={(e) =>
                    setTargetPayment((prev) => ({
                      ...prev,
                      paymentOtherDetails: e.target.value,
                    }))
                  }
                  placeholder={
                    isEn ? 'Enter other payment source...' : 'Nhập cụ thể nguồn chi trả khác...'
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-dym-blue-200"
                />
              </div>
            )}
          </div>

          {/* 3. Địa điểm khám (Auto tick CS KBCB) */}
          <div className="bg-white border border-slate-200 rounded-md p-4 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                {isEn ? '3. Examination Location' : '3. Địa điểm khám'}
              </h4>
              <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                {isEn ? 'Auto-selected: CS KBCB' : 'Mặc định: CS KBCB'}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {([
                { id: 'cs_kbcb', label: 'CS KBCB', active: true },
                { id: 'kham_luu_dong', label: 'Khám lưu động', active: false },
                { id: 'tram_y_te', label: 'Trạm Y tế', active: false },
                { id: 'truong_hoc', label: 'Trường học', active: false },
                { id: 'ksk_tai_nha', label: 'KSK tại nhà', active: false },
              ] as const).map((loc) => (
                <div
                  key={loc.id}
                  className={`px-3 py-2 rounded border text-xs flex items-center gap-2 select-none ${
                    loc.active
                      ? 'border-dym-blue-500 bg-dym-blue-50/60 text-dym-blue-900 font-bold'
                      : 'border-slate-200 bg-slate-50 text-slate-400'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-xs border flex items-center justify-center shrink-0 ${
                      loc.active
                        ? 'bg-dym-blue-600 border-dym-blue-600 text-white'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {loc.active && <Check className="w-3 h-3 stroke-[3]" />}
                  </span>
                  <span>{loc.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stepper Navigation */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="py-3 px-4 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              {isEn ? 'Back' : 'Quay lại'}
            </button>
            <button
              type="submit"
              className="flex-1 py-3 bg-dym-blue-500 hover:bg-dym-blue-600 active:scale-[0.99] text-white font-bold text-sm rounded shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{isEn ? 'Review & Confirm' : 'Xem lại & Xác nhận'}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* ================================= STEP 4: XÁC NHẬN ================================= */}
      {currentStep === 4 && (
        <form onSubmit={handleFinalSubmit} className="space-y-4 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-md p-4 shadow-sm space-y-3 text-xs">
            <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {isEn
                ? 'Health Checkup Registration Summary (Circular 25)'
                : 'Tóm tắt hồ sơ khám sức khỏe Thông tư 25'}
            </h3>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <span className="text-slate-400 block text-[11px]">
                  {isEn ? 'Full Name:' : 'Họ và tên:'}
                </span>
                <span className="font-bold text-slate-800 text-sm uppercase">{fullName.trim().toUpperCase()}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">
                  {isEn ? 'Gender & Date of Birth:' : 'Giới tính & Ngày sinh:'}
                </span>
                <span className="font-medium text-slate-700">
                  {isEn ? (gender === 'Nam' ? 'Male' : 'Female') : gender} —{' '}
                  {birthDate.split('-').reverse().join('/')}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">
                  {isEn ? 'Citizen ID / Passport:' : 'Số CCCD / Hộ chiếu:'}
                </span>
                <span className="font-medium text-slate-700">{cccd}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">
                  {isEn ? 'Phone Number:' : 'Số điện thoại:'}
                </span>
                <span className="font-medium text-slate-700">{phoneNumber}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">
                  {isEn ? 'Ethnicity / Blood Type:' : 'Dân tộc / Nhóm máu:'}
                </span>
                <span className="font-medium text-slate-700">
                  {ethnicity} / {isEn && bloodGroup === 'Chưa rõ' ? 'Unknown' : bloodGroup}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">
                  {isEn ? 'Health Insurance:' : 'Thẻ BHYT:'}
                </span>
                <span className="font-medium text-slate-700">
                  {insuranceNumber || (isEn ? 'None' : 'Không có')}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400 block text-[11px]">
                  {isEn ? 'Current Address:' : 'Nơi ở hiện tại:'}
                </span>
                <span className="font-medium text-slate-700">
                  {addressDetail}, {ward}, {province}
                </span>
              </div>
              {(workplace || formattedWorkplaceLocation) && (
                <div className="col-span-2">
                  <span className="text-slate-400 block text-[11px]">
                    {isEn ? 'Workplace / School:' : 'Nơi làm việc, học tập:'}
                  </span>
                  <span className="font-medium text-slate-700">
                    {workplace}{' '}
                    {formattedWorkplaceLocation ? `(${formattedWorkplaceLocation})` : ''}
                  </span>
                </div>
              )}
            </div>

            {/* Tóm tắt tiền sử bệnh */}
            <div className="border-t border-slate-100 pt-2.5 mt-2">
              <span className="text-slate-400 block text-[11px] mb-1">
                {isEn ? 'Medical History:' : 'Tiền sử y tế:'}
              </span>
              {Object.values(medicalHistory.personalHistory).some(Boolean) ||
              medicalHistory.familyHistory.hasDisease ||
              medicalHistory.currentTreatment.isTreating ? (
                <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      {isEn ? 'Medical history conditions recorded.' : 'Có ghi nhận tiền sử bệnh lý.'}
                    </p>
                    <p className="text-[10px] text-amber-700">
                      {isEn
                        ? 'Your selected items have been saved for your doctor examination form.'
                        : 'Hệ thống đã lưu đầy đủ các mục bạn chọn để điền vào phiếu khám nộp Bác sĩ.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <p className="font-medium">
                    {isEn ? 'No medical history conditions reported.' : 'Tiền sử sức khỏe hoàn toàn bình thường.'}
                  </p>
                </div>
              )}
            </div>

            {/* Tóm tắt Thông tin đối tượng - Chi trả */}
            <div className="border-t border-slate-100 pt-2.5 mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <span className="text-slate-400 block text-[11px]">
                  {isEn ? 'Target Category:' : 'Đối tượng:'}
                </span>
                <span className="font-medium text-slate-700">
                  {targetPayment.targetGroup === '14'
                    ? '14 – Sinh viên, học viên'
                    : targetPayment.targetGroup === '15'
                      ? '15 – NLĐ chính thức'
                      : targetPayment.targetGroup === '16'
                        ? '16 – NLĐ phi chính thức'
                        : targetPayment.targetOtherDetails || 'Đối tượng khác'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">
                  {isEn ? 'Payment Source:' : 'Nguồn chi trả:'}
                </span>
                <span className="font-medium text-slate-700">
                  {targetPayment.paymentSource === 'employer'
                    ? 'Người sử dụng lao động'
                    : targetPayment.paymentSource === 'self'
                      ? 'Người dân tự chi trả'
                      : targetPayment.paymentOtherDetails || 'Nguồn khác'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">
                  {isEn ? 'Exam Location:' : 'Địa điểm khám:'}
                </span>
                <span className="font-semibold text-dym-blue-700">CS KBCB</span>
              </div>
            </div>
          </div>

          {/* Cam đoan */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md text-xs space-y-2">
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
                {isEn
                  ? 'I hereby certify that the information declared above is true and accurate to the best of my knowledge.'
                  : 'Tôi xin cam đoan những điều khai trên đây hoàn toàn đúng với sự thật theo sự hiểu biết của tôi.'}
              </span>
            </label>
          </div>

          {/* Stepper Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              className="py-3 px-4 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              {isEn ? 'Back' : 'Quay lại'}
            </button>
            <button
              type="submit"
              disabled={isLoading || !medicalHistory.commitmentAgreed}
              className="flex-1 py-3 bg-dym-blue-500 hover:bg-dym-blue-600 active:scale-[0.99] disabled:bg-slate-300 text-white font-bold text-sm rounded shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              <Activity className="w-4 h-4" />
              <span>
                {isLoading
                  ? isEn
                    ? 'Submitting...'
                    : 'Đang gửi thông tin...'
                  : isEn
                    ? 'Confirm & Submit'
                    : 'Xác nhận & Gửi thông tin'}
              </span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
