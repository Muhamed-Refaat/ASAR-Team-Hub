const { test } = require("node:test");
const assert = require("node:assert/strict");
const M = require("../web/model.js");
const Sync = require("../web/sync.js");
const seed = () => ({
  team: [
    { ID: "1", Name: "Admin", Mail: "admin@example.com", Role: "Team Leader" },
  ],
  admins: [{ Email: "admin@example.com", Enabled: "TRUE" }],
  activeUserSession: { email: "admin@example.com" },
  tasks: [],
  meet: [],
  learning: [],
  completions: [],
  logs: [],
  activity: [],
  skills: [],
});
const tick = () => new Promise(setImmediate);
const payload = (type, title = type) => ({
  type,
  title,
  members: ["1"],
  date: "2026-10-18",
  status: "Backlog",
  loggingEnabled: true,
});
function harness(storage = new Map(), initial = seed()) {
  let data = initial,
    jobs = [],
    count = 0;
  const requests = [],
    notices = [];
  const queue = Sync.create({
    model: M,
    getData: () => data,
    send: (action, body) =>
      new Promise((resolve, reject) =>
        requests.push({ action, body, resolve, reject }),
      ),
    onData: (next) => {
      data = next;
    },
    onChange: (next) => {
      jobs = next;
    },
    onNotice: (...notice) => notices.push(notice),
    storage: {
      setItem: (k, v) => storage.set(k, v),
      getItem: (k) => storage.get(k),
    },
    makeId: () => `request-${++count}`,
    now: () => "2026-10-18T12:00:00Z",
  });
  queue.accept(data);
  return {
    queue,
    requests,
    notices,
    storage,
    data: () => data,
    jobs: () => jobs,
    succeed() {
      const request = requests.shift();
      const result = M.transition(
        data,
        data.activeUserSession.email,
        request.action,
        request.body,
        "2026-10-18T12:00:00Z",
      );
      request.resolve({ success: true, data: result.db });
    },
  };
}
test("background creations appear immediately, stay outside confirmed progress, and serialize snapshots", async () => {
  const h = harness();
  h.queue.enqueue("saveTask", payload("Task"));
  h.queue.enqueue("saveEvent", payload("Meet"));
  h.queue.enqueue("saveEvent", payload("Learning"));
  assert.equal(h.jobs().length, 3);
  assert.equal(M.events(h.data()).length, 0);
  assert.equal(M.progress(h.data(), h.data().team[0]).total, 0);
  await tick();
  assert.equal(h.requests.length, 1);
  assert.deepEqual(
    h.jobs().map((job) => job.state),
    ["saving", "queued", "queued"],
  );
  for (let i = 0; i < 3; i++) {
    h.succeed();
    await tick();
  }
  await h.queue.run(() => {});
  assert.equal(M.events(h.data()).length, 3);
  assert.ok(h.jobs().every((job) => job.state === "saved"));
  assert.equal(h.notices.filter((notice) => notice[1] === "success").length, 3);
});
test("lost-response retries reuse the creation ID and do not overwrite or duplicate an event", async () => {
  const h = harness();
  const job = h.queue.enqueue("saveTask", payload("Task"));
  await tick();
  const request = h.requests.shift();
  const remote = M.transition(
    h.data(),
    "admin@example.com",
    request.action,
    request.body,
    "2026-10-18T12:00:00Z",
  ).db;
  request.reject(new Error("Connection lost after the server saved"));
  await tick();
  assert.equal(h.jobs()[0].state, "failed");
  assert.equal(h.data().tasks.length, 0);
  h.queue.retry(job.id);
  await tick();
  const retry = h.requests.shift();
  assert.equal(retry.body.newId, request.body.newId);
  const result = M.transition(
    remote,
    "admin@example.com",
    retry.action,
    retry.body,
    "2026-10-18T12:01:00Z",
  );
  assert.equal(result.unchanged, true);
  retry.resolve({ success: true, data: result.db });
  await tick();
  assert.equal(h.data().tasks.length, 1);
  assert.equal(h.data().activity.length, 1);
  assert.equal(h.jobs()[0].state, "saved");
});
test("reload restores draft fields without silently resubmitting or duplicating confirmed events", async () => {
  const h = harness();
  const job = h.queue.enqueue("saveEvent", {
    ...payload("Meet"),
    description: "Keep my draft",
  });
  await tick();
  h.requests.shift().reject(new Error("Offline"));
  await tick();
  const restored = harness(h.storage);
  assert.equal(restored.requests.length, 0);
  assert.equal(restored.jobs()[0].state, "failed");
  assert.equal(restored.jobs()[0].payload.description, "Keep my draft");
  restored.queue.retry(job.id);
  await tick();
  restored.succeed();
  await tick();
  const confirmed = harness(h.storage, restored.data());
  assert.equal(confirmed.data().meet.length, 1);
  assert.equal(confirmed.requests.length, 0);
});
test("invalid drafts never send and duplicate submit events enqueue a single operation", async () => {
  const h = harness();
  assert.throws(
    () => h.queue.enqueue("saveEvent", payload("Meet", "")),
    /title/,
  );
  assert.equal(h.jobs().length, 0);
  h.queue.enqueue("saveTask", { ...payload("Task"), newId: "same-click" });
  h.queue.enqueue("saveTask", { ...payload("Task"), newId: "same-click" });
  await tick();
  assert.equal(h.requests.length, 1);
  h.succeed();
  await tick();
  assert.equal(h.data().tasks.length, 1);
});

test("a slow refresh never blocks writes or rewinds their confirmed result", async () => {
  const h = harness();
  const stale = structuredClone(h.data());
  let resolveRead,
    reads = 0;
  const read = () => {
    reads++;
    return reads === 1
      ? new Promise((resolve) => {
          resolveRead = resolve;
        })
      : Promise.resolve(h.data());
  };
  const reading = h.queue.refresh(read);
  assert.equal(h.queue.refresh(read), reading, "Refreshes coalesce");
  await tick();
  h.queue.enqueue("saveTask", payload("Task"));
  await tick();
  assert.equal(
    h.requests.length,
    1,
    "Write starts while refresh is unresolved",
  );
  h.succeed();
  await tick();
  assert.equal(h.data().tasks.length, 1);
  resolveRead(stale);
  assert.deepEqual(await reading, { deferred: true });
  await tick();
  assert.equal(reads, 2, "An overlapping read is retried after writes finish");
  assert.equal(h.data().tasks.length, 1, "Stale data was never accepted");
});

test("refresh requested during saving waits for the write queue to drain", async () => {
  const h = harness();
  h.queue.enqueue("saveTask", payload("Task"));
  h.queue.enqueue("saveEvent", payload("Meet"));
  let reads = 0;
  const read = () => {
    reads++;
    return Promise.resolve(h.data());
  };
  assert.deepEqual(await h.queue.refresh(read), { deferred: true });
  assert.equal(reads, 0);
  await tick();
  h.succeed();
  await tick();
  assert.equal(reads, 0);
  h.succeed();
  await tick();
  assert.equal(reads, 1);
  assert.equal(M.events(h.data()).length, 2);
});

test("failed independent reads release their state and allow a clean retry", async () => {
  const h = harness();
  await assert.rejects(
    h.queue.refresh(() => Promise.reject(new Error("Offline"))),
    /Offline/,
  );
  assert.deepEqual(await h.queue.refresh(() => Promise.resolve(h.data())), {
    accepted: true,
  });
});

test("table patches preserve unrelated snapshots and reject a different account", () => {
  const h = harness();
  const original = h.data();
  const tasks = [{ "Task Title": "Updated", "Event ID": "task-patch" }];
  h.queue.accept({
    mode: "patch",
    tables: { tasks },
    activeUserSession: original.activeUserSession,
    telegram: { chatTitle: "ASAR", chatId: "-1004488318175" },
  });
  assert.equal(h.data().tasks, tasks);
  assert.equal(h.data().team, original.team);
  assert.equal(h.data().learning, original.learning);
  assert.equal(h.data().telegram.chatTitle, "ASAR");
  const accepted = h.data();
  assert.throws(
    () =>
      h.queue.accept({
        mode: "patch",
        tables: { tasks: [] },
        activeUserSession: { email: "someone@example.com" },
      }),
    /account changed/,
  );
  assert.equal(h.data(), accepted);
});
