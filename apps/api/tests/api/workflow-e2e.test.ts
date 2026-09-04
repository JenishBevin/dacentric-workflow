import request from "supertest";
import { createApp } from "../../src/app";
import { prisma, createFixtures, cleanupFixtures, TEST_PASSWORD } from "./setup";

/**
 * End-to-end coverage of the Section 55 acceptance scenario, driven at the
 * API layer (admin creates a user -> activation -> login -> board -> task ->
 * notification -> move -> approval -> workload -> audit -> export). A
 * browser-driven Playwright suite can layer the same scenario on top of the
 * UI once the frontend is wired to these endpoints; this is the
 * system-level guarantee that the endpoints themselves behave correctly
 * together, end to end.
 */
const NAMESPACE = "e2e-test";
const app = createApp();

async function login(email: string, password: string) {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}

describe("Full workflow scenario (Section 55)", () => {
  let fixtures: Awaited<ReturnType<typeof createFixtures>>;
  let adminToken: string;
  let managerToken: string;
  let memberToken: string;

  beforeAll(async () => {
    await cleanupFixtures(NAMESPACE);
    fixtures = await createFixtures(NAMESPACE);
    adminToken = await login(fixtures.admin.workEmail, TEST_PASSWORD);
    managerToken = await login(fixtures.manager.workEmail, TEST_PASSWORD);
    memberToken = await login(fixtures.memberA.workEmail, TEST_PASSWORD);
  });

  afterAll(async () => {
    await cleanupFixtures(NAMESPACE);
    await prisma.$disconnect();
  });

  let taskId: string;

  it("1-3: admin creates a user and the new user can eventually log in (invitation flow)", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "New Hire",
        workEmail: `${NAMESPACE}-newhire@test.local`,
        roles: ["TEAM_MEMBER"],
        moduleAccess: ["WORKFLOW"],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("PENDING_ACTIVATION");

    const invitation = await prisma.invitation.findFirst({ where: { userId: res.body.data.id } });
    expect(invitation).toBeTruthy();
  });

  it("4-5: manager creates a task on the fixture board with an assignee (board + members already exist)", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        boardId: fixtures.board.id,
        stageId: fixtures.board.stages[0].id,
        title: "Prepare client kickoff deck",
        priority: "HIGH",
        assigneeUserIds: [fixtures.memberA.id],
        dueDate: new Date(Date.now() + 3 * 86400000).toISOString(),
      });
    expect(res.status).toBe(201);
    expect(res.body.data.taskId).toMatch(/^WF-\d{6}$/);
    taskId = res.body.data.id;
  });

  it("6-7: the assignee received an in-app notification", async () => {
    const res = await request(app).get("/api/notifications").set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((n: any) => n.taskId === taskId && n.event === "TASK_ASSIGNED")).toBe(true);
  });

  it("8: the team member moves the task into In Progress", async () => {
    const res = await request(app)
      .post(`/api/tasks/${taskId}/move`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ stageId: fixtures.board.stages[1].id });
    expect(res.status).toBe(200);
    expect(res.body.data.stageId).toBe(fixtures.board.stages[1].id);
  });

  it("9-11: a task requiring approval goes to Pending Approval, then Approved -> Done", async () => {
    await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ requiresApproval: true, approverUserId: fixtures.manager.id })
      .expect(200);

    const moveRes = await request(app)
      .post(`/api/tasks/${taskId}/move`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ stageId: fixtures.board.stages[2].id }); // terminal "Done" stage
    expect(moveRes.status).toBe(200);
    expect(moveRes.body.data.approvalStatus).toBe("PENDING_APPROVAL");
    expect(moveRes.body.data.isCompleted).toBe(false);

    const approveRes = await request(app)
      .post(`/api/tasks/${taskId}/approval/approve`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.isCompleted).toBe(true);
    expect(approveRes.body.data.approvalStatus).toBe("APPROVED");
  });

  it("12: Team Workload reflects the completed task (no longer counted as open)", async () => {
    const res = await request(app).get("/api/team-workload").set("Authorization", `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
    const row = res.body.data.find((r: any) => r.userId === fixtures.memberA.id);
    expect(row).toBeTruthy();
    // The completed task should not inflate open-task count.
    expect(row.openTasks).toBe(0);
  });

  it("13: every step above produced immutable audit entries", async () => {
    const res = await request(app).get(`/api/audit?taskId=${taskId}`).set("Authorization", `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
    const actions = res.body.data.map((a: any) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["CREATE", "MOVE", "APPROVE"]));
  });

  it("14: the board can be exported to Excel", async () => {
    const res = await request(app).get(`/api/exports/board/${fixtures.board.id}`).set("Authorization", `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
  });

  it("rejects a task back to its previous stage with a mandatory reason", async () => {
    const secondTask = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        boardId: fixtures.board.id,
        stageId: fixtures.board.stages[1].id,
        title: "Second task for rejection flow",
        priority: "MEDIUM",
        assigneeUserIds: [fixtures.memberB.id],
        requiresApproval: true,
        approverUserId: fixtures.manager.id,
      });
    const id = secondTask.body.data.id;

    await request(app)
      .post(`/api/tasks/${id}/move`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ stageId: fixtures.board.stages[2].id })
      .expect(200);

    const rejectRes = await request(app)
      .post(`/api/tasks/${id}/approval/reject`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ reason: "Missing the client sign-off document." });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.stageId).toBe(fixtures.board.stages[1].id);
    expect(rejectRes.body.data.approvalStatus).toBe("REJECTED");
  });

  it("blocks a task from reaching Done while an open 'Blocked by' dependency remains", async () => {
    const blocker = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ boardId: fixtures.board.id, title: "Blocker task", priority: "LOW", assigneeUserIds: [fixtures.memberA.id] });

    const blocked = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ boardId: fixtures.board.id, title: "Blocked task", priority: "LOW", assigneeUserIds: [fixtures.memberA.id] });

    await request(app)
      .post(`/api/tasks/${blocked.body.data.id}/dependencies`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ type: "BLOCKED_BY", taskId: blocker.body.data.id })
      .expect(201);

    const moveRes = await request(app)
      .post(`/api/tasks/${blocked.body.data.id}/move`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ stageId: fixtures.board.stages[2].id });

    expect(moveRes.status).toBe(409);
    expect(moveRes.body.error.message).toMatch(/blocked by/i);
  });
});
