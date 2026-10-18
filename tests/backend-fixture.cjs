const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
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
  const scriptProperties = new Map(),
    requests = [],
    triggers = [];
  let elapsed = 0,
    fetchHandler;
  class Clock extends Date {
    constructor(...args) {
      super(...(args.length ? args : [Date.now() + elapsed]));
    }
    static now() {
      return Date.now() + elapsed;
    }
  }
  const context = vm.createContext({
    console,
    Date: Clock,
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
        tryLock: () => {
          if (locked) return false;
          locked = true;
          lockCount++;
          return true;
        },
        releaseLock: () => {
          locked = false;
        },
      }),
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: "sha256" },
      Charset: { UTF_8: "utf8" },
      computeDigest: (algorithm, value) => [
        ...crypto.createHash(algorithm).update(value).digest(),
      ],
      base64Encode: (value) => Buffer.from(value).toString("base64"),
      sleep: (ms) => {
        assert.equal(locked, false);
        elapsed += ms;
      },
      base64Decode: (value) => [...Buffer.from(value, "base64")],
      newBlob: (bytes, mimeType, name) => ({ bytes, mimeType, name }),
      formatDate: (d, tz, format) =>
        format === "yyyy-MM-dd"
          ? d.toISOString().slice(0, 10)
          : d.toISOString(),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => scriptProperties.get(key) || null,
        setProperty: (key, value) => scriptProperties.set(key, value),
        setProperties: (values) =>
          Object.entries(values).forEach(([key, value]) =>
            scriptProperties.set(key, value),
          ),
      }),
      getUserProperties: () => ({
        getProperty: (key) => properties.get(email + key),
        setProperty: (key, value) => properties.set(email + key, value),
      }),
    },
    ScriptApp: {
      getService: () => ({
        getUrl: () => "https://script.google.com/macros/s/asar-test/exec",
      }),
      getProjectTriggers: () => triggers,
      newTrigger: (handler) => ({
        timeBased() {
          return this;
        },
        everyMinutes(minutes) {
          assert.equal(minutes, 1);
          return this;
        },
        create() {
          const trigger = { getHandlerFunction: () => handler };
          triggers.push(trigger);
          return trigger;
        },
      }),
      deleteTrigger: (trigger) => triggers.splice(triggers.indexOf(trigger), 1),
    },
    UrlFetchApp: {
      fetch: (url, options) => {
        assert.equal(
          locked,
          false,
          "Network calls must never hold the event-save lock",
        );
        const method = url.split("/").at(-1);
        const payload = JSON.parse(options.payload);
        requests.push({ method, payload, time: Clock.now() });
        const result = fetchHandler
          ? fetchHandler({ url, options, method, payload })
          : {
              code: 200,
              body: {
                ok: true,
                result:
                  method === "getMe"
                    ? { id: 123, username: "ASARTestBot" }
                    : method === "getChat"
                      ? {
                          id: -4488318175,
                          title: "ASAR Team",
                          type: "group",
                          permissions: { can_send_messages: true },
                        }
                      : method === "getChatMember"
                        ? { status: "member" }
                        : { message_id: requests.length },
              },
            };
        return {
          getResponseCode: () => result.code,
          getContentText: () => JSON.stringify(result.body),
        };
      },
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
    scriptProperties,
    userProperties: properties,
    requests,
    triggers,
    advance: (ms) => {
      elapsed += ms;
    },
    fetch: (handler) => {
      fetchHandler = handler;
    },
    failSharing: (value) => {
      failSharing = value;
    },
  };
}

module.exports = { environment, Sheet };
