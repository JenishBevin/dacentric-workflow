import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Building2, Upload } from "lucide-react";
import { useCustomers, useCreateCustomer, useImportCustomers } from "../../api/customers";
import { Button, Input, Select, Badge, Skeleton, ErrorState, EmptyState } from "../../components/ui/primitives";
import { Drawer } from "../../components/ui/Drawer";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { CustomerStatus } from "../../lib/types";
import { can } from "../../lib/permissions";
import { useAuth } from "../../context/AuthContext";

const STATUS_TONE: Record<CustomerStatus, "green" | "slate" | "amber"> = {
  ACTIVE: "green",
  INACTIVE: "slate",
  PROSPECT: "amber",
};

export default function CustomersListPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const { data: customers, isLoading, isError, refetch } = useCustomers({ search: search || undefined, status: status || undefined });
  const [newOpen, setNewOpen] = useState(false);
  const canManage = can(user, "CRM_ERP_LINKING", "OWN");
  const importCustomers = useImportCustomers();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const result = await importCustomers.mutateAsync(file);
      push({
        variant: result.skipped.length ? "success" : "success",
        title: `Imported ${result.created} customer${result.created === 1 ? "" : "s"}.`,
        description: result.skipped.length ? `${result.skipped.length} row(s) skipped — see console for details.` : undefined,
      });
      if (result.skipped.length) console.warn("Customer import — skipped rows:", result.skipped);
    } catch (err) {
      push({ variant: "error", title: "Import failed", description: extractApiError(err).message });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500">Every customer's permanent record — profile, contacts, enquiries, projects, and documents in one place.</p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} loading={importCustomers.isPending}>
                <Upload className="h-4 w-4" /> Import from Excel
              </Button>
            </>
          )}
          {canManage && (
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" /> New Customer
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search by name, ID, contact or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-40">
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PROSPECT">Prospect</option>
          <option value="INACTIVE">Inactive</option>
        </Select>
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}
      {isError && <ErrorState message="Could not load customers." onRetry={() => refetch()} />}
      {customers && customers.length === 0 && (
        <EmptyState icon={<Building2 className="h-8 w-8" />} title="No customers yet." description="Create one to start tracking enquiries and projects against it." />
      )}

      {customers && customers.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Main Contact</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Account Manager</th>
                <th className="px-4 py-2.5 text-right">Enquiries</th>
                <th className="px-4 py-2.5 text-right">Projects</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Link to={`/workflow/customers/${c.id}`} className="font-medium text-brand-700 hover:underline">
                      {c.name}
                    </Link>
                    <p className="font-mono text-xs text-slate-400">{c.customerId}</p>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {c.mainContactName ?? <span className="text-slate-400">—</span>}
                    {c.phone && <span className="block text-xs text-slate-400">{c.phone}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{c.accountManager?.name ?? <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{c.enquiryCount}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{c.projectCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewCustomerDrawer open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

const NewCustomerDrawer: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { push } = useToast();
  const createCustomer = useCreateCustomer();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [mainContactName, setMainContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<CustomerStatus>("PROSPECT");

  function reset() {
    setName("");
    setIndustry("");
    setCountry("");
    setMainContactName("");
    setEmail("");
    setPhone("");
    setStatus("PROSPECT");
  }

  async function submit() {
    if (!name.trim()) {
      push({ variant: "error", title: "Customer name is required." });
      return;
    }
    try {
      await createCustomer.mutateAsync({ name: name.trim(), industry, country, mainContactName, email, phone, status });
      push({ variant: "success", title: "Customer created." });
      reset();
      onClose();
    } catch (err) {
      push({ variant: "error", title: "Could not create customer", description: extractApiError(err).message });
    }
  }

  return (
    <Drawer
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="New Customer"
      subtitle="Creates a permanent Customer ID — enquiries and projects link to it going forward."
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button onClick={submit} loading={createCustomer.isPending}>
            Create Customer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Company / Customer Name <span className="text-red-500">*</span>
          </label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ABC Technologies" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Industry</label>
            <Input value={industry} onChange={(e) => setIndustry(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Country</label>
            <Input value={country} onChange={(e) => setCountry(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Main Contact Person</label>
          <Input value={mainContactName} onChange={(e) => setMainContactName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
          <Select value={status} onChange={(e) => setStatus(e.target.value as CustomerStatus)}>
            <option value="PROSPECT">Prospect</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </div>
      </div>
    </Drawer>
  );
};
