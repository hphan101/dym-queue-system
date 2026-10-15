import React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SearchableSelect } from "./SearchableSelect";
import * as z from "zod";
import {
  User,
  Phone,
  Calendar,
  Heart,
  MapPin,
  Loader2,
  CreditCard,
  Building,
  Home,
} from "lucide-react";
import type { BranchCode, RegistrationData } from "./types";
import { translations, type SupportedLanguage } from "./translations";

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

  const fetchPromise = fetch(`/data/wards/${provinceCode}.json`)
    .then(async (res) => {
      if (res.ok) {
        const list = (await res.json()) as Ward[];
        return list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      }
      // Fallback to complete wards dataset if specific province chunk is missing
      const fallbackRes = await fetch('/data/wards.json');
      if (!fallbackRes.ok) throw new Error('WARDS_UNAVAILABLE');
      const allWards = (await fallbackRes.json()) as Record<string, Ward>;
      return (Object.values(allWards) as Ward[])
        .filter((w) => w.parent_code === provinceCode)
        .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    })
    .catch((err) => {
      wardCache.delete(provinceCode);
      throw err;
    });

  wardCache.set(provinceCode, fetchPromise);
  return fetchPromise;
}

const phoneRegex = /^(0[3|5|7|8|9])+([0-9]{8})$/;
const cccdPassportRegex = /^(?:[0-9]{12}|[A-Za-z][A-Za-z0-9]{6,12})$/;

interface RegistrationFormProps {
  onSubmit: (data: RegistrationData) => void;
  isLoading: boolean;
  lang: SupportedLanguage;
  branch: BranchCode;
}

export const RegistrationForm: React.FC<RegistrationFormProps> = ({
  onSubmit,
  isLoading,
  lang,
  branch,
}) => {
  const t = translations[lang];
  const [provinces, setProvinces] = React.useState<Province[]>([]);
  const [wards, setWards] = React.useState<Ward[]>([]);
  const [locationsLoaded, setLocationsLoaded] = React.useState(false);
  const [isLoadingLocations, setIsLoadingLocations] = React.useState(false);
  const [locationLoadError, setLocationLoadError] = React.useState(false);

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
    gender: z.enum(["Nam", "Nữ"] as const, {
      message: t.errGenderRequired,
    }),
    cccd: z
      .string()
      .min(1, t.errCccdRequired)
      .transform((val) => val.trim())
      .refine((val) => cccdPassportRegex.test(val), t.errCccdInvalid),
    province: z.string().min(1, t.errProvinceRequired),
    ward: z.string().min(1, t.errWardRequired),
    addressDetail: z
      .string()
      .min(1, t.errAddressDetailRequired)
      .transform((val) => val.trim()),
    companyName: z.string().transform((val) => val.trim()),
    honeypot: z.string().optional(),
  });

  type FormSchemaType = z.infer<typeof formSchema>;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormSchemaType>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      phoneNumber: "",
      birthDate: "",
      gender: undefined,
      cccd: "",
      province: "",
      ward: "",
      addressDetail: "",
      companyName: "",
      honeypot: "",
    },
  });

  const selectedProvince = watch("province");

  const loadLocations = React.useCallback(() => {
    if (locationsLoaded || isLoadingLocations) return;

    setIsLoadingLocations(true);
    setLocationLoadError(false);
    void loadProvinces()
      .then((data) => {
        setProvinces(data);
        setLocationsLoaded(true);
      })
      .catch(() => setLocationLoadError(true))
      .finally(() => setIsLoadingLocations(false));
  }, [isLoadingLocations, locationsLoaded]);

  React.useEffect(() => {
    setValue("ward", "");
    if (!selectedProvince) {
      setWards([]);
      return;
    }

    void loadWardsForProvince(selectedProvince)
      .then((data) => setWards(data))
      .catch(() => setLocationLoadError(true));
  }, [selectedProvince, setValue]);

  const provinceOptions = React.useMemo(() => {
    return provinces.map((p) => ({ value: p.code, label: p.name_with_type }));
  }, [provinces]);

  const wardOptions = React.useMemo(() => {
    return wards.map((w) => ({ value: w.name_with_type, label: w.name_with_type }));
  }, [wards]);

  // Store the readable province name instead of its dataset code.
  const handleFormSubmit = (formData: FormSchemaType) => {
    const provinceObj = provinces.find((p) => p.code === formData.province);
    const mappedData: RegistrationData = {
      ...formData,
      branch,
      province: provinceObj ? provinceObj.name_with_type : formData.province,
    } as RegistrationData;
    onSubmit(mappedData);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
          <User className="w-4 h-4 text-dym-blue-500" />
          {t.fullName} <span className="text-red-500">*</span>
        </label>
        <div className="relative rounded-lg shadow-sm">
          <input
            type="text"
            {...register("fullName")}
            disabled={isLoading}
            placeholder={lang === "vi" ? "Nhập họ tên" : "Enter full name"}
            className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all ${
              errors.fullName
                ? "border-red-500 focus:ring-red-200"
                : "border-slate-200 focus:border-dym-blue-500 focus:ring-dym-blue-100"
            }`}
          />
        </div>
        {errors.fullName && (
          <p className="mt-1 text-xs text-red-500 font-medium">
            {errors.fullName.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-dym-blue-500" />
            {t.birthDate} <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            max={new Date().toISOString().split("T")[0]}
            {...register("birthDate")}
            disabled={isLoading}
            className={`w-full min-w-0 px-3 py-2 bg-white border rounded-lg text-sm text-slate-900 text-left min-h-[38px] appearance-none focus:outline-none focus:ring-2 transition-all ${
              errors.birthDate
                ? "border-red-500 focus:ring-red-200"
                : "border-slate-200 focus:border-dym-blue-500 focus:ring-dym-blue-100"
            }`}
          />
          {errors.birthDate && (
            <p className="mt-1 text-xs text-red-500 font-medium">
              {errors.birthDate.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
            <Heart className="w-4 h-4 text-dym-blue-500" />
            {t.gender} <span className="text-red-500">*</span>
          </label>
          <div className="w-full px-0 flex items-center gap-4 h-[38px]">
            {["Nam", "Nữ"].map((g) => (
              <label
                key={g}
                className="flex items-center gap-2 cursor-pointer text-slate-700 text-sm shrink-0"
              >
                <input
                  type="radio"
                  value={g}
                  disabled={isLoading}
                  {...register("gender")}
                  className="w-4 h-4 text-dym-blue-600 border-slate-300 focus:ring-dym-blue-500"
                />
                <span>{g === "Nam" ? t.genderNam : t.genderNu}</span>
              </label>
            ))}
          </div>
          {errors.gender && (
            <p className="mt-1 text-xs text-red-500 font-medium">
              {errors.gender.message}
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-dym-blue-500" />
          {t.cccd} <span className="text-red-500">*</span>
        </label>
        <div className="relative rounded-lg shadow-sm">
          <input
            type="text"
            {...register("cccd")}
            disabled={isLoading}
            placeholder={t.placeholderCccd}
            className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all ${
              errors.cccd
                ? "border-red-500 focus:ring-red-200"
                : "border-slate-200 focus:border-dym-blue-500 focus:ring-dym-blue-100"
            }`}
          />
        </div>
        {errors.cccd && (
          <p className="mt-1 text-xs text-red-500 font-medium">
            {errors.cccd.message}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
          <Phone className="w-4 h-4 text-dym-blue-500" />
          {t.phoneNumber} <span className="text-red-500">*</span>
        </label>
        <div className="relative rounded-lg shadow-sm">
          <input
            type="tel"
            {...register("phoneNumber")}
            disabled={isLoading}
            placeholder={
              lang === "vi" ? "Nhập số điện thoại" : "Enter phone number"
            }
            className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all ${
              errors.phoneNumber
                ? "border-red-500 focus:ring-red-200"
                : "border-slate-200 focus:border-dym-blue-500 focus:ring-dym-blue-100"
            }`}
          />
        </div>
        {errors.phoneNumber && (
          <p className="mt-1 text-xs text-red-500 font-medium">
            {errors.phoneNumber.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
            <Building className="w-4 h-4 text-dym-blue-500" />
            {t.province} <span className="text-red-500">*</span>
          </label>
          <Controller
            name="province"
            control={control}
            render={({ field }) => (
              <SearchableSelect
                options={provinceOptions}
                value={field.value}
                onChange={field.onChange}
                placeholder={t.selectProvince}
                disabled={isLoading}
                error={!!errors.province}
                onFocus={loadLocations}
                isLoadingOptions={isLoadingLocations}
                loadingMessage={t.loadingLocations}
              />
            )}
          />
          {errors.province && (
            <p className="mt-1 text-xs text-red-500 font-medium">
              {errors.province.message}
            </p>
          )}
          {locationLoadError && (
            <div className="mt-1 flex items-center gap-2 text-xs text-red-500 font-medium">
              <span>{t.locationLoadError}</span>
              <button
                type="button"
                className="font-bold underline underline-offset-2"
                onClick={loadLocations}
              >
                {lang === "vi" ? "Thử lại" : "Retry"}
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-dym-blue-500" />
            {t.ward} <span className="text-red-500">*</span>
          </label>
          <Controller
            name="ward"
            control={control}
            render={({ field }) => (
              <SearchableSelect
                options={wardOptions}
                value={field.value}
                onChange={field.onChange}
                placeholder={t.selectWard}
                disabled={isLoading || !selectedProvince}
                error={!!errors.ward}
                isLoadingOptions={isLoadingLocations}
                loadingMessage={t.loadingLocations}
              />
            )}
          />
          {errors.ward && (
            <p className="mt-1 text-xs text-red-500 font-medium">
              {errors.ward.message}
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
          <Home className="w-4 h-4 text-dym-blue-500" />
          {t.addressDetail} <span className="text-red-500">*</span>
        </label>
        <div className="relative rounded-lg shadow-sm">
          <input
            type="text"
            {...register("addressDetail")}
            disabled={isLoading}
            placeholder={t.placeholderAddressDetail}
            className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all ${
              errors.addressDetail
                ? "border-red-500 focus:ring-red-200"
                : "border-slate-200 focus:border-dym-blue-500 focus:ring-dym-blue-100"
            }`}
          />
        </div>
        {errors.addressDetail && (
          <p className="mt-1 text-xs text-red-500 font-medium">
            {errors.addressDetail.message}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
          <Building className="w-4 h-4 text-dym-blue-500" />
          {t.companyName}
        </label>
        <div className="relative rounded-lg shadow-sm">
          <input
            type="text"
            {...register("companyName")}
            disabled={isLoading}
            placeholder={t.placeholderCompany}
            className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all border-slate-200 focus:border-dym-blue-500 focus:ring-dym-blue-100`}
          />
        </div>
      </div>

      {/* Hidden honeypot; real users never interact with this field. */}
      <div className="absolute opacity-0 pointer-events-none -z-10" aria-hidden="true">
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          {...register("honeypot")}
          placeholder="Do not fill this field"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full mt-4 bg-dym-blue-500 hover:bg-dym-blue-600 text-white font-semibold py-2.5 px-4 rounded-lg text-sm shadow-md hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-dym-blue-100 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
