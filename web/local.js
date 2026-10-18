/* Local-only adapter. The production page does not contain preview identities or database exports. */
const LocalHub = (() => {
  let db;
  const attachments = new Map();
  let selected = localStorage.getItem("asar_preview_email") || "";
  let source = "Workbook snapshot";
  function parseCSV(text) {
    const rows = [];
    let row = [],
      cell = "",
      quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"' && quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = !quoted;
      else if (c === "," && !quoted) {
        row.push(cell);
        cell = "";
      } else if ((c === "\n" || c === "\r") && !quoted) {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell);
        if (row.some((v) => v.trim())) rows.push(row);
        row = [];
        cell = "";
      } else cell += c;
    }
    if (cell || row.length) {
      row.push(cell);
      rows.push(row);
    }
    const headers = (rows.shift() || []).map((v) => v.trim());
    return rows.map((values) =>
      Object.fromEntries(headers.map((h, i) => [h, values[i] || ""])),
    );
  }
  function snapshot() {
    const result = JSON.parse(JSON.stringify(db));
    const member = HubModel.actor(db, selected);
    result.activeUserSession = {
      email: selected,
      name: member ? member.Name : "",
      isAdmin: HubModel.isAdmin(db, member),
    };
    result.localSource = source;
    return result;
  }
  async function load(reset = false) {
    if (db && !reset) return snapshot();
    if (reset) {
      attachments.forEach((url) => URL.revokeObjectURL(url));
      attachments.clear();
    }
    const entries = await Promise.all(
      Object.entries(LOCAL_SEED.sheets).map(async ([key, name]) => {
        let text = LOCAL_SEED.csv[key];
        if (location.protocol !== "file:") {
          const response = await fetch(`./spreedsheet-copy/${name}.csv`, {
            cache: "no-store",
          });
          if (!response.ok)
            throw new Error(
              `Could not load ${name}.csv (${response.status}). Rebuild the local database.`,
            );
          text = await response.text();
          source = "Local CSV files";
        }
        return [key, parseCSV(text)];
      }),
    );
    db = Object.fromEntries(entries);
    db.team = db.team.filter((m) => HubModel.clean(m.Name));
    if (!selected && db.team[0]) selected = db.team[0].Mail;
    return snapshot();
  }
  async function command(action, payload) {
    await load();
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Cairo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
        timeZoneName: "longOffset",
      })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value]),
    );
    const timestamp = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${parts.timeZoneName.replace("GMT", "") || "Z"}`;
    let result;
    try {
      result = HubModel.transition(db, selected, action, payload, timestamp);
    } catch (error) {
      const row = HubModel.failureActivity(
        db,
        selected,
        action,
        payload,
        error,
        timestamp,
      );
      if (row) db.activity.push(row);
      throw error;
    }
    if (!result.unchanged && action === "completeEvent" && payload.upload) {
      const row = result.db.completions[result.db.completions.length - 1];
      const bytes = Uint8Array.from(atob(payload.upload.base64), (c) =>
        c.charCodeAt(0),
      );
      const url = URL.createObjectURL(
        new Blob([bytes], { type: payload.upload.mimeType }),
      );
      attachments.set(row["Submission ID"], url);
      row["Evidence File ID"] = "local-" + row["Submission ID"];
      row["Evidence URL"] = "local-evidence:" + row["Submission ID"];
    }
    db = result.db;
    return { success: true, data: snapshot(), unchanged: result.unchanged };
  }
  function select(email) {
    selected = email;
    localStorage.setItem("asar_preview_email", email);
    return snapshot();
  }
  function csv(key) {
    const headers = [
      ...new Set([
        ...Object.keys(parseCSV(LOCAL_SEED.csv[key])[0] || {}),
        ...db[key].flatMap(Object.keys),
      ]),
    ];
    const originalHeaders = (LOCAL_SEED.csv[key].split(/\r?\n/)[0] || "")
      .split(",")
      .filter(Boolean);
    if (!headers.length) headers.push(...originalHeaders);
    const quote = (v) =>
      '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    return (
      "\uFEFF" +
      [headers, ...db[key].map((r) => headers.map((h) => r[h]))]
        .map((r) => r.map(quote).join(","))
        .join("\r\n")
    );
  }
  return {
    load,
    command,
    select,
    csv,
    parseCSV,
    fileUrl: (id) => attachments.get(id) || "",
    sheets: LOCAL_SEED.sheets,
  };
})();
