import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Drawer } from "../ui/Drawer";
import { Button, Input, Label, Select, Textarea } from "../ui/primitives";
import { useCreateBoard, useBoardTemplates, useServices } from "../../api/boards";
import { useEmployeeDirectory } from "../../api/misc";
import { useLinkedRecordSearch } from "../../api/misc";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { CustomerPicker } from "../customers/CustomerPicker";
import { CustomerRef } from "../../lib/types";

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
  serviceId?: string;
}

interface NewBoardDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Locks the project to this service (no picker shown) — used when creating
   * from inside a specific service's project list. */
  serviceId?: string;
  /** Only used when `serviceId` is not locked: pre-selects the picker. */
  initialServiceId?: string;
  initialName?: string;
  onCreated?: (board: { id: string; name: string }) => void;
}

export const NewBoardDrawer: React.FC<NewBoardDrawerProps> = ({ open, onClose, serviceId, initialServiceId, initialName, onCreated }) => {
  const { user } = useAuth();
  const { push } = useToast();
  const { data: templates } = useBoardTemplates();
  const { data: services } = useServices();
  const createBoard = useCreateBoard();
  const [members, setMembers] = useState<MemberRow[]>(user ? [{ userId: user.id, name: user.name, role: "OWNER" }] : []);
  const [recordQuery, setRecordQuery] = useState("");
  const { data: records } = useLinkedRecordSearch(recordQuery);
  const [memberQuery, setMemberQuery] = useState("");
  const { data: employees } = useEmployeeDirectory(memberQuery);
  const [customer, setCustomer] = useState<CustomerRef | null>(null);
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

  // Re-seed defaults every time the drawer opens, since it stays mounted
  // between uses — e.g. the "Awarded" action on a task opens this with the
  // task's title and service already filled in.
  useEffect(() => {
    if (open) {
      reset({ boardType: "STANDALONE", name: initialName ?? "", serviceId: initialServiceId ?? "" });
      setCustomer(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    if (dirty && !window.confirm("Discard unsaved changes to this project?")) return;
    reset();
    setMembers(user ? [{ userId: user.id, name: user.name, role: "OWNER" }] : []);
    setCustomer(null);
    setDirty(false);
    onClose();
  };

  const onSubmit = async (values: FormValues) => {
    if (!members.some((m) => m.role === "OWNER")) {
      push({ variant: "error", title: "A project must have at least one Owner." });
      return;
    }
    try {
      const board = await createBoard.mutateAsync({
        name: values.name,
        description: values.description || undefined,
        boardType: values.boardType,
        linkedRecordId: values.boardType === "LINKED" ? values.linkedRecordId : undefined,
        linkedRecordType: values.boardType === "LINKED" ? values.linkedRecordType : undefined,
        templateId: values.templateId || undefined,
        serviceId: serviceId ?? values.serviceId ?? undefined,
        customerId: customer?.id,
        members: members.map((m) => ({ userId: m.userId, role: m.role })),
      });
      push({ variant: "success", title: "Project created." });
      reset();
      setCustomer(null);
      setDirty(false);
      onClose();
      onCreated?.(board);
    } catch (err) {
      push({ variant: "error", title: "Could not create project", description: extractApiError(err).message });
    }
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      title="Create project"
      subtitle="Set up a new project for internal work, optionally linked to a commercial record."
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
              Project name
            </Label>
            <Input id="name" placeholder="e.g. Website Development" error={errors.name?.message} {...register("name", { required: "Project name is required." })} />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={2} placeholder="What is this project for?" {...register("description")} />
          </div>
          {!serviceId && (
            <div>
              <Label htmlFor="serviceId">Service</Label>
              <Select id="serviceId" {...register("serviceId")}>
                <option value="">None</option>
                {services?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <Label>Customer</Label>
            <CustomerPicker value={customer} onChange={setCustomer} placeholder="Search Customer Master by name or ID…" />
            <p className="mt-1 text-[11px] text-slate-400">Pulls from CRM — if this customer already exists, pick them instead of retyping their details.</p>
          </div>
        </section>

        <section className="space-y-3">
          <Label>Project type</Label>
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
            You can fine-tune stages, colours and WIP limits afterward from Project Settings.
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
