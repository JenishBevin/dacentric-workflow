import { useMemo, useState, useCallback } from "react";

/** Selection state for bulk actions. "Select all" always means every id in
 * `visibleIds` — whatever the page currently has loaded/filtered, since none
 * of the bulk-select pages paginate. Selecting an id that later falls out of
 * `visibleIds` (e.g. a filter changes) is dropped automatically. */
export function useSelection(visibleIds: string[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const visible = useMemo(() => new Set(visibleIds), [visibleIds]);
  const active = useMemo(() => new Set([...selectedIds].filter((id) => visible.has(id))), [selectedIds, visible]);

  const isSelected = useCallback((id: string) => active.has(id), [active]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isAllSelected = visibleIds.length > 0 && active.size === visibleIds.length;

  const toggleAll = useCallback(() => {
    setSelectedIds(isAllSelected ? new Set() : new Set(visibleIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAllSelected, visibleIds.join(",")]);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  return { selectedIds: active, isSelected, toggle, toggleAll, isAllSelected, clear, count: active.size };
}
