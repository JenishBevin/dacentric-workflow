import React, { useRef, useState } from "react";
import { Camera, Download, Trash2, UserSquare2 } from "lucide-react";
import { downloadHrFile, useEmployeePhotoUrl, useRemoveEmployeePhoto, useUploadEmployeePhoto, type HrEmployee } from "../../api/hr";
import { Button, Card } from "../ui/primitives";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";

const ACCEPTED_TYPES = ".png,.jpg,.jpeg,.webp";
const MAX_PHOTO_MB = 5;

/**
 * Passport-size professional photo kept on the HR record (ID cards, visa
 * paperwork). Separate from the user's own avatar, which they manage themselves.
 */
export function EmployeePhotoCard({ employee }: { employee: HrEmployee }) {
  const { push } = useToast();
  const photoUrl = useEmployeePhotoUrl(employee.id, employee.photoStorageKey);
  const upload = useUploadEmployeePhoto(employee.id);
  const remove = useRemoveEmployeePhoto(employee.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const hasPhoto = !!employee.photoStorageKey;

  async function onPickFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      push({ variant: "error", title: "File too large", description: `Photos must be ${MAX_PHOTO_MB} MB or smaller.` });
      return;
    }
    try {
      await upload.mutateAsync(file);
      push({ variant: "success", title: hasPhoto ? "Photo replaced." : "Photo uploaded." });
    } catch (err) {
      push({ variant: "error", title: "Could not upload photo", description: extractApiError(err).message });
    }
  }

  async function download() {
    const ext = employee.photoStorageKey?.match(/\.[a-z0-9]+$/i)?.[0] ?? "";
    try {
      await downloadHrFile(`/employees/${employee.id}/photo`, `${employee.employeeCode}-photo${ext}`);
    } catch (err) {
      push({ variant: "error", title: "Could not download photo", description: extractApiError(err).message });
    }
  }

  async function onConfirmRemove() {
    try {
      await remove.mutateAsync();
      push({ variant: "success", title: "Photo removed." });
      setConfirmRemove(false);
    } catch (err) {
      push({ variant: "error", title: "Could not remove photo", description: extractApiError(err).message });
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Passport-size photo</h3>
      <div className="flex flex-wrap items-start gap-4">
        {/* 35 × 45 mm passport ratio */}
        <div className="flex aspect-[7/9] w-28 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {photoUrl ? (
            <img src={photoUrl} alt={`${employee.fullName} passport photo`} className="h-full w-full object-cover" />
          ) : (
            <UserSquare2 className="h-10 w-10 text-slate-300" aria-hidden />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" loading={upload.isPending} onClick={() => fileRef.current?.click()}>
              <Camera className="h-4 w-4" /> {hasPhoto ? "Replace" : "Upload photo"}
            </Button>
            {hasPhoto && (
              <>
                <Button type="button" variant="ghost" size="sm" onClick={download}>
                  <Download className="h-4 w-4" /> Download
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmRemove(true)}>
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Professional, front-facing photo on a plain background. PNG, JPG or WEBP, up to {MAX_PHOTO_MB} MB.
            <br />
            This is separate from the employee's profile avatar.
          </p>
        </div>
        <input ref={fileRef} type="file" accept={ACCEPTED_TYPES} className="hidden" onChange={onPickFile} />
      </div>
      <ConfirmDialog
        open={confirmRemove}
        title="Remove passport photo?"
        message="The photo will be permanently deleted from this employee's record."
        confirmLabel="Remove"
        destructive
        loading={remove.isPending}
        onConfirm={onConfirmRemove}
        onCancel={() => setConfirmRemove(false)}
      />
    </Card>
  );
}
