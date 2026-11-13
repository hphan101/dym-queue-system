import { useStaffPermissions } from '@/features/admin/hooks/useStaffPermissions';
import { useEffect, useId, useState } from 'react';
import { PermissionButton as Button } from '@/features/admin/components/PermissionButton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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
    label: 'Scan CCCD',
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
        className="max-h-[85svh] overflow-y-auto sm:max-w-2xl"
        aria-busy={isBusy}
      >
        <DialogHeader>
          <DialogTitle>File hồ sơ nhân sự</DialogTitle>
          <DialogDescription>
            {person.personnel_code} · {person.full_name}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          PDF, JPG, PNG · Tối đa 10 MB/file. File riêng tư, chỉ admin được truy
          cập.
        </p>
        {error && (
          <p role="alert" className="break-words text-sm text-destructive">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm text-foreground">
            {message}
          </p>
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
          GROUPS.map(({ kind, label, hint }) => (
            <section
              key={kind}
              className="flex flex-col gap-3 rounded-lg border border-border p-4"
              aria-labelledby={`${inputId}-${kind}-label`}
            >
              <div className="flex flex-col gap-1">
                <label
                  id={`${inputId}-${kind}-label`}
                  htmlFor={`${inputId}-${kind}`}
                  className="text-sm font-semibold"
                >
                  {label}
                </label>
                <p className="text-sm text-muted-foreground">{hint}</p>
              </div>
              <Input
                id={`${inputId}-${kind}`}
                type="file"
                multiple
                accept={PERSONNEL_FILE_ACCEPT}
                disabled={isBusy || !can('personnel_documents', 'create')}
                className="h-auto min-h-10 cursor-pointer py-2"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = '';
                  void upload(kind, files);
                }}
              />
              <ul className="flex flex-col gap-2">
                {documents
                  .filter((document) => document.kind === kind)
                  .map((document) => (
                    <li
                      key={document.id}
                      className="flex items-center justify-between gap-3 border-t border-border pt-2"
                    >
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium">
                          {document.file_name}
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
                <p className="text-sm text-muted-foreground">Chưa có file.</p>
              )}
            </section>
          ))
        )}
        {isBusy && (
          <p role="status" className="text-sm text-muted-foreground">
            Đang xử lý, vui lòng giữ cửa sổ này mở…
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={isBusy}
          onClick={onClose}
        >
          Đóng
        </Button>
      </DialogContent>
    </Dialog>
  );
}
