import React from 'react';
import type { TT25RegistrationData } from './tt25Types';

interface TT25PrintTemplateProps {
  data: TT25RegistrationData;
  registrationNumber?: string;
}

export const TT25PrintTemplate: React.FC<TT25PrintTemplateProps> = ({
  data,
  registrationNumber: _registrationNumber,
}) => {
  // Format Date dd/mm/yyyy
  const formatDate = (isoDate: string) => {
    if (!isoDate) return '';
    try {
      const [year, month, day] = isoDate.split('-');
      if (year && month && day) return `${day}/${month}/${year}`;
    } catch {
      return isoDate;
    }
    return isoDate;
  };

  const today = new Date();
  const currentDay = today.getDate().toString().padStart(2, '0');
  const currentMonth = (today.getMonth() + 1).toString().padStart(2, '0');
  const currentYear = today.getFullYear();

  // Split CCCD into 12 individual boxes
  const cccdBoxes = Array.from({ length: 12 }, (_, index) => {
    return data.cccd ? data.cccd[index] || '' : '';
  });

  // Split BHYT into 15 boxes: 2 letters prefix, 13 numbers suffix
  const insuranceClean = (data.insuranceNumber || '').replace(/[^a-zA-Z0-9]/g, '');
  const bhytPrefix = Array.from({ length: 2 }, (_, index) => insuranceClean[index] || '');
  const bhytSuffix = Array.from({ length: 13 }, (_, index) => insuranceClean[index + 2] || '');

  const personal = data.medicalHistory?.personalHistory || {};
  const hasFamilyDisease = Boolean(data.medicalHistory?.familyHistory?.hasDisease);
  const isTreating = Boolean(data.medicalHistory?.currentTreatment?.isTreating);
  const hasPregnancy = Boolean(data.medicalHistory?.pregnancyHistory?.hasHistory);

  return (
    <div className="tt25-print-document">
      {/* ================================= PAGE 1 ================================= */}
      <div className="tt25-page" id="tt25-page-1">
        {/* Top Header Layout */}
        <div className="tt25-header-grid">
          <div className="tt25-header-left">
            <p className="tt25-top-doc-title">
              MẪU 3. MẪU GIẤY KHÁM SỨC KHỎE VÀ KHÁM SỨC KHỎE ĐỊNH KỲ DÙNG CHO NGƯỜI TỪ ĐỦ 18 TUỔI TRỞ LÊN
            </p>
            <p className="text-[10px] my-0.5">------</p>
            <p className="text-[11px] leading-tight text-slate-800">
              …………………<br />
              ………………….
            </p>
            <p className="text-[10px] my-0.5">-------</p>
            <p className="text-[10.5px]">
              Số: ……./SKSK-.........
            </p>
          </div>

          <div className="tt25-header-right">
            <p className="font-bold text-[11px] uppercase tracking-tight">
              CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
            </p>
            <p className="font-bold text-[11px] underline underline-offset-4">
              Độc lập - Tự do - Hạnh phúc
            </p>
          </div>
        </div>

        {/* Main Document Title */}
        <div className="tt25-main-title">
          <h1>
            Mẫu 03 - GIẤY KHÁM SỨC KHỎE VÀ KHÁM SỨC KHỎE ĐỊNH KỲ DÙNG CHO NGƯỜI TỪ ĐỦ 18 TUỔI TRỞ LÊN
          </h1>
          <p>
            (Ban hành kèm theo Thông tư số 25/2026/TT-BYT ngày 30 tháng 6 năm 2026 của Bộ Y tế)
          </p>
        </div>

        {/* THÔNG TIN HÀNH CHÍNH */}
        <div className="mb-2">
          <h2 className="tt25-section-title">THÔNG TIN HÀNH CHÍNH</h2>

          <div className="tt25-line">
            <span className="tt25-label font-medium mr-1.5">1. Họ và tên (viết chữ in hoa):</span>
            <span className="tt25-value font-bold uppercase">{data.fullName}</span>
          </div>

          <div className="tt25-line-group">
            <div className="tt25-line flex-1">
              <span className="tt25-label font-medium mr-3">2. Giới tính:</span>
              <span className="tt25-check-item mr-4">
                <span className="tt25-box">{data.gender === 'Nam' ? '✓' : ''}</span> Nam
              </span>
              <span className="tt25-check-item">
                <span className="tt25-box">{data.gender === 'Nữ' ? '✓' : ''}</span> Nữ
              </span>
            </div>
            <div className="tt25-line flex-1">
              <span className="tt25-label font-medium mr-1.5">3. Ngày tháng năm sinh:</span>
              <span className="tt25-value font-bold">{formatDate(data.birthDate)}</span>
            </div>
          </div>

          <div className="tt25-line-group">
            <div className="tt25-line flex-1">
              <span className="tt25-label font-medium mr-1.5">4. Dân tộc:</span>
              <span className="tt25-value">{data.ethnicity || 'Kinh'}</span>
            </div>
            <div className="tt25-line flex-1">
              <span className="tt25-label font-medium mr-1.5">5. Nhóm máu (nếu có):</span>
              <span className="tt25-value">{data.bloodGroup || 'Chưa rõ'}</span>
            </div>
          </div>

          <div className="tt25-line items-center my-0.5">
            <span className="tt25-label font-medium mr-2">6. Số CCCD/Mã số định danh/Hộ chiếu¹:</span>
            <div className="tt25-digits-row">
              {cccdBoxes.map((digit, i) => (
                <span key={i} className="tt25-digit-cell">
                  {digit}
                </span>
              ))}
            </div>
          </div>

          <div className="tt25-line items-center my-0.5">
            <span className="tt25-label font-medium mr-2">7. Số thẻ BHYT:</span>
            <div className="tt25-digits-row">
              {bhytPrefix.map((char, i) => (
                <span key={`p-${i}`} className="tt25-digit-cell">
                  {char}
                </span>
              ))}
              <span className="mx-1 font-bold text-black">-</span>
              {bhytSuffix.map((char, i) => (
                <span key={`s-${i}`} className="tt25-digit-cell">
                  {char}
                </span>
              ))}
            </div>
          </div>

          <div className="tt25-line">
            <span className="tt25-label font-medium mr-1.5">8. Nơi ở hiện tại:</span>
            <span className="tt25-value">{data.addressDetail || ''}</span>
          </div>
          <div className="tt25-line pl-4">
            <span className="tt25-label mr-1.5">Xã, phường:</span>
            <span className="tt25-value">
              {[data.ward, data.province].filter(Boolean).join(', ')}
            </span>
          </div>

          <div className="tt25-line">
            <span className="tt25-label font-medium mr-1.5">9. Nghề nghiệp:</span>
            <span className="tt25-value">{data.occupation || ''}</span>
          </div>

          <div className="tt25-line">
            <span className="tt25-label font-medium mr-1.5">10. Nơi làm việc, học tập:</span>
            <span className="tt25-value">{data.workplace || ''}</span>
          </div>
          <div className="tt25-line pl-4">
            <span className="tt25-label mr-1.5">Xã, phường:</span>
            <span className="tt25-value">{data.workplaceWard || ''}</span>
          </div>

          <div className="tt25-line-group">
            <div className="tt25-line flex-1">
              <span className="tt25-label font-medium mr-1.5">11. Điện thoại di động:</span>
              <span className="tt25-value font-bold">{data.phoneNumber}</span>
            </div>
            <div className="tt25-line flex-1">
              <span className="tt25-label font-medium mr-1.5">12. Lý do khám sức khỏe:</span>
              <span className="tt25-value">{data.checkupReason || 'Khám sức khỏe tổng quát'}</span>
            </div>
          </div>
        </div>

        {/* TIỀN SỬ BỆNH CỦA ĐỐI TƯỢNG KHÁM SỨC KHỎE */}
        <div className="mt-1">
          <h2 className="tt25-section-title">TIỀN SỬ BỆNH CỦA ĐỐI TƯỢNG KHÁM SỨC KHỎE</h2>

          <div className="mb-2">
            <p className="text-[10.5px] leading-relaxed">
              <strong>1. Tiền sử gia đình</strong>
              <br />
              Có ai trong gia đình ông (bà) mắc một trong các bệnh: truyền nhiễm, tim mạch, đái tháo đường, lao, hen phế quản, ung thư, động kinh, rối loạn tâm thần, bệnh khác:
            </p>
            <div className="flex items-center gap-6 mt-1 text-[10.5px] pl-3">
              <span className="tt25-check-item">
                <span className="tt25-box">{!hasFamilyDisease ? '✓' : ''}</span> Không
              </span>
              <span className="tt25-check-item flex-1">
                <span className="tt25-box">{hasFamilyDisease ? '✓' : ''}</span> Có, ghi cụ thể tên bệnh:{' '}
                <span className="tt25-value ml-1">
                  {data.medicalHistory?.familyHistory?.diseaseDetails || ''}
                </span>
              </span>
            </div>
          </div>

          <div>
            <p className="text-[10.5px] mb-1 leading-relaxed">
              <strong>2. Tiền sử bệnh, tật của bản thân:</strong> Ông (bà) đã/đang mắc bệnh, tình trạng bệnh nào sau đây không?
            </p>

            {/* Bảng Tiền sử Trang 1: Mục 1-4 và 12-15 */}
            <table className="tt25-table">
              <thead>
                <tr>
                  <th style={{ width: '28px' }}>TT</th>
                  <th style={{ textAlign: 'left', paddingLeft: '6px' }}>Tên bệnh, tật</th>
                  <th style={{ width: '32px' }}>Có</th>
                  <th style={{ width: '42px' }}>Không</th>
                  <th style={{ width: '32px' }}>STT</th>
                  <th style={{ textAlign: 'left', paddingLeft: '6px' }}>Tên bệnh, tật</th>
                  <th style={{ width: '32px' }}>Có</th>
                  <th style={{ width: '42px' }}>Không</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="text-center font-bold">1</td>
                  <td>Có bệnh hay bị thương trong 5 năm qua</td>
                  <td className="text-center"><span className="tt25-box">{personal[1] ? '✓' : ''}</span></td>
                  <td className="text-center"><span className="tt25-box">{!personal[1] ? '✓' : ''}</span></td>
                  <td className="text-center font-bold">12</td>
                  <td>Đái tháo đường hoặc kiểm soát tăng đường huyết</td>
                  <td className="text-center"><span className="tt25-box">{personal[12] ? '✓' : ''}</span></td>
                  <td className="text-center"><span className="tt25-box">{!personal[12] ? '✓' : ''}</span></td>
                </tr>
                <tr>
                  <td className="text-center font-bold">2</td>
                  <td>Có bệnh thần kinh hay bị thương ở đầu</td>
                  <td className="text-center"><span className="tt25-box">{personal[2] ? '✓' : ''}</span></td>
                  <td className="text-center"><span className="tt25-box">{!personal[2] ? '✓' : ''}</span></td>
                  <td className="text-center font-bold">13</td>
                  <td>Bệnh tâm thần</td>
                  <td className="text-center"><span className="tt25-box">{personal[13] ? '✓' : ''}</span></td>
                  <td className="text-center"><span className="tt25-box">{!personal[13] ? '✓' : ''}</span></td>
                </tr>
                <tr>
                  <td className="text-center font-bold">3</td>
                  <td>Bệnh mắt hoặc giảm thị lực (trừ trường hợp đeo kính thuốc)</td>
                  <td className="text-center"><span className="tt25-box">{personal[3] ? '✓' : ''}</span></td>
                  <td className="text-center"><span className="tt25-box">{!personal[3] ? '✓' : ''}</span></td>
                  <td className="text-center font-bold">14</td>
                  <td>Mất ý thức, rối loạn ý thức</td>
                  <td className="text-center"><span className="tt25-box">{personal[14] ? '✓' : ''}</span></td>
                  <td className="text-center"><span className="tt25-box">{!personal[14] ? '✓' : ''}</span></td>
                </tr>
                <tr>
                  <td className="text-center font-bold">4</td>
                  <td>Bệnh ở tai, giảm sức nghe hoặc thăng bằng</td>
                  <td className="text-center"><span className="tt25-box">{personal[4] ? '✓' : ''}</span></td>
                  <td className="text-center"><span className="tt25-box">{!personal[4] ? '✓' : ''}</span></td>
                  <td className="text-center font-bold">15</td>
                  <td>Ngất, chóng mặt</td>
                  <td className="text-center"><span className="tt25-box">{personal[15] ? '✓' : ''}</span></td>
                  <td className="text-center"><span className="tt25-box">{!personal[15] ? '✓' : ''}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Chú thích chân trang 1 */}
        <div className="tt25-footnote">
          ¹ Đối với người sử dụng ngân sách nhà nước chỉ chấp nhận số định danh cá nhân hoặc căn cước công dân
        </div>
      </div>

      {/* ================================= PAGE 2 ================================= */}
      <div className="tt25-page" id="tt25-page-2">
        {/* Tiếp tục Bảng Tiền sử Trang 2: Mục 5-11 và 16-22 */}
        <div className="mb-2">
          <table className="tt25-table">
            <thead>
              <tr>
                <th style={{ width: '28px' }}>TT</th>
                <th style={{ textAlign: 'left', paddingLeft: '6px' }}>Tên bệnh, tật</th>
                <th style={{ width: '32px' }}>Có</th>
                <th style={{ width: '42px' }}>Không</th>
                <th style={{ width: '32px' }}>STT</th>
                <th style={{ textAlign: 'left', paddingLeft: '6px' }}>Tên bệnh, tật</th>
                <th style={{ width: '32px' }}>Có</th>
                <th style={{ width: '42px' }}>Không</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-center font-bold">5</td>
                <td>Bệnh ở tim, hoặc nhồi máu cơ tim, các bệnh tim mạch khác</td>
                <td className="text-center"><span className="tt25-box">{personal[5] ? '✓' : ''}</span></td>
                <td className="text-center"><span className="tt25-box">{!personal[5] ? '✓' : ''}</span></td>
                <td className="text-center font-bold">16</td>
                <td>Bệnh tiêu hóa</td>
                <td className="text-center"><span className="tt25-box">{personal[16] ? '✓' : ''}</span></td>
                <td className="text-center"><span className="tt25-box">{!personal[16] ? '✓' : ''}</span></td>
              </tr>
              <tr>
                <td className="text-center font-bold">6</td>
                <td>Phẫu thuật can thiệp tim - mạch (thay van, bắc cầu nối, tạo hình mạch, máy tạo nhịp, đặt stent mạch, ghép tim)</td>
                <td className="text-center"><span className="tt25-box">{personal[6] ? '✓' : ''}</span></td>
                <td className="text-center"><span className="tt25-box">{!personal[6] ? '✓' : ''}</span></td>
                <td className="text-center font-bold">17</td>
                <td>Rối loạn giấc ngủ, ngừng thở khi ngủ, ngủ rũ ban ngày, ngáy to</td>
                <td className="text-center"><span className="tt25-box">{personal[17] ? '✓' : ''}</span></td>
                <td className="text-center"><span className="tt25-box">{!personal[17] ? '✓' : ''}</span></td>
              </tr>
              <tr>
                <td className="text-center font-bold">7</td>
                <td>Tăng huyết áp</td>
                <td className="text-center"><span className="tt25-box">{personal[7] ? '✓' : ''}</span></td>
                <td className="text-center"><span className="tt25-box">{!personal[7] ? '✓' : ''}</span></td>
                <td className="text-center font-bold">18</td>
                <td>Tai biến mạch máu não hoặc liệt</td>
                <td className="text-center"><span className="tt25-box">{personal[18] ? '✓' : ''}</span></td>
                <td className="text-center"><span className="tt25-box">{!personal[18] ? '✓' : ''}</span></td>
              </tr>
              <tr>
                <td className="text-center font-bold">8</td>
                <td>Khó thở</td>
                <td className="text-center"><span className="tt25-box">{personal[8] ? '✓' : ''}</span></td>
                <td className="text-center"><span className="tt25-box">{!personal[8] ? '✓' : ''}</span></td>
                <td className="text-center font-bold">19</td>
                <td>Bệnh hoặc tổn thương cột sống</td>
                <td className="text-center"><span className="tt25-box">{personal[19] ? '✓' : ''}</span></td>
                <td className="text-center"><span className="tt25-box">{!personal[19] ? '✓' : ''}</span></td>
              </tr>
              <tr>
                <td className="text-center font-bold">9</td>
                <td>Bệnh phổi, hen, khí phế thũng, viêm phế quản mạn tính</td>
                <td className="text-center"><span className="tt25-box">{personal[9] ? '✓' : ''}</span></td>
                <td className="text-center"><span className="tt25-box">{!personal[9] ? '✓' : ''}</span></td>
                <td className="text-center font-bold">20</td>
                <td>Sử dụng rượu, bia thường xuyên, liên tục</td>
                <td className="text-center"><span className="tt25-box">{personal[20] ? '✓' : ''}</span></td>
                <td className="text-center"><span className="tt25-box">{!personal[20] ? '✓' : ''}</span></td>
              </tr>
              <tr>
                <td className="text-center font-bold">10</td>
                <td>Bệnh thận, lọc máu</td>
                <td className="text-center"><span className="tt25-box">{personal[10] ? '✓' : ''}</span></td>
                <td className="text-center"><span className="tt25-box">{!personal[10] ? '✓' : ''}</span></td>
                <td className="text-center font-bold">21</td>
                <td>Sử dụng ma túy và chất gây nghiện</td>
                <td className="text-center"><span className="tt25-box">{personal[21] ? '✓' : ''}</span></td>
                <td className="text-center"><span className="tt25-box">{!personal[21] ? '✓' : ''}</span></td>
              </tr>
              <tr>
                <td className="text-center font-bold">11</td>
                <td>Nghiện rượu, bia</td>
                <td className="text-center"><span className="tt25-box">{personal[11] ? '✓' : ''}</span></td>
                <td className="text-center"><span className="tt25-box">{!personal[11] ? '✓' : ''}</span></td>
                <td className="text-center font-bold">22</td>
                <td>
                  Bệnh khác (ghi rõ):{' '}
                  <span className="font-bold underline ml-1">
                    {data.medicalHistory?.personalOtherDetails || ''}
                  </span>
                </td>
                <td className="text-center"><span className="tt25-box">{personal[22] ? '✓' : ''}</span></td>
                <td className="text-center"><span className="tt25-box">{!personal[22] ? '✓' : ''}</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Mục 3: Câu hỏi khác */}
        <div className="mb-2 text-[10.5px]">
          <p className="font-bold mb-1">3. Câu hỏi khác (nếu có):</p>
          <div className="pl-3 space-y-1">
            <div>
              <p>a) Ông (bà) có đang điều trị bệnh gì không?</p>
              <div className="flex items-center gap-4 pl-3 mt-0.5">
                <span className="tt25-check-item">
                  <span className="tt25-box">{!isTreating ? '✓' : ''}</span> Không
                </span>
                <span className="tt25-check-item flex-1">
                  <span className="tt25-box">{isTreating ? '✓' : ''}</span> Có. Nếu có, xin hãy liệt kê các thuốc đang dùng và liều lượng:
                </span>
              </div>
              <div className="tt25-line pl-8 mt-0.5">
                <span className="tt25-value">
                  {data.medicalHistory?.currentTreatment?.medications || ''}
                </span>
              </div>
            </div>

            <div>
              <p>b) Tiền sử thai sản (Đối với phụ nữ):</p>
              <div className="flex items-center gap-4 pl-3 mt-0.5">
                <span className="tt25-check-item">
                  <span className="tt25-box">{!hasPregnancy ? '✓' : ''}</span> Không
                </span>
                <span className="tt25-check-item flex-1">
                  <span className="tt25-box">{hasPregnancy ? '✓' : ''}</span> Có. Nếu có, xin hãy liệt kê các thuốc đang dùng và liều lượng:
                </span>
              </div>
              <div className="tt25-line pl-8 mt-0.5">
                <span className="tt25-value">
                  {data.medicalHistory?.pregnancyHistory?.details || ''}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Lời cam đoan & Chữ ký Người đề nghị khám sức khỏe */}
        <div className="grid grid-cols-2 gap-4 my-2 text-[10.5px] items-start">
          <div>
            <p className="italic leading-relaxed">
              Tôi xin cam đoan những điều khai trên đây hoàn toàn đúng với sự thật theo sự hiểu biết của tôi.
            </p>
          </div>
          <div className="text-center">
            <p className="italic">
              Ngày {currentDay} tháng {currentMonth} năm {currentYear}
            </p>
            <p className="font-bold uppercase mt-1">NGƯỜI ĐỀ NGHỊ KHÁM SỨC KHỎE</p>
            <p className="text-[10px] italic">(Ký và ghi rõ họ, tên)</p>
            <div className="h-16" />
          </div>
        </div>

        {/* ================= PHẦN DÀNH CHO CƠ SỞ Y TẾ ================= */}
        <div className="border-t border-black pt-1.5 text-[10px]">
          <h2 className="font-bold text-center uppercase tracking-wide text-[11px] mb-1">
            THÔNG TIN ĐỐI TƯỢNG - CHI TRẢ
          </h2>
          <div className="tt25-line mb-1">
            <span className="tt25-label">Đối tượng (ghi số từ 1 đến 17 theo mã đối tượng tại phụ lục):</span>
            <span className="tt25-value"></span>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <div>
              <p className="font-semibold mb-0.5">Nguồn chi trả:</p>
              <div className="space-y-0.5 pl-2">
                <p>□ Ngân sách nhà nước hỗ trợ</p>
                <p className="pl-4">□ Khám theo hợp đồng &nbsp;&nbsp;&nbsp;&nbsp; □ Khám phi địa giới</p>
                <p>□ Người sử dụng lao động chi trả</p>
                <p>□ Người dân tự chi trả</p>
                <p>□ Nguồn khác: .................................................................</p>
              </div>
            </div>
            <div>
              <p className="font-semibold mb-0.5">Địa điểm khám:</p>
              <div className="space-y-1 pl-2">
                <p>□ CS KBCB &nbsp;&nbsp;&nbsp;&nbsp; □ Khám lưu động</p>
                <p>□ Trạm Y tế &nbsp;&nbsp;&nbsp;&nbsp; □ Trường học &nbsp;&nbsp;&nbsp;&nbsp; □ KSK tại nhà</p>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-300 mt-2 pt-1.5">
            <h2 className="font-bold text-center uppercase tracking-wide text-[11px] mb-1">
              KẾT QUẢ KHÁM SỨC KHỎE
            </h2>
            <p className="font-bold uppercase text-[10.5px] mb-1">I. KHÁM THỂ LỰC</p>
            <div className="grid grid-cols-2 gap-x-6 text-[10px]">
              <div className="space-y-1">
                <p>- Chiều cao: ........................................ cm;</p>
                <p>- Cân nặng: ......................................... kg;</p>
              </div>
              <div className="space-y-1">
                <p>Mạch: ................................................. lần/phút;</p>
                <p>Huyết áp: .......................................... mmHg;</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
