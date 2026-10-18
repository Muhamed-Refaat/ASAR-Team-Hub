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
