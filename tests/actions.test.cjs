const { test } = require("node:test");
const assert = require("node:assert/strict");
const M = require("../web/model.js");
const Actions = require("../web/actions.js");
const Sync = require("../web/sync.js");
const tick = () => new Promise(setImmediate);
const seed = () => ({
  team: [
    {
      ID: "1",
      Name: "Admin",
      Mail: "admin@example.com",
      Role: "Team Leader",
      "Hard Skill": "{Python , 3}",
    },
    { ID: "2", Name: "Member", Mail: "member@example.com" },
  ],
  admins: [{ Email: "admin@example.com", Enabled: "TRUE" }],
  activeUserSession: { email: "admin@example.com" },
  tasks: [
    {
      "Task Title": "Prototype",
      "Event ID": "task-1",
      Assignees: "Admin\nMember",
      Status: "Pending",
    },
  ],
  learning: [
    {
      "Topic name": "Course",
      "Event ID": "learning-1",
      "Invited/Assigned": "Admin\nMember",
    },
  ],
  meet: [],
  completions: [],
  logs: [],
  activity: [],
  skills: [],
  skillRequirements: [],
  memberships: [],
  subteams: [],
});
function harness() {
  let confirmed = seed(),
    remote = structuredClone(confirmed),
    view,
    jobs = [],
    counter = 0,
    actions;
  const requests = [],
    notices = [];
  const send = (action, payload) =>
    new Promise((resolve, reject) =>
      requests.push({ action, payload, resolve, reject }),
    );
  const sync = Sync.create({
    model: M,
    getData: () => confirmed,
    send,
    onData: (data) => {
      confirmed = data;
      actions.accept(data);
    },
    onChange() {},
    makeId: () => "create-" + ++counter,
    now: () => "2026-10-18T12:00:00Z",
  });
  actions = Actions.create({
    model: M,
    getData: () => confirmed,
    send,
    schedule: sync.run,
    accept: sync.accept,
    onView: (next) => {
      view = next;
    },
    onChange: (next) => {
      jobs = next;
    },
    onNotice: (text) => notices.push(text),
    makeId: () => "action-" + ++counter,
    now: () => "2026-10-18T12:00:00Z",
  });
  sync.accept(confirmed);
  return {
    actions,
    sync,
    requests,
    notices,
    data: () => confirmed,
    view: () => view,
    jobs: () => jobs,
    succeed(lost = false) {
      const request = requests.shift();
      const result = M.transition(
        remote,
        remote.activeUserSession.email,
        request.action,
        request.payload,
        "2026-10-18T12:00:00Z",
      );
      remote = result.db;
      if (lost) request.reject(new Error("Reply lost after save"));
      else
        request.resolve({
          success: true,
          data: structuredClone(remote),
          unchanged: result.unchanged,
        });
      return request;
    },
  };
}
test("task moves render immediately, retain newer choices through older replies, and roll back only failed changes", async () => {
  const h = harness();
  h.actions.mutate("moveTask", { key: "Task:task-1", status: "Completed" });
  const latest = h.actions.mutate("moveTask", {
    key: "Task:task-1",
    status: "InProgress",
  });
  assert.equal(h.view().tasks[0].Status, "InProgress");
  assert.equal(h.data().tasks[0].Status, "Pending");
  assert.equal(JSON.parse(h.view().activity.at(-1).Details).outcome, "Saving");
  await tick();
  assert.equal(h.requests.length, 1);
  h.succeed();
  await tick();
  assert.equal(h.data().tasks[0].Status, "Completed");
  assert.equal(h.view().tasks[0].Status, "InProgress");
  h.requests.shift().reject(new Error("Offline"));
  await tick();
  assert.equal(h.view().tasks[0].Status, "Completed");
  assert.equal(h.jobs().at(-1).state, "failed");
  h.actions.retry(latest.id);
  await tick();
  assert.equal(h.view().tasks[0].Status, "InProgress");
  h.succeed();
  await tick();
  assert.equal(h.data().tasks[0].Status, "InProgress");
});
test("a failed earlier move cannot be retried over a newer successful move", async () => {
  const h = harness();
  const earlier = h.actions.mutate("moveTask", {
    key: "Task:task-1",
    status: "Completed",
  });
  h.actions.mutate("moveTask", { key: "Task:task-1", status: "Backlog" });
  await tick();
  h.requests.shift().reject(new Error("First write failed"));
  await tick();
  assert.equal(h.jobs()[0].state, "superseded");
  h.succeed();
  await tick();
  h.actions.retry(earlier.id);
  await tick();
  assert.equal(h.requests.length, 0);
  assert.equal(h.data().tasks[0].Status, "Backlog");
});
test("learning submits immediately as Pending, preserves attachments for retry and does not count as approved progress", async () => {
  const h = harness();
  const upload = {
    name: "certificate.pdf",
    mimeType: "application/pdf",
    base64: Buffer.from("%PDF-1.4\nEvidence\n%%EOF").toString("base64"),
  };
  const job = h.actions.mutate("completeEvent", {
    key: "Learning:learning-1",
    upload,
    evidence: "Result",
  });
  assert.equal(h.view().completions[0].Status, "Pending");
  assert.equal(h.data().completions.length, 0);
  assert.equal(M.progress(h.view(), h.view().team[0]).completed, 0);
  await tick();
  h.requests.shift().reject(new Error("Offline"));
  await tick();
  assert.equal(h.view().completions.length, 0);
  assert.equal(h.jobs()[0].payload.upload.base64, upload.base64);
  h.actions.retry(job.id);
  await tick();
  const request = h.succeed();
  await tick();
  assert.equal(request.payload.commandId, job.id);
  assert.equal(h.data().completions.length, 1);
  assert.equal(h.data().completions[0].Status, "Pending");
});
test("dependent submission, approval and undo share stable submission IDs without blocking the UI", async () => {
  const h = harness();
  h.actions.mutate("completeEvent", { key: "Learning:learning-1" });
  const submissionId = h.view().completions[0]["Submission ID"];
  h.actions.mutate("reviewSubmission", { submissionId, decision: "Completed" });
  assert.equal(h.view().completions[0].Status, "Completed");
  h.actions.mutate("revertCompletion", {
    key: "Learning:learning-1",
    submissionId,
  });
  assert.equal(h.view().completions[0].Status, "Uncompleted");
  await tick();
  for (let index = 0; index < 3; index++) {
    h.succeed();
    await tick();
  }
  assert.equal(h.data().completions.length, 1);
  assert.equal(h.data().completions[0].Status, "Uncompleted");
  assert.equal(h.data().activity.length, 3);
});
test("lost replies retry skill updates idempotently instead of duplicating assessments", async () => {
  const h = harness();
  const key = M.events(h.data()).find((event) => event.requirement).key;
  h.actions.mutate("completeEvent", { key, score: 4 });
  await tick();
  h.succeed();
  await tick();
  const job = h.actions.mutate("updateSkillCompletion", { key, score: 8 });
  await tick();
  h.succeed(true);
  await tick();
  assert.equal(h.data().completions.length, 1);
  h.actions.retry(job.id);
  await tick();
  h.succeed();
  await tick();
  assert.equal(h.data().completions.length, 2);
  assert.equal(h.data().activity.length, 2);
  assert.equal(h.data().completions.at(-1).Score, 8);
});
test("background creations and updates use one queue and refresh snapshots preserve optimistic changes", async () => {
  const h = harness();
  h.sync.enqueue("saveEvent", {
    type: "Meet",
    title: "Meeting",
    members: ["1"],
    date: "2099-01-01",
  });
  h.actions.mutate("moveTask", { key: "Task:task-1", status: "Completed" });
  await tick();
  assert.equal(h.requests.length, 1);
  h.sync.accept(h.data());
  assert.equal(h.view().tasks[0].Status, "Completed");
  h.succeed();
  await tick();
  assert.equal(h.data().meet.length, 1);
  assert.equal(h.view().tasks[0].Status, "Completed");
  h.succeed();
  await tick();
  assert.equal(h.data().tasks[0].Status, "Completed");
});
test("invalid evidence and unauthorized status changes fail locally without queuing writes", () => {
  const h = harness();
  assert.throws(
    () =>
      h.actions.mutate("addTaskLink", {
        key: "Task:task-1",
        url: "javascript:bad",
      }),
    /valid/,
  );
  h.data().activeUserSession.email = "member@example.com";
  assert.throws(
    () =>
      h.actions.mutate("moveTask", { key: "Task:task-1", status: "Completed" }),
    /Admins/,
  );
  assert.equal(h.requests.length, 0);
  assert.equal(h.jobs().length, 0);
});
