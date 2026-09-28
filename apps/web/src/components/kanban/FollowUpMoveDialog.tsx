import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { Modal } from "../ui/Modal";
import { Button, Input, Label } from "../ui/primitives";
import { PeoplePicker } from "../tasks/PeoplePicker";

export interface FollowUpChoice {
  followUpDate: string;
  followUpAssigneeUserId: string | null;
}

interface Person {
  userId: string;
  name: string;
}

interface Props {
  open: boolean;
  stageName: string;
  /** How many tasks are being moved — only changes the wording. */
  count?: number;
  /** Pre-selected follow-up owner (usually the task's primary assignee). */
  defaultAssignee?: Person | null;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (choice: FollowUpChoice) => void;
}

/** Shown whenever a task is moved onto a follow-up stage (e.g. Estimation's
 *  "Submitted"): the next follow-up date is mandatory, and someone can be
 *  named to chase the client — their Follow-up workload carries the task. */
export const FollowUpMoveDialog: React.FC<Props> = ({ open, stageName, count = 1, defaultAssignee, loading, onCancel, onConfirm }) => {
  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState("");
  const [assignee, setAssignee] = useState<Person | null>(null);

  useEffect(() => {
    if (open) {
      setDate("");
      setAssignee(defaultAssignee ?? null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={`Move to ${stageName}`}
      description={`${count === 1 ? "This task" : `These ${count} tasks`} will wait on the client — set when to follow up.`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm({ followUpDate: date, followUpAssigneeUserId: assignee?.userId ?? null })} disabled={!date} loading={loading}>
            Move
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label required>Next follow-up date</Label>
          <Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>Follow-up assignee</Label>
          <PeoplePicker
            selected={assignee ? [assignee] : []}
            onChange={(people) => setAssignee(people.slice(-1)[0] ?? null)}
            placeholder="Who will follow up with the client?"
          />
          <p className="mt-1 text-xs text-slate-500">Counted in their Follow-up workload, not their regular workload.</p>
        </div>
      </div>
    </Modal>
  );
};
