const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const M = require("../web/model.js");
class Sheet {
  constructor(name, rows) {
    this.name = name;
    this.rows = rows;
  }
  getDataRange() {
    return { getValues: () => this.rows.map((r) => r.slice()) };
  }
  getRange(r, c, h = 1, w = 1) {
    return {
      setValue: (v) => this.set(r, c, v),
      setValues: (rows) =>
        rows.forEach((row, i) =>
          row.forEach((v, j) => this.set(r + i, c + j, v)),
        ),
      getValues: () =>
        Array.from({ length: h }, (_, i) =>
          Array.from(
            { length: w },
            (_, j) => this.rows[r + i - 1]?.[c + j - 1] ?? "",
          ),
        ),
    };
  }
  set(r, c, v) {
    while (this.rows.length < r) this.rows.push([]);
    this.rows[r - 1][c - 1] = v;
  }
  appendRow(row) {
    this.rows.push(row.slice());
  }
}
function environment(email = "head@example.com") {
  const sheets = {
    Team: new Sheet("Team", [
      ["Name", "ID", "Mail", "Role", "Reports To", "Department"],
      ["Abdallah Allam", "1", "head@example.com", "Team Leader", "", ""],
      ["Member", "2", "member@example.com", "Team member", "1", ""],
    ]),
    Admins: new Sheet("Admins", [
      ["Email", "Enabled"],
      ["head@example.com", true],
    ]),
    Task: new Sheet("Task", [
      ["Task Title", "Assignees", "Status", "Event ID"],
      ["Build prototype", "Abdallah Allam\nMember", "Pending", "task-1"],
    ]),
    Learning: new Sheet("Learning", [
      ["Topic name", "", "Link"],
      ["Course", "", "https://example.com/course"],
    ]),
    SKILLs: new Sheet("SKILLs", [
      ["Hard Technical SKILLS", "", "", "Soft skills", "", "Technology"],
      [
        "SKILL",
        "Competency",
        "Application",
        "Skill",
        "Description",
        "Layer",
        "Tool",
        "Function",
      ],
      ["Python", "Development", "A", "Thinking", "B", "AI", "Editor", "C"],
    ]),
  };
  const ss = {
    getSheetByName: (name) => sheets[name],
    insertSheet: (name) => (sheets[name] = new Sheet(name, [[]])),
  };
  let locked = false,
    lockCount = 0;
  const files = [],
    folders = new Map(),
    properties = new Map();
  let failSharing = false;
  const context = vm.createContext({
    console,
    Date,
    JSON,
    Math,
    Map,
    Set,
    Intl,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush: () => {} },
    Session: {
      getActiveUser: () => ({ getEmail: () => email }),
      getScriptTimeZone: () => "Africa/Cairo",
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {
          assert.equal(locked, false);
          locked = true;
          lockCount++;
        },
        releaseLock: () => {
          locked = false;
        },
      }),
    },
    Utilities: {
      base64Decode: (value) => [...Buffer.from(value, "base64")],
      newBlob: (bytes, mimeType, name) => ({ bytes, mimeType, name }),
      formatDate: (d, tz, format) =>
        format === "yyyy-MM-dd"
          ? d.toISOString().slice(0, 10)
          : d.toISOString(),
    },
    PropertiesService: {
      getUserProperties: () => ({
        getProperty: (key) => properties.get(email + key),
        setProperty: (key, value) => properties.set(email + key, value),
      }),
    },
    DriveApp: {
      getFolderById: (id) => folders.get(id),
      createFolder: (name) => {
        const folder = {
          getId: () => "folder-" + email,
          createFile: (blob) => {
            const id = "file-" + (files.length + 1);
            const file = {
              blob,
              owner: email,
              viewers: [],
              trashed: false,
              getId: () => id,
              getUrl: () => "https://drive.google.com/file/d/" + id + "/view",
              addViewer: (viewer) => {
                if (failSharing) throw new Error("Sharing denied");
                file.viewers.push(viewer);
              },
              setTrashed: (value) => {
                file.trashed = value;
              },
            };
            files.push(file);
            return file;
          },
        };
        folders.set(folder.getId(), folder);
        return folder;
      },
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (text) => ({ setMimeType: () => text }),
    },
  });
  vm.runInContext(fs.readFileSync("Code.gs", "utf8"), context);
  return {
    context,
    sheets,
    ss,
    setEmail: (v) => {
      email = v;
    },
    locked: () => locked,
    lockCount: () => lockCount,
    files,
    failSharing: (value) => {
      failSharing = value;
    },
  };
}
test("production persists board moves and per-member requirements without losing ratings or other rows", () => {
  const e = environment();
  e.context.executeHubCommand("moveTask", {
    key: "Task:task-1",
    status: "InProgress",
  });
  assert.equal(e.sheets.Task.rows[1][2], "InProgress");
  const payload = {
    memberId: "2",
    requirements: [{ label: "Python", category: "Hard Skill", required: true }],
  };
  e.context.executeHubCommand("saveSkillRequirements", payload);
  e.setEmail("member@example.com");
  let db = e.context.getTeamData();
  const event = M.events(db).find((event) => event.requirement);
  e.context.executeHubCommand("completeEvent", { key: event.key, score: 5 });
  e.setEmail("head@example.com");
  e.context.executeHubCommand("saveSkillRequirements", {
    memberId: "1",
    requirements: [{ label: "Python", category: "Hard Skill", required: true }],
  });
  e.context.executeHubCommand("saveSkillRequirements", {
    ...payload,
    requirements: [
      { label: "Python", category: "Hard Skill", required: false },
    ],
  });
  db = e.context.getTeamData();
  assert.equal(db.skillRequirements.length, 2);
  assert.equal(M.requiredSkills(db, db.team[0]).length, 1);
  assert.equal(M.requiredSkills(db, db.team[1]).length, 0);
  assert.equal(M.skillGroups(db, db.team[1])[0].items[0].score, 5);
  assert.equal(db.completions.length, 1);
});
test("Apps Script reads Activity, sparse headers and two-row skill catalogue; session resolves only actual active email", () => {
  const e = environment();
  const data = e.context.getTeamData();
  assert.equal(data.activeUserSession.name, "Abdallah Allam");
  assert.equal(data.activeUserSession.isAdmin, true);
  assert.equal(data.learning[0].Link, "https://example.com/course");
  assert.equal(data.skills[0].Technology, "Editor");
  assert.ok(Array.isArray(data.activity));
  assert.ok(Array.isArray(data.completions));
  e.setEmail("");
  const anonymous = e.context.getTeamData();
  assert.equal(anonymous.activeUserSession.memberId, "");
  assert.equal(anonymous.activeUserSession.isAdmin, false);
});
test("production server rejects forged admin and member payload identities and always releases its lock", () => {
  const e = environment("member@example.com");
  assert.throws(
    () =>
      e.context.executeHubCommand("saveTask", {
        email: "head@example.com",
        title: "Forged",
        members: ["1"],
      }),
    /Admins sheet/,
  );
  assert.equal(e.locked(), false);
  assert.equal(e.sheets.Task.rows.length, 2);
  e.setEmail("");
  assert.throws(
    () =>
      e.context.executeHubCommand("completeEvent", {
        key: "Task:task-1",
        email: "head@example.com",
      }),
    /Sign in/,
  );
  assert.equal(e.locked(), false);
});
test("production task progress follows board status with no separate completion record", () => {
  const e = environment("member@example.com");
  assert.throws(
    () => e.context.executeHubCommand("completeEvent", { key: "Task:task-1" }),
    /Kanban board/,
  );
  assert.equal(e.context.getTeamData().completions.length, 0);
  e.setEmail("head@example.com");
  let result = e.context.executeHubCommand("moveTask", {
    key: "Task:task-1",
    status: "Completed",
  });
  assert.equal(result.data.tasks[0].Status, "Completed");
  assert.equal(
    M.progress(result.data, result.data.team[1]).byType.Task.completed,
    1,
  );
  result = e.context.executeHubCommand("moveTask", {
    key: "Task:task-1",
    status: "Blocked",
  });
  assert.equal(
    M.progress(result.data, result.data.team[1]).byType.Task.completed,
    0,
  );
  assert.equal(result.data.completions.length, 0);
  assert.equal(e.locked(), false);
});
test("production edit preserves sparse columns and unrelated source data; rejects mutation POST from anonymous account", () => {
  const e = environment();
  e.context.executeHubCommand("saveEvent", {
    type: "Learning",
    key: "Learning:learning-row-2",
    title: "Updated course",
    members: ["1", "2"],
    link: "https://example.com/new",
  });
  const data = e.context.getTeamData();
  assert.equal(data.learning[0]["Topic name"], "Updated course");
  assert.equal(data.learning[0].Link, "https://example.com/new");
  assert.equal(e.sheets.Task.rows[1][0], "Build prototype");
  e.setEmail("");
  const body = e.context.doPost({
    postData: {
      contents: JSON.stringify({
        action: "saveTask",
        email: "head@example.com",
        title: "Forged",
        members: ["1"],
      }),
    },
  });
  assert.equal(JSON.parse(body).success, false);
});

test("production saves real evidence bytes and reviewer permissions, persists Pending, and only counts admin approval; undo preserves the file", () => {
  const e = environment("member@example.com");
  const bytes = Buffer.from("%PDF-1.4\nCourse certificate\n%%EOF");
  const upload = {
    name: "certificate.pdf",
    mimeType: "application/pdf",
    base64: bytes.toString("base64"),
  };
  let db = e.context.getTeamData();
  const key = M.events(db).find((r) => r.type === "Learning").key;
  const submit = e.context.executeHubCommand("completeEvent", {
    key,
    upload,
    evidence: "Finished the course",
    status: "Completed",
    email: "head@example.com",
    "Evidence URL": "https://forged.example",
  });
  const row = submit.data.completions[0];
  assert.equal(row.Status, "Pending");
  assert.equal(row.Email, "member@example.com");
  assert.equal(
    row["Evidence URL"],
    "https://drive.google.com/file/d/file-1/view",
  );
  assert.equal(row["Evidence File ID"], "file-1");
  assert.equal(row["Evidence Filename"], "certificate.pdf");
  assert.equal(row["Evidence Size"], bytes.length);
  assert.deepEqual(Buffer.from(e.files[0].blob.bytes), bytes);
  assert.deepEqual(e.files[0].viewers, ["head@example.com"]);
  assert.equal(e.files[0].owner, "member@example.com");
  assert.equal(M.progress(submit.data, submit.data.team[1]).completed, 0);
  e.context.executeHubCommand("completeEvent", { key, upload });
  assert.equal(e.files.length, 1);
  assert.throws(
    () =>
      e.context.executeHubCommand("reviewSubmission", {
        submissionId: row["Submission ID"],
        decision: "Completed",
        email: "head@example.com",
      }),
    /Admins sheet/,
  );
  e.setEmail("head@example.com");
  const approved = e.context.executeHubCommand("reviewSubmission", {
    submissionId: row["Submission ID"],
    decision: "Completed",
    note: "Certificate checked",
  });
  assert.equal(approved.data.completions[0].Status, "Completed");
  assert.equal(
    approved.data.completions[0]["Reviewer Email"],
    "head@example.com",
  );
  assert.equal(approved.data.logs[0]["Attendees/Completed"], "Member");
  assert.equal(M.progress(approved.data, approved.data.team[1]).completed, 1);
  e.setEmail("member@example.com");
  const undone = e.context.executeHubCommand("revertCompletion", {
    key,
    submissionId: row["Submission ID"],
  });
  assert.equal(undone.data.completions[0].Status, "Uncompleted");
  assert.equal(undone.data.logs[0]["Attendees/Completed"], "");
  assert.equal(e.files[0].trashed, false);
  assert.equal(undone.data.completions[0]["Evidence File ID"], "file-1");
  const updated = e.context.executeHubCommand("completeEvent", { key, upload });
  assert.equal(updated.data.completions.length, 2);
  assert.equal(e.files.length, 2);
  assert.equal(updated.data.completions[1].Status, "Pending");
  assert.equal(e.locked(), false);
});
test("production admin can approve their own attendance and the inbox only exposes current pending attempts", () => {
  const e = environment();
  e.context.executeHubCommand("saveEvent", {
    type: "Meet",
    title: "Admin meeting",
    members: ["1", "2"],
    date: "2026-10-15",
    loggingEnabled: true,
  });
  const event = M.events(e.context.getTeamData()).find(
    (row) => row.type === "Meet",
  );
  let result = e.context.executeHubCommand("completeEvent", { key: event.key });
  const first = result.data.completions.at(-1)["Submission ID"];
  assert.equal(M.pendingReviews(result.data).length, 1);
  assert.equal(
    M.progress(result.data, result.data.team[0]).byType.Meet.completed,
    0,
  );
  result = e.context.executeHubCommand("reviewSubmission", {
    submissionId: first,
    decision: "Completed",
  });
  assert.equal(M.pendingReviews(result.data).length, 0);
  assert.equal(
    result.data.completions.at(-1)["Reviewer Email"],
    "head@example.com",
  );
  assert.equal(
    M.progress(result.data, result.data.team[0]).byType.Meet.completed,
    1,
  );
  e.context.executeHubCommand("revertCompletion", {
    key: event.key,
    submissionId: first,
  });
  result = e.context.executeHubCommand("completeEvent", { key: event.key });
  const second = result.data.completions.at(-1)["Submission ID"];
  assert.notEqual(second, first);
  assert.equal(M.pendingReviews(result.data).length, 1);
  assert.equal(M.pendingReviews(result.data)[0]["Submission ID"], second);
  assert.throws(
    () =>
      e.context.executeHubCommand("reviewSubmission", {
        submissionId: first,
        decision: "Completed",
      }),
    /no longer pending/,
  );
  e.setEmail("member@example.com");
  assert.throws(
    () =>
      e.context.executeHubCommand("reviewSubmission", {
        submissionId: second,
        decision: "Completed",
        email: "head@example.com",
      }),
    /Admins sheet/,
  );
  assert.equal(e.locked(), false);
});

test("production refuses invalid evidence before upload and removes files on failed reviewer sharing or persistence", () => {
  const e = environment("member@example.com");
  const key = M.events(e.context.getTeamData()).find(
    (r) => r.type === "Learning",
  ).key;
  const upload = {
    name: "certificate.pdf",
    mimeType: "application/pdf",
    base64: Buffer.from("%PDF-1.4\n%%EOF").toString("base64"),
  };
  assert.throws(
    () => e.context.executeHubCommand("completeEvent", { key }),
    /Upload course evidence/,
  );
  assert.equal(e.files.length, 0);
  e.failSharing(true);
  assert.throws(
    () => e.context.executeHubCommand("completeEvent", { key, upload }),
    /Could not share evidence/,
  );
  assert.equal(e.files[0].trashed, true);
  assert.equal(e.context.getTeamData().completions.length, 0);
  e.failSharing(false);
  e.sheets.Completion = new Sheet("Completion", [["Timestamp", "Event ID"]]);
  e.sheets.Completion.appendRow = () => {
    throw new Error("Sheet write failed");
  };
  assert.throws(
    () => e.context.executeHubCommand("completeEvent", { key, upload }),
    /Sheet write failed/,
  );
  assert.equal(e.files[1].trashed, true);
  assert.equal(e.context.getTeamData().completions.length, 0);
  assert.equal(e.locked(), false);
});

test("production persists co-leadership and support across subteams, safely disables removed relationships, and rejects leader privilege escalation", () => {
  const e = environment();
  const structure = {
    headId: "1",
    teams: [
      {
        id: "software",
        name: "Software",
        description: "Product",
        color: "purple",
      },
      {
        id: "hardware",
        name: "Hardware",
        description: "Device",
        color: "teal",
      },
    ],
    memberships: [
      { teamId: "software", memberId: "1", role: "Leader" },
      { teamId: "software", memberId: "2", role: "Leader" },
      { teamId: "hardware", memberId: "1", role: "Leader" },
      { teamId: "hardware", memberId: "2", role: "Support" },
    ],
  };
  let db = e.context.executeHubCommand("saveHierarchy", { structure }).data;
  assert.equal(db.subteams.length, 2);
  assert.equal(db.memberships.length, 4);
  assert.equal(db.team[1].Role, "Leader");
  e.setEmail("member@example.com");
  assert.equal(e.context.getTeamData().activeUserSession.isAdmin, false);
  assert.throws(
    () => e.context.executeHubCommand("saveHierarchy", { structure }),
    /Admins sheet/,
  );
  e.setEmail("head@example.com");
  const next = {
    ...structure,
    teams: [{ ...structure.teams[0], name: "Software & AI" }],
    memberships: structure.memberships.filter((r) => r.teamId === "software"),
  };
  db = e.context.executeHubCommand("saveHierarchy", { structure: next }).data;
  assert.equal(db.subteams.length, 2);
  assert.equal(db.memberships.length, 4);
  assert.equal(M.teamStructure(db).teams[0].name, "Software & AI");
  assert.equal(M.teamStructure(db).memberships.length, 2);
  assert.equal(db.team[1].Name, "Member");
  assert.equal(db.subteams[1].Active, "FALSE");
  assert.equal(db.memberships.filter((r) => r.Active === "FALSE").length, 2);
});
test("production skill reset and update persist without changing source profile ratings or duplicating completion counts", () => {
  const e = environment();
  e.context.executeHubCommand("saveSkillRequirements", {
    memberId: "2",
    requirements: [{ label: "Python", category: "Hard Skill", required: true }],
  });
  e.setEmail("member@example.com");
  const key = M.events(e.context.getTeamData()).find((r) => r.requirement).key;
  e.context.executeHubCommand("completeEvent", { key, score: 6 });
  let db = e.context.executeHubCommand("updateSkillCompletion", {
    key,
    score: 8,
  }).data;
  assert.equal(db.completions.length, 2);
  assert.equal(M.events(db).find((r) => r.key === key).totalCompleted, 1);
  assert.equal(M.skillGroups(db, db.team[1])[0].items[0].score, 8);
  db = e.context.executeHubCommand("revertCompletion", {
    key,
    submissionId: db.completions.at(-1)["Submission ID"],
  }).data;
  assert.equal(M.skillGroups(db, db.team[1])[0].items.length, 0);
  assert.equal(M.events(db).find((r) => r.key === key).totalCompleted, 0);
  assert.equal(db.completions[1].Score, 8);
  db = e.context.executeHubCommand("completeEvent", { key, score: 4 }).data;
  assert.equal(M.skillGroups(db, db.team[1])[0].items[0].score, 4);
  assert.equal(db.completions.length, 3);
});
