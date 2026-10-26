import { describe, expect, it } from "vitest";

import { can, ROLE_LABELS, type MembershipRole, type Permission } from "@/lib/permissions";

const ROLES: MembershipRole[] = ["owner", "admin", "finance", "cashier", "viewer"];

describe("can", () => {
  it("grants every role read access", () => {
    for (const role of ROLES) expect(can(role, "read")).toBe(true);
  });

  it("keeps ownership exclusive and settings limited to owner/admin", () => {
    for (const role of ROLES.filter((r) => r !== "owner")) {
      expect(can(role, "owner")).toBe(false);
    }
    expect(can("owner", "owner")).toBe(true);
    expect(can("owner", "settings")).toBe(true);
    expect(can("admin", "settings")).toBe(true);
    expect(can("finance", "settings")).toBe(false);
    expect(can("viewer", "settings")).toBe(false);
  });

  it("lets cashiers sell and take payments but not correct money or manage masters", () => {
    expect(can("cashier", "sales")).toBe(true);
    expect(can("cashier", "payments")).toBe(true);
    expect(can("cashier", "cash")).toBe(false);
    expect(can("cashier", "reverse")).toBe(false);
    expect(can("cashier", "master")).toBe(false);
    expect(can("cashier", "export")).toBe(false);
  });

  it("lets viewers read reports but not export", () => {
    expect(can("viewer", "reports")).toBe(true);
    expect(can("viewer", "export")).toBe(false);
    expect(can("viewer", "sales")).toBe(false);
  });

  it("denies unknown permissions by default", () => {
    expect(can("owner", "nope" as Permission)).toBe(false);
  });

  it("labels every role", () => {
    for (const role of ROLES) expect(ROLE_LABELS[role]).toBeTruthy();
  });
});
