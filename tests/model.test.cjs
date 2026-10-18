const { test } = require("node:test");
const assert = require("node:assert/strict");
const M = require("../web/model.js");
const base = () => ({
  team: [
    {
      ID: "1",
      Name: "Abdallah Allam",
      Mail: "head@example.com",
      Role: "Team Leader",
      Aliases: "Abdallah-Allam",
      "Hard Skill": "",
    },
    {
      ID: "2",
      Name: "Member Two",
      Mail: "member@example.com",
      Role: "Team member",
      "Reports To": "1",
    },
    {
      ID: "3",
      Name: "Leader Three",
      Mail: "leader@example.com",
      Role: "Leader",
      "Reports To": "1",
      Department: "Software",
    },
  ],
  admins: [{ Email: "head@example.com", Enabled: "TRUE" }],
  meet: [],
  learning: [],
  exam: [],
  tasks: [],
  skillEvents: [],
  logs: [],
  activity: [],
  completions: [],
  skills: [],
});
const now = "2026-10-10T12:00:00Z";
const upload = {
  name: "certificate.pdf",
  mimeType: "application/pdf",
  base64: Buffer.from("%PDF-1.4\nEvidence\n%%EOF").toString("base64"),
};
const apply = (db, email, action, payload) =>
  M.transition(db, email, action, payload, now).db;
const create = (db, type, members = ["1", "2"]) =>
  apply(db, "head@example.com", type === "Task" ? "saveTask" : "saveEvent", {
    type,
    title: type + " event",
    members,
    due: "2026-10-20",
    targetSkill: "Python",
    newId: type,
    loggingEnabled: true,
    date: "2026-10-15",
  });

test("all active event types: eligible denominators, own completion, deduplication and immutable source data", () => {
  let db = base();
  for (const type of M.TYPES) db = create(db, type);
  assert.equal(M.progress(db, db.team[1]).total, 4);
  assert.equal(M.progress(db, db.team[2]).total, 0);
  assert.equal(M.progress(db, db.team[2]).percent, null);
  for (const event of M.events(db).filter((e) => e.type !== "Task")) {
    const previous = JSON.stringify(db);
    const next = M.transition(
      db,
      "member@example.com",
      "completeEvent",
      {
        key: event.key,
        evidence: "Result URL",
        ...(event.type === "Learning" ? { upload } : {}),
      },
      now,
    );
    assert.equal(JSON.stringify(db), previous);
    db = next.db;
    if (M.REVIEW_TYPES.includes(event.type)) {
      assert.equal(
        M.eventState(
          M.events(db).find((e) => e.key === event.key),
          db.team[1],
          "2026-10-10",
        ).pending,
        true,
      );
      db = apply(db, "head@example.com", "reviewSubmission", {
        submissionId: db.completions.at(-1)["Submission ID"],
        decision: "Completed",
      });
    }
    assert.equal(
      M.eventState(
        M.events(db).find((e) => e.key === event.key),
        db.team[1],
        "2026-10-10",
      ).completed,
      true,
    );
    const again = M.transition(
      db,
      "member@example.com",
      "completeEvent",
      { key: event.key },
      now,
    );
    assert.equal(again.unchanged, true);
  }
  db = apply(db, "head@example.com", "moveTask", {
    key: M.events(db).find((e) => e.type === "Task").key,
    status: "Completed",
  });
  assert.equal(db.completions.length, 3);
  assert.equal(M.progress(db, db.team[1]).completed, 4);
  assert.equal(M.progress(db, db.team[0]).completed, 1);
  assert.equal(
    db.activity.filter((r) => r.Action === "completeEvent").length,
    3,
  );
});
test("role names do not grant event admin access; payload identity cannot elevate a member", () => {
  const db = base();
  assert.equal(M.isAdmin(db, db.team[2]), false);
  for (const action of [
    "saveTask",
    "saveEvent",
    "archiveEvent",
    "saveHierarchy",
  ])
    assert.throws(
      () =>
        apply(db, "member@example.com", action, {
          email: "head@example.com",
          title: "Forged",
          members: ["1"],
        }),
      /Admins sheet/,
    );
  assert.throws(() => apply(db, "", "saveTask", {}), /Sign in/);
  db.admins = [{ Name: "Leader Three" }];
  assert.equal(M.isAdmin(db, db.team[2]), true);
  db.admins = [{ Name: "Leader Three", Email: "wrong@example.com" }];
  assert.equal(M.isAdmin(db, db.team[2]), false);
  db.admins = [{ Email: "head@example.com", Enabled: false }];
  assert.equal(M.isAdmin(db, db.team[0]), false);
});
test("completion enforces eligibility and inclusive end-of-day deadlines; admins reopen within tab", () => {
  let db = create(base(), "Meet", ["1"]);
  const key = M.events(db)[0].key;
  assert.throws(
    () => apply(db, "member@example.com", "completeEvent", { key }),
    /not eligible/,
  );
  db = apply(db, "head@example.com", "saveEvent", {
    key,
    type: "Meet",
    title: "Meet event",
    members: ["1", "2"],
    due: "2026-10-10",
  });
  assert.equal(
    M.eventState(M.events(db)[0], db.team[1], "2026-10-10").canComplete,
    true,
  );
  assert.throws(
    () =>
      M.transition(
        db,
        "member@example.com",
        "completeEvent",
        { key },
        "2026-10-11T00:00:01Z",
      ),
    /closed/,
  );
  db = apply(db, "head@example.com", "saveEvent", {
    key,
    type: "Meet",
    title: "Meet renamed",
    members: ["1", "2"],
    due: "2026-10-12",
  });
  db = apply(db, "member@example.com", "completeEvent", { key });
  assert.equal(db.completions[0]["Event Name"], "Meet renamed");
});
test("task completion follows shared board status and rejects individual completion forms", () => {
  let db = create(base(), "Task");
  const key = M.events(db)[0].key;
  assert.throws(
    () => apply(db, "member@example.com", "completeEvent", { key }),
    /Kanban board/,
  );
  db = apply(db, "head@example.com", "moveTask", { key, status: "Completed" });
  assert.equal(M.progress(db, db.team[1]).byType.Task.completed, 1);
  assert.equal(M.progress(db, db.team[0]).byType.Task.completed, 1);
  assert.equal(db.completions.length, 0);
  assert.equal(
    M.transition(
      db,
      "head@example.com",
      "moveTask",
      { key, status: "Completed" },
      now,
    ).unchanged,
    true,
  );
  db.completions.push({
    "Event ID": key,
    "Member ID": "2",
    Status: "Completed",
  });
  db = apply(db, "head@example.com", "moveTask", { key, status: "InProgress" });
  assert.equal(M.events(db)[0].totalCompleted, 0);
  assert.equal(db.completions.length, 1);
  assert.throws(
    () =>
      apply(db, "head@example.com", "saveEvent", {
        type: "Task",
        title: "Invalid path",
        members: ["1"],
      }),
    /Tasks are managed/,
  );
});
test("archive/restore updates eligible denominators without erasing completion records", () => {
  let db = create(base(), "Task");
  const key = M.events(db)[0].key;
  db = apply(db, "head@example.com", "moveTask", { key, status: "Completed" });
  db = apply(db, "head@example.com", "archiveEvent", { key, archived: true });
  assert.equal(M.progress(db, db.team[1]).total, 0);
  assert.equal(db.completions.length, 0);
  db = apply(db, "head@example.com", "archiveEvent", { key, archived: false });
  assert.equal(M.progress(db, db.team[1]).completed, 1);
});
test("legacy source + log reconcile by type and title without counting an event twice; explicit aliases work", () => {
  const db = base();
  db.meet = [
    { "Event ID": "meet-old", "Meeting title": "Review", Date: "2026-10-12" },
  ];
  db.logs = [
    {
      "Event ID": "1",
      "Event Type": "Meet",
      "Event Name": "Review",
      "Invited/Assigned": "Abdallah-Allam\nMember Two",
      "Attendees/Completed": "Abdallah-Allam",
    },
    {
      "Event ID": "2",
      "Event Type": "Skill",
      "Event Name": "Python",
      "Invited/Assigned": "Unknown old name",
      "Attendees/Completed": "Unknown old name",
    },
  ];
  assert.equal(M.events(db).length, 2);
  assert.equal(M.events(db)[0].eligible.length, 2);
  assert.equal(M.progress(db, db.team[0]).completed, 1);
  assert.equal(M.events(db)[1].eligible.length, 0);
  assert.deepEqual(M.events(db)[1].unresolved, ["Unknown old name"]);
  assert.equal(M.events(db)[1].totalEligible, 1);
  assert.equal(M.events(db)[1].totalCompleted, 1);
  db.team[1].Aliases = "Unknown old name";
  assert.equal(M.progress(db, db.team[1]).byType.Skill.completed, 1);
});
test("historical event totals preserve unmatched invitees and completed names without double-counting aliases", () => {
  const db = base();
  db.logs = [
    {
      "Event ID": "old",
      "Event Type": "Skill",
      "Event Name": "Historical",
      "Invited/Assigned":
        "Abdallah-Allam\nAbdallah Allam\nOld member\nAnother old member",
      "Attendees/Completed": "Abdallah-Allam\nOld member",
    },
  ];
  const event = M.events(db)[0];
  assert.equal(event.totalEligible, 3);
  assert.equal(event.totalCompleted, 2);
  assert.equal(event.eligible.length, 1);
  assert.equal(M.progress(db, db.team[0]).byType.Skill.completed, 1);
});
test("aggregate Log compatibility does not duplicate individual completions as imported history", () => {
  let db = create(base(), "Meet");
  const key = M.events(db)[0].key;
  db = apply(db, "member@example.com", "completeEvent", { key });
  assert.equal(db.logs[0]["Legacy Captured"], "TRUE");
  db = apply(db, "head@example.com", "reviewSubmission", {
    submissionId: db.completions.at(-1)["Submission ID"],
    decision: "Completed",
  });
  assert.equal(db.logs[0]["Legacy Completed"], "");
  db = apply(db, "head@example.com", "completeEvent", { key });
  db = apply(db, "head@example.com", "reviewSubmission", {
    submissionId: db.completions.at(-1)["Submission ID"],
    decision: "Completed",
  });
  assert.equal(db.logs[0]["Legacy Completed"], "");
  assert.equal(M.events(db)[0].totalCompleted, 2);
});
test("legacy log-only events retain completion when edited and renamed", () => {
  let db = base();
  db.logs = [
    {
      "Event ID": "7",
      "Event Type": "Skill",
      "Event Name": "Python",
      "Invited/Assigned": "Member Two",
      "Attendees/Completed": "Member Two",
    },
  ];
  const key = M.events(db)[0].key;
  db = apply(db, "head@example.com", "saveEvent", {
    key,
    type: "Skill",
    title: "Python assessment",
    members: ["2"],
    targetSkill: "Python",
    due: "2026-10-20",
  });
  assert.equal(M.events(db).length, 1);
  assert.equal(M.events(db)[0].key, key);
  assert.equal(M.progress(db, db.team[1]).completed, 1);
});
test("skill assessment updates the matrix and CV without generating unrecorded ratings or qualifications", () => {
  let db = create(base(), "Skill", ["1"]);
  const key = M.events(db)[0].key;
  const noData = M.cvData(db, db.team[1]);
  assert.equal(noData.education.length, 0);
  assert.equal(noData.overview, "");
  assert.equal(noData.groups.flatMap((g) => g.items).length, 0);
  db = apply(db, "head@example.com", "completeEvent", {
    key,
    score: 0,
    evidence: "Attempt",
  });
  const profile = M.cvData(db, db.team[0]);
  assert.equal(profile.groups[0].items[0].score, 0);
  assert.equal(profile.groups[0].items[0].source, "Logged assessment");
  assert.equal(profile.progress.byType.Skill.completed, 1);
  assert.throws(
    () =>
      apply(create(base(), "Skill"), "member@example.com", "completeEvent", {
        key,
        score: 11,
      }),
    /0 to 10/,
  );
});
test("subteam hierarchy supports co-leaders, multiple memberships, role changes and safe retirement", () => {
  let db = base();
  const structure = {
    headId: "1",
    teams: [
      {
        id: "software",
        name: "Software",
        description: "Build the product",
        color: "purple",
      },
      {
        id: "hardware",
        name: "Hardware",
        description: "Build the device",
        color: "teal",
      },
    ],
    memberships: [
      { teamId: "software", memberId: "2", role: "Leader" },
      { teamId: "software", memberId: "3", role: "Leader" },
      { teamId: "hardware", memberId: "3", role: "Leader" },
      { teamId: "hardware", memberId: "2", role: "Support" },
    ],
  };
  assert.deepEqual(M.hierarchyErrors(db, structure), []);
  db = apply(db, "head@example.com", "saveHierarchy", { structure });
  assert.equal(M.teamStructure(db).memberships.length, 4);
  assert.equal(
    M.teamStructure(db).memberships.filter(
      (r) => r.teamId === "software" && r.role === "Leader",
    ).length,
    2,
  );
  assert.equal(db.team[1].Role, "Leader");
  assert.equal(db.team[1].Department, "Software | Hardware");
  assert.equal(M.isAdmin(db, db.team[1]), false);
  assert.throws(
    () => apply(db, "member@example.com", "saveHierarchy", { structure }),
    /Admins sheet/,
  );
  for (const invalid of [
    { ...structure, headId: "unknown" },
    { ...structure, teams: [...structure.teams, structure.teams[0]] },
    {
      ...structure,
      memberships: structure.memberships.filter(
        (r) => r.teamId !== "software" || r.role !== "Leader",
      ),
    },
    {
      ...structure,
      memberships: [...structure.memberships, structure.memberships[0]],
    },
    {
      ...structure,
      memberships: [
        ...structure.memberships,
        { teamId: "software", memberId: "missing", role: "Member" },
      ],
    },
  ]) {
    assert.ok(M.hierarchyErrors(db, invalid).length);
    assert.throws(() =>
      apply(db, "head@example.com", "saveHierarchy", { structure: invalid }),
    );
  }
  const renamed = {
    ...structure,
    teams: structure.teams.map((t) =>
      t.id === "software" ? { ...t, name: "Software & AI" } : t,
    ),
    memberships: structure.memberships.map((r) =>
      r.memberId === "2" && r.teamId === "software"
        ? { ...r, role: "Member" }
        : r,
    ),
  };
  db = apply(db, "head@example.com", "saveHierarchy", { structure: renamed });
  assert.equal(db.team[1].Role, "Team member");
  assert.equal(db.subteams.length, 2);
  assert.equal(db.memberships.length, 4);
  const retired = {
    headId: "2",
    teams: renamed.teams.filter((t) => t.id === "software"),
    memberships: renamed.memberships.filter((r) => r.teamId === "software"),
  };
  db = apply(db, "head@example.com", "saveHierarchy", { structure: retired });
  assert.equal(db.team.filter((m) => m.Role === "Team Leader").length, 1);
  assert.equal(db.team[1].Role, "Team Leader");
  assert.equal(M.teamStructure(db).teams.length, 1);
  assert.equal(M.teamStructure(db).memberships.length, 2);
  assert.equal(
    db.subteams.find((t) => t["Subteam ID"] === "hardware").Active,
    "FALSE",
  );
  assert.equal(db.memberships.length, 4);
  db = apply(db, "head@example.com", "saveHierarchy", {
    structure: { headId: "2", teams: [], memberships: [] },
  });
  assert.equal(M.teamStructure(db).teams.length, 0);
  assert.equal(M.teamStructure(db).memberships.length, 0);
});
test("old department data becomes an initial subteam structure without guessing relationships", () => {
  const db = base();
  db.team[1].Department = "Software";
  const result = M.teamStructure(db);
  assert.equal(result.teams.length, 1);
  assert.equal(result.memberships.length, 2);
  assert.equal(
    result.memberships.find((r) => r.memberId === "3").role,
    "Leader",
  );
  assert.equal(
    result.memberships.find((r) => r.memberId === "2").role,
    "Member",
  );
  assert.deepEqual(M.hierarchyErrors(db, result), []);
});
test("skill assessments update the selected matrix category, using the latest recorded result", () => {
  let db = base();
  db.team[1]["Soft Skill"] = "{Communication, 2}";
  db = apply(db, "head@example.com", "saveEvent", {
    type: "Skill",
    title: "Communication review",
    members: ["2"],
    targetSkill: "Communication",
    skillCategory: "Soft Skill",
  });
  let event = M.events(db)[0];
  assert.equal(event.skillCategory, "Soft Skill");
  db = apply(db, "member@example.com", "completeEvent", {
    key: event.key,
    score: 8,
  });
  assert.equal(
    M.skillGroups(db, db.team[1]).find((g) => g.name === "Soft Skill").items[0]
      .score,
    8,
  );
  assert.equal(
    M.skillGroups(db, db.team[1]).find((g) => g.name === "Hard Skill").items
      .length,
    0,
  );
  assert.throws(
    () =>
      apply(db, "head@example.com", "saveEvent", {
        type: "Skill",
        title: "Invalid review",
        members: ["2"],
        targetSkill: "Communication",
        skillCategory: "Invalid",
      }),
    /valid skill category/,
  );
});
test("invalid input does not mutate data or erase zero scores", () => {
  let db = base();
  const original = JSON.stringify(db);
  assert.throws(
    () =>
      apply(db, "head@example.com", "saveTask", {
        title: "X",
        members: ["bogus"],
      }),
    /valid team/,
  );
  assert.equal(JSON.stringify(db), original);
  assert.throws(
    () =>
      apply(db, "head@example.com", "saveTask", {
        title: "X",
        members: ["1"],
        due: "2026-02-30",
      }),
    /valid deadline/,
  );
  db = apply(db, "head@example.com", "saveTask", {
    title: "X",
    members: ["1"],
    score: 0,
  });
  assert.equal(db.tasks[0].Score, undefined);
});

test("project skills follow each member's sheet requirements, with stable completion and immutable ratings", () => {
  let db = base();
  db.team[1]["Hard Skill"] = "{Python, 2}";
  db.skills = [{ "Hard Skill": "Python", "Soft Skill": "Communication" }];
  const originalRatings = db.team[1]["Hard Skill"];
  assert.equal(M.requiredSkills(db, db.team[1]).length, 1);
  let event = M.events(db).find((e) => e.requirement);
  assert.deepEqual(event.eligible.map(M.memberKey), ["2"]);
  db = apply(db, "member@example.com", "completeEvent", {
    key: event.key,
    score: 6,
  });
  assert.equal(M.skillGroups(db, db.team[1])[0].items[0].score, 6);
  assert.equal(M.progress(db, db.team[1]).byType.Skill.completed, 1);
  assert.throws(
    () =>
      apply(db, "member@example.com", "saveSkillRequirements", {
        memberId: "2",
        requirements: [],
      }),
    /Admins sheet/,
  );
  const request = {
    memberId: "2",
    requirements: [
      { label: "Python", category: "Hard Skill", required: false },
      { label: "Communication", category: "Soft Skill", required: true },
    ],
  };
  db = apply(db, "head@example.com", "saveSkillRequirements", request);
  assert.deepEqual(
    M.requiredSkills(db, db.team[1]).map((r) => r.label),
    ["Communication"],
  );
  assert.equal(db.team[1]["Hard Skill"], originalRatings);
  assert.equal(db.completions.length, 1);
  request.requirements[0].required = true;
  assert.equal(M.skillGroups(db, db.team[1])[0].items[0].score, 6);
  db = apply(db, "head@example.com", "saveSkillRequirements", request);
  assert.equal(db.skillRequirements.length, 2);
  event = M.events(db).find((e) => e.key === event.key);
  assert.equal(event.completed.has("2"), true);
  assert.equal(M.events(db).filter((e) => e.key === event.key).length, 1);
});

test("task board moves require admin rights and preserve the task's assignments and completion records", () => {
  let db = create(base(), "Task");
  const key = M.events(db)[0].key;
  const assignees = db.tasks[0].Assignees;
  assert.throws(
    () =>
      apply(db, "member@example.com", "moveTask", {
        key,
        status: "InProgress",
      }),
    /Admins sheet/,
  );
  db = apply(db, "head@example.com", "moveTask", { key, status: "InProgress" });
  assert.equal(db.tasks[0].Status, "InProgress");
  assert.equal(db.tasks[0].Assignees, assignees);
  db.completions.push({
    "Event ID": key,
    "Member ID": "2",
    Status: "Completed",
  });
  db = apply(db, "head@example.com", "moveTask", { key, status: "Blocked" });
  assert.equal(db.completions.length, 1);
  assert.equal(M.events(db)[0].completed.has("2"), false);
  assert.throws(
    () => apply(db, "head@example.com", "moveTask", { key, status: "Invalid" }),
    /valid task status/,
  );
});

test("meeting attendance is controlled by admins; learning cannot be archived and exams are inactive", () => {
  let db = create(base(), "Meet");
  const key = M.events(db)[0].key;
  const edit = {
    key,
    type: "Meet",
    title: "Meet event",
    members: ["1", "2"],
    date: "2026-10-15",
    due: "2026-10-20",
    loggingEnabled: false,
  };
  db = apply(db, "head@example.com", "saveEvent", edit);
  assert.equal(
    M.eventState(M.events(db)[0], db.team[1], "2026-10-10").upcoming,
    true,
  );
  assert.throws(
    () => apply(db, "member@example.com", "completeEvent", { key }),
    /Attendance logging is disabled/,
  );
  db = apply(db, "head@example.com", "saveEvent", {
    ...edit,
    loggingEnabled: true,
  });
  db = apply(db, "member@example.com", "completeEvent", { key });
  assert.equal(db.completions.length, 1);
  db = create(db, "Learning");
  const course = M.events(db).find((e) => e.type === "Learning");
  assert.throws(
    () =>
      apply(db, "head@example.com", "archiveEvent", {
        key: course.key,
        archived: true,
      }),
    /cannot be archived/,
  );
  db.learning[0].Archived = "TRUE";
  assert.equal(M.events(db).find((e) => e.type === "Learning").archived, false);
  assert.equal(M.TYPES.includes("Exam"), false);
  assert.throws(() => create(db, "Exam"));
});

test("blank task/meeting titles and skill metadata stay blank, and meeting dates do not close attendance", () => {
  let db = base();
  db.tasks = [{ "Event ID": "empty", "Task Title": "" }];
  assert.equal(M.events(db).length, 0);
  db = create(db, "Meet");
  db.meet[0].Date = "2026-10-01";
  db.meet[0]["Due to Date"] = "";
  const event = M.events(db)[0];
  assert.equal(event.targetSkill, "");
  db.meet[0]["Target Skill"] = "";
  assert.equal(M.events(db)[0].targetSkill, "");
  assert.equal(
    M.eventState(M.events(db)[0], db.team[1], "2026-10-10").canComplete,
    true,
  );
});

test("courses and attendance require review, preserve attempts, allow withdrawal and undo, and reject stale reviews", () => {
  for (const type of M.REVIEW_TYPES) {
    let db = create(base(), type);
    const key = M.events(db)[0].key;
    const state = () => M.eventState(M.events(db)[0], db.team[1], "2026-10-10");
    const submit = () => {
      db = apply(db, "member@example.com", "completeEvent", {
        key,
        upload,
        status: "Completed",
        reviewer: "forged@example.com",
        "Evidence URL": "https://forged.example",
      });
    };
    assert.equal(state().status, "Uncompleted");
    submit();
    const first = db.completions[0]["Submission ID"];
    assert.equal(state().status, "Pending");
    assert.equal(state().canComplete, false);
    assert.equal(M.progress(db, db.team[1]).completed, 0);
    assert.equal(M.events(db)[0].totalCompleted, 0);
    assert.equal(db.completions[0]["Reviewer Email"], "");
    assert.equal(db.completions[0]["Evidence URL"], "");
    assert.equal(db.logs[0]["Attendees/Completed"], "");
    assert.equal(
      M.transition(
        db,
        "member@example.com",
        "completeEvent",
        { key, upload },
        now,
      ).unchanged,
      true,
    );
    assert.throws(
      () =>
        apply(db, "member@example.com", "reviewSubmission", {
          submissionId: first,
          decision: "Completed",
        }),
      /Admins sheet/,
    );
    assert.throws(
      () =>
        apply(db, "head@example.com", "reviewSubmission", {
          submissionId: first,
          decision: "Uncompleted",
        }),
      /feedback/,
    );
    db = apply(db, "head@example.com", "reviewSubmission", {
      submissionId: first,
      decision: "Uncompleted",
      note: "Please upload a clearer certificate",
    });
    assert.equal(state().status, "Uncompleted");
    assert.equal(
      state().submission["Review Note"],
      "Please upload a clearer certificate",
    );
    submit();
    const second = db.completions.at(-1)["Submission ID"];
    assert.notEqual(first, second);
    assert.throws(
      () =>
        apply(db, "head@example.com", "reviewSubmission", {
          submissionId: first,
          decision: "Completed",
        }),
      /no longer pending/,
    );
    db = apply(db, "member@example.com", "revertCompletion", {
      key,
      submissionId: second,
      memberId: "1",
    });
    assert.equal(state().status, "Uncompleted");
    assert.throws(
      () =>
        apply(db, "head@example.com", "reviewSubmission", {
          submissionId: second,
          decision: "Completed",
        }),
      /no longer pending/,
    );
    submit();
    const third = db.completions.at(-1)["Submission ID"];
    db = apply(db, "head@example.com", "reviewSubmission", {
      submissionId: third,
      decision: "Completed",
      note: "Verified",
    });
    assert.equal(state().status, "Completed");
    assert.equal(state().submission["Reviewer Email"], "head@example.com");
    assert.equal(state().submission["Reviewed At"], now);
    assert.equal(M.progress(db, db.team[1]).completed, 1);
    assert.equal(M.events(db)[0].totalCompleted, 1);
    assert.equal(db.logs[0]["Attendees/Completed"], "Member Two");
    assert.throws(
      () =>
        apply(db, "head@example.com", "revertCompletion", {
          key,
          submissionId: third,
          memberId: "2",
        }),
      /no pending or completed/,
    );
    assert.throws(
      () =>
        apply(db, "member@example.com", "revertCompletion", {
          key,
          submissionId: second,
        }),
      /record has changed/,
    );
    db = M.transition(
      db,
      "member@example.com",
      "revertCompletion",
      { key, submissionId: third },
      "2026-12-01T00:00:00Z",
    ).db;
    assert.equal(state().status, "Uncompleted");
    assert.equal(M.events(db)[0].totalCompleted, 0);
    assert.equal(db.logs[0]["Attendees/Completed"], "");
    assert.equal(db.completions.length, 3);
    assert.equal(db.completions[2]["Reviewer Email"], "head@example.com");
    assert.equal(db.completions[2]["Evidence Filename"], upload.name);
    assert.equal(db.completions[2]["Status Changed By"], "member@example.com");
    assert.equal(
      db.activity.filter((a) => a.Action === "revertCompletion").length,
      2,
    );
    assert.equal(
      db.activity.filter((a) => a.Action === "reviewSubmission").length,
      2,
    );
  }
});
test("member undo overrides imported meeting completions without altering other historical participants", () => {
  let db = create(base(), "Meet");
  const key = M.events(db)[0].key;
  db.logs = [
    {
      "Event Type": "Meet",
      "Event Name": "Meet event",
      "Source ID": M.events(db)[0].id,
      "Invited/Assigned": "Member Two\nAbdallah Allam\nOld Member",
      "Attendees/Completed": "Member Two\nAbdallah Allam\nOld Member",
    },
  ];
  assert.equal(M.events(db)[0].completed.has("2"), true);
  db = apply(db, "member@example.com", "revertCompletion", { key });
  assert.equal(M.events(db)[0].completed.has("2"), false);
  assert.equal(M.events(db)[0].completed.has("1"), true);
  assert.equal(db.logs[0]["Attendees/Completed"], "Abdallah Allam\nOld Member");
  assert.equal(
    db.logs[0]["Legacy Completed"],
    "Member Two\nAbdallah Allam\nOld Member",
  );
  db = apply(db, "member@example.com", "completeEvent", { key });
  assert.equal(M.events(db)[0].completed.has("2"), false);
  db = apply(db, "head@example.com", "reviewSubmission", {
    submissionId: db.completions.at(-1)["Submission ID"],
    decision: "Completed",
  });
  assert.equal(M.events(db)[0].completed.has("2"), true);
});
test("course evidence must be an actual supported file within the limit; meeting files are optional", () => {
  const db = create(base(), "Learning"),
    key = M.events(db)[0].key;
  assert.throws(
    () =>
      apply(db, "member@example.com", "completeEvent", {
        key,
        evidence: "https://certificate.example",
      }),
    /Upload course evidence/,
  );
  for (const invalid of [
    { ...upload, mimeType: "text/html" },
    { ...upload, base64: "PHNjcmlwdD4=" },
    { ...upload, base64: "bad" },
    {
      ...upload,
      base64: "A".repeat(Math.ceil(M.MAX_EVIDENCE_BYTES / 3) * 4 + 4),
    },
  ]) {
    assert.throws(
      () =>
        apply(db, "member@example.com", "completeEvent", {
          key,
          upload: invalid,
        }),
      /PDF|Invalid evidence|contents/,
    );
  }
  assert.equal(
    M.validateUpload(upload).size,
    Buffer.from(upload.base64, "base64").length,
  );
  assert.equal(db.completions.length, 0);
  const meeting = create(base(), "Meet");
  const result = apply(meeting, "member@example.com", "completeEvent", {
    key: M.events(meeting)[0].key,
  });
  assert.equal(result.completions[0].Status, "Pending");
  assert.equal(result.completions[0]["Evidence Filename"], "");
});

test("skill results update or reset independently of event settings, retaining history and source ratings", () => {
  let db = base();
  db.team[1]["Hard Skill"] = "{Python,2}";
  const key = M.events(db).find((e) => e.requirement).key;
  const rating = () =>
    M.skillGroups(db, db.team[1])[0].items.find((i) => i.label === "Python")
      .score;
  db = apply(db, "member@example.com", "completeEvent", {
    key,
    score: 6,
    evidence: "First result",
  });
  assert.equal(rating(), 6);
  db = apply(db, "member@example.com", "updateSkillCompletion", {
    key,
    score: 8,
    evidence: "Corrected result",
  });
  assert.equal(rating(), 8);
  assert.equal(db.completions.length, 2);
  assert.equal(M.events(db)[0].totalCompleted, 1);
  assert.equal(db.completions[0].Score, 6);
  assert.throws(
    () =>
      apply(db, "head@example.com", "updateSkillCompletion", {
        key,
        score: 9,
        memberId: "2",
      }),
    /not eligible|Complete this skill/,
  );
  assert.throws(
    () =>
      apply(db, "member@example.com", "updateSkillCompletion", {
        key,
        score: 11,
      }),
    /0 to 10/,
  );
  const id = db.completions.at(-1)["Submission ID"];
  db = apply(db, "member@example.com", "revertCompletion", {
    key,
    submissionId: id,
  });
  assert.equal(rating(), 2);
  assert.equal(M.progress(db, db.team[1]).byType.Skill.completed, 0);
  assert.equal(db.completions[1].Score, 8);
  assert.equal(db.team[1]["Hard Skill"], "{Python,2}");
  assert.equal(db.logs[0]["Attendees/Completed"], "");
  db = apply(db, "member@example.com", "completeEvent", { key, score: 4 });
  assert.equal(rating(), 4);
  assert.equal(db.completions.length, 3);
  assert.equal(M.progress(db, db.team[1]).byType.Skill.completed, 1);
});

test("minimal event writes preserve legacy values and omit unused fields from new records", () => {
  let db = create(base(), "Task");
  const task = db.tasks[0],
    key = M.events(db)[0].key;
  Object.assign(task, {
    Score: 0,
    ETA: "2",
    Scale: "week",
    "Break down (DOD)": "Historical detail",
    Feedback: "Previous feedback",
  });
  db = apply(db, "head@example.com", "saveTask", {
    key,
    title: "Renamed task",
    members: ["1", "2"],
    status: "Pending",
    due: "2026-10-25",
    score: 9,
    dod: "Overwrite attempt",
  });
  assert.equal(db.tasks[0].Score, 0);
  assert.equal(db.tasks[0]["Break down (DOD)"], "Historical detail");
  const fresh = apply(base(), "head@example.com", "saveTask", {
    title: "Simple task",
    members: ["2"],
    status: "Backlog",
    score: 5,
    eta: "3",
    dod: "Unused",
  }).tasks[0];
  for (const field of [
    "Score",
    "Feedback",
    "ETA",
    "ATA",
    "Scale",
    "Break down (DOD)",
  ])
    assert.equal(Object.hasOwn(fresh, field), false);
  db = create(base(), "Learning");
  db.learning[0].Platform = "Existing platform";
  db.learning[0]["Track ID"] = "old-id";
  db.learning[0].Skill = "Existing topics";
  db = apply(db, "head@example.com", "saveEvent", {
    type: "Learning",
    key: M.events(db)[0].key,
    title: "Updated course",
    members: ["2"],
    link: "https://example.com/course",
    trackName: "Core learning",
    obligation: "Mandatory",
  });
  assert.equal(db.learning[0].Platform, "Existing platform");
  assert.equal(db.learning[0]["Track ID"], "old-id");
  assert.equal(db.learning[0].Skill, "Existing topics");
  const meeting = create(base(), "Meet").meet[0];
  assert.equal(Object.hasOwn(meeting, "Meeting Type"), false);
  assert.equal(Object.hasOwn(meeting, "Target Skill"), false);
  assert.throws(
    () =>
      apply(base(), "head@example.com", "saveEvent", {
        type: "Meet",
        title: "Undated meeting",
        members: ["2"],
      }),
    /meeting date/,
  );
});
