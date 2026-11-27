import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import React, { useState, useEffect, useId, useRef } from 'react';
import {
  Activity,
  Check,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Info,
} from 'lucide-react';
import type { BranchCode } from '../../../types/domain';
import type { SupportedLanguage } from '../../../locales/index';
import type { RegistrationResponse } from '../types';
import type {
  TT25RegistrationData,
  TT25MedicalHistory,
  TT25TargetPaymentInfo,
  TT25TargetGroup,
  TT25PaymentSource,
  PregnancyStatus,
} from '../tt25Types';
import {
  TT25_PERSONAL_DISEASES,
  PREGNANCY_STATUS_LABELS,
  INITIAL_TT25_MEDICAL_HISTORY,
  getDefaultTargetPaymentByReason,
} from '../tt25Types';
import {
  ETHNIC_GROUPS,
  BLOOD_GROUPS,
  CHECKUP_REASONS,
  requiresCompanyName,
  isWorkPermitCheckup,
} from '../tt25Constants';
import { SearchableSelect } from './SearchableSelect';
import { BirthDateInput } from './BirthDateInput';
import { validateVietnamCccd } from './cccdValidator';
import { hasChineseOrJapaneseCharacters, isValidPassportName, LATIN_NAME_MESSAGE, PASSPORT_NAME_MESSAGE } from '../../../../../supabase/functions/_shared/passportName';

const previewMode = typeof __DYM_CLOUDFLARE_PREVIEW__ !== 'undefined' && __DYM_CLOUDFLARE_PREVIEW__;
import {
  loadOccupations,
  loadProvinces,
  loadWardsForProvince,
  type Province,
  type Ward,
} from './locationService';

const EMAIL_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

const administrativeLabels = {
  fullName: ['họ và tên', 'full name', '氏名'],
  birthDate: ['ngày sinh', 'date of birth', '生年月日'],
  pregnancyStatus: ['tình trạng mang thai', 'pregnancy status', '妊娠の状況'],
  phoneNumber: ['số điện thoại', 'phone number', '電話番号'],
  email: ['email', 'email address', 'メールアドレス'],
  province: ['tỉnh/thành phố', 'province or city', '省・市'],
  ward: ['phường/xã', 'ward or commune', '行政区（区・社）'],
  addressDetail: ['địa chỉ cụ thể', 'street address', '詳細住所'],
  workplace: ['tên công ty', 'company name', '会社名'],
} as const;

interface TT25RegistrationFormProps {
  branch: BranchCode;
  isLoading: boolean;
  onSubmit: (data: TT25RegistrationData) => Promise<RegistrationResponse | undefined>;
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
  const text = (vi: string, en: string, ja: string) => ({ vi, en, ja })[lang];
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Administrative state
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<'Nam' | 'Nữ'>('Nam');
  const [pregnancyStatus, setPregnancyStatus] = useState<PregnancyStatus>();
  const pregnancyId = useId();
  const [birthDate, setBirthDate] = useState('');
  const [ethnicity, setEthnicity] = useState('Kinh');
  const [bloodGroup, setBloodGroup] = useState('Chưa rõ');
  const [documentNumbers, setDocumentNumbers] = useState({ cccd: '', passport: '' });
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
  const [email, setEmail] = useState('');
  const emailId = useId();
  const identityId = useId();
  const fullNameId = useId();
  const [identityDocumentType, setIdentityDocumentType] = useState<'cccd' | 'passport'>('cccd');
  const isPassport = identityDocumentType === 'passport';
  const nameFormatError = isPassport && fullName.trim() && !isValidPassportName(fullName)
    ? PASSPORT_NAME_MESSAGE[lang]
    : hasChineseOrJapaneseCharacters(fullName) ? LATIN_NAME_MESSAGE[lang] : '';
  const cccd = documentNumbers[identityDocumentType];
  const identityLabel = isPassport
    ? (text('Số hộ chiếu', 'Passport number', 'パスポート番号'))
    : (text('Số CCCD', 'Citizen ID (CCCD)', 'ベトナムの身分証明書番号（CCCD）'));
  const [checkupReason, setCheckupReason] = useState(
    initialCheckupReason || CHECKUP_REASONS[0] || '',
  );
  const companyRequired = requiresCompanyName(checkupReason);
  const phoneRequired = !isWorkPermitCheckup(checkupReason);
  const companyName = workplace.trim();

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
  const fullNameError = errors.fullName || nameFormatError;
  const [reviewAdministrative, setReviewAdministrative] = useState(false);
  const administrativeForm = useRef<HTMLFormElement>(null);
  const focusInvalid = useRef(false);

  useEffect(() => {
    if (currentStep !== 1 || !focusInvalid.current) return;
    focusInvalid.current = false;
    const input = administrativeForm.current?.querySelector<HTMLElement>(
      'input[aria-invalid="true"]:not(:disabled), fieldset[aria-invalid="true"] input',
    );
    input?.focus({ preventScroll: true });
    input?.scrollIntoView({ block: 'center' });
  }, [currentStep, errors]);

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

    if (companyRequired && !companyName) {
      newErrors.workplace = text('Vui lòng nhập tên công ty', 'Please enter your company name', '会社名を入力してください。');
    } else if (companyName.normalize('NFC').length > 150 || CONTROL_CHARACTERS.test(companyName)) {
      newErrors.workplace = text(
        'Tên công ty tối đa 150 ký tự và không xuống dòng',
        'Company name must be 150 characters or fewer on one line',
        '会社名は改行せず、150文字以内で入力してください。',
      );
    }

    const cleanName = fullName.trim().normalize('NFC').toUpperCase();
    if (!cleanName) {
      newErrors.fullName = text('Vui lòng nhập họ và tên', 'Please enter your full name', '氏名を入力してください。');
    } else if (cleanName.length < 2) {
      newErrors.fullName = text('Họ và tên phải có ít nhất 2 ký tự', 'Full name must be at least 2 characters', '氏名は2文字以上で入力してください。');
    } else if (cleanName.length > 100 || CONTROL_CHARACTERS.test(cleanName)) {
      newErrors.fullName = text(
        'Họ và tên tối đa 100 ký tự và không xuống dòng',
        'Full name must be 100 characters or fewer on one line',
        '氏名は改行せず、100文字以内で入力してください。',
      );
    } else if (nameFormatError) {
      newErrors.fullName = nameFormatError;
    }

    if (!birthDate) {
      newErrors.birthDate = text(
        'Vui lòng nhập ngày sinh (định dạng ngày/tháng/năm)',
        'Please enter your date of birth (DD/MM/YYYY)',
        '生年月日を日／月／年の順に入力してください。',
      );
    } else {
      const birth = new Date(birthDate);
      if (isNaN(birth.getTime()) || birth.getFullYear() < 1900) {
        newErrors.birthDate = text('Ngày sinh không hợp lệ', 'Invalid date of birth', '有効な生年月日を入力してください。');
      } else {
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
          age--;
        }
        if (age < 18) {
          newErrors.birthDate = text(
            'Thông tư 25 áp dụng cho người từ đủ 18 tuổi trở lên',
            'Circular 25 applies to individuals aged 18 and above',
            '通達第25号の対象は18歳以上の方です。',
          );
        }
      }
    }

    if (gender === 'Nữ' && !pregnancyStatus) {
      newErrors.pregnancyStatus = text('Vui lòng chọn tình trạng mang thai', 'Please select your pregnancy status', '妊娠の状況を選択してください。');
    }

    const cccdError = validateVietnamCccd({
      allowPreviewCode: previewMode,
      identityDocumentType,
      cccd,
      gender,
      birthDate,
      lang,
    });
    if (cccdError) {
      newErrors.cccd = cccdError;
    } else if (isPassport && (cccd.trim().normalize('NFC').toUpperCase().length > 100 || CONTROL_CHARACTERS.test(cccd.trim()))) {
      newErrors.cccd = text(
        'Số hộ chiếu tối đa 100 ký tự và không xuống dòng',
        'Passport number must be 100 characters or fewer on one line',
        'パスポート番号は改行せず、100文字以内で入力してください。',
      );
    }

    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (phoneRequired && !phoneNumber.trim()) {
      newErrors.phoneNumber = text('Vui lòng nhập số điện thoại', 'Please enter your phone number', '電話番号を入力してください。');
    } else if (phoneNumber.trim() && !(previewMode ? /^0{8}\d{2}$/ : /^0[35789]\d{8}$/).test(cleanPhone)) {
      newErrors.phoneNumber = text(
        previewMode ? 'Nhập số điện thoại thử dạng 00000000xx' : 'Số điện thoại gồm 10 số (bắt đầu bằng 03, 05, 07, 08, 09)',
        previewMode ? 'Use a test phone number like 0000000001' : 'Phone number must be 10 digits (starting with 03, 05, 07, 08, 09)',
        previewMode ? 'テスト用の電話番号（例：0000000001）を入力してください。' : '電話番号は03、05、07、08、09のいずれかで始まる10桁の番号を入力してください。',
      );
    }

    if (email.trim() && (email.trim().length > 120 || !EMAIL_PATTERN.test(email.trim()))) {
      newErrors.email = text('Vui lòng nhập email đúng định dạng', 'Please enter a valid email address', '有効なメールアドレスを入力してください。');
    }

    if (!province) newErrors.province = text('Vui lòng chọn Tỉnh/Thành phố', 'Please select a Province / City', '省または市を選択してください。');
    if (!ward) newErrors.ward = text('Vui lòng chọn Phường/Xã', 'Please select a Ward / Commune', '行政区（区・社）を選択してください。');
    const cleanAddress = addressDetail.trim().normalize('NFC');
    if (!cleanAddress) {
      newErrors.addressDetail = text('Vui lòng nhập địa chỉ cụ thể', 'Please enter your street address', '番地や通り名などの詳細住所を入力してください。');
    } else if (cleanAddress.length < 3 || cleanAddress.length > 250 || CONTROL_CHARACTERS.test(cleanAddress)) {
      newErrors.addressDetail = text(
        'Địa chỉ cụ thể phải có từ 3 đến 250 ký tự và không xuống dòng',
        'Street address must contain 3–250 characters on one line',
        '詳細住所は改行せず、3〜250文字で入力してください。',
      );
    }

    if (previewMode) {
      const synthetic = /thử|demo|\btest\b/i;
      const testTextError = text('Thêm “test” hoặc “demo” vào ô này.', 'Include “test” or “demo” in this field.', '「test」または「demo」を含めてください。');
      if (!newErrors.fullName && !synthetic.test(cleanName)) newErrors.fullName = testTextError;
      if (!newErrors.addressDetail && !synthetic.test(cleanAddress)) newErrors.addressDetail = testTextError;
      if (!newErrors.workplace && companyName && !synthetic.test(companyName)) newErrors.workplace = testTextError;
      const demoDocument = isPassport ? /^DEMO-[A-Z0-9-]{1,24}$/i : /^000\d{9}$/;
      if (!newErrors.cccd && !demoDocument.test(cccd.trim())) {
        newErrors.cccd = text('Nhập hộ chiếu DEMO- hoặc CCCD thử bắt đầu bằng 000.', 'Use a DEMO- passport or a test citizen ID starting with 000.', 'DEMO-で始まるパスポート番号、または000で始まる身分証明書番号を入力してください。');
      }
      if (!newErrors.email && email.trim() && !/@(?:example\.(?:com|org|net)|[a-z0-9.-]+\.test)$/i.test(email.trim())) {
        newErrors.email = text('Dùng email thử @example.com hoặc để trống.', 'Use an @example.com test email or leave it blank.', 'example.comのメールアドレスを使用するか、空欄のままにしてください。');
      }
      if (insuranceNumber.trim() && !/^0{10}\d{0,5}$/.test(insuranceNumber.trim())) {
        newErrors.insuranceNumber = text('Dùng số thẻ BHYT thử, ví dụ 0000000000, hoặc để trống.', 'Use a test insurance number like 0000000000 or leave it blank.', 'テスト用の保険証番号（例：0000000000）を入力するか、空欄のままにしてください。');
      }
    }

    focusInvalid.current = Object.keys(newErrors).length > 0;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNextToStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateStep1()) {
      setReviewAdministrative(false);
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

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || !medicalHistory.commitmentAgreed) return;
    if (!validateStep1()) {
      setCurrentStep(1);
      return;
    }
    const finalData: TT25RegistrationData = {
      branch,
      fullName: fullName.trim().toUpperCase(),
      gender,
      birthDate,
      ethnicity: ethnicity.trim() || 'Kinh',
      pregnancyStatus: gender === 'Nữ' ? pregnancyStatus : undefined,
      bloodGroup: bloodGroup.trim() || 'Chưa rõ',
      cccd: cccd.trim().toUpperCase(),
      identityDocumentType,
      insuranceNumber: insuranceNumber.trim().toUpperCase(),
      province,
      ward,
      addressDetail: addressDetail.trim(),
      occupation: occupation.trim() || 'Tự do',
      workplace: companyName,
      workplaceWard: formattedWorkplaceLocation,
      phoneNumber: phoneNumber.replace(/[^0-9]/g, ''),
      email: email.trim() || undefined,
      checkupReason: checkupReason || 'Khám sức khỏe tổng quát',
      medicalHistory,
      targetPayment: {
        ...targetPayment,
        targetOtherDetails: targetPayment.targetOtherDetails.trim(),
        paymentOtherDetails: targetPayment.paymentOtherDetails.trim(),
        examLocation: 'cs_kbcb',
      },
    };

    const response = await onSubmit(finalData);
    if (response?.code === 'INVALID_DATA') {
      setReviewAdministrative(true);
      const field = response.field === 'companyName' ? 'workplace' : response.field;
      const labels = field && Object.hasOwn(administrativeLabels, field)
        ? administrativeLabels[field as keyof typeof administrativeLabels]
        : undefined;
      const label = field === 'cccd' ? identityLabel.toLowerCase() : labels?.[lang === 'ja' ? 2 : lang === 'en' ? 1 : 0];
      if (field && label) {
        focusInvalid.current = true;
        setErrors({ [field]: text(`Vui lòng kiểm tra lại ${label}`, `Please check your ${label}`, `「${label}」を確認してください。`) });
      }
      setCurrentStep(1);
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  };

  return (
    <div className="w-full">
      {/* Step Indicator Header */}
      <div className="mb-7">
        <div className="max-w-md mx-auto relative">
          {/* Connecting Track Line: aligned to center of 32px circle (top-4) */}
          <div className="absolute top-4 left-6 right-6 -translate-y-1/2 h-[2.5px] bg-slate-200 rounded-full overflow-hidden pointer-events-none">
            <div
              className="h-full w-full bg-primary rounded-full origin-left transition-transform duration-300 ease-out-quint"
              style={{
                transform: `scaleX(${
                  currentStep === 1
                    ? 0
                    : currentStep === 2
                      ? 1 / 3
                      : currentStep === 3
                        ? 2 / 3
                        : 1
                })`,
              }}
            />
          </div>

          {/* Step Items */}
          <div className="flex items-start justify-between relative z-10">
            {([
              { step: 1, label: text('Hành chính', 'Personal Info', '基本情報') },
              { step: 2, label: text('Tiền sử bệnh', 'Medical History', '問診') },
              { step: 3, label: text('Đối tượng - Chi trả', 'Target & Payment', '受診区分・費用') },
              { step: 4, label: text('Xác nhận', 'Confirm', '確認') },
            ] as const).map((item) => {
              const isCompleted = currentStep > item.step;
              const isCurrent = currentStep === item.step;
              const isClickable = item.step < currentStep && !isLoading;

              return (
                <button
                  key={item.step}
                  type="button"
                  disabled={!isClickable}
                  aria-current={isCurrent ? 'step' : undefined}
                  onClick={() => {
                    if (isClickable) {
                      setCurrentStep(item.step);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                  className={`flex flex-col items-center group transition-colors ${
                    isClickable ? 'cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-[background-color,color,border-color,box-shadow,transform] duration-200 ${
                      isCompleted
                        ? 'bg-primary text-primary-foreground group-hover:bg-primary/90'
                        : isCurrent
                          ? 'bg-primary text-primary-foreground ring-4 ring-accent'
                          : 'bg-white border-2 border-slate-300 text-slate-600'
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
                        ? 'font-bold text-primary'
                        : isCompleted
                          ? 'font-medium text-slate-700 group-hover:text-primary'
                          : 'font-medium text-slate-600'
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
        <form ref={administrativeForm} noValidate onSubmit={handleNextToStep2} className="space-y-4 animate-fade-in">
          <h2 className="sr-only">
            {text('1. Thông tin hành chính', '1. Administrative Information', '1. 基本情報')}
          </h2>
          {reviewAdministrative && (
            <Alert variant="destructive"><AlertDescription>
              {text(
                'Vui lòng kiểm tra thông tin hành chính rồi gửi lại.',
                'Please review your administrative information and try again.',
                '基本情報を確認してから、もう一度送信してください。',
              )}
            </AlertDescription></Alert>
          )}
          <Alert variant="warning" role="note">
            <AlertDescription id={`${fullNameId}-document-note`} className="flex items-start gap-2 leading-5">
              <AlertCircle className="h-5 w-4 shrink-0" aria-hidden="true" />
              <span>
                {previewMode ? text(
                  'Bản thử dùng thông tin giả. Thêm “test” vào tên và địa chỉ, dùng hộ chiếu bắt đầu bằng DEMO- hoặc CCCD thử bắt đầu bằng 000. Dùng số điện thoại dạng 00000000xx và email @example.com nếu cần.',
                  'Use test data. Include “test” in names and addresses, use a passport starting with DEMO- or a test citizen ID starting with 000, and use a phone number like 0000000001 and an @example.com email when needed.',
                  'テスト用の情報を入力してください。氏名・住所に「test」を含め、パスポート番号にはDEMO-、身分証明書番号には000から始まる番号を使用してください。',
                ) : text(
                  'Thông tin cung cấp cần chính xác với thông tin trên CCCD hoặc passport.',
                  'The information you provide must match your citizen ID or passport.',
                  '入力する情報は、ベトナムの身分証明書（CCCD）またはパスポートの記載と一致している必要があります。',
                )}
              </span>
            </AlertDescription>
          </Alert>

          {/* Họ và tên */}
          <div>
            <label htmlFor={fullNameId} className="block text-xs font-semibold text-slate-700 mb-1">
              {isPassport
                ? text('1. Họ và tên trên hộ chiếu', '1. Full name on passport', '1. パスポートに記載された氏名')
                : text('1. Họ và tên (ví dụ: NGUYỄN VĂN A)', '1. Full Name (e.g. NGUYEN VAN A)', '1. 氏名（例：NGUYEN VAN A）')}{' '}
              <span className="text-red-500">*</span>
            </label>
            <input
              id={fullNameId}
              type="text"
              autoComplete="name"
              enterKeyHint="next"
              value={fullName}
              aria-invalid={Boolean(fullNameError)}
              aria-describedby={`${fullNameId}-document-note ${fullNameId}-name-note`}
              maxLength={100}
              onChange={(e) => {
                setFullName(e.target.value);
                if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: '' }));
              }}
              className={`w-full px-3 py-2 bg-white border rounded text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-[border-color,box-shadow] duration-150 ${
                fullNameError ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
              }`}
            />
            <p id={`${fullNameId}-name-note`} role="status"
              className={fullNameError ? 'mt-1 text-xs text-red-700' : isPassport ? 'mt-1 text-xs text-slate-600' : 'sr-only'}>
              {fullNameError || (isPassport ? PASSPORT_NAME_MESSAGE[lang] : '')}
            </p>
          </div>

          {/* Giới tính & Ngày sinh */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
            <div className="min-w-0">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {text('2. Giới tính', '2. Gender', '2. 性別')} <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['Nam', 'Nữ'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      setGender(g);
                      if (g === 'Nam') {
                        setPregnancyStatus(undefined);
                        setErrors((prev) => ({ ...prev, pregnancyStatus: '' }));
                      }
                      if (cccd.trim().length === 12) {
                        const err = validateVietnamCccd({
                          allowPreviewCode: previewMode,
                          identityDocumentType,
                          cccd,
                          gender: g,
                          birthDate,
                          lang,
                        });
                        setErrors((prev) => ({ ...prev, cccd: err || '' }));
                      }
                    }}
                    className={`py-2 px-3 rounded text-xs font-semibold border transition-colors ${
                      gender === g
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {g === 'Nam' ? text('Nam', 'Male', '男性') : text('Nữ', 'Female', '女性')}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-w-0">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {text('3. Ngày sinh', '3. Date of Birth', '3. 生年月日（日／月／年）')} <span className="text-red-500">*</span>
              </label>
              <BirthDateInput
                calendarLabel={text('Chọn ngày từ lịch', 'Choose a date from the calendar', 'カレンダーから日付を選択')}
                value={birthDate}
                onChange={(val) => {
                  setBirthDate(val);
                  setErrors((prev) => {
                    const nextCccdErr =
                      cccd.trim().length === 12
                        ? validateVietnamCccd({
                          allowPreviewCode: previewMode,
                            identityDocumentType,
                            cccd,
                            gender,
                            birthDate: val,
                            lang,
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

          {gender === 'Nữ' && (
            <fieldset
              aria-describedby={errors.pregnancyStatus ? `${pregnancyId}-error` : undefined}
              aria-invalid={Boolean(errors.pregnancyStatus)}
            >
              <legend className="mb-1 text-xs font-semibold text-slate-700">
                {text('Tình trạng mang thai', 'Pregnancy status', '妊娠の状況')} <span className="text-red-500">*</span>
              </legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(Object.keys(PREGNANCY_STATUS_LABELS) as PregnancyStatus[]).map((status) => (
                  <label key={status} className="flex min-h-11 cursor-pointer items-center gap-2 rounded border border-input bg-card px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent/60">
                    <input
                      type="radio"
                      name={pregnancyId}
                      className="size-4 shrink-0 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      checked={pregnancyStatus === status}
                      onChange={() => {
                        setPregnancyStatus(status);
                        setErrors((prev) => ({ ...prev, pregnancyStatus: '' }));
                      }}
                    />
                    {PREGNANCY_STATUS_LABELS[status][lang]}
                  </label>
                ))}
              </div>
              {errors.pregnancyStatus && <FieldError id={`${pregnancyId}-error`} className="mt-1 text-xs">{errors.pregnancyStatus}</FieldError>}
            </fieldset>
          )}

          {/* Dân tộc & Nhóm máu */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {text('4. Dân tộc', '4. Ethnicity', '4. 民族')}
              </label>
              <SearchableSelect
                lang={lang}
                options={ETHNIC_GROUPS.map((e) => ({
                  value: e,
                  label: e === 'Người nước ngoài' ? text(e, 'Foreigner (Người nước ngoài)', '外国籍（Người nước ngoài）') : e,
                }))}
                value={ethnicity}
                onChange={setEthnicity}
                placeholder={text('Chọn dân tộc', 'Select ethnicity', '民族を選択')}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {text('5. Nhóm máu (nếu có)', '5. Blood Type (optional)', '5. 血液型（任意）')}
              </label>
              <SearchableSelect
                lang={lang}
                options={BLOOD_GROUPS.map((b) => ({
                  value: b,
                  label: b === 'Chưa rõ' ? text(b, 'Unknown', '不明') : b,
                }))}
                value={bloodGroup}
                onChange={setBloodGroup}
                placeholder={text('Chọn nhóm máu', 'Select blood type', '血液型を選択')}
              />
            </div>
          </div>

          {/* Số CCCD & Số BHYT */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldSet className="mb-2 gap-2">
                <FieldLegend variant="label">{text('6. Giấy tờ tùy thân', '6. Identity document', '6. 本人確認書類')}</FieldLegend>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  {(['cccd', 'passport'] as const).map((type) => (
                    <label key={type} className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name={identityId}
                        value={type}
                        checked={identityDocumentType === type}
                        onChange={() => {
                          setIdentityDocumentType(type);
                          setErrors((prev) => ({ ...prev, cccd: '', fullName: '' }));
                        }}
                      />
                      {type === 'cccd' ? 'CCCD' : text('Hộ chiếu', 'Passport', 'パスポート')}
                    </label>
                  ))}
                </div>
              </FieldSet>
              <label htmlFor={`${identityId}-number`} className="block text-xs font-semibold text-slate-700 mb-1">
                {identityLabel}{' '}<span className="text-red-500">*</span>
              </label>
              <input
                id={`${identityId}-number`}
                type="text"
                inputMode={isPassport ? 'text' : 'numeric'}
                aria-required="true"
                aria-invalid={Boolean(errors.cccd)}
                aria-describedby={errors.cccd ? `${identityId}-error` : undefined}
                value={cccd}
                onChange={(e) => {
                  const nextVal = e.target.value.toUpperCase();
                  setDocumentNumbers((prev) => ({ ...prev, [identityDocumentType]: nextVal }));
                  if (!isPassport && nextVal.trim().length === 12) {
                    const err = validateVietnamCccd({
                      allowPreviewCode: previewMode,
                      identityDocumentType,
                      cccd: nextVal,
                      gender,
                      birthDate,
                      lang,
                    });
                    setErrors((prev) => ({ ...prev, cccd: err || '' }));
                  } else if (errors.cccd) {
                    setErrors((prev) => ({ ...prev, cccd: '' }));
                  }
                }}
                onBlur={() => {
                  if (!isPassport && cccd.trim()) {
                    const err = validateVietnamCccd({
                      allowPreviewCode: previewMode,
                      identityDocumentType,
                      cccd,
                      gender,
                      birthDate,
                      lang,
                    });
                    setErrors((prev) => ({ ...prev, cccd: err || '' }));
                  }
                }}
                maxLength={isPassport ? 100 : 12}
                placeholder={isPassport ? identityLabel : (text('12 chữ số CCCD', '12 digits', 'CCCDの12桁の番号'))}
                className={`w-full px-3 py-2 bg-white border rounded text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors ${
                  errors.cccd ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                }`}
              />
              {errors.cccd && <p id={`${identityId}-error`} className="text-xs text-red-500 mt-1">{errors.cccd}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {text('7. Số thẻ BHYT (nếu có)', '7. Health Insurance No. (optional)', '7. 健康保険証番号（任意）')}
              </label>
              <input
                type="text"
                value={insuranceNumber}
                aria-invalid={Boolean(errors.insuranceNumber)}
                onChange={(e) => {
                  setInsuranceNumber(e.target.value.toUpperCase());
                  if (errors.insuranceNumber) setErrors((prev) => ({ ...prev, insuranceNumber: '' }));
                }}
                maxLength={15}
                placeholder={text('VD: DN4791234567890', 'e.g. DN4791234567890', '例：DN4791234567890')}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors"
              />
              {errors.insuranceNumber && <p className="text-xs text-red-500 mt-1">{errors.insuranceNumber}</p>}
            </div>
          </div>

          {/* Nơi ở hiện tại: Tỉnh / Huyện / Xã / Địa chỉ */}
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-slate-800">
              {text('8. Nơi ở hiện tại', '8. Current Residence Address', '8. 現住所')}{' '}
              <span className="text-red-500">*</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <SearchableSelect
                  lang={lang}
                  options={provinces.map((p) => ({ value: p.name_with_type, label: p.name_with_type }))}
                  value={province}
                  onChange={handleProvinceChange}
                  placeholder={text('Chọn Tỉnh / Thành phố', 'Select Province / City', '省・市を選択')}
                  disabled={isLocationLoading || !locationsLoaded}
                  isLoadingOptions={isLocationLoading}
                  error={Boolean(errors.province)}
                />
                {errors.province && <p className="text-xs text-red-500 mt-0.5">{errors.province}</p>}
              </div>

              <div>
                <SearchableSelect
                  lang={lang}
                  options={wards.map((w) => ({ value: w.name_with_type, label: w.name_with_type }))}
                  value={ward}
                  onChange={(val) => {
                    setWard(val);
                    if (errors.ward) setErrors((prev) => ({ ...prev, ward: '' }));
                  }}
                  placeholder={text('Chọn Phường / Xã', 'Select Ward / Commune', '行政区（区・社）を選択')}
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
                aria-invalid={Boolean(errors.addressDetail)}
                maxLength={250}
                onChange={(e) => {
                  setAddressDetail(e.target.value);
                  if (errors.addressDetail) setErrors((prev) => ({ ...prev, addressDetail: '' }));
                }}
                placeholder={text('Số nhà, tên đường, thôn / ấp...', 'House number, street name...', '番地、通り名、集落名など')}
                className={`w-full px-3 py-2 bg-white border rounded text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors ${
                  errors.addressDetail ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                }`}
              />
              {errors.addressDetail && <p className="text-xs text-red-500 mt-0.5">{errors.addressDetail}</p>}
            </div>
          </div>

          {/* Nghề nghiệp */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {text('9. Nghề nghiệp', '9. Occupation', '9. 職業')}
            </label>
            <SearchableSelect
              lang={lang}
              options={occupations.map((occ) => ({ value: occ, label: occ }))}
              value={occupation}
              onChange={setOccupation}
              placeholder={
                text('Chọn hoặc nhập để tìm nghề nghiệp...', 'Select or type to search occupation...', '職業を選択または検索（ベトナム語）')
              }
              isLoadingOptions={occupations.length === 0 && isLocationLoading}
            />
          </div>

          {/* Nơi làm việc, học tập & Xã phường */}
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                {text('10. Nơi làm việc, học tập (Tên đầy đủ công ty/trường)', '10. Workplace / School (Full company/school name)', '10. 勤務先・学校（正式名称）')}
                {companyRequired && <span className="text-red-500"> *</span>}
              </label>
              <input
                type="text"
                value={workplace}
                required={companyRequired}
                aria-required={companyRequired}
                aria-invalid={Boolean(errors.workplace)}
                aria-describedby={errors.workplace ? 'workplace-error' : undefined}
                maxLength={150}
                onChange={(e) => {
                  setWorkplace(e.target.value);
                  if (errors.workplace) setErrors((prev) => ({ ...prev, workplace: '' }));
                }}
                placeholder={
                  text('Nhập tên đầy đủ công ty hoặc trường học...', 'Enter company or school name...', '会社または学校の正式名称を入力')
                }
                className={`w-full px-3 py-2 bg-white border rounded text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors ${errors.workplace ? 'border-red-400 bg-red-50/30' : 'border-slate-200'}`}
              />
              {errors.workplace && <p id="workplace-error" className="text-xs text-red-500 mt-1">{errors.workplace}</p>}
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-1">
                {text('Xã, phường nơi làm việc, học tập', 'Ward / Province of workplace or school', '勤務先・学校の所在地（省・市、区・社）')}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <SearchableSelect
                  lang={lang}
                  options={provinces.map((p) => ({
                    value: p.name_with_type,
                    label: p.name_with_type,
                  }))}
                  value={workplaceProvince}
                  onChange={handleWorkplaceProvinceChange}
                  placeholder={text('Chọn Tỉnh / Thành phố', 'Select Province / City', '省・市を選択')}
                  disabled={isLocationLoading || !locationsLoaded}
                  isLoadingOptions={isLocationLoading}
                />

                <SearchableSelect
                  lang={lang}
                  options={workplaceWards.map((w) => ({
                    value: w.name_with_type,
                    label: w.name_with_type,
                  }))}
                  value={workplaceWard}
                  onChange={setWorkplaceWard}
                  placeholder={text('Chọn Phường / Xã', 'Select Ward / Commune', '行政区（区・社）を選択')}
                  disabled={!workplaceProvince || workplaceWards.length === 0}
                />
              </div>
            </div>
          </div>

          {/* Điện thoại di động */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {text('11. Điện thoại di động', '11. Mobile Phone Number', '11. 携帯電話番号')}{' '}
              {phoneRequired && <span className="text-red-500">*</span>}
            </label>
            <input
              type="tel"
              aria-required={phoneRequired}
              inputMode="tel"
              autoComplete="tel"
              enterKeyHint="next"
              value={phoneNumber}
              aria-invalid={Boolean(errors.phoneNumber)}
              onChange={(e) => {
                setPhoneNumber(e.target.value);
                if (errors.phoneNumber) setErrors((prev) => ({ ...prev, phoneNumber: '' }));
              }}
              maxLength={10}
              placeholder={previewMode ? '0000000001' : '0912345678'}
              className={`w-full px-3 py-2 bg-white border rounded text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-[border-color,box-shadow] duration-150 ${
                errors.phoneNumber ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
              }`}
            />
            {errors.phoneNumber && <p className="text-xs text-red-500 mt-1">{errors.phoneNumber}</p>}
          </div>

          <Field className="gap-1" data-invalid={errors.email ? true : undefined}>
            <FieldLabel htmlFor={emailId} className="text-xs font-semibold leading-4 text-slate-700">
              {text('12. Email (không bắt buộc)', '12. Email (optional)', '12. メールアドレス（任意）')}
            </FieldLabel>
            <Input
              id={emailId}
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="done"
              value={email}
              maxLength={120}
              placeholder="ten@example.com"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? `${emailId}-error` : undefined}
              className="h-[38px] rounded border-slate-200 bg-white py-2 text-sm text-slate-900 shadow-none transition-[border-color,box-shadow] duration-150 placeholder:text-gray-400 hover:border-slate-200 focus-visible:border-slate-200 focus-visible:ring-ring/30 aria-invalid:border-red-400 aria-invalid:bg-red-50/30"
              onChange={(event) => {
                setEmail(event.target.value);
                if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
              }}
            />
            {errors.email && <FieldError id={`${emailId}-error`} className="text-xs">{errors.email}</FieldError>}
          </Field>

          {/* Next Button */}
          <div className="pt-2">
            <Button
              type="submit"
              className="h-auto min-h-11 w-full whitespace-normal py-3 font-semibold shadow-none focus-visible:ring-ring"
            >
              <span>
                {text('Tiếp tục: Khai báo tiền sử bệnh', 'Next: Medical History Declaration', '次へ：問診')}
              </span>
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </form>
      )}

      {/* ================================= STEP 2: TIỀN SỬ BỆNH ================================= */}
      {currentStep === 2 && (
        <form onSubmit={handleNextToStep3} className="space-y-5 animate-fade-in">
          <h2 className="sr-only">
            {text('2. Tiền sử bệnh', '2. Medical History', '2. 問診')}
          </h2>
          {/* 1. Tiền sử gia đình */}
          <div className="bg-white border border-slate-200 rounded-md p-3.5 shadow-sm space-y-2">
            <h3 className="text-sm sm:text-base font-bold text-slate-800 leading-snug">
              {text('1. Tiền sử gia đình:', '1. Family Medical History:', '1. 家族歴')}
              <span className="font-normal text-xs text-slate-600 block mt-0.5">
                {text(
                  'Có ai trong gia đình ông (bà) mắc một trong các bệnh: truyền nhiễm, tim mạch, đái tháo đường, lao, hen phế quản, ung thư, động kinh, rối loạn tâm thần, bệnh khác:',
                  'Has anyone in your family been diagnosed with: infectious diseases, cardiovascular disease, diabetes, tuberculosis, bronchial asthma, cancer, epilepsy, mental disorders, or other hereditary conditions?',
                  'ご家族に、感染症、心血管疾患、糖尿病、結核、気管支喘息、がん、てんかん、精神疾患、またはその他の病気にかかった方はいますか？',
                )}
              </span>
            </h3>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setMedicalHistory((prev) => ({
                    ...prev,
                    familyHistory: { hasDisease: false, diseaseDetails: '' },
                  }))
                }
                className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold border transition-colors ${
                  !medicalHistory.familyHistory.hasDisease
                    ? 'bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-700 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {text('Không', 'No', 'いいえ')}
              </button>
              <button
                type="button"
                onClick={() =>
                  setMedicalHistory((prev) => ({
                    ...prev,
                    familyHistory: { ...prev.familyHistory, hasDisease: true },
                  }))
                }
                className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold border transition-colors ${
                  medicalHistory.familyHistory.hasDisease
                    ? 'bg-amber-700 hover:bg-amber-800 text-white border-amber-700 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {text('Có bệnh', 'Yes', 'はい')}
              </button>
            </div>
            {medicalHistory.familyHistory.hasDisease && (
              <div className="pt-1 animate-fade-in">
                <input
                  type="text"
                  value={medicalHistory.familyHistory.diseaseDetails}
                  maxLength={300}
                  onChange={(e) =>
                    setMedicalHistory((prev) => ({
                      ...prev,
                      familyHistory: { ...prev.familyHistory, diseaseDetails: e.target.value },
                    }))
                  }
                  placeholder={
                    text('Ghi cụ thể tên bệnh (VD: Tim mạch, tiểu đường...)', 'Specify condition name (e.g., Heart disease, diabetes...)', '病名を入力（例：心疾患、糖尿病）')
                  }
                  className="w-full px-3 py-1.5 bg-amber-50/50 border border-amber-300 rounded text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200"
                />
              </div>
            )}
          </div>

          {/* 2. Tiền sử bản thân: Bảng 22 bệnh lý */}
          <div className="bg-white border border-slate-200 rounded-md p-3.5 shadow-sm space-y-2.5">
            <div className="border-b border-slate-100 pb-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-800">
                {text('2. Tiền sử bệnh, tật của bản thân:', '2. Personal Medical History:', '2. 既往歴・治療歴')}
              </h3>
              <p className="text-[11px] text-slate-500">
                {text(
                  'Ông (bà) đã hoặc đang mắc bệnh, tình trạng nào sau đây không?',
                  'Have you ever had or do you currently have any of the following conditions?',
                  '次の病気や症状にかかったことがありますか、または現在ありますか？',
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[380px] overflow-y-auto pr-1">
              {TT25_PERSONAL_DISEASES.map((item) => {
                const isSelected = Boolean(medicalHistory.personalHistory[item.id]);
                return (
                  <div
                    key={item.id}
                    className={`p-2.5 rounded border text-xs flex items-center justify-between gap-2 transition-colors ${
                      isSelected
                        ? 'border-amber-300 bg-amber-50/40'
                        : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50'
                    }`}
                  >
                    <span className="font-medium text-slate-800 leading-snug">
                      <strong className="text-slate-500 mr-1">{item.id}.</strong>{' '}
                      {text(item.name, item.nameEn, item.nameJa)}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleDisease(item.id, false)}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
                          !isSelected
                            ? 'bg-slate-200 text-slate-800 border-slate-300'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {text('Không', 'No', 'いいえ')}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleDisease(item.id, true)}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
                          isSelected
                            ? 'bg-amber-700 hover:bg-amber-800 text-white border-amber-700 shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {text('Có', 'Yes', 'はい')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {medicalHistory.personalHistory[22] && (
              <div className="pt-2 animate-fade-in">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  {text('Ghi rõ bệnh khác của bạn:', 'Please specify other conditions:', 'その他の病気を記入してください')}
                </label>
                <input
                  type="text"
                  value={medicalHistory.personalOtherDetails}
                  maxLength={300}
                  onChange={(e) =>
                    setMedicalHistory((prev) => ({
                      ...prev,
                      personalOtherDetails: e.target.value,
                    }))
                  }
                  placeholder={text('Ghi rõ tên bệnh lý khác...', 'Specify other medical conditions...', 'その他の病名を入力')}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded text-xs"
                />
              </div>
            )}
          </div>

          {/* 3. Câu hỏi khác */}
          <div className="bg-white border border-slate-200 rounded-md p-3.5 shadow-sm space-y-3">
            <h3 className="text-sm sm:text-base font-bold text-slate-800">
              {text('3. Câu hỏi khác (nếu có):', '3. Additional Questions (if applicable):', '3. その他の質問（該当する場合）')}
            </h3>

            {/* a) Điều trị bệnh */}
            <div className="space-y-1.5 text-xs">
              <p className="font-medium text-slate-700">
                {text(
                  'a) Bạn có đang điều trị bệnh gì không?',
                  'a) Are you currently receiving treatment for any medical condition?',
                  'a）現在、何らかの病気の治療を受けていますか？',
                )}
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
                  className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold border transition-colors ${
                    !medicalHistory.currentTreatment.isTreating
                      ? 'bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-700 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {text('Không', 'No', 'いいえ')}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMedicalHistory((prev) => ({
                      ...prev,
                      currentTreatment: { ...prev.currentTreatment, isTreating: true },
                    }))
                  }
                  className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold border transition-colors ${
                    medicalHistory.currentTreatment.isTreating
                      ? 'bg-amber-700 hover:bg-amber-800 text-white border-amber-700 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {text('Có điều trị', 'Yes, currently under treatment', 'はい、治療中です')}
                </button>
              </div>
              {medicalHistory.currentTreatment.isTreating && (
                <div className="pt-1 animate-fade-in">
                  <input
                    type="text"
                    value={medicalHistory.currentTreatment.medications}
                    maxLength={300}
                    onChange={(e) =>
                      setMedicalHistory((prev) => ({
                        ...prev,
                        currentTreatment: { ...prev.currentTreatment, medications: e.target.value },
                      }))
                    }
                    placeholder={
                      text('Liệt kê các thuốc đang dùng và liều lượng...', 'List current medications and dosages...', '使用中の薬と用量を入力')
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
                  {text('b) Tiền sử thai sản (Đối với phụ nữ):', 'b) Obstetric / Pregnancy History (For women):', 'b）妊娠・出産歴（女性の方）')}
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
                    className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold border transition-colors ${
                      !medicalHistory.pregnancyHistory?.hasHistory
                        ? 'bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-700 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    {text('Không', 'No', 'いいえ')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setMedicalHistory((prev) => ({
                        ...prev,
                        pregnancyHistory: { hasHistory: true, details: prev.pregnancyHistory?.details || '' },
                      }))
                    }
                    className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold border transition-colors ${
                      medicalHistory.pregnancyHistory?.hasHistory
                        ? 'bg-amber-700 hover:bg-amber-800 text-white border-amber-700 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    {text('Có', 'Yes', 'はい')}
                  </button>
                </div>
                {medicalHistory.pregnancyHistory?.hasHistory && (
                  <div className="pt-1 animate-fade-in">
                    <input
                      type="text"
                      value={medicalHistory.pregnancyHistory?.details || ''}
                      maxLength={300}
                      onChange={(e) =>
                        setMedicalHistory((prev) => ({
                          ...prev,
                          pregnancyHistory: { hasHistory: true, details: e.target.value },
                        }))
                      }
                      placeholder={
                        text('Ghi rõ tình trạng thai sản hoặc thuốc đang dùng...', 'Specify pregnancy status or obstetric history...', '妊娠の状況や出産歴などを入力')
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
            <Button
              type="button"
              variant="outline"
              onClick={() => setCurrentStep(1)}
              className="h-auto min-h-11 shrink-0 px-4 py-3 text-xs shadow-none focus-visible:ring-ring"
            >
              <ChevronLeft aria-hidden="true" />
              {text('Quay lại', 'Back', '戻る')}
            </Button>
            <Button
              type="submit"
              className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal py-3 font-semibold shadow-none focus-visible:ring-ring"
            >
              <span>
                {text('Tiếp tục: Thông tin đối tượng - chi trả', 'Next: Target & Payment Info', '次へ：受診区分・費用')}
              </span>
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </form>
      )}

      {/* ================================= STEP 3: THÔNG TIN ĐỐI TƯỢNG - CHI TRẢ ================================= */}
      {currentStep === 3 && (
        <form onSubmit={handleNextToStep4} className="space-y-4 animate-fade-in">
          <h2 className="sr-only">
            {text('3. Đối tượng & Nguồn chi trả', '3. Target Category & Payment Source', '3. 受診区分と費用負担')}
          </h2>
          <div className="bg-accent/60 border border-border rounded-md p-3 text-xs text-foreground flex items-start gap-2">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p>
              {text(
                'Vui lòng chọn thông tin đối tượng và nguồn chi trả theo mẫu Thông tư 25/2026/TT-BYT. Địa điểm khám được tự động tích chọn là Cơ sở KBCB (CS KBCB).',
                'Please select your target category and payment source in accordance with Circular 25/2026/TT-BYT. Examination location is automatically set to Medical facility.',
                'ベトナム保健省通達第25/2026/TT-BYT号に沿って、受診区分と費用の負担者を選択してください。受診場所は医療機関に設定されています。',
              )}
            </p>
          </div>

          {/* 1. Đối tượng */}
          <div className="space-y-2.5">
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-slate-800">
                {text('1. Đối tượng khám sức khỏe', '1. Target Category', '1. 受診区分')}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {text(
                  'Đối tượng (ghi số từ 1 đến 17 theo mã đối tượng tại phụ lục):',
                  'Target code from 1 to 17 according to the Circular appendix:',
                  '通達の付録にある区分コード（1〜17）に従って選択してください。',
                )}
              </p>
            </div>

            <div className="space-y-2">
              {([
                {
                  id: '14' as TT25TargetGroup,
                  labelVi: '14 – Sinh viên, học viên',
                  labelEn: '14 – Student / Trainee',
                  labelJa: '14 – 学生・研修生',
                },
                {
                  id: '15' as TT25TargetGroup,
                  labelVi: '15 – Người lao động chính thức (theo Luật An toàn, Vệ sinh lao động)',
                  labelEn: '15 – Official employee (under Law on Occupational Safety and Health)',
                  labelJa: '15 – 正規雇用の労働者（労働安全衛生法に基づく）',
                },
                {
                  id: '16' as TT25TargetGroup,
                  labelVi: '16 – Người lao động phi chính thức',
                  labelEn: '16 – Informal worker',
                  labelJa: '16 – インフォーマル部門の労働者',
                },
                {
                  id: 'other' as TT25TargetGroup,
                  labelVi: 'Các đối tượng khác',
                  labelEn: 'Other target category',
                  labelJa: 'その他の受診区分',
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
                    className={`w-full p-2.5 rounded border text-left text-xs flex items-center gap-2.5 transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-primary bg-accent/50 text-foreground font-semibold shadow-xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-xs border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </span>
                    <span className="leading-snug">{text(opt.labelVi, opt.labelEn, opt.labelJa)}</span>
                  </button>
                );
              })}
            </div>

            {targetPayment.targetGroup === 'other' && (
              <div className="pt-1 animate-fade-in">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  {text('Ghi rõ đối tượng khác:', 'Specify other target category:', 'その他の受診区分')}
                </label>
                <input
                  type="text"
                  value={targetPayment.targetOtherDetails}
                  maxLength={200}
                  onChange={(e) =>
                    setTargetPayment((prev) => ({
                      ...prev,
                      targetOtherDetails: e.target.value,
                    }))
                  }
                  placeholder={
                    text('Nhập cụ thể đối tượng khác...', 'Enter target category or code (1 - 17)...', '受診区分またはコード（1〜17）を入力')
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>
            )}
          </div>

          {/* 2. Nguồn chi trả */}
          <div className="space-y-2.5">
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-slate-800">
                {text('2. Nguồn chi trả', '2. Payment Source', '2. 費用負担')}
              </h3>
            </div>

            <div className="space-y-2">
              {([
                {
                  id: 'employer' as TT25PaymentSource,
                  labelVi: 'Người sử dụng lao động chi trả',
                  labelEn: 'Paid by employer',
                  labelJa: '勤務先負担',
                },
                {
                  id: 'self' as TT25PaymentSource,
                  labelVi: 'Người dân tự chi trả',
                  labelEn: 'Self-paid by examinee',
                  labelJa: '自己負担',
                },
                {
                  id: 'other' as TT25PaymentSource,
                  labelVi: 'Nguồn khác',
                  labelEn: 'Other payment source',
                  labelJa: 'その他の負担者',
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
                    className={`w-full p-2.5 rounded border text-left text-xs flex items-center gap-2.5 transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-primary bg-accent/50 text-foreground font-semibold shadow-xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-xs border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </span>
                    <span className="leading-snug">{text(opt.labelVi, opt.labelEn, opt.labelJa)}</span>
                  </button>
                );
              })}
            </div>

            {targetPayment.paymentSource === 'other' && (
              <div className="pt-1 animate-fade-in">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  {text('Ghi rõ nguồn chi trả khác:', 'Specify other payment source:', 'その他の負担者')}
                </label>
                <input
                  type="text"
                  value={targetPayment.paymentOtherDetails}
                  maxLength={200}
                  onChange={(e) =>
                    setTargetPayment((prev) => ({
                      ...prev,
                      paymentOtherDetails: e.target.value,
                    }))
                  }
                  placeholder={
                    text('Nhập cụ thể nguồn chi trả khác...', 'Enter other payment source...', '費用の負担者を入力')
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>
            )}
          </div>

          {/* 3. Địa điểm khám (Auto tick CS KBCB) */}
          <div className="bg-white border border-slate-200 rounded-md p-4 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-800 uppercase tracking-wide">
                {text('3. Địa điểm khám', '3. Examination Location', '3. 受診場所')}
              </h3>
              <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
                {text('Mặc định: CS KBCB', 'Auto-selected: Medical facility', '自動選択：医療機関')}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {([
                { id: 'cs_kbcb', label: text('CS KBCB', 'Medical facility', '医療機関'), active: true },
                { id: 'kham_luu_dong', label: text('Khám lưu động', 'Mobile clinic', '巡回健診'), active: false },
                { id: 'tram_y_te', label: text('Trạm Y tế', 'Health station', '保健所'), active: false },
                { id: 'truong_hoc', label: text('Trường học', 'School', '学校'), active: false },
                { id: 'ksk_tai_nha', label: text('KSK tại nhà', 'Home health check', '自宅での健診'), active: false },
              ] as const).map((loc) => (
                <div
                  key={loc.id}
                  className={`px-3 py-2 rounded border text-xs flex items-center gap-2 select-none ${
                    loc.active
                      ? 'border-primary bg-accent/60 text-foreground font-bold'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-xs border flex items-center justify-center shrink-0 ${
                      loc.active
                        ? 'bg-primary border-primary text-primary-foreground'
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
            <Button
              type="button"
              variant="outline"
              onClick={() => setCurrentStep(2)}
              className="h-auto min-h-11 shrink-0 px-4 py-3 text-xs shadow-none focus-visible:ring-ring"
            >
              <ChevronLeft aria-hidden="true" />
              {text('Quay lại', 'Back', '戻る')}
            </Button>
            <Button
              type="submit"
              className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal py-3 font-semibold shadow-none focus-visible:ring-ring"
            >
              <span>{text('Xem lại & Xác nhận', 'Review & Confirm', '入力内容を確認')}</span>
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </form>
      )}

      {/* ================================= STEP 4: XÁC NHẬN ================================= */}
      {currentStep === 4 && (
        <form onSubmit={handleFinalSubmit} className="space-y-4 animate-fade-in">
          <h2 className="sr-only">
            {text('4. Xác nhận và tóm tắt hồ sơ', '4. Registration Summary & Confirmation', '4. 登録内容の確認')}
          </h2>
          <div className="bg-white border border-slate-200 rounded-md p-4 shadow-sm space-y-3 text-xs">
            <h3 className="font-bold text-sm sm:text-base text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              {text('Tóm tắt hồ sơ khám sức khỏe Thông tư 25', 'Health Checkup Registration Summary (Circular 25)', '健康診断の登録内容（通達第25号）')}
            </h3>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isLoading}
              onClick={() => {
                setCurrentStep(1);
                window.scrollTo({ top: 0, behavior: 'auto' });
              }}
            >
              {text('Sửa thông tin hành chính', 'Edit administrative information', '基本情報を修正')}
            </Button>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <span className="text-slate-500 block text-[11px]">
                  {text('Họ và tên:', 'Full Name:', '氏名')}
                </span>
                <span className="font-bold text-slate-800 text-sm uppercase">{fullName.trim().toUpperCase()}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">
                  {text('Giới tính & Ngày sinh:', 'Gender & Date of Birth:', '性別・生年月日')}
                </span>
                <span className="font-medium text-slate-700">
                  {gender === 'Nam' ? text('Nam', 'Male', '男性') : text('Nữ', 'Female', '女性')} —{' '}
                  {(lang === 'ja' ? birthDate.split('-') : birthDate.split('-').reverse()).join('/')}
                </span>
              </div>
              {gender === 'Nữ' && pregnancyStatus && (
                <div>
                  <span className="text-slate-500 block text-[11px]">{text('Tình trạng mang thai:', 'Pregnancy status:', '妊娠の状況')}</span>
                  <span className="font-medium text-slate-700">{PREGNANCY_STATUS_LABELS[pregnancyStatus][lang]}</span>
                </div>
              )}
              <div>
                <span className="text-slate-500 block text-[11px]">
                  {identityLabel}
                </span>
                <span className="font-medium text-slate-700">{cccd}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">
                  {text('Số điện thoại:', 'Phone Number:', '電話番号')}
                </span>
                <span className="font-medium text-slate-700">{phoneNumber}</span>
              </div>
              {email.trim() && (
                <div>
                  <span className="text-slate-500 block text-[11px]">{text('Email:', 'Email:', 'メールアドレス')}</span>
                  <span className="break-all font-medium text-slate-700">{email.trim()}</span>
                </div>
              )}
              <div>
                <span className="text-slate-500 block text-[11px]">
                  {text('Dân tộc / Nhóm máu:', 'Ethnicity / Blood Type:', '民族・血液型')}
                </span>
                <span className="font-medium text-slate-700">
                  {ethnicity} / {bloodGroup === 'Chưa rõ' ? text(bloodGroup, 'Unknown', '不明') : bloodGroup}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">
                  {text('Thẻ BHYT:', 'Health Insurance:', '健康保険証番号')}
                </span>
                <span className="font-medium text-slate-700">
                  {insuranceNumber || (text('Không có', 'None', 'なし'))}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500 block text-[11px]">
                  {text('Nơi ở hiện tại:', 'Current Address:', '現住所')}
                </span>
                <span className="font-medium text-slate-700">
                  {addressDetail}, {ward}, {province}
                </span>
              </div>
              {(companyName || formattedWorkplaceLocation) && (
                <div className="col-span-2">
                  <span className="text-slate-500 block text-[11px]">
                    {text('Nơi làm việc, học tập:', 'Workplace / School:', '勤務先・学校')}
                  </span>
                  <span className="font-medium text-slate-700">
                    {companyName}{' '}
                    {formattedWorkplaceLocation ? `(${formattedWorkplaceLocation})` : ''}
                  </span>
                </div>
              )}
            </div>

            {/* Tóm tắt tiền sử bệnh */}
            <div className="border-t border-slate-100 pt-2.5 mt-2">
              <span className="text-slate-500 block text-[11px] mb-1">
                {text('Tiền sử y tế:', 'Medical History:', '問診内容')}
              </span>
              {Object.values(medicalHistory.personalHistory).some(Boolean) ||
              medicalHistory.familyHistory.hasDisease ||
              medicalHistory.currentTreatment.isTreating ? (
                <Alert variant="warning"><AlertDescription className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      {text('Có ghi nhận tiền sử bệnh lý.', 'Medical history conditions recorded.', '申告された既往歴があります。')}
                    </p>
                    <p className="text-[11px]">
                      {text(
                        'Hệ thống đã lưu đầy đủ các mục bạn chọn để điền vào phiếu khám nộp Bác sĩ.',
                        'Your selected items have been saved for your doctor examination form.',
                        '選択した内容は、医師が確認する健診票に反映されます。',
                      )}
                    </p>
                  </div>
                </AlertDescription></Alert>
              ) : (
                <Alert variant="success" role="status" aria-live="polite"><AlertDescription className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <p className="font-medium">
                    {text('Tiền sử sức khỏe hoàn toàn bình thường.', 'No medical history conditions reported.', '申告された既往歴はありません。')}
                  </p>
                </AlertDescription></Alert>
              )}
            </div>

            {/* Tóm tắt Thông tin đối tượng - Chi trả */}
            <div className="border-t border-slate-100 pt-2.5 mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <span className="text-slate-500 block text-[11px]">
                  {text('Đối tượng:', 'Target Category:', '受診区分')}
                </span>
                <span className="font-medium text-slate-700">
                  {targetPayment.targetGroup === '14'
                    ? (text('14 – Sinh viên, học viên', '14 – Student / Trainee', '14 – 学生・研修生'))
                    : targetPayment.targetGroup === '15'
                      ? (text('15 – NLĐ chính thức', '15 – Official employee', '15 – 正規雇用の労働者'))
                      : targetPayment.targetGroup === '16'
                        ? (text('16 – NLĐ phi chính thức', '16 – Informal worker', '16 – インフォーマル部門の労働者'))
                        : targetPayment.targetOtherDetails || (text('Đối tượng khác', 'Other target category', 'その他の受診区分'))}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">
                  {text('Nguồn chi trả:', 'Payment Source:', '費用負担')}
                </span>
                <span className="font-medium text-slate-700">
                  {targetPayment.paymentSource === 'employer'
                    ? (text('Người sử dụng lao động', 'Paid by employer', '勤務先負担'))
                    : targetPayment.paymentSource === 'self'
                      ? (text('Người dân tự chi trả', 'Self-paid by examinee', '自己負担'))
                      : targetPayment.paymentOtherDetails || (text('Nguồn khác', 'Other payment source', 'その他の負担者'))}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">
                  {text('Địa điểm khám:', 'Exam Location:', '受診場所')}
                </span>
                <span className="font-semibold text-primary">{text('CS KBCB', 'Medical facility', '医療機関')}</span>
              </div>
            </div>
          </div>

          {/* Cam đoan */}
          <div className="p-3.5 bg-slate-50 rounded-md text-xs space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <Checkbox
                checked={medicalHistory.commitmentAgreed}
                onCheckedChange={(checked) =>
                  setMedicalHistory((prev) => ({
                    ...prev,
                    commitmentAgreed: checked === true,
                  }))
                }
                className="mt-0.5"
              />
              <span className="text-slate-700 leading-relaxed font-medium">
                {text(
                  'Tôi xin cam đoan những điều khai trên đây hoàn toàn đúng với sự thật theo sự hiểu biết của tôi.',
                  'I hereby certify that the information declared above is true and accurate to the best of my knowledge.',
                  '私の知る限り、上記の申告内容に誤りがないことを確認します。',
                )}
              </span>
            </label>
          </div>

          {/* Stepper Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={() => setCurrentStep(3)}
              className="h-auto min-h-11 shrink-0 px-4 py-3 text-xs shadow-none focus-visible:ring-ring"
            >
              <ChevronLeft aria-hidden="true" />
              {text('Quay lại', 'Back', '戻る')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !medicalHistory.commitmentAgreed}
              className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal py-3 font-semibold shadow-none focus-visible:ring-ring"
            >
              <Activity aria-hidden="true" />
              <span>
                {isLoading
                  ? text('Đang gửi thông tin...', 'Submitting...', '送信中…')
                  : text('Xác nhận & Gửi thông tin', 'Confirm & Submit', '確認して送信')}
              </span>
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};
