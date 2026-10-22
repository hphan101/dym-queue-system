import React, { useEffect, useState } from 'react';
import {
  CheckIcon,
  ClockIcon,
  DocumentCheckIcon,
  IdentificationIcon,
  PencilSquareIcon,
  PrinterIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { BRANCH_NAMES } from '../../../config/branches';
import { formatQueueNumber } from '../../../lib/queueNumber';
import type { BranchCode } from '../../../types/domain';
import {
  loadOccupations,
  loadProvinces,
  loadWardsForProvince,
  type Province,
  type Ward,
} from '../../registration/locationService';
import { CHECKUP_REASONS } from '../../registration/tt25Constants';
import { validateVietnamCccd } from '../../registration/cccdValidator';
import {
  type TT25PaymentSource,
  type TT25TargetGroup,
  getDefaultTargetPaymentByReason,
} from '../../registration/tt25Types';
import { usePrintStatus } from '../hooks/usePrintStatus';
import {
  type RegistrationEditableFields,
  useRegistrationOverrides,
} from '../hooks/useRegistrationOverrides';
import type { RegistrationDetails } from '../types';
import {
  calculateAge,
  formatBirthDate,
  formatPhone,
  formatRegistrationTime,
  getRegistrationDisplayState,
} from '../utils/adminFormatters';

export interface RegistrationDetailModalProps {
  selectedRow: RegistrationDetails | null;
  branch: BranchCode;
  onClose: () => void;
  onPrint: (row: RegistrationDetails) => void;
  onPrintConsent?: (row: RegistrationDetails) => void;
  onUpdated?: (updated: RegistrationDetails) => void;
}

export const RegistrationDetailModal: React.FC<RegistrationDetailModalProps> = ({
  selectedRow,
  branch,
  onClose,
  onPrint,
  onPrintConsent,
  onUpdated,
}) => {
  const { getStatus, togglePrintStatus } = usePrintStatus();
  const { applyToDetails, saveEdit } = useRegistrationOverrides();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [provinces, setProvinces] = useState<Province[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [workplaceWards, setWorkplaceWards] = useState<Ward[]>([]);
  const [occupations, setOccupations] = useState<string[]>([]);

  const effectiveRow = selectedRow ? applyToDetails(selectedRow) : null;

  const buildInitialForm = (row: RegistrationDetails): RegistrationEditableFields => {
    const ext = row.tt25_data ?? {};
    const defaultReason = row.company_name?.trim()
      ? 'Khám sức khỏe định kỳ theo công ty'
      : 'Khám sức khỏe cá nhân tự nguyện';
    const resolvedReason =
      ext.checkupReason && ext.checkupReason !== 'Khám sức khỏe tổng quát'
        ? ext.checkupReason
        : defaultReason;

    return {
      full_name: row.full_name || '',
      gender: row.gender === 'Nữ' ? 'Nữ' : 'Nam',
      birth_date: row.birth_date || '',
      phone_number: row.phone_number || '',
      identity_document: row.identity_document || '',
      company_name: row.company_name || '',
      province: row.province || '',
      ward: row.ward || '',
      address_detail: row.address_detail || '',
      tt25_data: {
        ...ext,
        occupation: ext.occupation || '',
        workplaceProvince: ext.workplaceProvince || '',
        workplaceWard: ext.workplaceWard || '',
        checkupReason: resolvedReason,
        targetPayment:
          ext.targetPayment ?? getDefaultTargetPaymentByReason(resolvedReason),
      },
    };
  };

  const [form, setForm] = useState<RegistrationEditableFields>({
    full_name: '',
    gender: 'Nam',
    birth_date: '',
    phone_number: '',
    identity_document: '',
    company_name: '',
    province: '',
    ward: '',
    address_detail: '',
    tt25_data: {},
  });

  // Sync form state whenever selectedRow changes or edit mode opens
  useEffect(() => {
    if (!effectiveRow) {
      setIsEditing(false);
      setFormError(null);
      return;
    }
    setForm(buildInitialForm(effectiveRow));
    setIsEditing(false);
    setFormError(null);
    setSaveSuccess(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRow?.id]);

  // Load provinces and occupations when editing starts
  useEffect(() => {
    if (!isEditing) return;
    loadProvinces()
      .then((list) => setProvinces(list))
      .catch(() => setProvinces([]));
    loadOccupations()
      .then((list) => setOccupations(list))
      .catch(() => setOccupations([]));
  }, [isEditing]);

  // Load wards when province changes in edit mode
  useEffect(() => {
    if (!isEditing || provinces.length === 0 || !form.province) {
      setWards([]);
      return;
    }
    const matched = provinces.find(
      (p) => p.name_with_type === form.province || p.name === form.province,
    );
    if (!matched) {
      setWards([]);
      return;
    }
    loadWardsForProvince(matched.code)
      .then((list) => setWards(list))
      .catch(() => setWards([]));
  }, [isEditing, provinces, form.province]);

  // Load workplaceWards when workplaceProvince changes in edit mode
  useEffect(() => {
    const wpProv = form.tt25_data?.workplaceProvince || '';
    if (!isEditing || provinces.length === 0 || !wpProv) {
      setWorkplaceWards([]);
      return;
    }
    const matched = provinces.find(
      (p) => p.name_with_type === wpProv || p.name === wpProv,
    );
    if (!matched) {
      setWorkplaceWards([]);
      return;
    }
    loadWardsForProvince(matched.code)
      .then((list) => setWorkplaceWards(list))
      .catch(() => setWorkplaceWards([]));
  }, [isEditing, provinces, form.tt25_data?.workplaceProvince]);

  if (!effectiveRow) return null;

  const displayState = getRegistrationDisplayState(
    effectiveRow.state,
    effectiveRow.first_called_at,
  );
  const printStatus = getStatus(effectiveRow.id);

  const handleStartEdit = () => {
    setForm(buildInitialForm(effectiveRow));
    setFormError(null);
    setSaveSuccess(false);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setFormError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) {
      setFormError('Vui lòng nhập họ và tên khách hàng.');
      return;
    }

    if (form.identity_document.trim()) {
      const cccdErr = validateVietnamCccd({
        cccd: form.identity_document,
        gender: form.gender === 'Nữ' ? 'Nữ' : 'Nam',
        birthDate: form.birth_date || effectiveRow.birth_date,
      });
      if (cccdErr) {
        setFormError(cccdErr);
        return;
      }
    }

    setIsSaving(true);
    setFormError(null);
    try {
      await saveEdit(effectiveRow.id, form);
      const nextRow: RegistrationDetails = {
        ...effectiveRow,
        full_name: form.full_name.trim(),
        gender: form.gender,
        birth_date: form.birth_date.trim() || effectiveRow.birth_date,
        phone_number: form.phone_number.replace(/\s+/g, '').trim(),
        identity_document: form.identity_document.trim().toUpperCase(),
        company_name: form.company_name.trim(),
        province: form.province.trim(),
        ward: form.ward.trim(),
        address_detail: form.address_detail.trim(),
        tt25_data: {
          ...(effectiveRow.tt25_data ?? {}),
          ...(form.tt25_data ?? {}),
        },
      };
      onUpdated?.(nextRow);
      setIsEditing(false);
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="dym-clinical-drawer-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-patient-name"
    >
      <div
        className="dym-clinical-drawer-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="dym-clinical-drawer-header">
          <div className="dym-clinical-drawer-top">
            <div className="dym-clinical-drawer-title-wrap">
              <div className="dym-clinical-drawer-meta-row">
                <span className="dym-clinical-drawer-kicker">
                  PHIẾU ĐĂNG KÝ TIẾP ĐÓN
                </span>
                <span className="dym-ticket-tag dym-drawer-ticket-tag">
                  #{formatQueueNumber(effectiveRow.queue_number)}
                </span>
                {saveSuccess && (
                  <span className="dym-drawer-saved-pill">
                    <CheckIcon className="w-3.5 h-3.5" />
                    Đã lưu
                  </span>
                )}
              </div>
              <h2
                id="drawer-patient-name"
                className="dym-clinical-drawer-title"
              >
                {effectiveRow.full_name}
              </h2>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isEditing && (
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="dym-clinical-drawer-edit-btn"
                  title="Chỉnh sửa thông tin khách hàng"
                >
                  <PencilSquareIcon className="w-4 h-4" />
                  <span>Chỉnh sửa</span>
                </button>
              )}
              <button
                type="button"
                className="dym-clinical-drawer-close-btn"
                onClick={onClose}
                aria-label="Đóng bảng chi tiết"
                title="Đóng (Esc)"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="dym-clinical-drawer-actions">
            {onPrintConsent && (
              <button
                type="button"
                onClick={() => onPrintConsent(effectiveRow)}
                className="dym-drawer-action-btn is-consent"
                title="In phiếu Đồng thuận khám sức khỏe"
              >
                <DocumentCheckIcon className="w-4 h-4 shrink-0" />
                <span>In Đồng thuận</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onPrint(effectiveRow)}
              className="dym-drawer-action-btn is-tt25"
              title="In phiếu khám sức khỏe theo mẫu Thông tư 25"
            >
              <PrinterIcon className="w-4 h-4 shrink-0" />
              <span>In phiếu TT25</span>
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <form onSubmit={(e) => void handleSaveEdit(e)} className="dym-clinical-drawer-body">
          {formError && (
            <div className="dym-drawer-error-banner" role="alert">
              {formError}
            </div>
          )}

          {/* Section 1: Thông tin cá nhân */}
          <div className={`dym-detail-section ${isEditing ? 'is-editing' : ''}`}>
            <div className="dym-detail-section-title">
              <IdentificationIcon className="w-4 h-4" />
              <span>Thông tin cá nhân</span>
            </div>

            {isEditing ? (
              <div className="dym-detail-grid">
                <div className="dym-detail-item dym-detail-full-width">
                  <label className="dym-detail-label" htmlFor="edit-full-name">
                    Họ và tên
                  </label>
                  <input
                    id="edit-full-name"
                    type="text"
                    className="dym-drawer-input"
                    value={form.full_name}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, full_name: e.target.value }))
                    }
                    placeholder="Nhập họ và tên..."
                    required
                  />
                </div>

                <div className="dym-detail-item">
                  <label className="dym-detail-label" htmlFor="edit-gender">
                    Giới tính
                  </label>
                  <select
                    id="edit-gender"
                    className="dym-drawer-input"
                    value={form.gender}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        gender: e.target.value as 'Nam' | 'Nữ',
                      }))
                    }
                  >
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                  </select>
                </div>

                <div className="dym-detail-item">
                  <label className="dym-detail-label" htmlFor="edit-birth-date">
                    Ngày sinh
                  </label>
                  <input
                    id="edit-birth-date"
                    type="date"
                    className="dym-drawer-input"
                    value={form.birth_date}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, birth_date: e.target.value }))
                    }
                  />
                </div>

                <div className="dym-detail-item">
                  <label className="dym-detail-label" htmlFor="edit-phone">
                    Số điện thoại
                  </label>
                  <input
                    id="edit-phone"
                    type="tel"
                    className="dym-drawer-input tabular-nums"
                    value={form.phone_number}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, phone_number: e.target.value }))
                    }
                    placeholder="09xxxxxxxx"
                  />
                </div>

                <div className="dym-detail-item">
                  <label className="dym-detail-label" htmlFor="edit-cccd">
                    CCCD / Hộ chiếu
                  </label>
                  <input
                    id="edit-cccd"
                    type="text"
                    className="dym-drawer-input tabular-nums"
                    value={form.identity_document}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        identity_document: e.target.value,
                      }))
                    }
                    placeholder="Số CCCD hoặc Hộ chiếu"
                  />
                </div>
              </div>
            ) : (
              <div className="dym-detail-grid">
                <div className="dym-detail-item">
                  <span className="dym-detail-label">Họ và tên</span>
                  <span className="dym-detail-value">{effectiveRow.full_name}</span>
                </div>
                <div className="dym-detail-item">
                  <span className="dym-detail-label">Giới tính</span>
                  <span className="dym-detail-value">{effectiveRow.gender}</span>
                </div>
                <div className="dym-detail-item">
                  <span className="dym-detail-label">Ngày sinh</span>
                  <span className="dym-detail-value">
                    {formatBirthDate(effectiveRow.birth_date)}
                    {calculateAge(effectiveRow.birth_date) !== null && (
                      <span className="text-xs font-normal text-slate-500 ml-1">
                        ({calculateAge(effectiveRow.birth_date)} tuổi)
                      </span>
                    )}
                  </span>
                </div>
                <div className="dym-detail-item">
                  <span className="dym-detail-label">Số điện thoại</span>
                  <span className="dym-detail-value">
                    {formatPhone(effectiveRow.phone_number)}
                  </span>
                </div>
                <div className="dym-detail-item dym-detail-full-width">
                  <span className="dym-detail-label">CCCD / Hộ chiếu</span>
                  <span className="dym-detail-value tabular-nums">
                    {effectiveRow.identity_document || '—'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Đơn vị & Địa chỉ */}
          <div className={`dym-detail-section ${isEditing ? 'is-editing' : ''}`}>
            <div className="dym-detail-section-title">
              <UserGroupIcon className="w-4 h-4" />
              <span>Nghề nghiệp, Đơn vị & Nơi cư trú</span>
            </div>

            {isEditing ? (
              <div className="dym-detail-grid">
                <div className="dym-detail-item dym-detail-full-width">
                  <label className="dym-detail-label" htmlFor="edit-occupation">
                    Nghề nghiệp (Mục 9 TT25)
                  </label>
                  <input
                    id="edit-occupation"
                    type="text"
                    list="admin-occupation-list"
                    className="dym-drawer-input"
                    value={form.tt25_data?.occupation || ''}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        tt25_data: {
                          ...prev.tt25_data,
                          occupation: e.target.value,
                        },
                      }))
                    }
                    placeholder="Nhập hoặc chọn nghề nghiệp..."
                  />
                  {occupations.length > 0 && (
                    <datalist id="admin-occupation-list">
                      {occupations.map((occ) => (
                        <option key={occ} value={occ} />
                      ))}
                    </datalist>
                  )}
                </div>

                <div className="dym-detail-item dym-detail-full-width">
                  <label className="dym-detail-label" htmlFor="edit-company">
                    Tên cơ quan / Công ty (Mục 10 TT25)
                  </label>
                  <input
                    id="edit-company"
                    type="text"
                    className="dym-drawer-input"
                    value={form.company_name}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        company_name: e.target.value,
                      }))
                    }
                    placeholder="Tên công ty hoặc để trống nếu khách lẻ"
                  />
                </div>

                <div className="dym-detail-item">
                  <label
                    className="dym-detail-label"
                    htmlFor="edit-workplace-province"
                  >
                    Tỉnh/TP nơi làm việc
                  </label>
                  <select
                    id="edit-workplace-province"
                    className="dym-drawer-input"
                    value={form.tt25_data?.workplaceProvince || ''}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        tt25_data: {
                          ...prev.tt25_data,
                          workplaceProvince: e.target.value,
                          workplaceWard: '',
                        },
                      }))
                    }
                  >
                    <option value="">-- Chọn Tỉnh/TP --</option>
                    {form.tt25_data?.workplaceProvince &&
                      !provinces.some(
                        (p) =>
                          p.name_with_type ===
                            form.tt25_data?.workplaceProvince ||
                          p.name === form.tt25_data?.workplaceProvince,
                      ) && (
                        <option value={form.tt25_data.workplaceProvince}>
                          {form.tt25_data.workplaceProvince}
                        </option>
                      )}
                    {provinces.map((p) => (
                      <option key={p.code} value={p.name_with_type}>
                        {p.name_with_type}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="dym-detail-item">
                  <label
                    className="dym-detail-label"
                    htmlFor="edit-workplace-ward"
                  >
                    Phường/Xã nơi làm việc
                  </label>
                  {workplaceWards.length > 0 ? (
                    <select
                      id="edit-workplace-ward"
                      className="dym-drawer-input"
                      value={form.tt25_data?.workplaceWard || ''}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          tt25_data: {
                            ...prev.tt25_data,
                            workplaceWard: e.target.value,
                          },
                        }))
                      }
                    >
                      <option value="">-- Chọn Phường/Xã --</option>
                      {form.tt25_data?.workplaceWard &&
                        !workplaceWards.some(
                          (w) =>
                            w.name_with_type ===
                              form.tt25_data?.workplaceWard ||
                            w.name === form.tt25_data?.workplaceWard,
                        ) && (
                          <option value={form.tt25_data.workplaceWard}>
                            {form.tt25_data.workplaceWard}
                          </option>
                        )}
                      {workplaceWards.map((w) => (
                        <option key={w.code} value={w.name_with_type}>
                          {w.name_with_type}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="edit-workplace-ward"
                      type="text"
                      className="dym-drawer-input"
                      value={form.tt25_data?.workplaceWard || ''}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          tt25_data: {
                            ...prev.tt25_data,
                            workplaceWard: e.target.value,
                          },
                        }))
                      }
                      placeholder="Nhập Phường/Xã nơi làm việc"
                    />
                  )}
                </div>

                <div className="dym-detail-item">
                  <label className="dym-detail-label" htmlFor="edit-province">
                    Tỉnh/TP cư trú (Mục 8)
                  </label>
                  <select
                    id="edit-province"
                    className="dym-drawer-input"
                    value={form.province}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        province: e.target.value,
                        ward: '',
                      }))
                    }
                  >
                    <option value="">-- Chọn Tỉnh/TP --</option>
                    {form.province &&
                      !provinces.some(
                        (p) =>
                          p.name_with_type === form.province ||
                          p.name === form.province,
                      ) && (
                        <option value={form.province}>{form.province}</option>
                      )}
                    {provinces.map((p) => (
                      <option key={p.code} value={p.name_with_type}>
                        {p.name_with_type}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="dym-detail-item">
                  <label className="dym-detail-label" htmlFor="edit-ward">
                    Phường/Xã cư trú (Mục 8)
                  </label>
                  {wards.length > 0 ? (
                    <select
                      id="edit-ward"
                      className="dym-drawer-input"
                      value={form.ward}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, ward: e.target.value }))
                      }
                    >
                      <option value="">-- Chọn Phường/Xã --</option>
                      {form.ward &&
                        !wards.some(
                          (w) =>
                            w.name_with_type === form.ward ||
                            w.name === form.ward,
                        ) && <option value={form.ward}>{form.ward}</option>}
                      {wards.map((w) => (
                        <option key={w.code} value={w.name_with_type}>
                          {w.name_with_type}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="edit-ward"
                      type="text"
                      className="dym-drawer-input"
                      value={form.ward}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, ward: e.target.value }))
                      }
                      placeholder="Nhập Phường / Xã"
                    />
                  )}
                </div>

                <div className="dym-detail-item dym-detail-full-width">
                  <label className="dym-detail-label" htmlFor="edit-address">
                    Địa chỉ cư trú chi tiết
                  </label>
                  <input
                    id="edit-address"
                    type="text"
                    className="dym-drawer-input"
                    value={form.address_detail}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        address_detail: e.target.value,
                      }))
                    }
                    placeholder="Số nhà, tên đường, khu phố..."
                  />
                </div>

                <div className="dym-detail-item dym-detail-full-width">
                  <label className="dym-detail-label" htmlFor="edit-reason">
                    Lý do khám sức khỏe (Mục 12 TT25)
                  </label>
                  <select
                    id="edit-reason"
                    className="dym-drawer-input"
                    value={form.tt25_data?.checkupReason || CHECKUP_REASONS[0]}
                    onChange={(e) => {
                      const nextReason = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        tt25_data: {
                          ...prev.tt25_data,
                          checkupReason: nextReason,
                          targetPayment:
                            getDefaultTargetPaymentByReason(nextReason),
                        },
                      }));
                    }}
                  >
                    {CHECKUP_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="dym-detail-item">
                  <label
                    className="dym-detail-label"
                    htmlFor="edit-target-group"
                  >
                    Đối tượng khám (Trang 2)
                  </label>
                  <select
                    id="edit-target-group"
                    className="dym-drawer-input"
                    value={form.tt25_data?.targetPayment?.targetGroup || '15'}
                    onChange={(e) => {
                      const nextGroup = e.target.value as TT25TargetGroup;
                      setForm((prev) => ({
                        ...prev,
                        tt25_data: {
                          ...prev.tt25_data,
                          targetPayment: {
                            ...(prev.tt25_data?.targetPayment ??
                              getDefaultTargetPaymentByReason()),
                            targetGroup: nextGroup,
                          },
                        },
                      }));
                    }}
                  >
                    <option value="14">14 – Sinh viên, học viên</option>
                    <option value="15">15 – Người lao động chính thức</option>
                    <option value="16">16 – Người lao động phi chính thức</option>
                    <option value="other">Các đối tượng khác</option>
                  </select>
                </div>

                <div className="dym-detail-item">
                  <label
                    className="dym-detail-label"
                    htmlFor="edit-payment-source"
                  >
                    Nguồn chi trả (Trang 2)
                  </label>
                  <select
                    id="edit-payment-source"
                    className="dym-drawer-input"
                    value={
                      form.tt25_data?.targetPayment?.paymentSource || 'employer'
                    }
                    onChange={(e) => {
                      const nextSource = e.target.value as TT25PaymentSource;
                      setForm((prev) => ({
                        ...prev,
                        tt25_data: {
                          ...prev.tt25_data,
                          targetPayment: {
                            ...(prev.tt25_data?.targetPayment ??
                              getDefaultTargetPaymentByReason()),
                            paymentSource: nextSource,
                          },
                        },
                      }));
                    }}
                  >
                    <option value="employer">
                      Người sử dụng lao động chi trả
                    </option>
                    <option value="self">Người dân tự chi trả</option>
                    <option value="other">Nguồn khác</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="dym-detail-grid">
                <div className="dym-detail-item">
                  <span className="dym-detail-label">Nghề nghiệp (Mục 9)</span>
                  <span className="dym-detail-value">
                    {effectiveRow.tt25_data?.occupation || '—'}
                  </span>
                </div>
                <div className="dym-detail-item">
                  <span className="dym-detail-label">Lý do khám (Mục 12)</span>
                  <span className="dym-detail-value">
                    {effectiveRow.tt25_data?.checkupReason &&
                    effectiveRow.tt25_data.checkupReason !==
                      'Khám sức khỏe tổng quát'
                      ? effectiveRow.tt25_data.checkupReason
                      : effectiveRow.company_name?.trim()
                        ? 'Khám sức khỏe định kỳ theo công ty'
                        : 'Khám sức khỏe cá nhân tự nguyện'}
                  </span>
                </div>
                <div className="dym-detail-item dym-detail-full-width">
                  <span className="dym-detail-label">
                    Tên cơ quan / Công ty (Mục 10)
                  </span>
                  <span className="dym-detail-value">
                    {effectiveRow.company_name || 'Khách cá nhân / Vãng lai'}
                  </span>
                </div>
                <div className="dym-detail-item dym-detail-full-width">
                  <span className="dym-detail-label">
                    Xã, phường nơi làm việc (Mục 10)
                  </span>
                  <span className="dym-detail-value">
                    {(() => {
                      const wpWard = effectiveRow.tt25_data?.workplaceWard || '';
                      const wpProv =
                        effectiveRow.tt25_data?.workplaceProvince || '';
                      const full =
                        wpProv && !wpWard.includes(wpProv)
                          ? [wpWard, wpProv].filter(Boolean).join(', ')
                          : wpWard;
                      return full || '—';
                    })()}
                  </span>
                </div>
                <div className="dym-detail-item">
                  <span className="dym-detail-label">Tỉnh / Thành phố</span>
                  <span className="dym-detail-value">
                    {effectiveRow.province || '—'}
                  </span>
                </div>
                <div className="dym-detail-item">
                  <span className="dym-detail-label">Phường / Xã</span>
                  <span className="dym-detail-value">{effectiveRow.ward || '—'}</span>
                </div>
                <div className="dym-detail-item dym-detail-full-width">
                  <span className="dym-detail-label">Địa chỉ chi tiết</span>
                  <span className="dym-detail-value">
                    {effectiveRow.address_detail || '—'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Edit Mode Save/Cancel Footer */}
          {isEditing && (
            <div className="dym-drawer-edit-footer">
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="dym-drawer-btn-cancel"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="dym-drawer-btn-save"
              >
                <CheckIcon className="w-4 h-4" />
                <span>{isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
              </button>
            </div>
          )}

          {/* Section 3: Quản lý lượt gọi */}
          <div className="dym-detail-section">
            <div className="dym-detail-section-title">
              <ClockIcon className="w-4 h-4" />
              <span>Nhật ký hàng đợi</span>
            </div>
            <div className="dym-detail-grid">
              <div className="dym-detail-item">
                <span className="dym-detail-label">Cơ sở tiếp nhận</span>
                <span className="dym-detail-value">{BRANCH_NAMES[branch]}</span>
              </div>
              <div className="dym-detail-item">
                <span className="dym-detail-label">Thời gian lấy số</span>
                <span className="dym-detail-value tabular-nums">
                  {formatRegistrationTime(effectiveRow.registered_at)} (
                  {effectiveRow.queue_date})
                </span>
              </div>
              <div className="dym-detail-item">
                <span className="dym-detail-label">Lần gọi đầu</span>
                <span className="dym-detail-value tabular-nums">
                  {effectiveRow.first_called_at
                    ? formatRegistrationTime(effectiveRow.first_called_at)
                    : 'Chưa gọi'}
                </span>
              </div>
              <div className="dym-detail-item">
                <span className="dym-detail-label">Trạng thái</span>
                <span className="dym-detail-value">
                  <span className={`dym-status-badge ${displayState.cls}`}>
                    <span className="dym-status-indicator-dot" />
                    {displayState.label}
                  </span>
                </span>
              </div>
              <div className="dym-detail-item">
                <span className="dym-detail-label">Trạng thái in</span>
                <span className="dym-detail-value">
                  <button
                    type="button"
                    onClick={() => togglePrintStatus(effectiveRow.id)}
                    title={printStatus.title}
                    className={`dym-status-badge dym-print-status-btn ${printStatus.cls}`}
                  >
                    <span className="dym-status-indicator-dot" />
                    {printStatus.label}
                  </button>
                </span>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
