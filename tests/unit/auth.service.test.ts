import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import { prisma } from "../../src/shared/db/prisma.js";

describe("AuthService.updateUserStatus with logoutAll unit test", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should call logoutAll and return revokedSessionsCount when status is not ACTIVE", async () => {
    const targetUserId = "user-123";
    const adminUserId = "admin-999";
    const newStatus = "SUSPENDED";

    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      id: targetUserId,
      email: "test@example.com",
      role: "FREELANCER",
      accountStatus: "ACTIVE",
    } as any);

    vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
      const tx = {
        user: {
          update: vi.fn().mockResolvedValue({
            id: targetUserId,
            email: "test@example.com",
            role: "FREELANCER",
            accountStatus: newStatus,
            updatedAt: new Date(),
          }),
        },
      };
      return callback(tx);
    });

    const logoutAllSpy = vi.spyOn(AuthService, "logoutAll").mockResolvedValue({
      revokedSessionsCount: 5,
    });

    const result = await AuthService.updateUserStatus(targetUserId, newStatus, adminUserId);

    // The revocation must run inside the same transaction as the status
    // change, so logoutAll receives the tx client as its second argument.
    expect(logoutAllSpy).toHaveBeenCalledWith(targetUserId, expect.anything());
    expect(result.revokedSessionsCount).toBe(5);
    expect(result.user.accountStatus).toBe(newStatus);
  });

  it("should not call logoutAll when status is ACTIVE", async () => {
    const targetUserId = "user-123";
    const adminUserId = "admin-999";
    const newStatus = "ACTIVE";

    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      id: targetUserId,
      email: "test@example.com",
      role: "FREELANCER",
      accountStatus: "SUSPENDED",
    } as any);

    vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
      const tx = {
        user: {
          update: vi.fn().mockResolvedValue({
            id: targetUserId,
            email: "test@example.com",
            role: "FREELANCER",
            accountStatus: newStatus,
            updatedAt: new Date(),
          }),
        },
      };
      return callback(tx);
    });

    const logoutAllSpy = vi.spyOn(AuthService, "logoutAll").mockResolvedValue({
      revokedSessionsCount: 0,
    });

    const result = await AuthService.updateUserStatus(targetUserId, newStatus, adminUserId);

    expect(logoutAllSpy).not.toHaveBeenCalled();
    expect(result.revokedSessionsCount).toBe(0);
    expect(result.user.accountStatus).toBe("ACTIVE");
  });
});
