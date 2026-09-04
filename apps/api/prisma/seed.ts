import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { RoleCode, ModuleCode, AccountStatus } from "@dacentric/types";
import { ensureRolesAndPermissions } from "../src/modules/roles/rolesSeed";

const prisma = new PrismaClient();

const BOOTSTRAP_EMAIL = "superadmin@dacentric.example";
const BOOTSTRAP_PASSWORD = "Passw0rd!23";

/**
 * Clean-slate seed: ensures the seven platform roles and their default
 * permission matrix exist, then provisions exactly one active Super Admin
 * account so there's a way to log in. Everyone else is invited from
 * Settings -> Users by that Super Admin — there is no self-registration.
 */
async function main() {
  console.log("Seeding roles and bootstrap admin...");

  await ensureRolesAndPermissions(prisma);
  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.SUPER_ADMIN } });

  const passwordHash = await bcrypt.hash(BOOTSTRAP_PASSWORD, 12);
  const existing = await prisma.user.findUnique({ where: { workEmail: BOOTSTRAP_EMAIL } });

  if (!existing) {
    await prisma.user.create({
      data: {
        name: "Super Admin",
        workEmail: BOOTSTRAP_EMAIL,
        passwordHash,
        status: AccountStatus.ACTIVE,
        moduleAccess: [ModuleCode.WORKFLOW, ModuleCode.CRM, ModuleCode.ERP, ModuleCode.HRMS],
        roles: { create: [{ roleId: superAdminRole.id }] },
      },
    });
  }

  console.log("Seed complete.");
  console.log("----------------------------------------------------------------");
  console.log(`Super Admin login: ${BOOTSTRAP_EMAIL} / ${BOOTSTRAP_PASSWORD}`);
  console.log("Invite everyone else from Settings -> Users.");
  console.log("----------------------------------------------------------------");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
