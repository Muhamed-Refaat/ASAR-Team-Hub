// Generated from shared web/ sources.
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
      "Deleted",
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
      "Deleted",
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
      "Deleted",
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
  const activeMember = (member) =>
    !!member && !["false", "no", "0", "removed"].includes(norm(member.Active));
  const activeTeam = (db) => (db.team || []).filter(activeMember);
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
    const matches = (db.allTeam || db.team || []).filter((m) =>
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
          .filter(activeMember)
          .map((m) => [memberKey(m), m]),
      ).values(),
    ];
  }
  function actor(db, email) {
    const matches = activeTeam(db).filter(
      (m) => norm(m.Mail) === norm(email) && norm(email),
    );
    return matches.length === 1 ? matches[0] : null;
  }
  function isAdmin(db, member) {
    if (!activeMember(member)) return false;
    return (db.admins || []).some((a) => {
      if (["false", "no", "0"].includes(norm(a.Enabled))) return false;
      // A supplied email takes precedence over a name; a misspelled email cannot grant access by name.
      return clean(a.Email)
        ? norm(a.Email) === norm(member.Mail)
        : clean(a.Name) &&
            memberKey(resolveMember(db, a.Name) || {}) === memberKey(member);
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
    activeTeam(db).forEach((m) =>
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
  function events(db, { includeDeleted = false } = {}) {
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
    activeTeam(db).forEach((m) =>
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
    return result.filter((event) => includeDeleted || !event.deleted);
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
  function references(db) {
    return (db.references || []).filter(
      (row) => !truth(row.Deleted) && clean(row.Title) && clean(row.URL),
    );
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
        : activeTeam(db);
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
    const currentIdentity = (token) => {
      const member = resolveMember(db, token);
      return !member || activeMember(member);
    };
    const eligibleIdentities = new Set(
      assigned
        ? list(assigned).filter(currentIdentity).map(identity)
        : eligible.map(memberKey),
    );
    const completedIdentities = new Set(
      list(logs.map((l) => clean(l["Attendees/Completed"])).join("\n"))
        .filter(currentIdentity)
        .map(identity),
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
      if (activeMember(m)) {
        completed.add(memberKey(m));
        completedIdentities.add(memberKey(m));
      } else if (!m && c.Name) completedIdentities.add(identity(c.Name));
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
      deleted: truth(row.Deleted) || logs.some((item) => truth(item.Deleted)),
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
      .filter(
        (row) =>
          completionStatus(row) === "Pending" &&
          activeMember(resolveMember(db, row["Member ID"] || row.Email)),
      )
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
    const head = activeTeam(db).find((m) => role(m) === "Team Leader");
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
            activeTeam(db).some((m) => memberKey(m) === id(r["Member ID"])),
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
          activeTeam(db)
            .map((m) => clean(m.Department))
            .filter(Boolean),
        ),
      ];
      teams = names.map((name, i) => ({
        id: "legacy-" + (i + 1),
        name,
        description: "",
        color: TEAM_COLORS[i % TEAM_COLORS.length],
      }));
      memberships = activeTeam(db)
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
    const ids = new Set(activeTeam(db).map(memberKey));
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
      "deleteEvent",
      "saveHierarchy",
      "moveTask",
      "saveSkillRequirements",
      "reviewSubmission",
      "removeMember",
      "deleteReference",
    ];
    if (adminActions.includes(action))
      assert(
        admin,
        "Only members explicitly listed in the Admins sheet may manage events or hierarchy.",
      );
    // Stable command IDs make every background retry safe, including skill updates and reviews.
    if (
      clean(payload.commandId) &&
      (db.activity || []).some((row) => {
        if (row.Action !== action || norm(row.Email) !== norm(member.Mail))
          return false;
        try {
          const data = JSON.parse(row.Details || "{}");
          return (
            data &&
            data.outcome === "Succeeded" &&
            data.requestId === clean(payload.commandId)
          );
        } catch (_) {
          return false;
        }
      })
    )
      return { db: input, unchanged: true };
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
      if (
        clean(payload.commandId) &&
        clean(payload.newId) &&
        db.completions.some(
          (row) =>
            clean(row["Submission ID"]) === newId("submission") &&
            row["Event ID"] === e.key &&
            id(row["Member ID"]) === memberKey(member),
        )
      )
        return { db: input, unchanged: true };
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
        activeMember(person) &&
          e.submissions.get(memberKey(person)) === submission &&
          completionStatus(submission) === "Pending",
        "This submission is no longer pending. Refresh before reviewing.",
      );
      assert(
        ["Completed", "Uncompleted", "Rejected"].includes(payload.decision),
        "Choose approve, return for changes or reject.",
      );
      const note = safeText(payload.note);
      assert(
        payload.decision !== "Uncompleted" || note,
        "Add feedback when returning a submission.",
      );
      Object.assign(submission, {
        Status:
          payload.decision === "Rejected" ? "Uncompleted" : payload.decision,
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
        const linkId = newId("task-link");
        if (links.some((link) => link.id === linkId))
          return { db: input, unchanged: true };
        links.push({
          id: linkId,
          url,
          memberId: memberKey(member),
          name: clean(member.Name),
          timestamp: now,
          active: true,
        });
        details = { link: linkId, url };
      } else {
        const link = links.find((item) => item.id === payload.linkId);
        assert(link, "This link is no longer available.");
        assert(
          admin || link.memberId === memberKey(member),
          "Only the link's author or an admin can remove it.",
        );
        if (link.active === false) return { db: input, unchanged: true };
        link.active = false;
        details = { link: link.id, url: link.url };
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
    } else if (action === "addReference") {
      const title = safeText(payload.title);
      const url = clean(payload.url);
      const description = safeText(payload.description);
      assert(
        title && title.length <= 180,
        "Enter a link title, up to 180 characters.",
      );
      assert(
        url.length <= 2048 &&
          /^https?:\/\/[^\s<>"'\\]+$/i.test(url) &&
          /^https?:\/\/[^/?#]+/i.test(url),
        "Enter a valid http or https URL.",
      );
      assert(
        description.length <= 1000,
        "Keep the description under 1,000 characters.",
      );
      db.references = db.references || [];
      const referenceId = newId("reference");
      const existing = db.references.find(
        (row) => row["Reference ID"] === referenceId,
      );
      if (existing) {
        assert(
          norm(existing["Added By"]) === norm(member.Mail),
          "This link ID is already in use.",
        );
      } else
        db.references.push({
          "Reference ID": referenceId,
          Title: title,
          URL: url,
          Description: description,
          "Added By": norm(member.Mail),
          "Added By Name": clean(member.Name),
          "Added At": now,
          Deleted: "FALSE",
        });
      target = existing?.Title || title;
      details = { referenceId };
    } else if (action === "deleteReference") {
      const row = (db.references || []).find(
        (item) => item["Reference ID"] === clean(payload.referenceId),
      );
      assert(row, "Link not found. Refresh the page.");
      row.Deleted = "TRUE";
      target = row.Title;
      details = { referenceId: row["Reference ID"] };
    } else if (action === "deleteEvent") {
      // Keep source rows, evidence and attempts in place, including after a partial write.
      const e = events(db, { includeDeleted: true }).find(
        (event) => event.key === payload.key,
      );
      assert(e, "Event not found. Refresh the page.");
      assert(
        ["Task", "Meet", "Learning"].includes(e.type),
        "Only tasks, meetings and learning courses can be deleted.",
      );
      const source = (db[TABLES[e.type]] || []).includes(e.row);
      if (source) {
        e.row["Event ID"] = e.id;
        e.row.Deleted = "TRUE";
      }
      db.logs
        .filter(
          (log) =>
            log === e.log ||
            (clean(log["Event Type"]) === e.type &&
              (id(log["Source ID"]) === e.id ||
                (source &&
                  !clean(log["Source ID"]) &&
                  norm(log["Event Name"]) === norm(e.title)))),
        )
        .forEach((log) => {
          log.Deleted = "TRUE";
        });
      db.activity.forEach((row) => {
        if (row.Action !== "telegramNotification") return;
        let data;
        try {
          data = JSON.parse(row.Details || "{}");
        } catch (_) {
          return;
        }
        const item = data?.telegram;
        if (
          data?.event !== e.key ||
          !["Queued", "Retrying"].includes(item?.status)
        )
          return;
        const error = "This event was deleted before delivery.";
        item.status = "Cancelled";
        item.error = error;
        item.history = [
          ...(item.history || []),
          { status: "Cancelled", at: now, error },
        ].slice(-20);
        data.outcome = "Cancelled";
        row.Details = JSON.stringify(data);
      });
      target = e.title;
      details = { event: e.key, type: e.type };
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
    } else if (action === "removeMember") {
      const selected = activeTeam(db).find(
        (person) => memberKey(person) === id(payload.memberId),
      );
      assert(
        selected,
        "This member is no longer active. Refresh the team directory.",
      );
      assert(
        role(selected) !== "Team Leader",
        "Assign a new Team Leader before removing this member.",
      );
      assert(
        activeTeam(db).some(
          (person) =>
            memberKey(person) !== memberKey(selected) && isAdmin(db, person),
        ),
        "Keep at least one enabled admin on the team.",
      );
      const structure = teamStructure(db);
      const soleLeader = structure.teams.find((team) => {
        const leaders = structure.memberships.filter(
          (entry) => entry.teamId === team.id && entry.role === "Leader",
        );
        return (
          leaders.length === 1 && leaders[0].memberId === memberKey(selected)
        );
      });
      assert(
        !soleLeader,
        "Assign another leader for " +
          (soleLeader?.name || "this subteam") +
          " before removing this member.",
      );
      selected.Active = "FALSE";
      (db.memberships || [])
        .filter((entry) => id(entry["Member ID"]) === memberKey(selected))
        .forEach((entry) => {
          entry.Active = "FALSE";
        });
      target = selected.Name;
      details = { memberId: memberKey(selected), name: selected.Name };
    } else if (action === "saveSkillRequirements") {
      const selected = activeTeam(db).find(
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
      db.team.filter(activeMember).forEach((m) => {
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
        requestId: clean(payload.commandId || payload.newId),
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
        requestId: clean(payload.commandId || payload.newId),
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
    activeMember,
    activeTeam,
    resolveMember,
    people,
    actor,
    isAdmin,
    parseRatings,
    ratingCategory,
    events,
    pendingReviews,
    taskLinks,
    references,
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

/* Public notification formatting only. Bot credentials belong in Script Properties. */
const HubTelegram = (() => {
  const types = ["Task", "Meet", "Learning"];
  const clean = (value) => String(value == null ? "" : value).trim();
  const clip = (value, max) => {
    const text = clean(value);
    if (text.length <= max) return text;
    let cut = text.slice(0, max - 1);
    if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
    return cut + "…";
  };
  // Telegram entity positions use UTF-16 units, matching JavaScript string offsets.
  // Only presentation styles are accepted; sheet content is always literal text.
  function entities(text, values) {
    let end = 0;
    const boundary = (at) =>
      !(
        at > 0 &&
        /[\uD800-\uDBFF]/.test(text[at - 1]) &&
        /[\uDC00-\uDFFF]/.test(text[at] || "")
      );
    return (Array.isArray(values) ? values : [])
      .filter(
        (item) =>
          item &&
          ["bold", "italic"].includes(item.type) &&
          Number.isInteger(item.offset) &&
          Number.isInteger(item.length) &&
          item.offset >= 0 &&
          item.length > 0 &&
          item.offset + item.length <= text.length &&
          boundary(item.offset) &&
          boundary(item.offset + item.length),
      )
      .sort((a, b) => a.offset - b.offset)
      .filter((item) => {
        if (item.offset < end) return false;
        end = item.offset + item.length;
        return true;
      })
      .map(({ type, offset, length }) => ({ type, offset, length }));
  }
  function fragments(text, styles) {
    text = String(text || "");
    const parts = [];
    let at = 0;
    for (const item of entities(text, styles)) {
      if (item.offset > at)
        parts.push({ text: text.slice(at, item.offset), type: "" });
      at = item.offset + item.length;
      parts.push({ text: text.slice(item.offset, at), type: item.type });
    }
    if (at < text.length) parts.push({ text: text.slice(at), type: "" });
    return parts;
  }
  function dateLabel(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(value));
    return match
      ? `${Number(match[3])} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(match[2]) - 1]} ${match[1]} (Cairo)`
      : clean(value);
  }
  function details(row) {
    try {
      const value = JSON.parse(row.Details || "{}");
      return value && !Array.isArray(value) && typeof value === "object"
        ? value
        : {};
    } catch (_) {
      return {};
    }
  }
  function creations(db) {
    return new Map(
      (db.activity || []).flatMap((row) => {
        const data = details(row);
        return ["saveTask", "saveEvent"].includes(row.Action) &&
          data.created === true &&
          types.includes(data.type)
          ? [[data.event, row]]
          : [];
      }),
    );
  }
  function deliveries(db, chatId) {
    return new Map(
      (db.activity || []).flatMap((row) => {
        const data = details(row);
        return row.Action === "telegramNotification" &&
          data.event &&
          data.telegram &&
          (chatId === undefined || data.telegram.chatId === chatId)
          ? [[data.event, { ...data.telegram, actor: row.Email }]]
          : [];
      }),
    );
  }
  function url(value) {
    let text = clean(value);
    if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/|$)/i.test(text))
      text = "https://" + text;
    return /^https?:\/\/[^\s<>"']+$/i.test(text) ? text : "";
  }
  function preview(model, db, key, hubUrl) {
    const creation = creations(db).get(key);
    const event = model.events(db).find((item) => item.key === key);
    if (
      !event ||
      !types.includes(event.type) ||
      (!creation && event.type !== "Learning")
    )
      throw new Error(
        "Choose a saved course, newly created task or meeting to announce.",
      );
    if (event.archived)
      throw new Error("Restore this event before announcing it.");
    let text = "";
    const styles = [];
    const add = (value, type) => {
      value = String(value);
      if (type && value.length)
        styles.push({ type, offset: text.length, length: value.length });
      text += value;
    };
    const line = (icon, label, value) => {
      add(icon + " ");
      add(label + ":", "bold");
      add(" " + value + "\n");
    };
    add(
      {
        Task: "📌 NEW TASK",
        Meet: "📅 NEW MEETING",
        Learning: "🎓 NEW COURSE",
      }[event.type],
      "bold",
    );
    add("\n");
    add("ASAR Team Hub", "italic");
    add("\n\n");
    add(clip(event.title, 240), "bold");
    add("\n\n");
    if (event.meetingDate)
      line("🗓️", "Meeting date", dateLabel(event.meetingDate));
    if (event.due) line("⏳", "Due", dateLabel(event.due));
    if (event.type === "Task") {
      const status = model.status(event.row.Status);
      line(
        {
          Backlog: "🗂️",
          Pending: "🟡",
          InProgress: "🔵",
          Blocked: "🔴",
          Completed: "✅",
        }[status] || "📍",
        "Status",
        status.replace("InProgress", "In progress"),
      );
    }
    const names = event.eligible.map((member) => clean(member.Name));
    line(
      "👥",
      "Assigned to",
      clip(names.slice(0, 5).join(", ") || "No members assigned", 650) +
        (names.length > 5 ? ` +${names.length - 5} more` : ""),
    );
    if (event.description) {
      add("\n📝 ");
      add("Details", "bold");
      add("\n" + clip(event.description, 900) + "\n");
    }
    const link = url(event.row.Link || event.row.Attachments);
    if (link) {
      add("\n");
      if (link.length <= 1000)
        line(
          "🔗",
          { Meet: "Join meeting", Learning: "Course", Task: "Reference" }[
            event.type
          ],
          link,
        );
      else add("🔗 Open Team Hub for the event link.\n");
    } else if (event.type === "Meet" && event.row.Attachments)
      line("📍", "Location", clip(event.row.Attachments, 300));
    const creator = creation ? model.actor(db, creation.Email) : null;
    if (creator) {
      add("\n");
      line("👤", "Created by", clip(creator.Name, 160));
    }
    add("\n");
    add(
      {
        Task: "🚀 Let’s turn plans into progress.",
        Meet: "🤝 See you there. Let’s move forward together.",
        Learning: "🌱 Learn it. Apply it. Share what you discover.",
      }[event.type],
      "italic",
    );
    return {
      key,
      type: event.type,
      title: event.title,
      text,
      entities: styles,
      url: /^https:\/\//i.test(url(hubUrl)) ? url(hubUrl) : "",
    };
  }
  return { details, creations, deliveries, preview, entities, fragments };
})();
if (typeof module !== "undefined" && module.exports)
  module.exports = HubTelegram;

const SPREADSHEET_ID = "188lG-b__CVXFxj2ebrGXilpfw8-Y7Q-O9KrGzkOWqkU";
const HUB_SHEETS_ = {
  supervisor: "Supervisor",
  team: "Team",
  skills: "Skill",
  learning: "Learning",
  meet: "Meet",
  tasks: "Task",
  logs: "Log",
  activity: "Activity",
  admins: "Admins",
  skillEvents: "SkillEvents",
  completions: "Completion",
  skillRequirements: "SkillRequirements",
  subteams: "Subteams",
  memberships: "TeamMemberships",
  references: "References",
};

function doGet(e) {
  if (e && e.parameter && e.parameter.action === "learning") {
    return ContentService.createTextOutput(
      JSON.stringify(readHubSheet_(hubSpreadsheet_(), "Learning")),
    ).setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("ASAR Team Hub")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function hubSpreadsheet_() {
  return (
    SpreadsheetApp.getActiveSpreadsheet() ||
    SpreadsheetApp.openById(SPREADSHEET_ID)
  );
}

function readHubSheet_(ss, name, snapshots) {
  let sheet = ss.getSheetByName(name);
  if (!sheet && name === "Skill") sheet = ss.getSheetByName("SKILLs");
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (snapshots) snapshots[name] = rows;
  let headerIndex = 0;
  let headers = (rows[0] || []).map((v) => String(v || "").trim());
  if (
    name === "Skill" &&
    rows[1] &&
    String(rows[1][0]).toUpperCase() === "SKILL"
  ) {
    headerIndex = 1;
    headers = [
      "Hard Skill",
      "Technical Competency",
      "Specific Technical Application",
      "Soft Skill",
      "Description",
      "Engineering Layer",
      "Technology",
      "Function in Architecture",
    ];
  }
  return rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((v, i) => headers[i] && v !== "" && v !== null))
    .map((row) => {
      const record = {};
      headers.forEach((header, i) => {
        if (!header) return;
        const v = row[i];
        record[header] =
          v instanceof Date
            ? Utilities.formatDate(
                v,
                Session.getScriptTimeZone() || "Africa/Cairo",
                name === "Activity" || name === "Completion"
                  ? "yyyy-MM-dd'T'HH:mm:ssXXX"
                  : "yyyy-MM-dd",
              )
            : v == null
              ? ""
              : v;
      });
      return record;
    });
}

function hubData_(ss, snapshots) {
  const db = {};
  Object.keys(HUB_SHEETS_).forEach(
    (key) => (db[key] = readHubSheet_(ss, HUB_SHEETS_[key], snapshots)),
  );
  db.team = db.team.filter((m) => String(m.Name || "").trim());
  return db;
}

function hubSession_(db) {
  // Payload emails and effective-user emails cannot authorize writes.
  const email = String(Session.getActiveUser().getEmail() || "")
    .trim()
    .toLowerCase();
  const member = HubModel.actor(db, email);
  return {
    email,
    name: member ? member.Name : "",
    memberId: member ? HubModel.memberKey(member) : "",
    isAdmin: HubModel.isAdmin(db, member),
  };
}

function getTeamData() {
  const db = hubData_(hubSpreadsheet_());
  db.activeUserSession = hubSession_(db);
  return db;
}

function executeHubCommand(action, payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let auditContext = null;
  try {
    const ss = hubSpreadsheet_();
    const snapshots = {};
    const before = hubData_(ss, snapshots);
    const session = hubSession_(before);
    const now = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone() || "Africa/Cairo",
      "yyyy-MM-dd'T'HH:mm:ssXXX",
    );
    auditContext = { ss, before, session, now };
    const result =
      action === "queueTelegramNotification"
        ? hubQueueTelegram_(before, session, payload || {}, now)
        : HubModel.transition(
            before,
            session.email,
            action,
            payload || {},
            now,
          );
    if (!result.unchanged) {
      // The transition validates identity, eligibility, state and bytes before Drive is touched.
      let evidenceFile = null;
      if (action === "completeEvent" && payload && payload.upload) {
        const submission =
          result.db.completions[result.db.completions.length - 1];
        evidenceFile = saveHubEvidence_(
          before,
          session,
          payload.upload,
          submission,
        );
        submission["Evidence File ID"] = evidenceFile.getId();
        submission["Evidence URL"] = evidenceFile.getUrl();
      }
      try {
        Object.keys(HUB_SHEETS_)
          .filter(
            (key) =>
              key !== "skills" &&
              key !== "supervisor" &&
              key !== "admins" &&
              key !== "activity",
          )
          .forEach((key) => {
            if (JSON.stringify(before[key]) !== JSON.stringify(result.db[key]))
              writeHubChanges_(
                ss,
                HUB_SHEETS_[key],
                before[key],
                result.db[key],
                snapshots[HUB_SHEETS_[key]],
              );
          });
        // Record success only after every affected source table has been written.
        if (
          JSON.stringify(before.activity) !== JSON.stringify(result.db.activity)
        )
          writeHubChanges_(
            ss,
            HUB_SHEETS_.activity,
            before.activity,
            result.db.activity,
            snapshots[HUB_SHEETS_.activity],
          );
        SpreadsheetApp.flush();
      } catch (error) {
        // Never remove a file already referenced by a successfully written row.
        if (evidenceFile) {
          try {
            if (
              !readHubSheet_(ss, "Completion").some(
                (c) => c["Evidence File ID"] === evidenceFile.getId(),
              )
            )
              evidenceFile.setTrashed(true);
          } catch (_) {
            /* Keep the evidence if persistence cannot be determined. */
          }
        }
        throw error;
      }
    }
    // The validated result already contains persisted rows, including Drive metadata.
    // Avoid reading the entire workbook a second time for every small update.
    const db = result.db;
    db.activeUserSession = hubSession_(db);
    return { success: true, data: db, unchanged: result.unchanged };
  } catch (error) {
    if (auditContext) {
      try {
        const { ss, before, session, now } = auditContext;
        const row = HubModel.failureActivity(
          before,
          session.email,
          action,
          payload || {},
          error,
          now,
        );
        if (row) {
          const history = readHubSheet_(ss, "Activity");
          writeHubChanges_(ss, "Activity", history, [...history, row]);
          SpreadsheetApp.flush();
        }
      } catch (_) {
        /* Preserve the original error if the audit sheet is unavailable. */
      }
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function saveHubEvidence_(db, session, upload, submission) {
  const metadata = HubModel.validateUpload(upload);
  const properties = PropertiesService.getUserProperties();
  let folder;
  const folderId = properties.getProperty("ASAR_EVIDENCE_FOLDER_ID");
  if (folderId) folder = DriveApp.getFolderById(folderId);
  else {
    folder = DriveApp.createFolder("ASAR Team Hub - Evidence");
    properties.setProperty("ASAR_EVIDENCE_FOLDER_ID", folder.getId());
  }
  const blob = Utilities.newBlob(
    Utilities.base64Decode(upload.base64),
    metadata.mimeType,
    submission["Submission ID"] + " - " + metadata.name,
  );
  const file = folder.createFile(blob);
  try {
    // Share this attachment only with the currently enabled reviewers. No public links.
    (db.team || [])
      .filter((m) => HubModel.isAdmin(db, m))
      .forEach((m) => {
        if (HubModel.norm(m.Mail) !== session.email)
          file.addViewer(String(m.Mail).trim());
      });
    return file;
  } catch (error) {
    file.setTrashed(true);
    throw new Error(
      "Could not share evidence with the admins. Nothing was submitted. " +
        error.message,
    );
  }
}

function writeHubChanges_(ss, name, before, after, snapshot) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const values = snapshot || sheet.getDataRange().getValues();
  const headers = (values[0] || []).map((v) => String(v || "").trim());
  while (headers.length && !headers[headers.length - 1]) headers.pop();
  const originalHeaders = headers.slice();
  after.forEach((row) =>
    Object.keys(row).forEach((key) => {
      if (!headers.includes(key)) headers.push(key);
    }),
  );
  if (!headers.length) return;
  if (JSON.stringify(headers) !== JSON.stringify(originalHeaders))
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  // Preserve sheet layout, untouched cells and formulas.
  const rowNumbers = values
    .slice(1)
    .map((row, i) =>
      row.some((v, j) => headers[j] && v !== "" && v !== null) ? i + 2 : null,
    )
    .filter(Boolean);
  after.forEach((row, i) => {
    const previous = before[i];
    if (!previous) {
      sheet.appendRow(headers.map((h) => sheetText_(row[h])));
    } else {
      const changed = Object.keys(row)
        .filter(
          (key) => JSON.stringify(previous[key]) !== JSON.stringify(row[key]),
        )
        .map((key) => ({
          column: headers.indexOf(key) + 1,
          value: sheetText_(row[key]),
        }))
        .sort((a, b) => a.column - b.column);
      for (let index = 0; index < changed.length;) {
        const first = changed[index++];
        const cells = [first.value];
        while (
          index < changed.length &&
          changed[index].column === first.column + cells.length
        )
          cells.push(changed[index++].value);
        const range = sheet.getRange(
          rowNumbers[i],
          first.column,
          1,
          cells.length,
        );
        if (cells.length === 1) range.setValue(cells[0]);
        else range.setValues([cells]);
      }
    }
  });
}

function sheetText_(value) {
  return typeof value === "string" && /^[=+@]/.test(value)
    ? "'" + value
    : value == null
      ? ""
      : value;
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const result = executeHubCommand(
      payload.action,
      payload.payload || payload,
    );
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
      ContentService.MimeType.JSON,
    );
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: err.message }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// Telegram credentials stay in Script Properties, never in hubData_ or client responses.
function hubTelegramConfig_() {
  const p = PropertiesService.getScriptProperties();
  return {
    token: String(p.getProperty("TELEGRAM_BOT_TOKEN") || "").trim(),
    chatId: String(p.getProperty("TELEGRAM_CHAT_ID") || "").trim(),
    title: p.getProperty("TELEGRAM_CHAT_TITLE") || "Team Telegram group",
    url:
      p.getProperty("TELEGRAM_HUB_URL") ||
      ScriptApp.getService().getUrl() ||
      "",
    enabled: p.getProperty("TELEGRAM_NOTIFICATIONS_ENABLED") === "true",
    installer: p.getProperty("TELEGRAM_INSTALLER_EMAIL") || "",
  };
}

function hubTelegramReady_(config) {
  return (
    config.enabled &&
    /^\d+:[A-Za-z0-9_-]{20,}$/.test(config.token) &&
    /^-[1-9]\d*$/.test(config.chatId)
  );
}

function hubTelegramAdmin_() {
  const db = hubData_(hubSpreadsheet_());
  const session = hubSession_(db);
  if (!session.isAdmin)
    throw new Error(
      "Only explicitly listed admins can manage Telegram notifications.",
    );
  return session;
}

function hubTelegramDigest_(preview) {
  return Utilities.base64Encode(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      JSON.stringify(preview),
      Utilities.Charset.UTF_8,
    ),
  );
}

function getTelegramPreview(key) {
  const db = hubData_(hubSpreadsheet_());
  const session = hubSession_(db);
  if (!session.memberId)
    throw new Error("Sign in with your team account to preview notifications.");
  const config = hubTelegramConfig_();
  let preview = HubTelegram.preview(HubModel, db, key, config.url);
  const delivery = HubTelegram.deliveries(db, config.chatId).get(key) || null;
  const waiting =
    delivery &&
    ["Queued", "Sending", "Retrying", "Sent"].includes(delivery.status);
  if (waiting)
    preview = {
      ...preview,
      text: delivery.text,
      url: delivery.url,
      entities: delivery.entities || [],
    };
  const canSend = session.isAdmin && hubTelegramReady_(config) && !waiting;
  let receipt = "";
  if (canSend) {
    receipt = Utilities.getUuid();
    PropertiesService.getUserProperties().setProperty(
      "ASAR_TELEGRAM_PREVIEW",
      JSON.stringify({
        receipt,
        key,
        digest: hubTelegramDigest_(preview),
        chatId: config.chatId,
        expiresAt: Date.now() + 10 * 60 * 1000,
      }),
    );
  }
  return {
    preview,
    receipt,
    canSend,
    delivery,
    chatTitle: config.title,
    reason: waiting
      ? delivery.status === "Sent"
        ? "This announcement has already been sent."
        : "This announcement is already in the delivery queue."
      : !session.isAdmin
        ? "Only an admin can send this announcement."
        : !hubTelegramReady_(config)
          ? "Telegram is not connected yet. Ask the hub owner to complete the bot setup."
          : "Review the message, then confirm to send it to the team group.",
  };
}

function hubQueueTelegram_(db, session, payload, now) {
  if (!session.isAdmin)
    throw new Error(
      "Only explicitly listed admins can send Telegram notifications.",
    );
  const config = hubTelegramConfig_();
  // Revalidate even duplicate requests: deleted events cannot be announced.
  const preview = HubTelegram.preview(HubModel, db, payload.key, config.url);
  const existing = HubTelegram.deliveries(db, config.chatId).get(payload.key);
  if (
    existing &&
    ["Queued", "Sending", "Retrying", "Sent"].includes(existing.status)
  )
    return { db, unchanged: true };
  if (!hubTelegramReady_(config))
    throw new Error("Connect Telegram before sending an announcement.");
  let receipt;
  try {
    receipt = JSON.parse(
      PropertiesService.getUserProperties().getProperty(
        "ASAR_TELEGRAM_PREVIEW",
      ) || "null",
    );
  } catch (_) {}
  if (
    !receipt ||
    receipt.receipt !== payload.receipt ||
    receipt.key !== payload.key ||
    receipt.expiresAt < Date.now()
  )
    throw new Error("Open the notification preview again before sending.");
  if (
    receipt.chatId !== config.chatId ||
    receipt.digest !== hubTelegramDigest_(preview)
  )
    throw new Error(
      "The event or destination changed. Open the preview again before sending.",
    );
  const next = JSON.parse(JSON.stringify(db));
  next.activity.push({
    Timestamp: now,
    Email: session.email,
    Action: "telegramNotification",
    Target: preview.title,
    Details: JSON.stringify({
      event: preview.key,
      type: preview.type,
      requestId: receipt.receipt,
      outcome: "Queued",
      telegram: {
        status: "Queued",
        text: preview.text,
        entities: preview.entities,
        url: preview.url,
        chatId: config.chatId,
        attempts: 0,
        nextAttemptAt: 0,
        history: [{ status: "Queued", at: now }],
      },
    }),
  });
  // The durable Activity row, written by executeHubCommand, is the delivery outbox.
  return { db: next, unchanged: false };
}

// Run once in the Apps Script editor after adding the Script Properties in README.
// Setup verifies the bot and group but never posts a message.
function setupTelegramNotifications() {
  const session = hubTelegramAdmin_();
  const config = hubTelegramConfig_();
  if (
    !/^\d+:[A-Za-z0-9_-]{20,}$/.test(config.token) ||
    !/^-[1-9]\d*$/.test(config.chatId)
  )
    throw new Error(
      "Set TELEGRAM_BOT_TOKEN and the negative numeric TELEGRAM_CHAT_ID in Script Properties first.",
    );
  if (config.installer && config.installer !== session.email)
    throw new Error(
      "Run setup from the original installer account: " + config.installer,
    );
  const bot = hubTelegramCall_(config, "getMe", {});
  const chat = hubTelegramCall_(config, "getChat", { chat_id: config.chatId });
  if (!bot.ok || !chat.ok) throw new Error((!bot.ok ? bot : chat).error);
  if (!["group", "supergroup"].includes(chat.result.type))
    throw new Error(
      "Choose the team's Telegram group, not a private chat or channel.",
    );
  const membership = hubTelegramCall_(config, "getChatMember", {
    chat_id: config.chatId,
    user_id: bot.result.id,
  });
  if (!membership.ok) throw new Error(membership.error);
  const role = membership.result;
  if (
    ["left", "kicked"].includes(role.status) ||
    role.is_member === false ||
    role.can_send_messages === false ||
    (!["administrator", "creator"].includes(role.status) &&
      chat.result.permissions &&
      chat.result.permissions.can_send_messages === false)
  )
    throw new Error("Add the bot to this group and allow it to send messages.");
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const triggers = ScriptApp.getProjectTriggers().filter(
      (t) => t.getHandlerFunction() === "hubTelegramWorker_",
    );
    if (!triggers.length)
      ScriptApp.newTrigger("hubTelegramWorker_")
        .timeBased()
        .everyMinutes(1)
        .create();
    // One installer owns the trigger. Remove duplicates created by this account.
    triggers.slice(1).forEach((trigger) => ScriptApp.deleteTrigger(trigger));
    PropertiesService.getScriptProperties().setProperties({
      TELEGRAM_CHAT_ID: String(chat.result.id),
      TELEGRAM_CHAT_TITLE: String(chat.result.title || "Team Telegram group"),
      TELEGRAM_NOTIFICATIONS_ENABLED: "true",
      TELEGRAM_INSTALLER_EMAIL: session.email,
    });
  } finally {
    lock.releaseLock();
  }
  const status = {
    enabled: true,
    chatId: String(chat.result.id),
    chatTitle: chat.result.title,
    message:
      "Connected. Every announcement requires an admin preview and confirmation in the hub.",
  };
  console.log(
    "Telegram connected to " +
      status.chatTitle +
      " (" +
      status.chatId +
      "). Delivery trigger installed; no message sent during setup.",
  );
  return status;
}

function pauseTelegramNotifications() {
  hubTelegramAdmin_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    PropertiesService.getScriptProperties().setProperty(
      "TELEGRAM_NOTIFICATIONS_ENABLED",
      "false",
    );
  } finally {
    lock.releaseLock();
  }
  return {
    enabled: false,
    message: "Delivery paused. Queued announcements are preserved.",
  };
}

// Optional setup aid: group IDs/titles only, without returning incoming messages.
function findTelegramGroups() {
  hubTelegramAdmin_();
  const result = hubTelegramCall_(hubTelegramConfig_(), "getUpdates", {
    timeout: 0,
    limit: 100,
    allowed_updates: ["message", "my_chat_member"],
  });
  if (!result.ok) throw new Error(result.error);
  const groups = new Map();
  (result.result || []).forEach((update) => {
    const chat = (update.message || update.my_chat_member || {}).chat;
    if (chat && ["group", "supergroup"].includes(chat.type))
      groups.set(String(chat.id), {
        chatId: String(chat.id),
        title: String(chat.title || "Group"),
      });
  });
  return [...groups.values()];
}

function hubTelegramCall_(config, method, payload) {
  let response, body, code;
  try {
    response = UrlFetchApp.fetch(
      "https://api.telegram.org/bot" + config.token + "/" + method,
      {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
        followRedirects: false,
        timeoutSeconds: 20,
      },
    );
    code = response.getResponseCode();
    body = JSON.parse(response.getContentText());
  } catch (_) {
    // Fetch exceptions can contain the request URL and bot token. Never expose them.
    return {
      ok: false,
      uncertain: true,
      error:
        "Telegram did not confirm delivery. Check the group before retrying.",
    };
  }
  if (!body || typeof body !== "object")
    return {
      ok: false,
      uncertain: true,
      error:
        "Telegram did not confirm delivery. Check the group before retrying.",
    };
  if (code >= 200 && code < 300 && body.ok === true)
    return { ok: true, result: body.result };
  const errorCode = Number(body.error_code || code);
  const migrated = body.parameters && body.parameters.migrate_to_chat_id;
  return {
    ok: false,
    code: errorCode,
    retryAfter: Number(body.parameters && body.parameters.retry_after) || 0,
    uncertain: !body || typeof body.ok !== "boolean",
    error: migrated
      ? "The group migrated. Set TELEGRAM_CHAT_ID to " +
        String(migrated) +
        " and run setup again."
      : errorCode === 401
        ? "Telegram rejected the bot token. Update it and run setup again."
        : errorCode === 400 && method === "getChat"
          ? "Telegram could not find this group. Check bot membership and use the Bot API chat ID; a supergroup ID starts with -100."
          : errorCode === 403
            ? "The bot cannot post in this group. Check its membership and permissions."
            : errorCode === 429
              ? "Telegram rate limit reached. Delivery will retry automatically."
              : errorCode >= 500
                ? "Telegram is temporarily unavailable. Delivery will retry automatically."
                : "Telegram rejected this request. Check the bot, group ID and connection settings.",
  };
}

function hubTelegramUpdate_(ss, rows, index, data, status, error) {
  const item = data.telegram;
  const now = new Date().toISOString();
  item.status = status;
  item.error = error || "";
  item.history = [
    ...(item.history || []),
    { status, at: now, ...(error ? { error } : {}) },
  ].slice(-20);
  data.outcome = status;
  const after = rows.slice();
  after[index] = { ...rows[index], Details: JSON.stringify(data) };
  writeHubChanges_(ss, "Activity", rows, after);
  SpreadsheetApp.flush();
}

function hubTelegramEventDeleted_(ss, key) {
  const type = String(key || "").split(":")[0];
  const table = HubModel.TABLES[type];
  if (!["Task", "Meet", "Learning"].includes(type)) return true;
  // Check the source before claiming: its deletion may have persisted even if
  // the later Activity write failed. Never send from a stale outbox snapshot.
  const event = HubModel.events(
    {
      [table]: readHubSheet_(ss, HUB_SHEETS_[table]),
      logs: readHubSheet_(ss, "Log"),
    },
    { includeDeleted: true },
  ).find((item) => item.key === key);
  return !!event?.deleted;
}

function hubTelegramClaim_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return null;
  try {
    const config = hubTelegramConfig_();
    if (!hubTelegramReady_(config)) return null;
    const ss = hubSpreadsheet_();
    const access = {
      team: readHubSheet_(ss, "Team"),
      admins: readHubSheet_(ss, "Admins"),
    };
    if (!HubModel.isAdmin(access, HubModel.actor(access, config.installer)))
      return null;
    const rows = readHubSheet_(ss, "Activity");
    const now = Date.now();
    for (let index = 0; index < rows.length; index++) {
      if (rows[index].Action !== "telegramNotification") continue;
      const data = HubTelegram.details(rows[index]),
        item = data.telegram;
      if (!item) continue;
      if (item.status === "Sending" && item.leaseUntil < now) {
        hubTelegramUpdate_(
          ss,
          rows,
          index,
          data,
          "Unconfirmed",
          "Delivery was interrupted. Check the group before retrying.",
        );
        return { skipped: true };
      }
      if (
        !["Queued", "Retrying"].includes(item.status) ||
        item.nextAttemptAt > now
      )
        continue;
      if (item.chatId !== config.chatId) {
        hubTelegramUpdate_(
          ss,
          rows,
          index,
          data,
          "Failed",
          "The destination changed. Preview this announcement again.",
        );
        return { skipped: true };
      }
      if (hubTelegramEventDeleted_(ss, data.event)) {
        hubTelegramUpdate_(
          ss,
          rows,
          index,
          data,
          "Cancelled",
          "This event was deleted before delivery.",
        );
        return { skipped: true };
      }
      const properties = PropertiesService.getScriptProperties();
      const wait =
        Number(properties.getProperty("ASAR_TELEGRAM_NEXT_SEND_AT") || 0) - now;
      if (wait > 0) return { wait: Math.min(wait, 3500) };
      item.attempts = (item.attempts || 0) + 1;
      item.leaseId = Utilities.getUuid();
      item.leaseUntil = now + 2 * 60 * 1000;
      properties.setProperty("ASAR_TELEGRAM_NEXT_SEND_AT", String(now + 3200));
      hubTelegramUpdate_(ss, rows, index, data, "Sending");
      return {
        config,
        index,
        receipt: data.requestId,
        leaseId: item.leaseId,
        item,
      };
    }
    return null;
  } finally {
    lock.releaseLock();
  }
}

function hubTelegramFinish_(claim, result) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = hubSpreadsheet_(),
      rows = readHubSheet_(ss, "Activity");
    const index = rows.findIndex(
      (row) =>
        row.Action === "telegramNotification" &&
        HubTelegram.details(row).requestId === claim.receipt,
    );
    if (index < 0) return;
    const data = HubTelegram.details(rows[index]),
      item = data.telegram;
    if (item.status !== "Sending" || item.leaseId !== claim.leaseId) return;
    if (result.ok) {
      item.messageId = result.result.message_id;
      item.sentAt = new Date().toISOString();
      hubTelegramUpdate_(ss, rows, index, data, "Sent");
    } else {
      const retry =
        !result.uncertain && (result.code === 429 || result.code >= 500);
      item.nextAttemptAt =
        Date.now() +
        Math.max(
          result.retryAfter || 0,
          Math.min(3600, 30 * Math.pow(2, Math.min(item.attempts, 7))),
        ) *
          1000;
      hubTelegramUpdate_(
        ss,
        rows,
        index,
        data,
        result.uncertain ? "Unconfirmed" : retry ? "Retrying" : "Failed",
        result.error,
      );
    }
  } finally {
    lock.releaseLock();
  }
}

// Private trigger entry point. No script lock is held during network calls or spacing.
function hubTelegramWorker_() {
  const started = Date.now();
  let sent = 0,
    passes = 0;
  while (sent < 5 && passes++ < 20 && Date.now() - started < 45000) {
    const claim = hubTelegramClaim_();
    if (!claim) break;
    if (claim.skipped) continue;
    if (claim.wait) {
      Utilities.sleep(claim.wait);
      continue;
    }
    const payload = {
      chat_id: claim.item.chatId,
      text: claim.item.text,
      link_preview_options: { is_disabled: true },
    };
    const entities = HubTelegram.entities(claim.item.text, claim.item.entities);
    if (entities.length) payload.entities = entities;
    if (claim.item.url)
      payload.reply_markup = {
        inline_keyboard: [[{ text: "🚀 Open Team Hub", url: claim.item.url }]],
      };
    const result = hubTelegramCall_(claim.config, "sendMessage", payload);
    hubTelegramFinish_(claim, result);
    sent++;
    if (!result.ok) break;
  }
}
