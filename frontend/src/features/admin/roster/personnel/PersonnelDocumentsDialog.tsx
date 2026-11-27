import { Alert, AlertDescription } from '@/components/ui/alert';
import { useStaffPermissions } from '@/features/admin/shared/useStaffPermissions';
import { useEffect, useId, useState } from 'react';
import { Upload, FileText, LockKeyhole } from 'lucide-react';
import { PermissionButton as Button } from '@/features/admin/shared/PermissionButton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import './personnelDocuments.css';
import type { MedicalPersonnel } from '../data/rosterService';
import {
  deletePersonnelDocument,
  fetchPersonnelDocuments,
  getPersonnelDocumentUrl,
  PERSONNEL_FILE_ACCEPT,
  uploadPersonnelDocument,
  type PersonnelDocument,
  type PersonnelDocumentKind,
} from './personnelDocuments';

const GROUPS: Array<{
  kind: PersonnelDocumentKind;
  label: string;
  hint: string;
}> = [
  {
    kind: 'identity',
    label: 'CCCD',
    hint: 'Có thể tải riêng mặt trước và mặt sau.',
  },
  {
    kind: 'certificate',
    label: 'Chứng chỉ hành nghề',
    hint: 'Có thể tải nhiều trang hoặc một file PDF.',
  },
];

export function PersonnelDocumentsDialog({
  person,
  onClose,
}: {
  person: MedicalPersonnel;
  onClose: () => void;
}) {
  const { can } = useStaffPermissions();
  const inputId = useId();
  const [documents, setDocuments] = useState<PersonnelDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<PersonnelDocument | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    fetchPersonnelDocuments(person.id)
      .then((items) => {
        if (active) {
          setDocuments(items);
          setLoadFailed(false);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setLoadFailed(true);
          setError(
            cause instanceof Error ? cause.message : 'Không thể tải hồ sơ.',
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [person.id, reload]);

  const upload = async (kind: PersonnelDocumentKind, files: File[]) => {
    if (!files.length) return;
    setIsBusy(true);
    setError('');
    setMessage('');
    let saved = 0;
    try {
      for (const file of files) {
        try {
          const document = await uploadPersonnelDocument(person.id, kind, file);
          setDocuments((previous) => [
            document,
            ...previous.filter((item) => item.id !== document.id),
          ]);
          saved++;
        } catch (cause) {
          throw new Error(
            `${file.name}: ${cause instanceof Error ? cause.message : 'Không thể tải file lên.'}`,
          );
        }
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Không thể tải file lên.',
      );
    } finally {
      if (saved)
        setMessage(
          `Đã lưu ${saved}/${files.length} file. File đã tải lên được lưu ngay.`,
        );
      setIsBusy(false);
    }
  };

  const openDocument = async (document: PersonnelDocument) => {
    const preview = window.open('about:blank', '_blank');
    if (!preview) {
      setError(
        'Trình duyệt đang chặn tab mới. Vui lòng cho phép rồi mở lại file.',
      );
      return;
    }
    preview.opener = null;
    setIsBusy(true);
    setError('');
    try {
      preview.location.replace(await getPersonnelDocumentUrl(document));
    } catch (cause) {
      preview.close();
      setError(cause instanceof Error ? cause.message : 'Không thể mở file.');
    } finally {
      setIsBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsBusy(true);
    setError('');
    setMessage('');
    try {
      await deletePersonnelDocument(pendingDelete);
      setDocuments((previous) =>
        previous.filter((item) => item.id !== pendingDelete.id),
      );
      setMessage(`Đã xóa file ${pendingDelete.file_name}.`);
      setPendingDelete(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xóa file.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isBusy) onClose();
      }}
    >
      <DialogContent
        className="personnel-documents-dialog"
        aria-busy={isBusy}
      >
        <DialogHeader className="personnel-documents-header">
          <DialogTitle>Hồ sơ nhân sự</DialogTitle>
          <DialogDescription className="break-words">
            {person.personnel_code} · {person.full_name}
          </DialogDescription>
        </DialogHeader>
        <div className="personnel-documents-body">
        <div className="personnel-documents-guidance text-sm text-muted-foreground">
          <p>PDF, JPG, PNG · Tối đa 10 MB/file</p>
          <p className="flex items-center gap-2"><LockKeyhole className="size-4 shrink-0" aria-hidden="true" />Hồ sơ riêng tư, chỉ tài khoản được cấp quyền mới xem được</p>
          {typeof __DYM_CLOUDFLARE_PREVIEW__ !== 'undefined' && __DYM_CLOUDFLARE_PREVIEW__ && <p>Dùng tệp giả có tên bắt đầu bằng DEMO-.</p>}
        </div>
        {error && (
          <Alert variant="destructive"><AlertDescription className="break-words">
            {error}
          </AlertDescription></Alert>
        )}
        {message && (
          <Alert variant="success" role="status" aria-live="polite"><AlertDescription>
            {message}
          </AlertDescription></Alert>
        )}
        {pendingDelete && (
          <div
            role="group"
            aria-label="Xác nhận xóa file"
            className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-4"
          >
            <p className="break-words text-sm">
              Xóa vĩnh viễn file <strong>{pendingDelete.file_name}</strong>?
              File sẽ bị gỡ khỏi hồ sơ và kho lưu trữ, không thể khôi phục.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button permissionAction="delete" permissionModule="personnel_documents"
                type="button"
                variant="destructive"
                size="sm"
                disabled={isBusy}
                onClick={() => void confirmDelete()}
              >
                Xác nhận xóa
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                autoFocus
                disabled={isBusy}
                onClick={() => setPendingDelete(null)}
              >
                Hủy
              </Button>
            </div>
          </div>
        )}
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : loadFailed ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setError('');
              setIsLoading(true);
              setReload((value) => value + 1);
            }}
          >
            Tải lại hồ sơ
          </Button>
        ) : (
          <div className="personnel-documents-groups">{GROUPS.map(({ kind, label, hint }) => (
            <Card
              key={kind}
              className="personnel-documents-group"
              aria-labelledby={`${inputId}-${kind}-label`}
            >
              <CardHeader>
                <CardTitle
                  id={`${inputId}-${kind}-label`}
                  className="personnel-documents-group-title"
                  role="heading"
                  aria-level={3}
                >
                  {label}
                </CardTitle>
                <CardDescription>{hint}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
              <input
                id={`${inputId}-${kind}`}
                aria-label={`Tải file ${label}`}
                type="file"
                multiple
                accept={PERSONNEL_FILE_ACCEPT}
                disabled={isBusy || !can('personnel_documents', 'create')}
                className="hidden"
                tabIndex={-1}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = '';
                  void upload(kind, files);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={isBusy || !can('personnel_documents', 'create')}
                aria-label={`Tải file ${label} lên`}
                onClick={() => document.getElementById(`${inputId}-${kind}`)?.click()}
              >
                <Upload data-icon="inline-start" aria-hidden="true" />
                Tải file lên
              </Button>
              <ul className="flex flex-col gap-2">
                {documents
                  .filter((document) => document.kind === kind)
                  .map((document) => (
                    <li
                      key={document.id}
                      className="personnel-document-row"
                    >
                      <div className="min-w-0">
                        <p className="flex items-start gap-2 break-words text-sm font-medium">
                          <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span className="min-w-0 break-words">{document.file_name}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {Math.ceil(document.file_size / 1024).toLocaleString(
                            'vi-VN',
                          )}{' '}
                          KB
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => void openDocument(document)}
                          aria-label={`Xem ${document.file_name}`}
                        >
                          Xem
                        </Button>
                        <Button permissionAction="delete" permissionModule="personnel_documents"
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => {
                            setError('');
                            setMessage('');
                            setPendingDelete(document);
                          }}
                          aria-label={`Xóa ${document.file_name}`}
                        >
                          Xóa
                        </Button>
                      </div>
                    </li>
                  ))}
              </ul>
              {!documents.some((document) => document.kind === kind) && (
                <Empty className="personnel-documents-empty">
                  <EmptyDescription>Chưa có file</EmptyDescription>
                </Empty>
              )}
              </CardContent>
            </Card>
          ))}</div>
        )}
        {isBusy && (
          <p role="status" className="text-sm text-muted-foreground">
            Đang xử lý, vui lòng giữ cửa sổ này mở…
          </p>
        )}
        </div>
        <DialogFooter className="personnel-documents-footer">
        <Button
          type="button"
          variant="outline"
          disabled={isBusy}
          onClick={onClose}
        >
          Đóng
        </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
