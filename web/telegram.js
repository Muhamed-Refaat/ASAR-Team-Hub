/* Public notification formatting only. Bot credentials belong in Script Properties. */
const HubTelegram = (() => {
  const types = ["Task", "Meet", "Learning"];
  const clean = (value) => String(value == null ? "" : value).trim();
  const clip = (value, max) => {
    const text = clean(value);
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
  };
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
  function deliveries(db) {
    return new Map(
      (db.activity || []).flatMap((row) => {
        const data = details(row);
        return row.Action === "telegramNotification" &&
          data.event &&
          data.telegram
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
    if (!creation || !event || !types.includes(event.type))
      throw new Error(
        "Only newly created tasks, meetings and courses can be announced.",
      );
    if (event.archived)
      throw new Error("Restore this event before announcing it.");
    const label = { Task: "task", Meet: "meeting", Learning: "course" }[
      event.type
    ];
    const lines = ["ASAR Team Hub · New " + label, "", clip(event.title, 240)];
    if (event.meetingDate)
      lines.push("Meeting date: " + event.meetingDate + " (Cairo)");
    if (event.due) lines.push("Due: " + event.due + " (Cairo)");
    if (event.type === "Task")
      lines.push(
        "Status: " +
          model.status(event.row.Status).replace("InProgress", "In progress"),
      );
    lines.push(
      "Assigned to: " +
        clip(
          event.eligible.map((member) => clean(member.Name)).join(", ") ||
            "No members assigned",
          700,
        ),
    );
    if (event.description) lines.push("", clip(event.description, 900));
    const link = url(event.row.Link || event.row.Attachments);
    if (link)
      lines.push(
        "",
        link.length <= 1000
          ? (event.type === "Meet" ? "Join meeting: " : "Course: ") + link
          : "Open Team Hub for the event link.",
      );
    else if (event.type === "Meet" && event.row.Attachments)
      lines.push("Location: " + clip(event.row.Attachments, 300));
    const creator = model.actor(db, creation.Email);
    if (creator) lines.push("", "Created by: " + clip(creator.Name, 160));
    return {
      key,
      type: event.type,
      title: event.title,
      text: lines.join("\n"),
      url: /^https:\/\//i.test(url(hubUrl)) ? url(hubUrl) : "",
    };
  }
  return { details, creations, deliveries, preview };
})();
if (typeof module !== "undefined" && module.exports)
  module.exports = HubTelegram;
