/* Shared by Apps Script, the local adapter and tests. No browser or GAS dependencies. */
const HubModel = (() => {
  const TYPES = ["Task", "Meet", "Learning", "Skill"];
  const EVENT_FORM_FIELDS = {
    Task: ["title", "description", "members", "status", "due"],
    Meet: [
      "title",
      "description",
      "members",
      "date",
      "link",
      "loggingEnabled",
      "due",
    ],
    Learning: [
      "title",
      "description",
      "members",
      "link",
      "trackName",
      "obligation",
      "due",
    ],
  };
  const EVENT_COLUMNS = {
    Task: [
      "Task Title",
      "Task description",
      "Assignees",
      "Status",
      "Due to Date",
      "Archived",
      "Event ID",
    ],
    Meet: [
      "Meeting title",
      "Date",
      "Description",
      "Attachments",
      "Invited/Assigned",
      "Logging Enabled",
      "Due to Date",
      "Archived",
      "Event ID",
    ],
    Learning: [
      "Topic name",
      "Link",
      "Track Name",
      "Obligability",
      "Invited/Assigned",
      "Due to Date",
      "Description",
      "Event ID",
    ],
  };
  const REVIEW_TYPES = ["Learning", "Meet"];
  const COMPLETION_STATES = ["Uncompleted", "Pending", "Completed"];
  const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
  const completionStatus = (row) =>
    COMPLETION_STATES.includes(clean(row.Status))
      ? clean(row.Status)
      : "Completed";
  function validateUpload(upload) {
    assert(
      upload && typeof upload === "object",
      "Choose a PDF, PNG or JPEG evidence file, up to 10 MB.",
    );
    const name = clean(upload.name).replace(/[\\/\x00-\x1f]/g, "_");
    const signatures = {
      "application/pdf": "JVBERi0",
      "image/png": "iVBORw0KGgo",
      "image/jpeg": "/9j/",
    };
    const base64 = upload.base64;
    assert(
      name && name.length <= 200 && signatures[upload.mimeType],
      "Choose a PDF, PNG or JPEG evidence file.",
    );
    assert(
      typeof base64 === "string" &&
        base64.length <= Math.ceil(MAX_EVIDENCE_BYTES / 3) * 4 &&
        base64.length % 4 === 0 &&
        /^[A-Za-z0-9+/]+={0,2}$/.test(base64),
      "Invalid evidence file or file exceeds 10 MB.",
    );
    const size =
      (base64.length / 4) * 3 -
      (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
    assert(
      size > 0 &&
        size <= MAX_EVIDENCE_BYTES &&
        base64.startsWith(signatures[upload.mimeType]),
      "The file contents do not match the selected PDF or image format.",
    );
    return { name, mimeType: upload.mimeType, size };
  }
  const LABELS = {
    Task: "Tasks",
    Meet: "Meetings",
    Learning: "Learning",
    Skill: "Skills",
  };
  const TABLES = {
    Task: "tasks",
    Meet: "meet",
    Learning: "learning",
    Skill: "skillEvents",
  };
  const TITLES = {
    Task: "Task Title",
    Meet: "Meeting title",
    Learning: "Topic name",
    Skill: "Event Name",
  };
  const STATUS = ["Backlog", "Pending", "InProgress", "Blocked", "Completed"];
  const RATING_FIELDS = [
    "Hard Skill",
    "Soft Skill",
    "Technology",
    "Personality",
    "Abilities",
  ];
  const clean = (v) => String(v == null ? "" : v).trim();
  const norm = (v) =>
    clean(v)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\s\-–—]+/g, " ");
  const list = (v) =>
    (Array.isArray(v) ? v : clean(v).split(/[\n,;]+/))
      .map(clean)
      .filter(Boolean);
  const id = (v) => clean(v).replace(/\.0+$/, "");
  const memberKey = (m) => id(m.ID) || norm(m.Mail) || norm(m.Name);
  const truth = (v) => ["true", "yes", "1"].includes(norm(v));
  const status = (v) =>
    ({
      backlog: "Backlog",
      pending: "Pending",
      inprogress: "InProgress",
      blocked: "Blocked",
      completed: "Completed",
      done: "Completed",
      complete: "Completed",
      closed: "Completed",
    })[norm(v).replace(/\s/g, "")] || "Pending";
  const dateOnly = (v) =>
    /^\d{4}-\d{2}-\d{2}/.test(clean(v)) ? clean(v).slice(0, 10) : "";
  const validDate = (v) =>
    /^\d{4}-\d{2}-\d{2}$/.test(clean(v)) &&
    !isNaN(Date.parse(v + "T00:00:00Z")) &&
    new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
  const number = (v) =>
    clean(v) !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
  const role = (m) => {
    const value = norm(m.Role || m.Rule);
    if (["team leader", "team lead"].includes(value)) return "Team Leader";
    if (["leader", "subteam leader", "sub team leader"].includes(value))
      return "Leader";
    return "Team member";
  };
  function resolveMember(db, token) {
    const wanted = norm(token);
    if (!wanted) return null;
    const matches = (db.team || []).filter((m) =>
      [memberKey(m), m.Name, m.Mail, ...list(m.Aliases)].some(
        (v) => norm(v) === wanted,
      ),
    );
    return matches.length === 1 ? matches[0] : null;
  }
  function people(db, value) {
    return [
      ...new Map(
        list(value)
          .map((t) => resolveMember(db, t))
          .filter(Boolean)
          .map((m) => [memberKey(m), m]),
      ).values(),
    ];
  }
  function actor(db, email) {
    const matches = (db.team || []).filter(
      (m) => norm(m.Mail) === norm(email) && norm(email),
    );
    return matches.length === 1 ? matches[0] : null;
  }
  function isAdmin(db, member) {
    if (!member) return false;
    return (db.admins || []).some((a) => {
      if (["false", "no", "0"].includes(norm(a.Enabled))) return false;
      // A supplied email takes precedence over a name; a misspelled email cannot grant access by name.
      return clean(a.Email)
        ? norm(a.Email) === norm(member.Mail)
        : clean(a.Name) && resolveMember(db, a.Name) === member;
    });
  }
  function parseRatings(value) {
    const items = [];
    for (const match of clean(value).matchAll(/\{([^}]+)\}/g)) {
      const at = match[1].lastIndexOf(",");
      const label = clean(match[1].slice(0, at));
      const score = number(match[1].slice(at + 1));
      if (at >= 0 && label && score !== null && score >= 0 && score <= 10)
        items.push({ label, score, source: "Team sheet" });
    }
    return items;
  }
  function ratingCategory(db, label) {
    return (
      RATING_FIELDS.find(
        (field) =>
          (db.skills || []).some(
            (s) => norm(s[field]) === norm(label) && clean(label),
          ) ||
          (db.team || []).some((m) =>
            parseRatings(m[field]).some((i) => norm(i.label) === norm(label)),
          ),
      ) || "Hard Skill"
    );
  }
  const PROJECT_FIELDS = ["Hard Skill", "Soft Skill", "Technology"];
  const skillKey = (category, label) => category + ":" + norm(label);
  function projectSkills(db) {
    const items = new Map();
    const add = (category, label) => {
      if (clean(label))
        items.set(skillKey(category, label), { category, label: clean(label) });
    };
    (db.skills || []).forEach((s) =>
      PROJECT_FIELDS.forEach((field) => add(field, s[field])),
    );
    (db.team || []).forEach((m) =>
      PROJECT_FIELDS.forEach((field) =>
        parseRatings(m[field]).forEach((i) => add(field, i.label)),
      ),
    );
    (db.skillRequirements || []).forEach((r) => add(r.Category, r.Skill));
    return [...items.values()];
  }
  function requiredSkills(db, member) {
    const items = new Map();
    PROJECT_FIELDS.forEach((category) =>
      parseRatings(member[category]).forEach((i) =>
        items.set(skillKey(category, i.label), {
          label: i.label,
          category,
          target: null,
        }),
      ),
    );
    (db.skillRequirements || [])
      .filter((r) => id(r["Member ID"]) === memberKey(member))
      .forEach((r) => {
        const key = skillKey(r.Category, r.Skill);
        if (truth(r.Required))
          items.set(key, {
            label: clean(r.Skill),
            category: r.Category,
            target: number(r["Target Score"]),
          });
        else items.delete(key);
      });
    return [...items.values()];
  }
  function events(db) {
    const result = [];
    const matchedLogs = new Set();
    TYPES.forEach((type) =>
      (db[TABLES[type]] || []).forEach((row, index) => {
        const title = clean(
          row[TITLES[type]] || (type === "Learning" ? row["Course Name"] : ""),
        );
        if (!title) return;
        const sourceId = id(row["Event ID"]);
        const candidates = (db.logs || []).filter(
          (l) =>
            clean(l["Event Type"]) === type &&
            (sourceId
              ? id(l["Source ID"]) === sourceId ||
                (!clean(l["Source ID"]) &&
                  norm(l["Event Name"]) === norm(title))
              : norm(l["Event Name"]) === norm(title)),
        );
        candidates.forEach((l) => matchedLogs.add(l));
        const log = candidates[0];
        result.push(
          makeEvent(
            db,
            type,
            title,
            sourceId || `${type.toLowerCase()}-row-${index + 2}`,
            row,
            candidates,
            log,
          ),
        );
      }),
    );
    const requirements = new Map();
    (db.team || []).forEach((m) =>
      requiredSkills(db, m).forEach((r) => {
        const key = skillKey(r.category, r.label);
        if (!requirements.has(key))
          requirements.set(key, { ...r, members: [] });
        requirements.get(key).members.push(m);
      }),
    );
    requirements.forEach((r, key) => {
      const sourceId = "required-" + encodeURIComponent(key);
      const logs = (db.logs || []).filter(
        (l) =>
          clean(l["Event Type"]) === "Skill" && id(l["Source ID"]) === sourceId,
      );
      logs.forEach((l) => matchedLogs.add(l));
      const row = {
        "Event Name": r.label,
        "Event ID": sourceId,
        "Target Skill": r.label,
        "Skill Category": r.category,
        "Invited/Assigned": r.members.map((m) => clean(m.Name)).join("\n"),
        Requirement: true,
      };
      result.push(
        makeEvent(db, "Skill", r.label, sourceId, row, logs, logs[0]),
      );
    });
    (db.logs || []).forEach((log) => {
      const type = clean(log["Event Type"]);
      const sourceId = id(log["Source ID"]);
      const retiredRequirement =
        sourceId.startsWith("required-") && !matchedLogs.has(log);
      let retiredCategory = "Hard Skill";
      if (retiredRequirement) {
        try {
          retiredCategory = decodeURIComponent(sourceId.slice(9)).split(":")[0];
        } catch (_) {}
      }
      if (
        !matchedLogs.has(log) &&
        TYPES.includes(type) &&
        clean(log["Event Name"])
      )
        result.push(
          makeEvent(
            db,
            type,
            clean(log["Event Name"]),
            sourceId || `legacy-${id(log["Event ID"])}`,
            retiredRequirement
              ? {
                  Archived: "TRUE",
                  "Target Skill": log["Target Skill"] || log["Event Name"],
                  "Skill Category": log["Skill Category"] || retiredCategory,
                }
              : {},
            [log],
            log,
          ),
        );
    });
    return result;
  }
  function taskLinks(row) {
    try {
      const links = JSON.parse(clean(row["Evidence Links"]) || "[]");
      return Array.isArray(links)
        ? links.filter(
            (link) =>
              link &&
              clean(link.id) &&
              /^https?:\/\/[^\s]+$/i.test(clean(link.url)),
          )
        : [];
    } catch (_) {
      return [];
    }
  }
  function makeEvent(db, type, title, eventId, row, logs, log) {
    const assigned = clean(
      type === "Task"
        ? row.Assignees
        : row["Invited/Assigned"] || (log && log["Invited/Assigned"]),
    );
    const eligible = assigned
      ? people(db, assigned)
      : type === "Task"
        ? []
        : db.team || [];
    const key = `${type}:${eventId}`;
    const completions = (db.completions || []).filter(
      (c) => clean(c["Event ID"]) === key,
    );
    const legacyPeople = people(
      db,
      logs.map((l) => clean(l["Attendees/Completed"])).join("\n"),
    );
    // A legacy task status only describes the whole assignment. New task completion is per member.
    const identity = (token) => {
      const m = resolveMember(db, token);
      return m ? memberKey(m) : "unmatched:" + norm(token);
    };
    const eligibleIdentities = new Set(
      assigned ? list(assigned).map(identity) : eligible.map(memberKey),
    );
    const completedIdentities = new Set(
      list(logs.map((l) => clean(l["Attendees/Completed"])).join("\n")).map(
        identity,
      ),
    );
    const completed = new Set(legacyPeople.map(memberKey));
    const submissions = new Map();
    completions.forEach((c) => {
      const m = resolveMember(db, c["Member ID"] || c.Email || c.Name);
      const identityKey = m ? memberKey(m) : identity(c.Name || c.Email);
      submissions.set(identityKey, c);
      // The latest attempt overrides imported aggregates, including a member's undo.
      completed.delete(identityKey);
      completedIdentities.delete(identityKey);
      if (completionStatus(c) !== "Completed") return;
      if (m) {
        completed.add(memberKey(m));
        completedIdentities.add(memberKey(m));
      } else if (c.Name) completedIdentities.add(identity(c.Name));
    });
    if (type === "Task") {
      // Kanban status is the sole current completion state. Preserve old personal logs as history.
      completed.clear();
      completedIdentities.clear();
      if (status(row.Status) === "Completed") {
        eligible.forEach((m) => completed.add(memberKey(m)));
        eligibleIdentities.forEach((key) => completedIdentities.add(key));
      }
    }
    const due = dateOnly(
      row["Due to Date"] ||
        (log && log["Due to Date"]) ||
        (type !== "Task" && type !== "Meet" && row.Date) ||
        (type === "Task" && row.ETA),
    );
    return {
      key,
      id: eventId,
      type,
      links:
        type === "Task"
          ? taskLinks(row).filter((link) => link.active !== false)
          : [],
      title,
      row,
      log,
      eligible,
      completed,
      completions,
      submissions,
      due,
      totalEligible: eligibleIdentities.size,
      totalCompleted: [...eligibleIdentities].filter((key) =>
        completedIdentities.has(key),
      ).length,
      description: clean(row.Description || row["Task description"]),
      archived:
        type !== "Learning" && truth(row.Archived || (log && log.Archived)),
      requirement: truth(row.Requirement),
      meetingDate: type === "Meet" ? dateOnly(row.Date) : "",
      loggingEnabled: type !== "Meet" || truth(row["Logging Enabled"]),
      targetSkill: clean(
        row["Target Skill"] || (type === "Learning" ? row.Skill : ""),
      ),
      skillCategory:
        clean(row["Skill Category"]) ||
        ratingCategory(db, row["Target Skill"] || title),
      unresolved: list(assigned).filter((t) => !resolveMember(db, t)),
      legacyCompletions: list(
        logs.map((l) => clean(l["Attendees/Completed"])).join("\n"),
      ).filter((t) => !resolveMember(db, t)),
    };
  }
  function pendingReviews(db, eventRows = events(db)) {
    return eventRows
      .filter((event) => REVIEW_TYPES.includes(event.type))
      .flatMap((event) => [...event.submissions.values()])
      .filter((row) => completionStatus(row) === "Pending")
      .sort((a, b) => clean(a.Timestamp).localeCompare(clean(b.Timestamp)));
  }
  function eventState(event, member, today) {
    const key = member && memberKey(member);
    const eligible = !!key && event.eligible.some((m) => memberKey(m) === key);
    const completed = !!key && event.completed.has(key);
    const submission = key ? event.submissions.get(key) : null;
    const reviewRequired = REVIEW_TYPES.includes(event.type);
    const pending = !!submission && completionStatus(submission) === "Pending";
    const closed = !!event.due && event.due < today;
    const upcoming = event.type === "Meet" && event.meetingDate > today;
    const loggingDisabled = event.type === "Meet" && !event.loggingEnabled;
    return {
      eligible,
      completed,
      pending,
      submission,
      reviewRequired,
      status: completed ? "Completed" : pending ? "Pending" : "Uncompleted",
      canRevert:
        (reviewRequired || event.type === "Skill") && (pending || completed),
      closed,
      upcoming,
      loggingDisabled,
      canComplete:
        eligible &&
        !completed &&
        !pending &&
        !closed &&
        !event.archived &&
        !loggingDisabled,
      label: completed
        ? "Completed by you"
        : pending
          ? "Pending review"
          : !eligible
            ? "Not assigned to you"
            : closed
              ? "Closed"
              : loggingDisabled
                ? "Attendance logging closed"
                : event.type === "Meet"
                  ? "Attendance logging open"
                  : reviewRequired
                    ? "Uncompleted"
                    : "Ready to complete",
    };
  }
  function progress(db, member, eventRows = events(db)) {
    const key = member && memberKey(member);
    const all = eventRows.filter(
      (e) => !e.archived && e.eligible.some((m) => memberKey(m) === key),
    );
    const byType = {};
    TYPES.forEach((type) => {
      const rows = all.filter((e) => e.type === type);
      const completed = rows.filter((e) => e.completed.has(key)).length;
      byType[type] = {
        completed,
        total: rows.length,
        percent: rows.length
          ? Math.round((100 * completed) / rows.length)
          : null,
      };
    });
    const completed = all.filter((e) => e.completed.has(key)).length;
    return {
      byType,
      completed,
      total: all.length,
      percent: all.length ? Math.round((100 * completed) / all.length) : null,
    };
  }
  function skillGroups(db, member, eventRows = events(db)) {
    return RATING_FIELDS.map((field) => {
      const items = parseRatings(member[field]);
      {
        const assessments = eventRows
          .filter(
            (e) =>
              e.type === "Skill" && e.targetSkill && e.skillCategory === field,
          )
          .flatMap((e) =>
            [...e.submissions.values()]
              .filter(
                (c) =>
                  id(c["Member ID"]) === memberKey(member) &&
                  completionStatus(c) === "Completed" &&
                  number(c.Score) !== null,
              )
              .map((c) => ({ ...c, skill: e.targetSkill })),
          )
          .sort((a, b) => clean(a.Timestamp).localeCompare(clean(b.Timestamp)));
        assessments.forEach((assessment) => {
          const item = {
            label: assessment.skill,
            score: number(assessment.Score),
            source: "Logged assessment",
          };
          const index = items.findIndex(
            (i) => norm(i.label) === norm(item.label),
          );
          if (index >= 0) items[index] = item;
          else items.push(item);
        });
      }
      return { name: field, items };
    });
  }
  function education(member) {
    const raw = clean(member.Education);
    const blocks = [...raw.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    return (blocks.length ? blocks : raw.split("\n"))
      .map(clean)
      .filter(Boolean);
  }
  function cvData(db, member) {
    const eventRows = events(db);
    const text = (value) => {
      const valueText = clean(value);
      return /^(null|undefined|nan|n\/?a|none|not provided|not available|true|false|yes|no|نعم|لا|[-–—]+)$/i.test(
        valueText,
      )
        ? ""
        : valueText;
    };
    const entries = (value) => {
      if (!text(value)) return [];
      try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        if (Array.isArray(parsed))
          return parsed.flatMap((group) =>
            Array.isArray(group?.items)
              ? group.items
                  .filter((item) => typeof item === "string")
                  .map(text)
                  .filter(Boolean)
              : [],
          );
      } catch (_) {
        /* Older sheets store plain text or rating pairs. */
      }
      const ratings = parseRatings(value);
      return ratings.length
        ? ratings.map((item) => text(item.label)).filter(Boolean)
        : text(value).split(/\r?\n/).map(text).filter(Boolean);
    };
    const unique = (items) => [
      ...new Map(items.map((item) => [norm(item), item])).values(),
    ];
    const groups = skillGroups(db, member, eventRows).map((group) => ({
      ...group,
      items: group.items.filter((item) => text(item.label)),
    }));
    const structure = teamStructure(db);
    const appointments = structure.memberships
      .filter((membership) => membership.memberId === memberKey(member))
      .map((membership) => ({
        team: text(
          structure.teams.find((team) => team.id === membership.teamId)?.name,
        ),
        role:
          membership.role === "Leader"
            ? "Subteam Leader"
            : membership.role === "Support"
              ? "Supporting Member"
              : "Team Member",
      }))
      .filter((appointment) => appointment.team);
    if (structure.headId === memberKey(member))
      appointments.unshift({ team: "ASAR Team", role: "Team Leader" });
    const labels = (category) =>
      groups
        .find((group) => group.name === category)
        ?.items.map((item) => item.label) || [];
    return {
      name: text(member.Name),
      role: role(member) === "Team member" ? "Team Member" : role(member),
      department: text(member.Department),
      email: text(member.Mail),
      phone: text(id(member["Phone number"])),
      overview: text(member.overview || member.Overview),
      education: education(member).map(text).filter(Boolean),
      groups,
      technical: unique([...labels("Hard Skill"), ...entries(member.Skills)]),
      tools: unique(labels("Technology")),
      interpersonal: unique([
        ...labels("Soft Skill"),
        ...entries(member.Personality),
      ]),
      knowledge: unique(entries(member.Knowledge)),
      abilities: unique(entries(member.Abilities)),
      appointments,
      learning: eventRows
        .filter(
          (event) =>
            event.type === "Learning" && event.completed.has(memberKey(member)),
        )
        .map((event) => ({
          title: text(event.title),
          track: text(event.row["Track Name"]),
          url: /^https?:\/\//i.test(clean(event.row.Link))
            ? clean(event.row.Link)
            : "",
        }))
        .filter((course) => course.title),
      progress: progress(db, member, eventRows),
      tasks: eventRows
        .filter(
          (e) =>
            e.type === "Task" &&
            e.eligible.some((m) => memberKey(m) === memberKey(member)),
        )
        .map((e) => ({
          title: text(e.title),
          description: text(e.description),
          dod: text(e.row["Break down (DOD)"]),
          includedInCV:
            e.completed.has(memberKey(member)) ||
            (!e.archived && status(e.row.Status) === "InProgress"),
          status:
            (e.completed.has(memberKey(member))
              ? "Completed"
              : status(e.row.Status)) + (e.archived ? " (Archived)" : ""),
          score: number(e.row.Score),
          feedback: text(e.row.Feedback),
        })),
    };
  }
  const MEMBERSHIP_ROLES = ["Leader", "Member", "Support"];
  const TEAM_COLORS = ["purple", "teal", "blue", "amber", "rose"];
  const enabled = (row) => !["false", "no", "0"].includes(norm(row.Active));
  function teamStructure(db) {
    const head = (db.team || []).find((m) => role(m) === "Team Leader");
    let teams, memberships;
    if ((db.subteams || []).length) {
      teams = db.subteams.filter(enabled).map((t) => ({
        id: id(t["Subteam ID"]),
        name: clean(t.Name),
        description: clean(t.Description),
        color: TEAM_COLORS.includes(t.Color) ? t.Color : "purple",
      }));
      const ids = new Set(teams.map((t) => t.id));
      memberships = (db.memberships || [])
        .filter(
          (r) =>
            enabled(r) &&
            ids.has(id(r["Subteam ID"])) &&
            (db.team || []).some((m) => memberKey(m) === id(r["Member ID"])),
        )
        .map((r) => ({
          teamId: id(r["Subteam ID"]),
          memberId: id(r["Member ID"]),
          role: clean(r.Role),
        }));
    } else {
      // Deterministic fallback for an older sheet, until the normalized sheets are migrated.
      const names = [
        ...new Set(
          (db.team || []).map((m) => clean(m.Department)).filter(Boolean),
        ),
      ];
      teams = names.map((name, i) => ({
        id: "legacy-" + (i + 1),
        name,
        description: "",
        color: TEAM_COLORS[i % TEAM_COLORS.length],
      }));
      memberships = (db.team || [])
        .filter((m) => clean(m.Department))
        .map((m) => ({
          teamId: teams.find((t) => t.name === clean(m.Department)).id,
          memberId: memberKey(m),
          role: role(m) === "Leader" ? "Leader" : "Member",
        }));
    }
    return { headId: head ? memberKey(head) : "", teams, memberships };
  }
  function hierarchyErrors(db, structure) {
    if (!structure || Array.isArray(structure))
      return ["Refresh the app to use subteam settings."];
    const { headId, teams = [], memberships = [] } = structure;
    const errors = [];
    const ids = new Set((db.team || []).map(memberKey));
    if (!ids.has(headId)) errors.push("Choose exactly one Team Leader.");
    if (
      !Array.isArray(teams) ||
      !Array.isArray(memberships) ||
      teams.length > 100 ||
      memberships.length > 5000
    )
      return ["Invalid subteam settings."];
    if (new Set(teams.map((t) => clean(t.id))).size !== teams.length)
      errors.push("Subteam IDs must be unique.");
    if (new Set(teams.map((t) => norm(t.name))).size !== teams.length)
      errors.push("Subteam names must be unique.");
    teams.forEach((t) => {
      if (
        !/^[a-zA-Z0-9_-]{1,80}$/.test(clean(t.id)) ||
        !clean(t.name) ||
        clean(t.name).length > 100 ||
        clean(t.description).length > 1000 ||
        !TEAM_COLORS.includes(t.color)
      )
        errors.push("Each subteam needs a valid ID, name and color.");
      if (!memberships.some((r) => r.teamId === t.id && r.role === "Leader"))
        errors.push("Every subteam needs at least one leader.");
    });
    const teamIds = new Set(teams.map((t) => t.id));
    if (
      new Set(memberships.map((r) => r.teamId + ":" + r.memberId)).size !==
      memberships.length
    )
      errors.push("A member can have one role per subteam.");
    memberships.forEach((r) => {
      if (
        !teamIds.has(r.teamId) ||
        !ids.has(r.memberId) ||
        !MEMBERSHIP_ROLES.includes(r.role)
      )
        errors.push("Choose valid members, subteams and membership roles.");
    });
    return [...new Set(errors)];
  }
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  function selectedMembers(db, payload) {
    const tokens = list(payload.members);
    const members = people(db, tokens);
    assert(
      tokens.length && members.length === new Set(tokens.map(norm)).size,
      "Choose valid team members. Resolve duplicate or unknown identities first.",
    );
    return members.map((m) => clean(m.Name)).join("\n");
  }
  function safeText(value) {
    const text = clean(value);
    assert(text.length <= 16000, "A field is too long.");
    return text;
  }
  function transition(input, email, action, payload, now) {
    const db = JSON.parse(JSON.stringify(input));
    const member = actor(db, email);
    assert(member, "Sign in with an account listed in the Team sheet.");
    const admin = isAdmin(db, member);
    const today = dateOnly(now);
    const adminActions = [
      "saveEvent",
      "saveTask",
      "archiveEvent",
      "saveHierarchy",
      "moveTask",
      "saveSkillRequirements",
      "reviewSubmission",
    ];
    if (adminActions.includes(action))
      assert(
        admin,
        "Only members explicitly listed in the Admins sheet may manage events or hierarchy.",
      );
    db.completions = db.completions || [];
    db.activity = db.activity || [];
    db.logs = db.logs || [];
    const find = () => {
      const e = events(db).find((e) => e.key === payload.key);
      assert(e, "Event not found. Refresh the page.");
      return e;
    };
    const newId = (prefix) =>
      `${prefix}-${clean(payload.newId) || Date.parse(now).toString(36) + "-" + Math.random().toString(36).slice(2, 9)}`;
    let target = "";
    let details = {};
    const syncLog = (e) => {
      let log = e.log;
      if (!log) {
        log = {
          "Event Type": e.type,
          "Event ID": newId("log"),
          "Event Name": e.title,
          "Source ID": e.id,
          "Target Skill": e.targetSkill,
          "Skill Category": e.skillCategory,
          "Invited/Assigned": e.eligible.map((m) => clean(m.Name)).join("\n"),
          "Attendees/Completed": "",
          "Due to Date": e.due,
          "Legacy Completed": "",
          "Legacy Captured": "TRUE",
        };
        db.logs.push(log);
      }
      if (!truth(log["Legacy Captured"])) {
        log["Legacy Completed"] = log["Attendees/Completed"] || "";
        log["Legacy Captured"] = "TRUE";
      }
      const names = new Map(
        list(log["Legacy Completed"]).map((name) => {
          const person = resolveMember(db, name);
          return [person ? memberKey(person) : "unmatched:" + norm(name), name];
        }),
      );
      (db.completions || [])
        .filter((c) => c["Event ID"] === e.key)
        .forEach((c) => {
          const person = resolveMember(db, c["Member ID"] || c.Email || c.Name);
          const key = person
            ? memberKey(person)
            : "unmatched:" + norm(c.Name || c.Email);
          if (completionStatus(c) === "Completed")
            names.set(key, person ? clean(person.Name) : c.Name);
          else names.delete(key);
        });
      log["Attendees/Completed"] = [...names.values()]
        .filter(Boolean)
        .join("\n");
    };
    if (action === "completeEvent" || action === "updateSkillCompletion") {
      const e = find();
      assert(
        e.type !== "Task",
        "Update task status using the Kanban board or status dropdown.",
      );
      target = e.title;
      const state = eventState(e, member, today);
      assert(state.eligible, "You are not eligible for this event.");
      const updatingSkill = action === "updateSkillCompletion";
      if (updatingSkill)
        assert(
          e.type === "Skill" && state.completed,
          "Complete this skill first before updating its result.",
        );
      if (!updatingSkill && (state.completed || state.pending))
        return { db: input, unchanged: true };
      assert(
        updatingSkill ? !state.closed && !e.archived : state.canComplete,
        state.loggingDisabled
          ? "Attendance logging is disabled. Ask an admin to open it."
          : "This event is closed or archived. Ask an admin to reopen it.",
      );
      const score = number(payload.score);
      assert(
        score === null || (e.type === "Skill" && score >= 0 && score <= 10),
        "Skill assessment scores must be from 0 to 10.",
      );
      const upload = payload.upload ? validateUpload(payload.upload) : null;
      assert(
        !payload.upload || REVIEW_TYPES.includes(e.type),
        "Evidence files are supported for courses and meetings.",
      );
      db.completions.push({
        "Submission ID": newId("submission"),
        Timestamp: now,
        "Event Type": e.type,
        "Event ID": e.key,
        "Event Name": e.title,
        "Member ID": memberKey(member),
        Name: clean(member.Name),
        Email: norm(member.Mail),
        Evidence: safeText(payload.evidence),
        Score: score === null ? "" : score,
        Status: state.reviewRequired ? "Pending" : "Completed",
        "Evidence File ID": "",
        "Evidence URL": "",
        "Evidence Filename": upload ? upload.name : "",
        "Evidence MIME Type": upload ? upload.mimeType : "",
        "Evidence Size": upload ? upload.size : "",
        "Reviewer Email": "",
        "Reviewer Name": "",
        "Reviewed At": "",
        "Review Note": "",
        "Status Changed At": now,
        "Status Changed By": norm(member.Mail),
      });
      syncLog(e);
    } else if (action === "reviewSubmission") {
      const submission = db.completions.find(
        (c) => clean(c["Submission ID"]) === clean(payload.submissionId),
      );
      assert(
        submission && clean(payload.submissionId),
        "Submission not found. Refresh the page.",
      );
      const e = events(db).find((e) => e.key === submission["Event ID"]);
      assert(
        e && REVIEW_TYPES.includes(e.type),
        "This record does not require review.",
      );
      const person = resolveMember(db, submission["Member ID"]);
      assert(
        person &&
          e.submissions.get(memberKey(person)) === submission &&
          completionStatus(submission) === "Pending",
        "This submission is no longer pending. Refresh before reviewing.",
      );
      assert(
        ["Completed", "Uncompleted"].includes(payload.decision),
        "Choose approve or return for changes.",
      );
      const note = safeText(payload.note);
      assert(
        payload.decision !== "Uncompleted" || note,
        "Add feedback when returning a submission.",
      );
      Object.assign(submission, {
        Status: payload.decision,
        "Reviewer Email": norm(member.Mail),
        "Reviewer Name": clean(member.Name),
        "Reviewed At": now,
        "Review Note": note,
        "Status Changed At": now,
        "Status Changed By": norm(member.Mail),
      });
      syncLog(e);
      target = e.title;
      details = {
        submissionId: payload.submissionId,
        member: memberKey(person),
        decision: payload.decision,
        note,
      };
    } else if (action === "revertCompletion") {
      const e = find();
      const state = eventState(e, member, today);
      assert(
        state.canRevert,
        "There is no pending or completed record to undo.",
      );
      assert(
        clean(payload.submissionId) ===
          clean(state.submission && state.submission["Submission ID"]),
        "Your record has changed. Refresh before undoing.",
      );
      let submission = state.submission;
      if (!submission) {
        submission = {
          "Submission ID": newId("submission"),
          Timestamp: now,
          "Event Type": e.type,
          "Event ID": e.key,
          "Event Name": e.title,
          "Member ID": memberKey(member),
          Name: clean(member.Name),
          Email: norm(member.Mail),
        };
        db.completions.push(submission);
      }
      details = {
        submissionId: submission["Submission ID"],
        previousStatus: state.status,
        member: memberKey(member),
      };
      Object.assign(submission, {
        Status: "Uncompleted",
        "Status Changed At": now,
        "Status Changed By": norm(member.Mail),
      });
      syncLog(e);
      target = e.title;
    } else if (["addTaskLink", "removeTaskLink"].includes(action)) {
      const event = find();
      assert(event.type === "Task", "Evidence links belong to a task.");
      assert(
        admin ||
          event.eligible.some(
            (person) => memberKey(person) === memberKey(member),
          ),
        "Only task assignees or admins can update task evidence.",
      );
      if (clean(event.row["Evidence Links"])) {
        let valid = false;
        try {
          valid = Array.isArray(JSON.parse(event.row["Evidence Links"]));
        } catch (_) {}
        assert(
          valid,
          "Existing task evidence could not be read. Ask an admin to check this task.",
        );
      }
      const links = taskLinks(event.row);
      if (action === "addTaskLink") {
        assert(!event.archived, "Restore this task before adding evidence.");
        const url = clean(payload.url);
        assert(
          url.length <= 2048 && /^https?:\/\/[^\s]+$/i.test(url),
          "Enter a valid https:// or http:// evidence link.",
        );
        assert(
          ["Completion", "Issue"].includes(payload.kind),
          "Choose completion evidence or an issue.",
        );
        const note = safeText(payload.note);
        assert(note.length <= 1000, "Keep the note within 1,000 characters.");
        const linkId = newId("task-link");
        if (links.some((link) => link.id === linkId))
          return { db: input, unchanged: true };
        links.push({
          id: linkId,
          url,
          kind: payload.kind,
          note,
          memberId: memberKey(member),
          name: clean(member.Name),
          timestamp: now,
          active: true,
        });
        details = { link: linkId, url, kind: payload.kind };
      } else {
        const link = links.find((item) => item.id === payload.linkId);
        assert(link, "This link is no longer available.");
        assert(
          admin || link.memberId === memberKey(member),
          "Only the link's author or an admin can remove it.",
        );
        if (link.active === false) return { db: input, unchanged: true };
        link.active = false;
        details = { link: link.id, url: link.url, kind: link.kind };
      }
      const value = JSON.stringify(links);
      assert(
        value.length <= 40000,
        "This task's evidence links are full. Ask an admin to review them.",
      );
      event.row["Evidence Links"] = value;
      if (!db.tasks.includes(event.row)) {
        event.row.Assignees = event.eligible
          .map((person) => clean(person.Name))
          .join("\n");
        event.row.Status = status(event.row.Status);
        db.tasks.push(event.row);
      }
      event.row["Event ID"] = event.id;
      event.row["Task Title"] = event.title;
      target = event.title;
    } else if (action === "saveEvent" || action === "saveTask") {
      const type = action === "saveTask" ? "Task" : clean(payload.type);
      assert(
        TYPES.includes(type) && (action === "saveTask" || type !== "Task"),
        "Tasks are managed in the Tasks tab.",
      );
      const title = safeText(payload.title);
      assert(title, "Enter an event title.");
      const due = clean(payload.due);
      assert(!due || validDate(due), "Choose a valid deadline.");
      const assigned = selectedMembers(db, payload);
      const table = TABLES[type];
      db[table] = db[table] || [];
      // Retrying an unconfirmed creation reuses its stable ID without duplicating or overwriting it.
      if (
        !payload.key &&
        clean(payload.newId) &&
        db[table].some(
          (row) => id(row["Event ID"]) === newId(type.toLowerCase()),
        )
      )
        return { db: input, unchanged: true };
      const existing = payload.key ? find() : null;
      assert(
        !existing || !existing.requirement,
        "Manage required skills from the member's skills list.",
      );
      assert(
        !existing || existing.type === type,
        "An event type cannot be changed.",
      );
      const row = existing ? existing.row : {};
      // A legacy log-only event gets a source row when first edited.
      if (!existing || !db[table].includes(row)) db[table].push(row);
      row["Event ID"] = existing ? existing.id : newId(type.toLowerCase());
      row[TITLES[type]] = title;
      row["Due to Date"] = due;
      row[type === "Task" ? "Assignees" : "Invited/Assigned"] = assigned;
      row[type === "Task" ? "Task description" : "Description"] = safeText(
        payload.description,
      );
      if (type === "Task") {
        assert(
          STATUS.includes(payload.status || "Pending"),
          "Choose a valid task status.",
        );
        row.Status = payload.status || "Pending";
      } else {
        if (type === "Skill") {
          row["Target Skill"] = safeText(payload.targetSkill);
          assert(row["Target Skill"], "Choose the skill being assessed.");
          row["Skill Category"] =
            payload.skillCategory || ratingCategory(db, row["Target Skill"]);
          assert(
            RATING_FIELDS.includes(row["Skill Category"]),
            "Choose a valid skill category.",
          );
        }
        if (type === "Meet") {
          row.Date =
            payload.date === undefined
              ? dateOnly(row.Date)
              : clean(payload.date);
          assert(validDate(row.Date), "Choose a valid meeting date.");
          row.Attachments = safeText(payload.link);
          assert(
            payload.loggingEnabled === undefined ||
              typeof payload.loggingEnabled === "boolean",
            "Choose whether attendance logging is open.",
          );
          row["Logging Enabled"] = (
            payload.loggingEnabled === undefined
              ? existing && existing.loggingEnabled
              : payload.loggingEnabled
          )
            ? "TRUE"
            : "FALSE";
        }
        if (type === "Learning") {
          if (payload.trackName !== undefined)
            row["Track Name"] = safeText(payload.trackName);
          row.Obligability =
            payload.obligation || row.Obligability || "Optional";
          assert(
            ["Optional", "Mandatory"].includes(row.Obligability),
            "Choose optional or mandatory learning.",
          );
          row.Link = safeText(payload.link);
          assert(
            !row.Link || /^https?:\/\/[^\s]+$/i.test(row.Link),
            "Enter a valid course URL.",
          );
        }
      }
      if (existing && existing.log) {
        existing.log["Event Name"] = title;
        existing.log["Invited/Assigned"] = assigned;
        existing.log["Due to Date"] = due;
        existing.log["Source ID"] = row["Event ID"];
      }
      target = title;
      details = {
        created: !existing,
        event: type + ":" + row["Event ID"],
      };
    } else if (action === "archiveEvent") {
      const e = find();
      assert(e.type !== "Learning", "Learning courses cannot be archived.");
      assert(
        !e.requirement,
        "Manage required skills from the member's skills list.",
      );
      target = e.title;
      assert(
        typeof payload.archived === "boolean",
        "Choose archive or restore.",
      );
      (Object.keys(e.row).length ? e.row : e.log).Archived = payload.archived
        ? "TRUE"
        : "";
    } else if (action === "moveTask") {
      const e = find();
      assert(e.type === "Task", "Only tasks can be moved on the board.");
      assert(STATUS.includes(payload.status), "Choose a valid task status.");
      if (status(e.row.Status) === payload.status)
        return { db: input, unchanged: true };
      details = {
        previousStatus: status(e.row.Status),
        status: payload.status,
      };
      e.row.Status = payload.status;
      target = e.title;
    } else if (action === "saveSkillRequirements") {
      const selected = (db.team || []).find(
        (m) => memberKey(m) === id(payload.memberId),
      );
      assert(selected, "Choose a valid member.");
      const requirements = payload.requirements || [];
      const catalogue = new Set(
        projectSkills(db).map((s) => skillKey(s.category, s.label)),
      );
      assert(
        new Set(requirements.map((r) => skillKey(r.category, r.label))).size ===
          requirements.length,
        "Duplicate required skills.",
      );
      db.skillRequirements = db.skillRequirements || [];
      requirements.forEach((r) => {
        assert(
          PROJECT_FIELDS.includes(r.category) &&
            catalogue.has(skillKey(r.category, r.label)),
          "Choose a skill from the project catalogue.",
        );
        assert(typeof r.required === "boolean", "Choose required skills.");
        const targetScore = number(r.target);
        assert(
          targetScore === null || (targetScore >= 0 && targetScore <= 10),
          "Target ratings must be from 0 to 10.",
        );
        let row = db.skillRequirements.find(
          (i) =>
            id(i["Member ID"]) === memberKey(selected) &&
            skillKey(i.Category, i.Skill) === skillKey(r.category, r.label),
        );
        if (!row) {
          row = {};
          db.skillRequirements.push(row);
        }
        Object.assign(row, {
          "Member ID": memberKey(selected),
          Skill: safeText(r.label),
          Category: r.category,
          Required: r.required ? "TRUE" : "FALSE",
          "Target Score": targetScore === null ? "" : targetScore,
        });
      });
      target = clean(selected.Name);
    } else if (action === "saveHierarchy") {
      const structure = payload.structure;
      const errors = hierarchyErrors(db, structure);
      assert(!errors.length, errors.join(" "));
      db.subteams = db.subteams || [];
      db.memberships = db.memberships || [];
      // Upsert and disable removed rows. The GAS writer preserves row positions and formulas.
      db.subteams.forEach((r) => {
        r.Active = "FALSE";
      });
      structure.teams.forEach((t) => {
        let row = db.subteams.find((r) => id(r["Subteam ID"]) === t.id);
        if (!row) {
          row = {};
          db.subteams.push(row);
        }
        Object.assign(row, {
          "Subteam ID": t.id,
          Name: safeText(t.name),
          Description: safeText(t.description),
          Color: t.color,
          Active: "TRUE",
        });
      });
      db.memberships.forEach((r) => {
        r.Active = "FALSE";
      });
      structure.memberships.forEach((r) => {
        let row = db.memberships.find(
          (i) =>
            id(i["Subteam ID"]) === r.teamId &&
            id(i["Member ID"]) === r.memberId,
        );
        if (!row) {
          row = {};
          db.memberships.push(row);
        }
        Object.assign(row, {
          "Subteam ID": r.teamId,
          "Member ID": r.memberId,
          Role: r.role,
          Active: "TRUE",
        });
      });
      db.team.forEach((m) => {
        const own = structure.memberships.filter(
          (r) => r.memberId === memberKey(m),
        );
        m.Role =
          memberKey(m) === structure.headId
            ? "Team Leader"
            : own.some((r) => r.role === "Leader")
              ? "Leader"
              : "Team member";
        // Compatibility fields are a summary; the membership sheets hold all relationships.
        m.Department = own
          .map((r) => structure.teams.find((t) => t.id === r.teamId).name)
          .join(" | ");
        const managers = own.flatMap((r) =>
          structure.memberships
            .filter(
              (i) =>
                i.teamId === r.teamId &&
                i.role === "Leader" &&
                i.memberId !== memberKey(m),
            )
            .map((i) => i.memberId),
        );
        m["Reports To"] =
          m.Role === "Team Leader"
            ? ""
            : [
                ...new Set(managers.length ? managers : [structure.headId]),
              ].join("\n");
      });
      details = {
        headId: structure.headId,
        teams: structure.teams,
        memberships: structure.memberships,
      };
      target = "Team hierarchy";
    } else throw new Error("Unknown action.");
    db.activity.push({
      Timestamp: now,
      Email: norm(member.Mail),
      Action: action,
      Target: target,
      Details: JSON.stringify({
        event: payload.key || "",
        type:
          payload.type ||
          (payload.key
            ? payload.key.split(":")[0]
            : action === "saveTask"
              ? "Task"
              : ""),
        requestId: clean(payload.newId),
        outcome: "Succeeded",
        ...(action === "completeEvent" ? { member: memberKey(member) } : {}),
        ...details,
      }),
    });
    return { db, unchanged: false };
  }
  function failureActivity(db, email, action, payload, error, now) {
    if (!actor(db, email)) return null;
    const event = payload.key
      ? events(db).find((item) => item.key === payload.key)
      : null;
    return {
      Timestamp: now,
      Email: norm(email),
      Action: action,
      Target: clean(event?.title || payload.title || "Request").slice(0, 240),
      Details: JSON.stringify({
        outcome: "Failed",
        event: clean(payload.key),
        type: event?.type || clean(payload.type),
        requestId: clean(payload.newId),
        error: clean(error.message || error).slice(0, 1000),
      }),
    };
  }
  return {
    TYPES,
    EVENT_FORM_FIELDS,
    EVENT_COLUMNS,
    REVIEW_TYPES,
    COMPLETION_STATES,
    MAX_EVIDENCE_BYTES,
    completionStatus,
    validateUpload,
    LABELS,
    TABLES,
    TITLES,
    STATUS,
    RATING_FIELDS,
    PROJECT_FIELDS,
    skillKey,
    projectSkills,
    requiredSkills,
    clean,
    norm,
    list,
    id,
    memberKey,
    truth,
    status,
    dateOnly,
    number,
    role,
    resolveMember,
    people,
    actor,
    isAdmin,
    parseRatings,
    ratingCategory,
    events,
    pendingReviews,
    taskLinks,
    failureActivity,
    eventState,
    progress,
    skillGroups,
    education,
    cvData,
    hierarchyErrors,
    teamStructure,
    MEMBERSHIP_ROLES,
    TEAM_COLORS,
    transition,
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = HubModel;
