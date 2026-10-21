import React from 'react';
import dymLogoDark from '../../assets/dym-logo-dark.png';
import type { TT25RegistrationData } from './tt25Types';
import { formatConsentDate, type ConsentStatementMode } from './consentPdfService';

interface ConsentPrintTemplateProps {
  data: TT25RegistrationData;
  statementMode: ConsentStatementMode;
}

export const ConsentPrintTemplate: React.FC<ConsentPrintTemplateProps> = ({
  data,
  statementMode,
}) => {
  const formattedDate = formatConsentDate(data.checkupDate);
  const statementText =
    statementMode === 'agree'
      ? 'Tôi đồng ý / I agree'
      : statementMode === 'disagree'
        ? 'Tôi không đồng ý / I do not agree'
        : '';

  return (
    <div className="tt25-print-wrapper">
      <div
        className="tt25-page flex flex-col justify-between"
        style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10pt', lineHeight: 1.38 }}
      >
        <div>
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <img
              src={dymLogoDark}
              alt="DYM Medical Center Vietnam"
              className="h-11 w-auto object-contain"
            />
            <div className="text-right text-[10pt]">
              <div className="font-bold text-black">
                Số thứ tự / <span className="italic text-[#2E74B5]">Order</span>
              </div>
              <div className="font-bold text-[12pt] text-black min-h-[18px]">
                {data.queueNumber || ''}
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="text-center mb-4">
            <h1 className="font-bold text-[15pt] text-black leading-tight">
              ĐỒNG THUẬN KHÁM SỨC KHỎE
            </h1>
            <h2 className="font-bold italic text-[15pt] text-[#0070C0] leading-tight">
              CONSENT STATEMENT FOR HEALTH CHECK-UP
            </h2>
          </div>

          {/* Body Content */}
          <div className="space-y-2.5 text-[10pt] text-justify">
            <div>
              <p className="font-bold">
                1. ĐỒNG Ý KHÁM /{' '}
                <span className="italic text-[#0070C0]">CONSENT TO EXAMINATION</span>
              </p>
              <p className="pl-4 mt-1">
                Tôi xác nhận và đồng ý cho phép Bác sĩ, Nhân viên y tế được DYM phân công và/hoặc các đơn vị liên kết/hợp tác với DYM đối với các hạng mục dịch vụ mà DYM không trực tiếp cung cấp (nếu có), tiến hành các hoạt động thăm khám, xét nghiệm, cận lâm sàng và đánh giá sức khỏe trong phạm vi gói dịch vụ đã đăng ký.
              </p>
              <p className="pl-4 italic text-[#0070C0] mt-1">
                I hereby acknowledge and agree to allow the Doctors and/or Medical Staff assigned by DYM, as well as DYM’s affiliated/cooperating partners for service items not directly provided by DYM (if any), to conduct medical examinations, tests, paraclinical procedures, and health assessments within the scope of the registered service package.
              </p>
            </div>

            <div>
              <p className="font-bold">
                2. ĐỒNG Ý CHO PHÉP XỬ LÝ DỮ LIỆU CÁ NHÂN /{' '}
                <span className="italic text-[#0070C0]">
                  CONSENT TO THE PROCESSING OF PERSONAL DATA
                </span>
              </p>
              <p className="pl-4 mt-1">
                Tôi xác nhận và đồng ý cho phép DYM thu thập, sử dụng, tổng hợp và lưu trữ dữ liệu cá nhân của tôi, bao gồm thông tin y tế, nhằm phục vụ cho việc thăm khám, chẩn đoán, điều trị, tư vấn, theo dõi sức khỏe, quản lý hồ sơ y tế và cung cấp các dịch vụ y tế cho tôi. Tôi cũng đồng ý cho phép DYM liên hệ và gửi đến tôi các thông tin truyền thông liên quan đến dịch vụ y tế, chương trình chăm sóc sức khỏe, sự kiện và các chương trình ưu đãi của DYM, trên cơ sở tuân thủ các quy định của pháp luật hiện hành về bảo vệ dữ liệu cá nhân và các quy định pháp luật có liên quan.
              </p>
              <p className="pl-4 italic text-[#0070C0] mt-1">
                I acknowledge and consent to DYM collecting, using, consolidating, and retaining my personal data, including my health information, for the purposes of medical examination, diagnosis, treatment, consultation, health monitoring, medical record management, and the provision of healthcare services. I also consent to DYM contacting me and sending communications regarding healthcare services, health promotion programs, events, and promotional offers provided by DYM, in compliance with applicable laws on personal data protection and other relevant legal requirements.
              </p>
              <p className="pl-4 mt-1.5">
                Tôi xác nhận và đồng ý cho phép DYM cung cấp báo cáo y tế của tôi cho tôi và/hoặc đơn vị chủ quản đã đăng ký dịch vụ khám sức khỏe cho tôi (nếu có), trong phạm vi cần thiết và phù hợp với mục đích khám sức khỏe, nội dung dịch vụ đã đăng ký và thỏa thuận được ký kết giữa đơn vị chủ quản và DYM, trên cơ sở tuân thủ quy định của Luật An toàn, Vệ sinh Lao động số 84/2015/QH13, Luật Khám bệnh, Chữa bệnh số 15/2023/QH15, Luật Bảo vệ Dữ liệu Cá nhân số 91/2025/QH15 và các quy định pháp luật có liên quan.
              </p>
              <p className="pl-4 italic text-[#0070C0] mt-1">
                I acknowledge and consent to DYM providing my medical report to me and/or the organization that registered the health check-up service on my behalf (if any), to the extent necessary and appropriate for the purpose of the health examination, the registered service scope, and the agreement entered into between such organization and DYM, in compliance with the Law on Occupational Safety and Hygiene No. 84/2015/QH13, the Law on Medical Examination and Treatment No. 15/2023/QH15, the Personal Data Protection Law No. 91/2025/QH15, and other applicable laws.
              </p>
              <p className="pl-4 mt-1.5">
                Việc cung cấp, chia sẻ hoặc tiết lộ dữ liệu cá nhân và thông tin y tế của tôi cho bất kỳ bên thứ ba nào khác chỉ được thực hiện khi có sự đồng ý hoặc chỉ định bằng văn bản của tôi, trừ trường hợp pháp luật có quy định khác hoặc cơ quan nhà nước có thẩm quyền yêu cầu theo quy định của pháp luật. /{' '}
                <span className="italic text-[#0070C0]">
                  The disclosure, sharing, or transfer of my personal data and medical information to any other third party shall only be carried out with my prior written consent or written instruction, unless otherwise required by applicable laws or requested by a competent authority in accordance with the law.
                </span>
              </p>
            </div>

            <div className="pl-4 pt-1 space-y-1">
              <p>
                Quý Anh/Chị đã đọc, hiểu toàn bộ nội dung của Bản Đồng thuận này. Quý Anh/Chị hiểu rằng, việc không đồng ý có thể dẫn đến việc DYM không thể cung cấp dịch vụ y tế cho Quý Anh/Chị. /{' '}
                <span className="italic text-[#0070C0]">
                  You have read and fully understood the contents of this Consent Form. You acknowledge and understand that if you do not provide your consent, DYM will be unable to provide medical services to you.
                </span>
              </p>
              <p>
                Vui lòng xác nhận sự đồng thuận bằng cách ghi lại nội dung sau: “Tôi đồng ý”{' '}
                <strong>HOẶC</strong> “Tôi không đồng ý”.
              </p>
              <p className="italic text-[#0070C0]">
                Please confirm your consent by writing the following statement: “I agree”{' '}
                <strong>OR</strong> “I do not agree”.
              </p>
            </div>

            {/* Customer Statement & Fields */}
            <div className="pl-4 pt-2 space-y-1 text-left">
              <div className="flex items-baseline gap-2">
                <span className="shrink-0">
                  Ý kiến của Khách hàng /{' '}
                  <span className="italic text-[#0070C0]">Customer&apos;s statement:</span>
                </span>
                <span className="flex-1 border-b border-[#0070C0] font-bold text-black px-2 min-h-[18px]">
                  {statementText}
                </span>
              </div>

              <p>
                Ngày / <span className="italic text-[#0070C0]">Date:</span>{' '}
                <span className="italic text-[#2E74B5] font-semibold">{formattedDate}</span>
              </p>

              <p>
                <strong>KHÁCH HÀNG / </strong>
                <strong className="italic text-[#0070C0]">
                  CUSTOMER: {(data.fullName || '').toUpperCase()}
                </strong>
              </p>

              <p className="italic text-[#0070C0]">
                Số CCCD/mã định danh/Số Passport:{' '}
                <strong>{data.cccd || ''}</strong>
              </p>

              <p className="pt-0.5">
                Ký tên <span className="italic text-[#0070C0]">/ Signature</span>
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-[10pt] text-[#0070C0] pt-6">
          <span>DYM.PRO.09.FOR.02.02</span>
          <span>
            Tối mật <span className="italic">| Restricted</span>
          </span>
          <span>1/1</span>
        </div>
      </div>
    </div>
  );
};
