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

function readHubSheet_(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet && name === "Skill") sheet = ss.getSheetByName("SKILLs");
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
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

function hubData_(ss) {
  const db = {};
  Object.keys(HUB_SHEETS_).forEach(
    (key) => (db[key] = readHubSheet_(ss, HUB_SHEETS_[key])),
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
  try {
    const ss = hubSpreadsheet_();
    const before = hubData_(ss);
    const session = hubSession_(before);
    const now = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone() || "Africa/Cairo",
      "yyyy-MM-dd'T'HH:mm:ssXXX",
    );
    const result = HubModel.transition(
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
              key !== "skills" && key !== "supervisor" && key !== "admins",
          )
          .forEach((key) => {
            if (JSON.stringify(before[key]) !== JSON.stringify(result.db[key]))
              writeHubChanges_(
                ss,
                HUB_SHEETS_[key],
                before[key],
                result.db[key],
              );
          });
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
    const db = hubData_(ss);
    db.activeUserSession = hubSession_(db);
    return { success: true, data: db, unchanged: result.unchanged };
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

function writeHubChanges_(ss, name, before, after) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const values = sheet.getDataRange().getValues();
  const headers = (values[0] || []).map((v) => String(v || "").trim());
  while (headers.length && !headers[headers.length - 1]) headers.pop();
  after.forEach((row) =>
    Object.keys(row).forEach((key) => {
      if (!headers.includes(key)) headers.push(key);
    }),
  );
  if (!headers.length) return;
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
      Object.keys(row).forEach((key) => {
        if (JSON.stringify(previous[key]) !== JSON.stringify(row[key]))
          sheet
            .getRange(rowNumbers[i], headers.indexOf(key) + 1)
            .setValue(sheetText_(row[key]));
      });
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
