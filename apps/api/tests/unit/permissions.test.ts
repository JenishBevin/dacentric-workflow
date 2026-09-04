import { computeEffectivePermissions, scopeAtLeast, widestScope, getPermissionScope } from "../../src/common/permissions";
import { PermissionKey, ModuleCode } from "@dacentric/types";

describe("RBAC effective permission calculation", () => {
  it("takes the widest scope across multiple roles holding the same permission", () => {
    const rows = [
      { module: ModuleCode.WORKFLOW, permission: PermissionKey.EDIT_TASK, scope: "OWN" as const },
      { module: ModuleCode.WORKFLOW, permission: PermissionKey.EDIT_TASK, scope: "TEAM" as const },
    ];
    const effective = computeEffectivePermissions(rows);
    expect(getPermissionScope(effective, PermissionKey.EDIT_TASK)).toBe("TEAM");
  });

  it("defaults to NONE for a permission with no matching role rows", () => {
    const effective = computeEffectivePermissions([]);
    expect(getPermissionScope(effective, PermissionKey.MANAGE_ROLES)).toBe("NONE");
  });

  it("orders scopes NONE < OWN < TEAM < ALL", () => {
    expect(scopeAtLeast("ALL", "TEAM")).toBe(true);
    expect(scopeAtLeast("OWN", "TEAM")).toBe(false);
    expect(widestScope(["OWN", "NONE", "TEAM"])).toBe("TEAM");
  });

  it("keeps module scoping independent — a Workflow permission does not leak into CRM", () => {
    const rows = [{ module: ModuleCode.WORKFLOW, permission: PermissionKey.EXPORT, scope: "ALL" as const }];
    const effective = computeEffectivePermissions(rows);
    expect(getPermissionScope(effective, PermissionKey.EXPORT, ModuleCode.CRM)).toBe("NONE");
    expect(getPermissionScope(effective, PermissionKey.EXPORT, ModuleCode.WORKFLOW)).toBe("ALL");
  });
});
