import React, { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Lock, Upload, Plus, Search, Trash2, Mail, Phone, Building2, ChevronRight, Globe, FileText, MapPin, StickyNote, Users as UsersIcon, Tag, Award } from "lucide-react";
import { EmptyState, Button, Input, Select, Badge, Skeleton, ErrorState, Label, Textarea } from "../../components/ui/primitives";
import { Drawer } from "../../components/ui/Drawer";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useVendors, useVendorFilterOptions, useImportVendors, useCreateVendor, useDeleteVendor, useUpdateVendorDetails, Vendor } from "../../api/vendors";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { isSuperAdmin } from "../../lib/permissions";
import { extractApiError } from "../../lib/apiClient";

function ChipList({ items, tone, max }: { items: string[]; tone: "indigo" | "slate"; max?: number }) {
  const shown = max ? items.slice(0, max) : items;
  const extra = items.length - shown.length;
  if (items.length === 0) return <span className="text-xs text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((s) => (
        <Badge key={s} tone={tone}>
          {s}
        </Badge>
      ))}
      {extra > 0 && <Badge tone="slate">+{extra} more</Badge>}
    </div>
  );
}

type TileTone = "blue" | "purple" | "amber" | "emerald";
const TILE_TONES: Record<TileTone, { box: string; border: string }> = {
  blue: { box: "bg-blue-50 text-blue-600", border: "border-blue-100" },
  purple: { box: "bg-purple-50 text-purple-600", border: "border-purple-100" },
  amber: { box: "bg-amber-50 text-amber-600", border: "border-amber-100" },
  emerald: { box: "bg-emerald-50 text-emerald-600", border: "border-emerald-100" },
};

function StatTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: TileTone }) {
  const t = TILE_TONES[tone];
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
      <div className={clsx("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border", t.box, t.border)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-2xl font-semibold leading-tight text-slate-900">{value}</p>
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
      </div>
    </div>
  );
}

/** Vendor Master (ERP's first real feature) — a supplier directory bulk
 * imported from the company's own supplier spreadsheet, browsable by the
 * brand and service category each one carries. */
function VendorMaster() {
  const { user } = useAuth();
  const { push } = useToast();
  // Bulk import stays Super Admin only (same reasoning as the
  // Enquiry/Estimation Excel imports — see vendors.routes.ts); adding one by
  // hand is also open to Management, Admin & Finance and Procurement, who
  // deal with suppliers day to day; editing/deleting an existing record
  // stays narrower still (Super Admin + Management).
  const canImport = isSuperAdmin(user);
  const canAddVendor = isSuperAdmin(user) || !!user?.roles.some((r) => r === "MANAGEMENT" || r === "ESTIMATION" || r === "PROCUREMENT");
  const canEditDelete = isSuperAdmin(user) || !!user?.roles.includes("MANAGEMENT");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("");
  const [service, setService] = useState("");
  const [selected, setSelected] = useState<Vendor | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Vendor | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data: vendors, isLoading, isError, refetch } = useVendors({ search: search || undefined, brand: brand || undefined, service: service || undefined });
  const { data: filterOptions } = useVendorFilterOptions();
  const importVendors = useImportVendors();
  const deleteVendor = useDeleteVendor();

  // Keep the open drawer in sync with the live list (e.g. after a save
  // invalidates the query and refetches with the vendor's new details).
  useEffect(() => {
    if (!selected || !vendors) return;
    const fresh = vendors.find((v) => v.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [vendors, selected]);

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const result = await importVendors.mutateAsync(file);
      push({
        variant: "success",
        title: `${result.vendorsCreated} vendor(s) added, ${result.vendorsUpdated} updated.`,
        description: `${result.brandsFound} brand(s) across ${result.servicesFound} service categor${result.servicesFound === 1 ? "y" : "ies"}.${result.rowsSkipped ? ` ${result.rowsSkipped} row(s) skipped (no supplier name).` : ""}`,
      });
    } catch (err) {
      push({ variant: "error", title: "Import failed", description: extractApiError(err).message });
    }
  }

  const filtersActive = !!search || !!brand || !!service;
  const totalContacts = vendors?.reduce((sum, v) => sum + v.contacts.length, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Vendor List</h1>
          <p className="text-sm text-slate-500">Supplier directory — browse by brand or service category. Click a vendor for full details.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canImport && (
            <>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFilePicked} />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} loading={importVendors.isPending}>
                <Upload className="h-4 w-4" /> Import from Excel
              </Button>
            </>
          )}
          {canAddVendor && (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add Vendor
            </Button>
          )}
        </div>
      </div>

      {vendors && vendors.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile icon={<Building2 className="h-5 w-5" />} label="Vendors" value={vendors.length} tone="blue" />
          <StatTile icon={<Award className="h-5 w-5" />} label="Brands" value={filterOptions?.brands.length ?? 0} tone="purple" />
          <StatTile icon={<Tag className="h-5 w-5" />} label="Service categories" value={filterOptions?.services.length ?? 0} tone="amber" />
          <StatTile icon={<UsersIcon className="h-5 w-5" />} label="Contacts" value={totalContacts} tone="emerald" />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search vendors by name…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={service} onChange={(e) => setService(e.target.value)} className="sm:w-56" aria-label="Service">
          <option value="">All services</option>
          {filterOptions?.services.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select value={brand} onChange={(e) => setBrand(e.target.value)} className="sm:w-56" aria-label="Brand">
          <option value="">All brands</option>
          {filterOptions?.brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </Select>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      )}

      {isError && <ErrorState message="Could not load vendors." onRetry={() => refetch()} />}

      {!isLoading && !isError && vendors && vendors.length === 0 && (
        <EmptyState
          icon={<Building2 className="h-8 w-8" />}
          title={filtersActive ? "No vendors match these filters." : "No vendors yet."}
          description={filtersActive ? "Try clearing the search or filters." : canImport ? "Import your supplier spreadsheet to get started." : "Ask a Super Admin to import the supplier list."}
        />
      )}

      {!isLoading && !isError && vendors && vendors.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Vendor</th>
                <th className="px-4 py-2.5">Services</th>
                <th className="px-4 py-2.5">Brands</th>
                <th className="px-4 py-2.5">Contacts</th>
                <th className="w-8 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr
                  key={v.id}
                  onClick={() => setSelected(v)}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="max-w-[12rem] px-4 py-3 font-medium text-slate-900">
                    {v.name}
                    {(v.website || v.vatNumber) && <span className="mt-0.5 block text-xs font-normal text-slate-400">{v.website ? "Has website" : "Has VAT number"} on file</span>}
                  </td>
                  <td className="max-w-[14rem] px-4 py-3">
                    <ChipList items={v.services} tone="indigo" max={2} />
                  </td>
                  <td className="max-w-[14rem] px-4 py-3">
                    <ChipList items={v.brands} tone="slate" max={2} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {v.contacts.length === 0 ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <span>
                        {v.contacts[0].name ?? "1 contact"}
                        {v.contacts.length > 1 && <span className="text-xs text-slate-400"> +{v.contacts.length - 1} more</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <ChevronRight className="ml-auto h-4 w-4 text-slate-300" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <VendorDetailDrawer
        vendor={selected}
        canManage={canEditDelete}
        onClose={() => setSelected(null)}
        onRequestDelete={(v) => setPendingDelete(v)}
      />

      <NewVendorDrawer open={addOpen} onClose={() => setAddOpen(false)} />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete vendor"
        message={
          <>
            Are you sure you want to delete <strong>&ldquo;{pendingDelete?.name}&rdquo;</strong>? This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        loading={deleteVendor.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteVendor.mutateAsync(pendingDelete.id);
            push({ variant: "success", title: "Vendor deleted." });
            setSelected(null);
          } catch (err) {
            push({ variant: "error", title: "Could not delete vendor", description: extractApiError(err).message });
          }
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

function VendorDetailDrawer({
  vendor,
  canManage,
  onClose,
  onRequestDelete,
}: {
  vendor: Vendor | null;
  canManage: boolean;
  onClose: () => void;
  onRequestDelete: (v: Vendor) => void;
}) {
  const { push } = useToast();
  const updateDetails = useUpdateVendorDetails();

  const [website, setWebsite] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setWebsite(vendor?.website ?? "");
    setVatNumber(vendor?.vatNumber ?? "");
    setAddress(vendor?.address ?? "");
    setNotes(vendor?.notes ?? "");
  }, [vendor?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!vendor) return null;

  const dirty =
    website !== (vendor.website ?? "") || vatNumber !== (vendor.vatNumber ?? "") || address !== (vendor.address ?? "") || notes !== (vendor.notes ?? "");

  async function handleSave() {
    if (!vendor) return;
    try {
      await updateDetails.mutateAsync({
        id: vendor.id,
        input: { website: website || null, vatNumber: vatNumber || null, address: address || null, notes: notes || null },
      });
      push({ variant: "success", title: "Vendor details saved." });
    } catch (err) {
      push({ variant: "error", title: "Could not save vendor details", description: extractApiError(err).message });
    }
  }

  return (
    <Drawer
      open={!!vendor}
      onClose={onClose}
      title={vendor.name}
      subtitle={`${vendor.services.length} service categor${vendor.services.length === 1 ? "y" : "ies"} · ${vendor.brands.length} brand${vendor.brands.length === 1 ? "" : "s"} · ${vendor.contacts.length} contact${vendor.contacts.length === 1 ? "" : "s"}`}
      footer={
        canManage ? (
          <>
            <Button variant="outline" className="mr-auto text-red-600 hover:bg-red-50" onClick={() => onRequestDelete(vendor)}>
              <Trash2 className="h-4 w-4" /> Delete vendor
            </Button>
            <Button onClick={handleSave} loading={updateDetails.isPending} disabled={!dirty}>
              Save changes
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Tag className="h-3.5 w-3.5" /> Service categories
          </h3>
          <ChipList items={vendor.services} tone="indigo" />
        </section>

        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Award className="h-3.5 w-3.5" /> Brands carried
          </h3>
          <ChipList items={vendor.brands} tone="slate" />
        </section>

        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <UsersIcon className="h-3.5 w-3.5" /> Contacts
          </h3>
          {vendor.contacts.length === 0 ? (
            <p className="text-sm text-slate-400">No contacts on file.</p>
          ) : (
            <div className="space-y-2">
              {vendor.contacts.map((c, i) => (
                <div key={i} className="rounded-lg border border-slate-200 px-3 py-2">
                  {c.name && <p className="text-sm font-medium text-slate-800">{c.name}</p>}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-brand-600">
                        <Phone className="h-3.5 w-3.5" /> {c.phone}
                      </a>
                    )}
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-brand-600">
                        <Mail className="h-3.5 w-3.5" /> {c.email}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3 border-t border-slate-100 pt-4">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <FileText className="h-3.5 w-3.5" /> Additional details
          </h3>
          <div>
            <Label className="flex items-center gap-1">
              <Globe className="h-3.5 w-3.5 text-slate-400" /> Website
            </Label>
            <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" disabled={!canManage} />
          </div>
          <div>
            <Label className="flex items-center gap-1">
              <FileText className="h-3.5 w-3.5 text-slate-400" /> VAT Number
            </Label>
            <Input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} disabled={!canManage} />
          </div>
          <div>
            <Label className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-slate-400" /> Address
            </Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} disabled={!canManage} />
          </div>
          <div>
            <Label className="flex items-center gap-1">
              <StickyNote className="h-3.5 w-3.5 text-slate-400" /> Notes
            </Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canManage} />
          </div>
          {!canManage && <p className="text-xs text-slate-400">Only Super Admins and Management can edit these details.</p>}
        </section>
      </div>
    </Drawer>
  );
}

interface ContactRow {
  name: string;
  phone: string;
  email: string;
}
const emptyContactRow = (): ContactRow => ({ name: "", phone: "", email: "" });

function NewVendorDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { push } = useToast();
  const createVendor = useCreateVendor();

  const [name, setName] = useState("");
  const [services, setServices] = useState("");
  const [brands, setBrands] = useState("");
  const [contacts, setContacts] = useState<ContactRow[]>([emptyContactRow()]);
  const [website, setWebsite] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  function reset() {
    setName("");
    setServices("");
    setBrands("");
    setContacts([emptyContactRow()]);
    setWebsite("");
    setVatNumber("");
    setAddress("");
    setNotes("");
  }

  function updateContact(i: number, patch: Partial<ContactRow>) {
    setContacts((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function handleCreate() {
    if (!name.trim()) {
      push({ variant: "error", title: "Vendor name is required." });
      return;
    }
    try {
      await createVendor.mutateAsync({
        name: name.trim(),
        services: services.split(",").map((s) => s.trim()).filter(Boolean),
        brands: brands.split(",").map((b) => b.trim()).filter(Boolean),
        contacts: contacts
          .filter((c) => c.name.trim() || c.phone.trim() || c.email.trim())
          .map((c) => ({ name: c.name.trim() || null, phone: c.phone.trim() || null, email: c.email.trim() || null })),
        website: website.trim() || null,
        vatNumber: vatNumber.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      });
      push({ variant: "success", title: "Vendor added." });
      reset();
      onClose();
    } catch (err) {
      push({ variant: "error", title: "Could not add vendor", description: extractApiError(err).message });
    }
  }

  return (
    <Drawer
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Add Vendor"
      subtitle="Adds one supplier to the directory — the same list a bulk Excel import feeds into."
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
          <Button onClick={handleCreate} loading={createVendor.isPending}>
            Add Vendor
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label required>Vendor Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gulf Security Trading LLC" autoFocus />
        </div>
        <div>
          <Label>Service Categories</Label>
          <Input value={services} onChange={(e) => setServices(e.target.value)} placeholder="Comma-separated, e.g. CCTV System, Audio & Visual System" />
        </div>
        <div>
          <Label>Brands Carried</Label>
          <Input value={brands} onChange={(e) => setBrands(e.target.value)} placeholder="Comma-separated, e.g. Bosch, Hikvision" />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="!mb-0">Contacts</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => setContacts((rows) => [...rows, emptyContactRow()])}>
              <Plus className="h-3.5 w-3.5" /> Add contact
            </Button>
          </div>
          <div className="space-y-2">
            {contacts.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input className="flex-1" placeholder="Name" value={c.name} onChange={(e) => updateContact(i, { name: e.target.value })} />
                <Input className="flex-1" placeholder="Phone" value={c.phone} onChange={(e) => updateContact(i, { phone: e.target.value })} />
                <Input className="flex-1" placeholder="Email" value={c.email} onChange={(e) => updateContact(i, { email: e.target.value })} />
                {contacts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setContacts((rows) => rows.filter((_, idx) => idx !== i))}
                    className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Remove contact"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
          <div>
            <Label>Website</Label>
            <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" />
          </div>
          <div>
            <Label>VAT Number</Label>
            <Input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Address</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </Drawer>
  );
}

/** ERP module landing page — the Vendor List, gated the same way every other
 * module page is (Settings -> Users -> edit -> Module Access). */
export default function ErpHomePage() {
  const { user } = useAuth();
  if (user?.moduleAccess.includes("ERP")) return <VendorMaster />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Vendor List</h1>
        <p className="text-sm text-slate-500">Purchasing, vendors, and inventory.</p>
      </div>
      <EmptyState
        icon={<Lock className="h-8 w-8" />}
        title="You don't have access to this feature"
        description="Purchase orders, vendors, and inventory tracking require ERP access. Contact your administrator if you believe you should have it."
      />
    </div>
  );
}
