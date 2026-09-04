import React from "react";
import { Modal } from "./Modal";
import { Button } from "./primitives";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Must name the specific object being changed/deleted (Section 52). */
  message: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  destructive = true,
  loading,
  onConfirm,
  onCancel,
}) => (
  <Modal
    open={open}
    onClose={onCancel}
    title={title}
    size="sm"
    footer={
      <>
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </>
    }
  >
    <div className="flex gap-3">
      {destructive && (
        <div className="mt-0.5 shrink-0">
          <AlertTriangle className="h-5 w-5 text-red-500" />
        </div>
      )}
      <div className="text-sm text-slate-600">{message}</div>
    </div>
  </Modal>
);
