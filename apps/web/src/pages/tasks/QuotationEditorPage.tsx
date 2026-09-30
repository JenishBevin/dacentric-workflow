import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, ChevronDown, Download, FileSpreadsheet, History, Plus, Save, Trash2, Eye, BarChart3 } from "lucide-react";
import { useTask } from "../../api/tasks";
import { useQuotations, useQuotation, useCreateQuotation, useUpdateQuotation, Quotation, QuotationLineItemInput } from "../../api/tasks";
import { useCustomerDetail } from "../../api/customers";
import { downloadExport } from "../../api/misc";
import { Button, Input, Label, Select, Badge, Skeleton, ErrorState } from "../../components/ui/primitives";
import { Drawer } from "../../components/ui/Drawer";
import { Modal } from "../../components/ui/Modal";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { boardPath } from "../../lib/boardPath";
import { generateQuotationPdf, DEFAULT_PAYMENT_TERMS, DEFAULT_NOTES, DEFAULT_GENERAL_TERMS } from "../../lib/quotationPdf";

interface RowForm {
  description: string;
  qty: string;
  unit: string;
  unitPrice: string;
  vendorName: string;
  vendorContact: string;
  buyingCost: string;
  marginPercent: string; // blank = use the quotation's default margin (MARGIN mode only)
  // MARGIN: the selling price follows buying cost + margin %. PRICE: the selling price was typed in, and the
  // margin % shown is worked out from it. Typing in either box switches the line to that mode.
  priceMode: "MARGIN" | "PRICE";
}

const emptyRow = (): RowForm => ({ description: "", qty: "1", unit: "Nos", unitPrice: "", vendorName: "", vendorContact: "", buyingCost: "", marginPercent: "", priceMode: "MARGIN" });

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// e.g. "QPTS-2026-0006" -> "QPTS/QN/2026-0006" — the quotation's suggested reference number.
function defaultQuotationRef(estimationId?: string | null): string {
  return estimationId ? estimationId.replace(/^QPTS-/, "QPTS/QN/") : "";
}

const TEXTAREA = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:focus-ring";
const CELL_INPUT = "!py-1.5 !text-sm";

/** Full-page quotation editor for an Estimation task (replaces the old pop-up): edit the proposal, keep every
 *  saved version under "Previous quotations", and price items from a costing sheet (buying cost + margin %). */
export default function QuotationEditorPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { push } = useToast();

  const { data: task, isLoading: taskLoading, isError: taskError } = useTask(taskId);
  const { data: versions, isLoading: versionsLoading, isError: versionsError, refetch: refetchVersions } = useQuotations(taskId);
  const { data: customer } = useCustomerDetail(task?.customerId ?? undefined);
  const createQuotation = useCreateQuotation(taskId ?? "");
  const updateQuotation = useUpdateQuotation(taskId ?? "");

  // Which saved version is being edited (null = a new, unsaved quotation). undefined until we've decided.
  const [activeId, setActiveId] = useState<string | null | undefined>(undefined);
  const { data: loaded, isLoading: loadedLoading } = useQuotation(taskId, activeId ?? undefined);

  const [title, setTitle] = useState("");
  const [ref, setRef] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientCompany, setRecipientCompany] = useState("");
  const [recipientLocation, setRecipientLocation] = useState("");
  const [currency, setCurrency] = useState("AED");
  const [vatRate, setVatRate] = useState("5");
  const [validityDays, setValidityDays] = useState("7");
  const [paymentTerms, setPaymentTerms] = useState(DEFAULT_PAYMENT_TERMS);
  const [notes, setNotes] = useState(DEFAULT_NOTES);
  const [generalTerms, setGeneralTerms] = useState(DEFAULT_GENERAL_TERMS);
  const [preparerName, setPreparerName] = useState("");
  const [preparerDesignation, setPreparerDesignation] = useState("");
  const [preparerMobile, setPreparerMobile] = useState("");
  const [rows, setRows] = useState<RowForm[]>([emptyRow()]);
  const [costingEnabled, setCostingEnabled] = useState(false);
  const [defaultMargin, setDefaultMargin] = useState("");

  const [historyOpen, setHistoryOpen] = useState(() => searchParams.get("history") === "1");
  const [busy, setBusy] = useState<string | null>(null);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [costingMenuOpen, setCostingMenuOpen] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<null | (() => void)>(null);
  // Saving a new quotation (first save, or "Save as new version") asks for a name that is unique on this task —
  // that name is what it's listed under in "Previous quotations". `after` runs once it has been saved.
  const [nameDialog, setNameDialog] = useState<null | { mode: "update" | "new"; preview: boolean; after: (saved: Quotation, previewWindow?: Window | null) => void | Promise<void> }>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState("");
  // Bumped every time the form is (re)filled from a saved version or a blank one; the effect below then records that
  // state as "clean" so only edits made after loading count as unsaved changes.
  const [populateTick, setPopulateTick] = useState(0);
  const [baselineSnap, setBaselineSnap] = useState("");
  const snapshotRef = useRef("");
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const costingMenuRef = useRef<HTMLDivElement>(null);

  // --- Which version to open first ---
  useEffect(() => {
    if (activeId !== undefined || !versions) return;
    const wanted = searchParams.get("q");
    if (searchParams.get("new") === "1") setActiveId(null);
    else if (wanted && versions.some((v) => v.id === wanted)) setActiveId(wanted);
    else setActiveId(versions[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions, activeId]);

  function applyQuotation(q: Quotation) {
    setTitle(q.title ?? "");
    setRef(q.quotationRef ?? defaultQuotationRef(task?.estimationId));
    setRecipientName(q.recipientName ?? "");
    setRecipientCompany(q.recipientCompany ?? "");
    setRecipientLocation(q.recipientLocation ?? "");
    setCurrency(q.currency);
    setVatRate(String(q.vatRate));
    setValidityDays(String(q.validityDays ?? 7));
    setPaymentTerms(q.paymentTerms ?? DEFAULT_PAYMENT_TERMS);
    setNotes(q.notes ?? DEFAULT_NOTES);
    setGeneralTerms(q.generalTerms ?? DEFAULT_GENERAL_TERMS);
    setPreparerName(q.preparerName ?? user?.name ?? "");
    setPreparerDesignation(q.preparerDesignation ?? user?.employee?.jobTitle ?? "");
    setPreparerMobile(q.preparerMobile ?? "");
    setCostingEnabled(q.costingEnabled);
    setDefaultMargin(q.marginPercent != null ? String(q.marginPercent) : "");
    setRows(
      q.lineItems.length
        ? q.lineItems.map((li) => ({
            description: li.description,
            qty: String(li.qty),
            unit: li.unit,
            unitPrice: String(li.unitPrice),
            vendorName: li.vendorName ?? "",
            vendorContact: li.vendorContact ?? "",
            buyingCost: li.buyingCost != null ? String(li.buyingCost) : "",
            marginPercent: li.priceMode !== "PRICE" && li.marginPercent != null ? String(li.marginPercent) : "",
            priceMode: li.priceMode === "PRICE" ? "PRICE" : "MARGIN",
          }))
        : [emptyRow()]
    );
  }

  function applyBlank() {
    setTitle("");
    setRef(defaultQuotationRef(task?.estimationId));
    setRecipientName(customer?.mainContactName ?? "");
    setRecipientCompany(customer?.name ?? "");
    setRecipientLocation(customer?.city || customer?.address || "");
    setCurrency("AED");
    setVatRate("5");
    setValidityDays("7");
    setPaymentTerms(DEFAULT_PAYMENT_TERMS);
    setNotes(DEFAULT_NOTES);
    setGeneralTerms(DEFAULT_GENERAL_TERMS);
    setPreparerName(user?.name ?? "");
    setPreparerDesignation(user?.employee?.jobTitle ?? "");
    setPreparerMobile("");
    setCostingEnabled(false);
    setDefaultMargin("");
    setRows([emptyRow()]);
  }

  // Populate the form whenever the version being edited changes (or, for a blank one, once the task + customer are known).
  useEffect(() => {
    if (activeId === undefined || !task) return;
    if (activeId === null) {
      applyBlank();
    } else if (loaded && loaded.id === activeId) {
      applyQuotation(loaded);
    } else {
      return;
    }
    setPopulateTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, loaded?.id, task?.id]);

  // A blank quotation prefills the recipient from the task's customer once it has loaded — only into fields still empty.
  useEffect(() => {
    if (activeId !== null || !customer) return;
    setRecipientName((v) => v || customer.mainContactName || "");
    setRecipientCompany((v) => v || customer.name || "");
    setRecipientLocation((v) => v || customer.city || customer.address || "");
    setPopulateTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id, activeId]);

  // What the form currently holds, for "unsaved changes" detection.
  const formSnapshot = JSON.stringify({ title, ref, recipientName, recipientCompany, recipientLocation, currency, vatRate, validityDays, paymentTerms, notes, generalTerms, preparerName, preparerDesignation, preparerMobile, rows, costingEnabled, defaultMargin });
  snapshotRef.current = formSnapshot;
  useEffect(() => {
    if (populateTick > 0) setBaselineSnap(snapshotRef.current);
  }, [populateTick]);
  const dirty = baselineSnap !== "" && baselineSnap !== formSnapshot;

  useEffect(() => {
    if (activeId === undefined) return;
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    next.delete("history");
    if (activeId) next.set("q", activeId);
    else next.delete("q");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) setDownloadMenuOpen(false);
      if (costingMenuRef.current && !costingMenuRef.current.contains(e.target as Node)) setCostingMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // --- Pricing (mirrors the server: with costing on, a line with a buying cost is priced as cost + margin) ---
  const marginDefaultNum = defaultMargin.trim() === "" || Number.isNaN(Number(defaultMargin)) ? 0 : Number(defaultMargin);

  function priceOf(row: RowForm): number {
    if (costingEnabled && row.buyingCost.trim() !== "" && Number.isFinite(Number(row.buyingCost))) {
      if (row.priceMode === "PRICE") return Number(row.unitPrice);
      const margin = row.marginPercent.trim() !== "" && Number.isFinite(Number(row.marginPercent)) ? Number(row.marginPercent) : marginDefaultNum;
      return round2(Number(row.buyingCost) * (1 + margin / 100));
    }
    return Number(row.unitPrice);
  }

  /** The margin % implied by a typed selling price (PRICE mode), shown in the margin box. */
  function derivedMargin(row: RowForm): string {
    const cost = Number(row.buyingCost);
    const price = Number(row.unitPrice);
    if (!Number.isFinite(cost) || cost <= 0 || row.unitPrice.trim() === "" || !Number.isFinite(price)) return "";
    return String(round2((price / cost - 1) * 100));
  }

  const parsed = useMemo(
    () =>
      rows
        .map((row) => ({ row, description: row.description.trim(), qty: Number(row.qty), unit: row.unit.trim() || "Nos", unitPrice: priceOf(row) }))
        .filter((r) => r.description && Number.isFinite(r.qty) && r.qty > 0 && Number.isFinite(r.unitPrice) && r.unitPrice >= 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, costingEnabled, defaultMargin]
  );

  const subtotal = parsed.reduce((sum, r) => sum + r.qty * r.unitPrice, 0);
  const vatNum = Number.isNaN(Number(vatRate)) ? 0 : Number(vatRate);
  const vatAmount = (subtotal * vatNum) / 100;
  const total = subtotal + vatAmount;
  const totalCost = parsed.reduce((sum, r) => sum + (costingEnabled && r.row.buyingCost.trim() !== "" ? r.qty * Number(r.row.buyingCost) : 0), 0);
  const costedSelling = parsed.reduce((sum, r) => sum + (costingEnabled && r.row.buyingCost.trim() !== "" ? r.qty * r.unitPrice : 0), 0);
  const profit = costedSelling - totalCost;

  function updateRow(i: number, patch: Partial<RowForm>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function buildPayload() {
    return {
      currency,
      title: title.trim(),
      quotationRef: ref.trim() || defaultQuotationRef(task?.estimationId),
      recipientName: recipientName.trim() || undefined,
      recipientCompany: recipientCompany.trim() || undefined,
      recipientLocation: recipientLocation.trim() || undefined,
      lineItems: parsed.map(({ row, description, qty, unit, unitPrice }): QuotationLineItemInput => {
        const item: QuotationLineItemInput = { description, qty, unit, unitPrice };
        if (row.vendorName.trim()) item.vendorName = row.vendorName.trim();
        if (row.vendorContact.trim()) item.vendorContact = row.vendorContact.trim();
        if (row.buyingCost.trim() !== "" && Number.isFinite(Number(row.buyingCost))) {
          item.buyingCost = Number(row.buyingCost);
          item.priceMode = row.priceMode;
          // In PRICE mode the margin is derived from the typed price (by the server), so only MARGIN mode sends one.
          if (row.priceMode === "MARGIN" && row.marginPercent.trim() !== "" && Number.isFinite(Number(row.marginPercent))) item.marginPercent = Number(row.marginPercent);
        }
        return item;
      }),
      vatRate: vatNum,
      validityDays: Number.isNaN(Number(validityDays)) || Number(validityDays) <= 0 ? 7 : Number(validityDays),
      paymentTerms: paymentTerms.trim() || undefined,
      notes: notes.trim() || undefined,
      generalTerms: generalTerms.trim() || undefined,
      preparerName: preparerName.trim() || undefined,
      preparerDesignation: preparerDesignation.trim() || undefined,
      preparerMobile: preparerMobile.trim() || undefined,
      costingEnabled,
      marginPercent: costingEnabled && defaultMargin.trim() !== "" ? marginDefaultNum : null,
    };
  }

  /** Saves the form. "update" writes onto the version being edited (or creates v1 if it's new); "new" always adds a fresh version. */
  async function persist(mode: "update" | "new", name?: string, onError?: (message: string) => void): Promise<Quotation | null> {
    if (!title.trim()) {
      push({ variant: "error", title: "Enter a title for the proposal." });
      return null;
    }
    if (parsed.length === 0) {
      push({ variant: "error", title: "Add at least one line item with a description, quantity and price." });
      return null;
    }
    try {
      const payload = { ...buildPayload(), ...(name ? { name } : {}) };
      const saved =
        mode === "update" && activeId
          ? await updateQuotation.mutateAsync({ quotationId: activeId, ...payload })
          : await createQuotation.mutateAsync(payload);
      setBaselineSnap(formSnapshot);
      if (saved.id !== activeId) setActiveId(saved.id);
      return saved;
    } catch (err) {
      const message = extractApiError(err).message;
      if (onError) onError(message);
      else push({ variant: "error", title: "Could not save quotation", description: message });
      return null;
    }
  }

  function askName(mode: "update" | "new", after: (saved: Quotation, previewWindow?: Window | null) => void | Promise<void>, preview = false) {
    setNameDraft(mode === "new" && activeVersion ? `${activeVersion.name ?? "Quotation"} (copy)` : `Quotation ${(versions?.length ?? 0) + 1}`);
    setNameError("");
    setNameDialog({ mode, preview, after });
  }

  async function confirmName() {
    if (!nameDialog) return;
    const name = nameDraft.trim();
    if (!name) {
      setNameError("Enter a name for this quotation.");
      return;
    }
    // A preview tab has to be opened inside this click, before any awaits, or the browser blocks it.
    const previewWindow = nameDialog.preview ? window.open("", "_blank") : null;
    setBusy("naming");
    const saved = await persist(nameDialog.mode, name, setNameError);
    if (saved) {
      const { after } = nameDialog;
      setNameDialog(null);
      try {
        await after(saved, previewWindow);
      } finally {
        setBusy(null);
      }
    } else {
      previewWindow?.close();
      setBusy(null);
    }
  }

  async function handleSave(mode: "update" | "new") {
    const done = (saved: Quotation) =>
      push({ variant: "success", title: mode === "new" ? `Saved "${saved.name}" (version ${saved.versionNumber}).` : `"${saved.name}" saved.` });
    if (mode === "new" || !activeId) {
      askName(mode, done);
      return;
    }
    setBusy(mode);
    const saved = await persist(mode);
    setBusy(null);
    if (saved) done(saved);
  }

  async function handleOutput(kind: "preview" | "with" | "without" | "both", previewWindow?: Window | null) {
    if (!activeId) {
      // Never saved yet — name and save it first, then produce the PDF.
      askName("update", (saved, win) => generateOutput(kind, saved, win), kind === "preview");
      return;
    }
    setBusy(kind);
    try {
      const saved = await persist("update");
      if (!saved) {
        previewWindow?.close();
        return;
      }
      await generateOutput(kind, saved, previewWindow);
    } finally {
      setBusy(null);
    }
  }

  async function generateOutput(kind: "preview" | "with" | "without" | "both", saved: Quotation, previewWindow?: Window | null) {
    try {
      const pdfInput = {
        refId: saved.quotationRef ?? "",
        projectName: task?.title ?? "",
        title: saved.title ?? "",
        recipientName: recipientName.trim(),
        recipientCompany: recipientCompany.trim(),
        recipientLocation: recipientLocation.trim(),
        currency: saved.currency,
        // Only description / qty / unit / selling price go on the customer's PDF — never the costing columns.
        lineItems: saved.lineItems.map(({ description, qty, unit, unitPrice }) => ({ description, qty, unit, unitPrice })),
        vatRate: saved.vatRate,
        subtotal: saved.subtotal,
        vatAmount: saved.vatAmount,
        totalAmount: saved.totalAmount,
        validityDays: saved.validityDays ?? 7,
        paymentTerms: saved.paymentTerms ?? DEFAULT_PAYMENT_TERMS,
        notes: saved.notes ?? DEFAULT_NOTES,
        generalTerms: saved.generalTerms ?? DEFAULT_GENERAL_TERMS,
        preparerName: preparerName.trim(),
        preparerDesignation: preparerDesignation.trim(),
        preparerMobile: preparerMobile.trim(),
      };
      if (kind === "preview") {
        await generateQuotationPdf({ ...pdfInput, hidePrices: false }, { preview: true, previewWindow });
        push({ variant: "success", title: "Preview opened in a new tab." });
      } else {
        if (kind === "with" || kind === "both") await generateQuotationPdf({ ...pdfInput, hidePrices: false });
        if (kind === "without" || kind === "both") await generateQuotationPdf({ ...pdfInput, hidePrices: true });
        push({ variant: "success", title: "Quotation downloaded.", description: "Upload the PDF to the task's Attachments." });
      }
    } catch (err) {
      previewWindow?.close();
      push({ variant: "error", title: "Could not create the quotation PDF", description: extractApiError(err).message });
    }
  }

  async function downloadCostingSheet(saved: Quotation) {
    try {
      const safeName = (saved.name ?? saved.quotationRef ?? "quotation").replace(/[^\w.-]+/g, "-");
      await downloadExport(`/tasks/${taskId}/quotations/${saved.id}/costing-sheet`, {}, `costing-sheet-${safeName}-v${saved.versionNumber}.xlsx`);
      push({ variant: "success", title: "Costing sheet downloaded." });
    } catch (err) {
      push({ variant: "error", title: "Could not download the costing sheet", description: extractApiError(err).message });
    }
  }

  async function handleCostingSheet() {
    if (!activeId) {
      askName("update", downloadCostingSheet);
      return;
    }
    setBusy("costing");
    try {
      const saved = await persist("update");
      if (saved) await downloadCostingSheet(saved);
    } finally {
      setBusy(null);
    }
  }

  function viewCostingSheet(saved: Quotation) {
    navigate(`/workflow/tasks/${taskId}/quotations?q=${saved.id}`);
  }

  async function handleViewCostingSheet() {
    if (!activeId) {
      askName("update", viewCostingSheet);
      return;
    }
    // View on the read-only page reflects what's actually saved, so save any pending edits first.
    if (!dirty) {
      viewCostingSheet({ id: activeId } as Quotation);
      return;
    }
    setBusy("viewCosting");
    try {
      const saved = await persist("update");
      if (saved) viewCostingSheet(saved);
    } finally {
      setBusy(null);
    }
  }

  const backPath = task ? `${boardPath(task.board?.name, task.boardId)}?task=${task.id}` : "/workflow/estimation";

  // Anything that would throw away unsaved edits asks first.
  function guard(action: () => void) {
    if (dirty) setPendingLeave(() => action);
    else action();
  }

  function openVersion(id: string | null) {
    setHistoryOpen(false);
    guard(() => {
      if (id !== activeId) setActiveId(id);
      else if (id === null) {
        applyBlank();
        setPopulateTick((t) => t + 1);
      }
    });
  }

  // --- Render ---
  if (taskLoading || versionsLoading || activeId === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (taskError || versionsError || !task) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <ErrorState message="Could not open the quotation. It may not be an Estimation task, or you may not have edit rights on it." onRetry={() => refetchVersions()} />
      </div>
    );
  }

  const activeVersion = versions?.find((v) => v.id === activeId);
  const saving = createQuotation.isPending || updateQuotation.isPending;
  const disabled = busy !== null || saving;

  return (
    <div className="space-y-4 pb-10">
      {/* Top bar */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:shadow-card">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => guard(() => navigate(backPath))}>
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to task</span>
              <span className="sm:hidden">Back</span>
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">Quotation — {task.title}</p>
              <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{task.taskId}</span>
                {task.estimationId && <span>· {task.estimationId}</span>}
                {activeVersion ? (
                  <Badge tone="indigo" className="max-w-full truncate">
                    Editing "{activeVersion.name ?? `Version ${activeVersion.versionNumber}`}" · v{activeVersion.versionNumber}
                  </Badge>
                ) : (
                  <Badge tone="amber">New quotation — not saved yet</Badge>
                )}
                {dirty && <span className="font-medium text-amber-600">Unsaved changes</span>}
              </p>
            </div>
          </div>
          {/* Scrolls horizontally on phones/tablets instead of wrapping into a tall stack of button rows. */}
          <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => setHistoryOpen(true)}>
              <History className="h-4 w-4" /> Previous quotations{versions && versions.length > 0 ? ` (${versions.length})` : ""}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={disabled}
              loading={busy === "preview"}
              onClick={() => {
                // Must open synchronously in this click handler — opening it after the awaits in handleOutput is past
                // the window most browsers allow for a user-gesture popup.
                const win = activeId ? window.open("", "_blank") : null;
                handleOutput("preview", win);
              }}
            >
              <Eye className="h-4 w-4" /> Preview
            </Button>
            <div className="relative shrink-0" ref={downloadMenuRef}>
              <Button variant="outline" size="sm" disabled={disabled} loading={busy === "with" || busy === "without" || busy === "both"} onClick={() => setDownloadMenuOpen((o) => !o)}>
                <Download className="h-4 w-4" /> Download <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              {downloadMenuOpen && (
                <div className="absolute right-0 z-30 mt-1 w-52 rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
                  {(
                    [
                      ["with", "PDF with price"],
                      ["without", "PDF without price"],
                      ["both", "Both PDFs"],
                    ] as const
                  ).map(([kind, label]) => (
                    <button
                      key={kind}
                      onClick={() => {
                        setDownloadMenuOpen(false);
                        handleOutput(kind);
                      }}
                      className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {costingEnabled && (
              <div className="relative shrink-0" ref={costingMenuRef}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  loading={busy === "costing" || busy === "viewCosting"}
                  onClick={() => setCostingMenuOpen((o) => !o)}
                >
                  <FileSpreadsheet className="h-4 w-4" /> Costing sheet <ChevronDown className="h-3.5 w-3.5" />
                </Button>
                {costingMenuOpen && (
                  <div className="absolute right-0 z-30 mt-1 w-52 rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
                    <button
                      onClick={() => {
                        setCostingMenuOpen(false);
                        handleViewCostingSheet();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <BarChart3 className="h-3.5 w-3.5 text-slate-400" /> View on page
                    </button>
                    <button
                      onClick={() => {
                        setCostingMenuOpen(false);
                        handleCostingSheet();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <Download className="h-3.5 w-3.5 text-slate-400" /> Download (.xlsx)
                    </button>
                  </div>
                )}
              </div>
            )}
            {activeId && (
              <Button variant="outline" size="sm" className="shrink-0" disabled={disabled} loading={busy === "new"} onClick={() => handleSave("new")}>
                <Plus className="h-4 w-4" /> Save as new version
              </Button>
            )}
            <Button size="sm" className="shrink-0" disabled={disabled} loading={busy === "update"} onClick={() => handleSave("update")}>
              <Save className="h-4 w-4" /> {activeId ? "Save" : "Save quotation"}
            </Button>
          </div>
        </div>
        {activeVersion && (
          <p className="mt-2 hidden text-xs text-slate-500 sm:block">
            <strong>Save</strong> updates "{activeVersion.name ?? `v${activeVersion.versionNumber}`}"; <strong>Save as new version</strong> keeps it exactly as it is and saves a new one under a new name.
          </p>
        )}
      </div>

      {loadedLoading && activeId ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* min-w-0: below lg this grid has no explicit columns, so a grid item otherwise defaults to
              min-width:auto and the line-items table's min-width would silently force this column (and the
              wide content inside it) past the viewport — clipped with no scrollbar by AppLayout's overflow-hidden shell. */}
          <div className="min-w-0 space-y-4">
            {/* Details */}
            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="md:col-span-2">
                  <Label required>Title</Label>
                  <Input placeholder="e.g. Proposal For Supply and Installation of Server" value={title} onChange={(e) => setTitle(e.target.value)} className="py-2.5" />
                </div>
                <div>
                  <Label>Reference No.</Label>
                  <Input placeholder="QPTS/QN/2026-0006" value={ref} onChange={(e) => setRef(e.target.value)} className="py-2.5" />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label>Recipient name</Label>
                  <Input placeholder="Mr. Dilip" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className="py-2.5" />
                </div>
                <div>
                  <Label>Recipient company</Label>
                  <Input placeholder="Telal Resort" value={recipientCompany} onChange={(e) => setRecipientCompany(e.target.value)} className="py-2.5" />
                </div>
                <div>
                  <Label>Location</Label>
                  <Input placeholder="Al Ain" value={recipientLocation} onChange={(e) => setRecipientLocation(e.target.value)} className="py-2.5" />
                </div>
              </div>
            </section>

            {/* Items + costing */}
            <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Label required className="!mb-0">Line items</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                    <input type="checkbox" checked={costingEnabled} onChange={(e) => setCostingEnabled(e.target.checked)} />
                    Use costing sheet
                  </label>
                  {costingEnabled && (
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-600" htmlFor="default-margin">
                        Margin %
                      </label>
                      <Input id="default-margin" type="number" min="0" step="0.01" placeholder="e.g. 20" value={defaultMargin} onChange={(e) => setDefaultMargin(e.target.value)} className="!w-24 !py-1.5" />
                      <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, marginPercent: "", priceMode: "MARGIN" })))}>
                        Apply to all
                      </Button>
                    </div>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
                    <Plus className="h-3.5 w-3.5" /> Add item
                  </Button>
                </div>
              </div>
              {costingEnabled && (
                <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                  Enter each item's buying cost and vendor, then either type a margin % (the selling price is worked out as buying cost + margin — a line's own margin, else the default above)
                  or type the selling price you want and the margin % is worked out for you. Costing details stay internal — they never appear on the customer's PDF.
                </p>
              )}

              <div className="overflow-x-auto">
                <table className={`w-full text-sm ${costingEnabled ? "min-w-[1150px]" : "min-w-[720px]"}`}>
                  <thead className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-8 px-1 py-2">#</th>
                      <th className="min-w-[220px] px-1 py-2">Description</th>
                      <th className="w-20 px-1 py-2">Qty</th>
                      <th className="w-20 px-1 py-2">Unit</th>
                      {costingEnabled && (
                        <>
                          <th className="w-36 px-1 py-2">Vendor</th>
                          <th className="w-36 px-1 py-2">Vendor contact</th>
                          <th className="w-28 px-1 py-2">Buying cost</th>
                          <th className="w-24 px-1 py-2">Margin %</th>
                        </>
                      )}
                      <th className="w-28 px-1 py-2">{costingEnabled ? "Selling price" : "Unit price"}</th>
                      <th className="w-28 px-1 py-2 text-right">Amount</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const useCost = costingEnabled && row.buyingCost.trim() !== "";
                      const price = priceOf(row);
                      const amount = Number(row.qty) * price;
                      return (
                        <tr key={i} className="border-t border-slate-100 align-top">
                          <td className="px-1 py-2 text-xs text-slate-400">{i + 1}</td>
                          <td className="px-1 py-2">
                            <textarea rows={2} placeholder="Item description" value={row.description} onChange={(e) => updateRow(i, { description: e.target.value })} className={TEXTAREA} />
                          </td>
                          <td className="px-1 py-2">
                            <Input type="number" min="0" step="1" value={row.qty} onChange={(e) => updateRow(i, { qty: e.target.value })} className={CELL_INPUT} />
                          </td>
                          <td className="px-1 py-2">
                            <Input value={row.unit} onChange={(e) => updateRow(i, { unit: e.target.value })} className={CELL_INPUT} />
                          </td>
                          {costingEnabled && (
                            <>
                              <td className="px-1 py-2">
                                <Input placeholder="Vendor" value={row.vendorName} onChange={(e) => updateRow(i, { vendorName: e.target.value })} className={CELL_INPUT} />
                              </td>
                              <td className="px-1 py-2">
                                <Input placeholder="Phone / email / quote ref" value={row.vendorContact} onChange={(e) => updateRow(i, { vendorContact: e.target.value })} className={CELL_INPUT} />
                              </td>
                              <td className="px-1 py-2">
                                <Input type="number" min="0" step="0.01" placeholder="0.00" value={row.buyingCost} onChange={(e) => updateRow(i, { buyingCost: e.target.value })} className={CELL_INPUT} />
                              </td>
                              <td className="px-1 py-2">
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder={defaultMargin || "default"}
                                  value={row.priceMode === "PRICE" ? derivedMargin(row) : row.marginPercent}
                                  onChange={(e) => updateRow(i, { marginPercent: e.target.value, priceMode: "MARGIN" })}
                                  className={`${CELL_INPUT} ${row.priceMode === "PRICE" ? "bg-slate-50 italic" : ""}`}
                                  title={row.priceMode === "PRICE" ? "Worked out from the selling price you typed" : "Type a margin % and the selling price follows"}
                                />
                              </td>
                            </>
                          )}
                          <td className="px-1 py-2">
                            {useCost ? (
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={row.priceMode === "PRICE" ? row.unitPrice : Number.isFinite(price) ? price.toFixed(2) : ""}
                                onChange={(e) => updateRow(i, { unitPrice: e.target.value, priceMode: "PRICE" })}
                                className={`${CELL_INPUT} ${row.priceMode === "PRICE" ? "" : "bg-slate-50"}`}
                                title="Type a selling price and the margin % is worked out from it"
                              />
                            ) : (
                              <Input type="number" min="0" step="0.01" placeholder="0.00" value={row.unitPrice} onChange={(e) => updateRow(i, { unitPrice: e.target.value })} className={CELL_INPUT} />
                            )}
                          </td>
                          <td className="px-1 py-2 text-right text-sm font-medium text-slate-800">{Number.isFinite(amount) && amount > 0 ? money(amount) : "—"}</td>
                          <td className="px-1 py-2">
                            <button
                              type="button"
                              onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs))}
                              disabled={rows.length === 1}
                              className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                              aria-label={`Remove item ${i + 1}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Terms */}
            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <Label>Payment terms</Label>
                <textarea rows={2} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className={TEXTAREA} />
                <p className="mt-1 text-[11px] text-slate-400">One line per item.</p>
              </div>
              <div>
                <Label>Notes</Label>
                <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={TEXTAREA} />
                <p className="mt-1 text-[11px] text-slate-400">One line per item — numbered automatically.</p>
              </div>
              <div>
                <Label>General Terms and Conditions</Label>
                <textarea rows={6} value={generalTerms} onChange={(e) => setGeneralTerms(e.target.value)} className={TEXTAREA} />
                <p className="mt-1 text-[11px] text-slate-400">One line per item — numbered automatically.</p>
              </div>
              <div>
                <Label className="!mb-2">Thanks &amp; Regards</Label>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label className="!text-xs">Name</Label>
                    <Input placeholder="Preparer name" value={preparerName} onChange={(e) => setPreparerName(e.target.value)} className="py-2.5" />
                  </div>
                  <div>
                    <Label className="!text-xs">Designation</Label>
                    <Input placeholder="Assistant Manager" value={preparerDesignation} onChange={(e) => setPreparerDesignation(e.target.value)} className="py-2.5" />
                  </div>
                  <div>
                    <Label className="!text-xs">Mobile</Label>
                    <Input placeholder="+971 5xxxxxxxx" value={preparerMobile} onChange={(e) => setPreparerMobile(e.target.value)} className="py-2.5" />
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Summary */}
          <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start">
            <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="!text-xs">Currency</Label>
                  <Select
                    value={currency}
                    onChange={(e) => {
                      setCurrency(e.target.value);
                      setVatRate(e.target.value === "AED" ? "5" : "0");
                    }}
                    className="!py-2"
                  >
                    {["AED", "USD", "EUR", "GBP", "SAR"].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label className="!text-xs">VAT %</Label>
                  <Input type="number" min="0" max="100" step="0.01" value={vatRate} onChange={(e) => setVatRate(e.target.value)} className="!py-2" />
                </div>
                <div>
                  <Label className="!text-xs">Valid (days)</Label>
                  <Input type="number" min="1" step="1" value={validityDays} onChange={(e) => setValidityDays(e.target.value)} className="!py-2" />
                </div>
              </div>
            </section>

            <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quotation total</p>
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>
                  {currency} {money(subtotal)}
                </span>
              </div>
              {vatNum > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>VAT ({vatRate}%)</span>
                  <span>
                    {currency} {money(vatAmount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-semibold text-slate-900">
                <span>Total</span>
                <span>
                  {currency} {money(total)}
                </span>
              </div>
            </section>

            {costingEnabled && (
              <section className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Costing (internal)</p>
                <div className="flex justify-between text-slate-700">
                  <span>Total buying cost</span>
                  <span>
                    {currency} {money(totalCost)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>Selling (costed items)</span>
                  <span>
                    {currency} {money(costedSelling)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-indigo-100 pt-2 font-semibold text-indigo-900">
                  <span>Profit</span>
                  <span>
                    {currency} {money(profit)}
                    {totalCost > 0 && <span className="ml-1 text-xs font-normal">({((profit / totalCost) * 100).toFixed(1)}% on cost)</span>}
                  </span>
                </div>
              </section>
            )}
          </aside>
        </div>
      )}

      {/* Previous quotations */}
      <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} title="Previous quotations" subtitle={task.title} widthClassName="md:w-[480px]">
        <div className="space-y-3">
          <Button variant="outline" size="sm" onClick={() => openVersion(null)}>
            <Plus className="h-4 w-4" /> Start a blank quotation
          </Button>
          {(!versions || versions.length === 0) && <p className="py-6 text-center text-sm text-slate-400">No quotations saved for this task yet.</p>}
          {versions?.map((v) => (
            <div key={v.id} className={`rounded-lg border p-3 ${v.id === activeId ? "border-brand-300 bg-brand-50/40" : "border-slate-200"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Badge tone="indigo">v{v.versionNumber}</Badge>
                    <span className="truncate">{v.name || v.title || "Untitled quotation"}</span>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {[v.name ? v.title : null, v.quotationRef].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-slate-800">
                  {v.currency} {money(v.totalAmount)}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  {v.itemCount} item{v.itemCount === 1 ? "" : "s"} · {v.createdByName ?? "Unknown"} · {format(new Date(v.updatedAt), "d MMM yyyy, HH:mm")}
                  {v.costingEnabled && " · costing"}
                </span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => guard(() => navigate(`/workflow/tasks/${task.id}/quotations?q=${v.id}`))}>
                    View with costing
                  </Button>
                  {v.id === activeId ? (
                    <Badge tone="green">Editing</Badge>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => openVersion(v.id)}>
                      Edit this
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Drawer>

      <Modal
        open={!!nameDialog}
        onClose={() => busy !== "naming" && setNameDialog(null)}
        title={nameDialog?.mode === "new" && activeId ? "Save as new version" : "Save quotation"}
        description="Give it a name that's unique on this task — it's how you'll find it under Previous quotations."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setNameDialog(null)} disabled={busy === "naming"}>
              Cancel
            </Button>
            <Button onClick={confirmName} loading={busy === "naming"}>
              Save
            </Button>
          </>
        }
      >
        <div>
          <Label required>Quotation name</Label>
          <Input
            autoFocus
            value={nameDraft}
            onChange={(e) => {
              setNameDraft(e.target.value);
              setNameError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmName();
            }}
            placeholder="e.g. Client budget option, Revised after site visit"
            maxLength={80}
            error={nameError || undefined}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!pendingLeave}
        title="Unsaved changes"
        message="You have changes that haven't been saved. Leave without saving them?"
        confirmLabel="Discard changes"
        onCancel={() => setPendingLeave(null)}
        onConfirm={() => {
          const action = pendingLeave;
          setPendingLeave(null);
          action?.();
        }}
      />
    </div>
  );
}
