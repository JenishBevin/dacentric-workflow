import { downloadHrFile, previewHrFile, useDeleteCv, useUploadCv, type Candidate } from "../../../api/hr";
import { cvMimeType, useNotify, validateCvFile } from "./common";

const cvPath = (id: string) => `/recruitment/candidates/${id}/cv`;

export function useCvActions() {
  const notify = useNotify();
  const upload = useUploadCv();
  const remove = useDeleteCv();

  return {
    uploading: upload.isPending,
    removing: remove.isPending,
    /** Must be called directly from a click handler (opens a tab synchronously). */
    preview(c: Pick<Candidate, "id" | "cvFileName">) {
      previewHrFile(cvPath(c.id), cvMimeType(c.cvFileName)).catch((err) => notify.error(err, "Could not open CV"));
    },
    async download(c: Pick<Candidate, "id" | "cvFileName">) {
      try {
        await downloadHrFile(cvPath(c.id), c.cvFileName ?? "cv.pdf");
      } catch (err) {
        notify.error(err, "Could not download CV");
      }
    },
    async upload(c: Pick<Candidate, "id" | "fullName">, file: File) {
      const problem = validateCvFile(file);
      if (problem) {
        notify.fail("CV not uploaded", problem);
        return false;
      }
      try {
        await upload.mutateAsync({ id: c.id, file });
        notify.success("CV uploaded", c.fullName);
        return true;
      } catch (err) {
        notify.error(err, "Could not upload CV");
        return false;
      }
    },
    async remove(c: Pick<Candidate, "id" | "fullName">) {
      try {
        await remove.mutateAsync(c.id);
        notify.success("CV removed", c.fullName);
        return true;
      } catch (err) {
        notify.error(err, "Could not remove CV");
        return false;
      }
    },
  };
}
