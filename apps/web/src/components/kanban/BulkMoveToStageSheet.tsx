import React from "react";
import { Modal } from "../ui/Modal";
import { BoardStage } from "../../lib/types";

/** Bulk counterpart to MoveToStageSheet — moves several tasks (possibly on
 * different current stages) to one target stage at once, so there's no
 * single "current stage" to highlight. */
export const BulkMoveToStageSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  count: number;
  stages: BoardStage[];
  onSelect: (stageId: string) => void;
}> = ({ open, onClose, count, stages, onSelect }) => (
  <Modal open={open} onClose={onClose} title="Move to stage" description={`Move ${count} task${count === 1 ? "" : "s"} to…`} size="sm">
    <div className="-mx-2 flex flex-col gap-1">
      {stages.map((stage) => (
        <button
          key={stage.id}
          onClick={() => onSelect(stage.id)}
          className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-slate-50"
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
          {stage.name}
          {stage.isTerminal && <span className="text-xs text-slate-400">(Done)</span>}
        </button>
      ))}
    </div>
  </Modal>
);
