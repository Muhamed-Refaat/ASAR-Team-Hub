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
  let auditContext = null;
  try {
    const ss = hubSpreadsheet_();
    const before = hubData_(ss);
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
    const db = hubData_(ss);
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
  const delivery = HubTelegram.deliveries(db).get(key) || null;
  const waiting =
    delivery &&
    ["Queued", "Sending", "Retrying", "Sent"].includes(delivery.status);
  if (waiting) preview = { ...preview, text: delivery.text, url: delivery.url };
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
  const existing = HubTelegram.deliveries(db).get(payload.key);
  if (
    existing &&
    ["Queued", "Sending", "Retrying", "Sent"].includes(existing.status)
  )
    return { db, unchanged: true };
  const config = hubTelegramConfig_();
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
  const preview = HubTelegram.preview(HubModel, db, payload.key, config.url);
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
  return {
    enabled: true,
    chatId: String(chat.result.id),
    chatTitle: chat.result.title,
    message:
      "Connected. Every announcement requires an admin preview and confirmation in the hub.",
  };
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
    if (claim.item.url)
      payload.reply_markup = {
        inline_keyboard: [[{ text: "Open Team Hub", url: claim.item.url }]],
      };
    const result = hubTelegramCall_(claim.config, "sendMessage", payload);
    hubTelegramFinish_(claim, result);
    sent++;
    if (!result.ok) break;
  }
}
