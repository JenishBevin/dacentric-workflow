import React from "react";
import { Modal } from "../ui/Modal";
import { BoardStage } from "../../lib/types";
import { Check } from "lucide-react";
import clsx from "clsx";

/** Minimal shape this sheet needs — lets it be reused for lighter-weight task
 *  summaries (e.g. My Tasks rows) that aren't full TaskSummary objects. */
export type MovableTask = Pick<import("../../lib/types").TaskSummary, "taskId" | "title" | "stageId"> & { id: string };

interface Props {
  open: boolean;
  onClose: () => void;
  task: MovableTask | null;
  stages: BoardStage[];
  onSelect: (stageId: string) => void;
}

/**
 * The non-drag alternative required by Section 13/50: every drag-and-drop
 * operation must have an accessible, touch-friendly equivalent. Used both
 * as the mobile "Move to Stage" action and as a keyboard/screen-reader
 * accessible way to change stage from the task card menu.
 */
export const MoveToStageSheet: React.FC<Props> = ({ open, onClose, task, stages, onSelect }) => (
  <Modal open={open} onClose={onClose} title="Move to stage" description={task ? `${task.taskId}: ${task.title}` : undefined} size="sm">
    <div className="-mx-2 flex flex-col gap-1">
      {stages.map((stage) => {
        const isCurrent = stage.id === task?.stageId;
        return (
          <button
            key={stage.id}
            onClick={() => onSelect(stage.id)}
            className={clsx(
              "flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm hover:bg-slate-50",
              isCurrent && "bg-brand-50"
            )}
          >
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
              {stage.name}
              {stage.isTerminal && <span className="text-xs text-slate-400">(Done)</span>}
            </span>
            {isCurrent && <Check className="h-4 w-4 text-brand-600" />}
          </button>
        );
      })}
    </div>
  </Modal>
);
