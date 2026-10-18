const { test } = require("node:test");
const assert = require("node:assert/strict");
const M = require("../web/model.js");
const T = require("../web/telegram.js");
const { environment } = require("./backend-fixture.cjs");
const plain = (value) => JSON.parse(JSON.stringify(value));
function create(e, type) {
  e.context.executeHubCommand(type === "Task" ? "saveTask" : "saveEvent", {
    type,
    title: type + " to delete",
    members: ["1", "2"],
    newId: "delete-test",
    status: "Completed",
    date: "2099-01-01",
    loggingEnabled: true,
  });
  return type + ":" + type.toLowerCase() + "-delete-test";
}

test("admin deletion removes all event types from current progress and reviews while retaining source, evidence and attempts", () => {
  for (const type of ["Task", "Meet", "Learning"]) {
    const e = environment();
    const key = create(e, type);
    if (type !== "Task") {
      e.setEmail("member@example.com");
      e.context.executeHubCommand("completeEvent", {
        key,
        evidence: "https://example.com/proof",
        newId: "proof",
      });
      e.setEmail("head@example.com");
    } else
      e.context.executeHubCommand("addTaskLink", {
        key,
        url: "https://example.com/proof",
        newId: "proof",
      });
    const before = plain(e.context.getTeamData());
    e.setEmail("member@example.com");
    assert.throws(
      () => e.context.executeHubCommand("deleteEvent", { key }),
      /Only members explicitly/,
    );
    e.setEmail("head@example.com");
    const command = { key, commandId: "delete-once" };
    const db = plain(e.context.executeHubCommand("deleteEvent", command).data);
    assert.equal(
      M.events(db).some((event) => event.key === key),
      false,
    );
    const deleted = M.events(db, { includeDeleted: true }).find(
      (event) => event.key === key,
    );
    assert.equal(deleted.deleted, true);
    assert.equal(db[M.TABLES[type]].length, before[M.TABLES[type]].length);
    const source = before[M.TABLES[type]].find(
      (row) => row["Event ID"] === deleted.id,
    );
    assert.deepEqual(deleted.row, { ...source, Deleted: "TRUE" });
    assert.deepEqual(db.completions, before.completions);
    assert.equal(
      M.pendingReviews(db).some((row) => row["Event ID"] === key),
      false,
    );
    assert.equal(
      M.progress(db, db.team[1]).total,
      M.progress(before, before.team[1]).total - 1,
    );
    assert.equal(
      M.cvData(db, db.team[1]).tasks.some((row) => row.title === deleted.title),
      false,
    );
    assert.ok(
      db.logs.every(
        (log) => log["Source ID"] !== deleted.id || M.truth(log.Deleted),
      ),
    );
    assert.equal(
      e.context.executeHubCommand("deleteEvent", command).unchanged,
      true,
    );
    assert.equal(
      e.context
        .getTeamData()
        .activity.filter((row) => row.Action === "deleteEvent").length,
      2,
    ); // one denied audit, one success
    if (type !== "Task")
      assert.throws(
        () =>
          e.context.executeHubCommand("reviewSubmission", {
            submissionId: before.completions.at(-1)["Submission ID"],
            decision: "Completed",
          }),
        /does not require review/,
      );
  }
});

test("imported and log-only deletion keeps stable identities and never deletes a separate same-title legacy event", () => {
  const e = environment();
  const key = M.events(e.context.getTeamData()).find(
    (event) => event.type === "Learning",
  ).key;
  let db = plain(e.context.executeHubCommand("deleteEvent", { key }).data);
  assert.equal(db.learning[0]["Event ID"], key.split(":")[1]);
  assert.equal(
    M.events(db).some((event) => event.key === key),
    false,
  );
  db.logs = [
    {
      "Event Type": "Meet",
      "Event ID": "a",
      "Event Name": "Legacy",
      "Attendees/Completed": "Member",
    },
    {
      "Event Type": "Meet",
      "Event ID": "b",
      "Event Name": "Legacy",
      "Attendees/Completed": "Member",
    },
  ];
  db = M.transition(
    db,
    "head@example.com",
    "deleteEvent",
    { key: "Meet:legacy-a" },
    new Date().toISOString(),
  ).db;
  assert.equal(db.logs[0].Deleted, "TRUE");
  assert.equal(db.logs[1].Deleted, undefined);
  assert.ok(M.events(db).some((event) => event.key === "Meet:legacy-b"));
  db.team[0]["Hard Skill"] = "{Python , 5}";
  assert.throws(
    () =>
      M.transition(
        db,
        "head@example.com",
        "deleteEvent",
        {
          key: M.events(db).find((event) => event.requirement).key,
        },
        new Date().toISOString(),
      ),
    /Only tasks, meetings and learning/,
  );
});

test("deletion cancels unsent announcements and the worker checks source tombstones after a partial Activity failure", () => {
  for (const partial of [false, true]) {
    const e = environment();
    e.scriptProperties.set(
      "TELEGRAM_BOT_TOKEN",
      "123456:" + "test_private_token_".repeat(3),
    );
    e.scriptProperties.set("TELEGRAM_CHAT_ID", "-4488318175");
    e.context.setupTelegramNotifications();
    const key = create(e, "Learning");
    const preview = e.context.getTelegramPreview(key);
    e.context.executeHubCommand("queueTelegramNotification", {
      key,
      receipt: preview.receipt,
    });
    const queued = T.deliveries(e.context.getTeamData()).get(key);
    const sheet = e.sheets.Activity,
      write = sheet.set.bind(sheet);
    if (partial)
      sheet.set = () => {
        throw new Error("Activity unavailable");
      };
    const command = { key, commandId: "delete-with-retry" };
    if (partial)
      assert.throws(
        () => e.context.executeHubCommand("deleteEvent", command),
        /Activity unavailable/,
      );
    else e.context.executeHubCommand("deleteEvent", command);
    sheet.set = write;
    e.context.hubTelegramWorker_();
    let db = e.context.getTeamData();
    const delivery = T.deliveries(db).get(key);
    assert.equal(delivery.status, "Cancelled");
    assert.equal(delivery.text, queued.text);
    assert.equal(delivery.chatId, queued.chatId);
    assert.equal(
      e.requests.filter((row) => row.method === "sendMessage").length,
      0,
    );
    assert.throws(() => e.context.getTelegramPreview(key), /Choose a saved/);
    assert.throws(
      () =>
        e.context.executeHubCommand("queueTelegramNotification", {
          key,
          receipt: preview.receipt,
        }),
      /Choose a saved/,
    );
    e.context.executeHubCommand("deleteEvent", command);
    e.context.executeHubCommand("deleteEvent", command);
    db = e.context.getTeamData();
    assert.equal(
      db.activity.filter(
        (row) =>
          row.Action === "deleteEvent" &&
          JSON.parse(row.Details).outcome === "Succeeded",
      ).length,
      1,
    );
    assert.equal(e.locked(), false);
  }
});

test("all active members add references with authenticated authorship; only explicit admins delete and history survives retries", () => {
  const e = environment("member@example.com");
  const payload = {
    title: "Project repository",
    url: "https://github.com/example/project",
    description: "Firmware and setup",
    newId: "repo",
    commandId: "add-repo",
    email: "head@example.com",
    "Added By": "head@example.com",
  };
  let db = plain(e.context.executeHubCommand("addReference", payload).data);
  assert.equal(M.references(db).length, 1);
  const row = db.references[0];
  assert.equal(row["Added By"], "member@example.com");
  assert.equal(row["Added By Name"], "Member");
  assert.equal(
    e.context.executeHubCommand("addReference", payload).unchanged,
    true,
  );
  const deletion = {
    referenceId: row["Reference ID"],
    commandId: "remove-repo",
  };
  e.sheets.Team.rows[2][3] = "Leader";
  assert.throws(
    () => e.context.executeHubCommand("deleteReference", deletion),
    /Only members explicitly/,
  );
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,test",
    "https://",
    "https://example.com/\nattack",
  ]) {
    assert.throws(
      () =>
        e.context.executeHubCommand("addReference", {
          ...payload,
          commandId: url,
          newId: url,
          url,
        }),
      /valid http or https/,
    );
  }
  e.setEmail("head@example.com");
  db = plain(e.context.executeHubCommand("deleteReference", deletion).data);
  assert.equal(M.references(db).length, 0);
  assert.deepEqual(db.references[0], { ...row, Deleted: "TRUE" });
  assert.equal(
    e.context.executeHubCommand("deleteReference", deletion).unchanged,
    true,
  );
  e.setEmail("");
  assert.throws(
    () => e.context.executeHubCommand("addReference", payload),
    /Sign in/,
  );
  e.setEmail("member@example.com");
  const headers = e.sheets.Team.rows[0];
  headers.push("Active");
  e.sheets.Team.rows[2][headers.length - 1] = false;
  assert.throws(
    () =>
      e.context.executeHubCommand("addReference", {
        ...payload,
        commandId: "inactive",
      }),
    /Sign in/,
  );
});

test("a reference write survives a later audit failure and retry records success without duplicating the link", () => {
  const e = environment("member@example.com");
  const insert = e.ss.insertSheet;
  e.ss.insertSheet = (name) => {
    if (name === "Activity") throw new Error("Audit unavailable");
    return insert(name);
  };
  const payload = {
    title: "Build guide",
    url: "https://example.com/guide",
    newId: "recover-reference",
    commandId: "recover-reference",
  };
  assert.throws(
    () => e.context.executeHubCommand("addReference", payload),
    /Audit unavailable/,
  );
  assert.equal(M.references(e.context.getTeamData()).length, 1);
  e.ss.insertSheet = insert;
  const result = e.context.executeHubCommand("addReference", payload);
  assert.equal(result.data.references.length, 1);
  assert.equal(
    result.data.activity.filter((row) => row.Action === "addReference").length,
    1,
  );
  assert.equal(
    e.context.executeHubCommand("addReference", payload).unchanged,
    true,
  );
});
