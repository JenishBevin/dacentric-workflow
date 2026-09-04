import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { Drawer } from "../ui/Drawer";
import { Button, Input, Label, Select, Textarea } from "../ui/primitives";
import { useCreateBoard, useBoardTemplates } from "../../api/boards";
import { useEmployeeDirectory } from "../../api/misc";
import { useLinkedRecordSearch } from "../../api/misc";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

interface MemberRow {
  userId: string;
  name: string;
  role: "OWNER" | "EDITOR" | "VIEWER" | "COMMENTER";
}

interface FormValues {
  name: string;
  description: string;
  boardType: "STANDALONE" | "LINKED";
  linkedRecordId?: string;
  linkedRecordType?: string;
  templateId?: string;
}

export const NewBoardDrawer: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { user } = useAuth();
  const { push } = useToast();
  const { data: templates } = useBoardTemplates();
  const createBoard = useCreateBoard();
  const [members, setMembers] = useState<MemberRow[]>(user ? [{ userId: user.id, name: user.name, role: "OWNER" }] : []);
  const [recordQuery, setRecordQuery] = useState("");
  const { data: records } = useLinkedRecordSearch(recordQuery);
  const [memberQuery, setMemberQuery] = useState("");
  const { data: employees } = useEmployeeDirectory(memberQuery);
  const [dirty, setDirty] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: { boardType: "STANDALONE" } });

  const boardType = watch("boardType");

  const close = () => {
    if (dirty && !window.confirm("Discard unsaved changes to this board?")) return;
    reset();
    setMembers(user ? [{ userId: user.id, name: user.name, role: "OWNER" }] : []);
    setDirty(false);
    onClose();
  };

  const onSubmit = async (values: FormValues) => {
    if (!members.some((m) => m.role === "OWNER")) {
      push({ variant: "error", title: "A board must have at least one Owner." });
      return;
    }
    try {
      await createBoard.mutateAsync({
        name: values.name,
        description: values.description || undefined,
        boardType: values.boardType,
        linkedRecordId: values.boardType === "LINKED" ? values.linkedRecordId : undefined,
        linkedRecordType: values.boardType === "LINKED" ? values.linkedRecordType : undefined,
        templateId: values.templateId || undefined,
        members: members.map((m) => ({ userId: m.userId, role: m.role })),
      });
      push({ variant: "success", title: "Board created." });
      reset();
      setDirty(false);
      onClose();
    } catch (err) {
      push({ variant: "error", title: "Could not create board", description: extractApiError(err).message });
    }
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      title="Create board"
      subtitle="Set up a new board for internal work, optionally linked to a commercial record."
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} loading={isSubmitting}>
            Save
          </Button>
        </>
      }
    >
      <form onChange={() => setDirty(true)} className="space-y-6" onSubmit={(e) => e.preventDefault()}>
        <section className="space-y-3">
          <div>
            <Label htmlFor="name" required>
              Board name
            </Label>
            <Input id="name" placeholder="e.g. Website Development" error={errors.name?.message} {...register("name", { required: "Board name is required." })} />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={2} placeholder="What is this board for?" {...register("description")} />
          </div>
        </section>

        <section className="space-y-3">
          <Label>Board type</Label>
          <div className="flex gap-2">
            <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
              <input type="radio" value="STANDALONE" {...register("boardType")} /> Standalone
            </label>
            <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
              <input type="radio" value="LINKED" {...register("boardType")} /> Linked to Customer/Lead/Order
            </label>
          </div>

          {boardType === "LINKED" && (
            <div>
              <Label>Linked record</Label>
              <Input placeholder="Search customers, leads, orders…" value={recordQuery} onChange={(e) => setRecordQuery(e.target.value)} />
              {records && records.length > 0 && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200">
                  {records.map((r: any) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setValue("linkedRecordId", r.id, { shouldDirty: true });
                        setValue("linkedRecordType", r.recordType, { shouldDirty: true });
                        setRecordQuery(`${r.name} (${r.externalRef})`);
                        setDirty(true);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span>{r.name}</span>
                      <span className="text-xs text-slate-400">{r.recordType}</span>
                    </button>
                  ))}
                </div>
              )}
              <input type="hidden" {...register("linkedRecordType")} />
            </div>
          )}
        </section>

        <section>
          <Label htmlFor="template">Template</Label>
          <Select id="template" {...register("templateId")}>
            <option value="">Blank</option>
            {templates?.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-slate-400">
            You can fine-tune stages, colours and WIP limits afterward from Board Settings.
          </p>
        </section>

        <section className="space-y-2">
          <Label>Members</Label>
          <Input placeholder="Search people to add…" value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} />
          {memberQuery && employees && employees.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200">
              {employees
                .filter((e) => !members.some((m) => m.userId === e.userId))
                .map((e) => (
                  <button
                    key={e.userId}
                    type="button"
                    onClick={() => {
                      setMembers((prev) => [...prev, { userId: e.userId, name: e.name, role: "EDITOR" }]);
                      setMemberQuery("");
                      setDirty(true);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span>{e.name}</span>
                    <span className="text-xs text-slate-400">{e.department}</span>
                  </button>
                ))}
            </div>
          )}
          <div className="space-y-1.5">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
                <span className="flex-1 truncate text-sm text-slate-700">{m.name}</span>
                <Select
                  value={m.role}
                  onChange={(e) => setMembers((prev) => prev.map((x) => (x.userId === m.userId ? { ...x, role: e.target.value as any } : x)))}
                  className="!w-32"
                >
                  <option value="OWNER">Owner</option>
                  <option value="EDITOR">Editor</option>
                  <option value="VIEWER">Viewer</option>
                  <option value="COMMENTER">Commenter</option>
                </Select>
                <button type="button" onClick={() => setMembers((prev) => prev.filter((x) => x.userId !== m.userId))} className="text-slate-400 hover:text-red-500">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </form>
    </Drawer>
  );
};
