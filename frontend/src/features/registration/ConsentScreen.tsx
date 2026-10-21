import React from 'react';
import { Check, X, ChevronLeft, ShieldCheck } from 'lucide-react';
import dymLogoDark from '../../assets/dym-logo-dark.png';
import { BRANCH_NAMES } from '../../config/branches';
import type { BranchCode } from '../../types/domain';
import type { SupportedLanguage } from '../../locales';

interface ConsentScreenProps {
  branch: BranchCode | null;
  lang: SupportedLanguage;
  onSelectConsent: (agreed: boolean) => void;
  onBack: () => void;
}

export const ConsentScreen: React.FC<ConsentScreenProps> = ({
  branch,
  lang,
  onSelectConsent,
  onBack,
}) => {
  const isEn = lang === 'en';

  return (
    <div className="animate-fade-in py-1 sm:py-2">
      {/* Header */}
      <div className="flex flex-col items-center text-center">
        <img
          src={dymLogoDark}
          alt="DYM Medical Center Vietnam"
          className="h-10 sm:h-11 w-auto object-contain mb-3"
        />

        {branch && (
          <span className="inline-flex items-center rounded bg-dym-blue-50 border border-dym-blue-100 px-3 py-0.5 text-xs font-semibold text-dym-blue-800 mb-3">
            {BRANCH_NAMES[branch]}
          </span>
        )}

        <div className="inline-flex items-center gap-1.5 text-dym-blue-700 text-xs font-bold uppercase tracking-wider mb-1">
          <ShieldCheck className="w-4 h-4" />
          <span>{isEn ? 'Step 3: Consent Form' : 'Bước 3: Đồng thuận khám'}</span>
        </div>

        <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-800 uppercase">
          {isEn ? 'CONSENT STATEMENT FOR HEALTH CHECK-UP' : 'ĐỒNG THUẬN KHÁM SỨC KHỎE'}
        </h1>
        <p className="text-xs font-semibold italic text-dym-blue-700 mt-0.5">
          {isEn ? 'ĐỒNG THUẬN KHÁM SỨC KHỎE' : 'CONSENT STATEMENT FOR HEALTH CHECK-UP'}
        </p>
      </div>

      {/* Scrollable Legal / Medical Consent Content */}
      <div className="mt-4 rounded-md border border-slate-200 bg-slate-50/70 p-3.5 sm:p-4 max-h-[360px] overflow-y-auto space-y-3.5 text-xs leading-relaxed text-slate-700 shadow-inner">
        {/* Section 1 */}
        <div className="space-y-1.5">
          <h2 className="font-bold text-slate-900 text-xs sm:text-[13px]">
            1. ĐỒNG Ý KHÁM /{' '}
            <span className="italic text-[#0070C0]">CONSENT TO EXAMINATION</span>
          </h2>
          {!isEn ? (
            <p className="text-justify">
              Tôi xác nhận và đồng ý cho phép Bác sĩ, Nhân viên y tế được DYM phân công và/hoặc các đơn vị liên kết/hợp tác với DYM đối với các hạng mục dịch vụ mà DYM không trực tiếp cung cấp (nếu có), tiến hành các hoạt động thăm khám, xét nghiệm, cận lâm sàng và đánh giá sức khỏe trong phạm vi gói dịch vụ đã đăng ký.
            </p>
          ) : (
            <p className="text-justify italic text-[#0070C0]">
              I hereby acknowledge and agree to allow the Doctors and/or Medical Staff assigned by DYM, as well as DYM’s affiliated/cooperating partners for service items not directly provided by DYM (if any), to conduct medical examinations, tests, paraclinical procedures, and health assessments within the scope of the registered service package.
            </p>
          )}
        </div>

        {/* Section 2 */}
        <div className="space-y-2 border-t border-slate-200/80 pt-3">
          <h2 className="font-bold text-slate-900 text-xs sm:text-[13px]">
            2. ĐỒNG Ý CHO PHÉP XỬ LÝ DỮ LIỆU CÁ NHÂN /{' '}
            <span className="italic text-[#0070C0]">
              CONSENT TO THE PROCESSING OF PERSONAL DATA
            </span>
          </h2>
          {!isEn ? (
            <>
              <p className="text-justify">
                Tôi xác nhận và đồng ý cho phép DYM thu thập, sử dụng, tổng hợp và lưu trữ dữ liệu cá nhân của tôi, bao gồm thông tin y tế, nhằm phục vụ cho việc thăm khám, chẩn đoán, điều trị, tư vấn, theo dõi sức khỏe, quản lý hồ sơ y tế và cung cấp các dịch vụ y tế cho tôi. Tôi cũng đồng ý cho phép DYM liên hệ và gửi đến tôi các thông tin truyền thông liên quan đến dịch vụ y tế, chương trình chăm sóc sức khỏe, sự kiện và các chương trình ưu đãi của DYM, trên cơ sở tuân thủ các quy định của pháp luật hiện hành về bảo vệ dữ liệu cá nhân và các quy định pháp luật có liên quan.
              </p>
              <p className="text-justify">
                Tôi xác nhận và đồng ý cho phép DYM cung cấp báo cáo y tế của tôi cho tôi và/hoặc đơn vị chủ quản đã đăng ký dịch vụ khám sức khỏe cho tôi (nếu có), trong phạm vi cần thiết và phù hợp với mục đích khám sức khỏe, nội dung dịch vụ đã đăng ký và thỏa thuận được ký kết giữa đơn vị chủ quản và DYM, trên cơ sở tuân thủ quy định của Luật An toàn, Vệ sinh Lao động số 84/2015/QH13, Luật Khám bệnh, Chữa bệnh số 15/2023/QH15, Luật Bảo vệ Dữ liệu Cá nhân số 91/2025/QH15 và các quy định pháp luật có liên quan.
              </p>
              <p className="text-justify">
                Việc cung cấp, chia sẻ hoặc tiết lộ dữ liệu cá nhân và thông tin y tế của tôi cho bất kỳ bên thứ ba nào khác chỉ được thực hiện khi có sự đồng ý hoặc chỉ định bằng văn bản của tôi, trừ trường hợp pháp luật có quy định khác hoặc cơ quan nhà nước có thẩm quyền yêu cầu theo quy định của pháp luật.
              </p>
            </>
          ) : (
            <>
              <p className="text-justify italic text-[#0070C0]">
                I acknowledge and consent to DYM collecting, using, consolidating, and retaining my personal data, including my health information, for the purposes of medical examination, diagnosis, treatment, consultation, health monitoring, medical record management, and the provision of healthcare services. I also consent to DYM contacting me and sending communications regarding healthcare services, health promotion programs, events, and promotional offers provided by DYM, in compliance with applicable laws on personal data protection and other relevant legal requirements.
              </p>
              <p className="text-justify italic text-[#0070C0]">
                I acknowledge and consent to DYM providing my medical report to me and/or the organization that registered the health check-up service on my behalf (if any), to the extent necessary and appropriate for the purpose of the health examination, the registered service scope, and the agreement entered into between such organization and DYM, in compliance with the Law on Occupational Safety and Hygiene No. 84/2015/QH13, the Law on Medical Examination and Treatment No. 15/2023/QH15, the Personal Data Protection Law No. 91/2025/QH15, and other applicable laws.
              </p>
              <p className="text-justify italic text-[#0070C0]">
                The disclosure, sharing, or transfer of my personal data and medical information to any other third party shall only be carried out with my prior written consent or written instruction, unless otherwise required by applicable laws or requested by a competent authority in accordance with the law.
              </p>
            </>
          )}
        </div>

        {/* Notice */}
        <div className="rounded bg-amber-50/90 border border-amber-200/80 p-2.5 text-[11px] text-amber-900">
          {!isEn ? (
            <p className="font-medium leading-relaxed">
              Quý Anh/Chị đã đọc, hiểu toàn bộ nội dung của Bản Đồng thuận này. Quý Anh/Chị hiểu rằng, việc không đồng ý có thể dẫn đến việc DYM không thể cung cấp dịch vụ y tế cho Quý Anh/Chị.
            </p>
          ) : (
            <p className="font-medium italic leading-relaxed">
              You have read and fully understood the contents of this Consent Form. You acknowledge and understand that if you do not provide your consent, DYM will be unable to provide medical services to you.
            </p>
          )}
        </div>
      </div>

      {/* Consent Selection Buttons */}
      <div className="mt-4 space-y-2.5">
        <p className="text-xs font-semibold text-center text-slate-700">
          {isEn
            ? 'Please confirm your consent statement below:'
            : 'Vui lòng xác nhận sự đồng thuận của Quý khách:'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => onSelectConsent(true)}
            className="w-full py-3 px-4 rounded bg-dym-blue-500 hover:bg-dym-blue-600 active:scale-[0.99] text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>{isEn ? 'I agree (Tôi đồng ý)' : 'Tôi đồng ý'}</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectConsent(false)}
            className="w-full py-3 px-4 rounded border-2 border-slate-200 bg-white hover:border-red-300 hover:bg-red-50/50 active:scale-[0.99] text-slate-700 hover:text-red-700 font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>{isEn ? 'I do not agree (Không đồng ý)' : 'Tôi không đồng ý'}</span>
          </button>
        </div>
      </div>

      {/* Back Button */}
      <div className="mt-4 flex justify-center">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-slate-500 hover:text-dym-blue-700 hover:bg-slate-100/80 transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>{isEn ? 'Back to checkup reason' : 'Quay lại chọn lý do khám'}</span>
        </button>
      </div>
    </div>
  );
};
