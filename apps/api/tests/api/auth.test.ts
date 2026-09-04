import request from "supertest";
import { createApp } from "../../src/app";
import { prisma, createFixtures, cleanupFixtures, TEST_PASSWORD } from "./setup";

const NAMESPACE = "auth-test";
const app = createApp();

describe("Authentication & account lockout (Section 7 / UC-02)", () => {
  let fixtures: Awaited<ReturnType<typeof createFixtures>>;

  beforeAll(async () => {
    await cleanupFixtures(NAMESPACE);
    fixtures = await createFixtures(NAMESPACE);
  });

  afterAll(async () => {
    await cleanupFixtures(NAMESPACE);
    await prisma.$disconnect();
  });

  it("rejects an incorrect password without revealing whether the account exists", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: fixtures.manager.workEmail, password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("logs in successfully with correct credentials and returns an access token", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: fixtures.manager.workEmail, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it("locks the account after five consecutive failed attempts", async () => {
    const email = fixtures.memberA.workEmail;
    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/auth/login").send({ email, password: "wrong-password" });
    }
    const res = await request(app).post("/api/auth/login").send({ email, password: TEST_PASSWORD });
    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe("ACCOUNT_LOCKED");
  });

  it("refuses a deactivated account with a clear message", async () => {
    await prisma.user.update({ where: { id: fixtures.memberB.id }, data: { status: "DEACTIVATED" } });
    const res = await request(app).post("/api/auth/login").send({ email: fixtures.memberB.workEmail, password: TEST_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/deactivated/i);
  });
});
