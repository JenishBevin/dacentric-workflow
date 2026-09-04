import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ensureRolesAndPermissions } from "../../src/modules/roles/rolesSeed";
import { RoleCode, ModuleCode, AccountStatus } from "@dacentric/types";

export const prisma = new PrismaClient();

export const TEST_PASSWORD = "TestPass1!";

/**
 * Creates an isolated set of fixtures (roles, one admin, one manager, two
 * team members, one board with standard stages) so the API test suite never
 * depends on `prisma/seed.ts` having been run first. Emails are namespaced
 * per test run to avoid colliding with a developer's local seed data.
 */
export async function createFixtures(namespace: string) {
  await ensureRolesAndPermissions(prisma);
  const roles = await prisma.role.findMany();
  const roleId = (code: RoleCode) => roles.find((r) => r.code === code)!.id;
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  async function makeUser(email: string, name: string, roleCodes: RoleCode[]) {
    return prisma.user.create({
      data: {
        name,
        workEmail: `${namespace}-${email}`,
        passwordHash,
        status: AccountStatus.ACTIVE,
        moduleAccess: [ModuleCode.WORKFLOW],
        roles: { create: roleCodes.map((c) => ({ roleId: roleId(c) })) },
      },
    });
  }

  const admin = await makeUser("admin@test.local", "Test Admin", [RoleCode.SYSTEM_ADMIN]);
  const manager = await makeUser("manager@test.local", "Test Manager", [RoleCode.MANAGER]);
  const memberA = await makeUser("membera@test.local", "Member A", [RoleCode.TEAM_MEMBER]);
  const memberB = await makeUser("memberb@test.local", "Member B", [RoleCode.TEAM_MEMBER]);

  const board = await prisma.board.create({
    data: {
      name: `${namespace} Test Board`,
      boardType: "STANDALONE",
      createdById: manager.id,
      stages: {
        create: [
          { name: "To Do", position: 0, color: "#60a5fa" },
          { name: "In Progress", position: 1, color: "#f59e0b" },
          { name: "Done", position: 2, color: "#22c55e", isTerminal: true },
        ],
      },
      members: {
        create: [
          { userId: manager.id, role: "OWNER" },
          { userId: memberA.id, role: "EDITOR" },
          { userId: memberB.id, role: "EDITOR" },
        ],
      },
    },
    include: { stages: true },
  });

  return { admin, manager, memberA, memberB, board };
}

export async function cleanupFixtures(namespace: string) {
  const users = await prisma.user.findMany({ where: { workEmail: { contains: `${namespace}-` } } });
  const userIds = users.map((u) => u.id);
  const boards = await prisma.board.findMany({ where: { name: { startsWith: namespace } } });
  const boardIds = boards.map((b) => b.id);
  await prisma.task.deleteMany({ where: { boardId: { in: boardIds } } });
  await prisma.board.deleteMany({ where: { id: { in: boardIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
