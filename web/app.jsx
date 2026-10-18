const { useState, useEffect, useRef, useMemo } = React;
const M = HubModel;
const IS_LOCAL = typeof LocalHub !== "undefined";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const icons = {
  Task: "check-square",
  Meet: "calendar",
  Learning: "book-open",
  Skill: "sparkles",
};
const initials = (name) =>
  M.clean(name)
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
const safeUrl = (value) => {
  try {
    const url = new URL(M.clean(value));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch (_) {
    return "";
  }
};
const dateLabel = (value) => {
  if (!value) return "No deadline";
  const d = new Date(value + "T12:00:00");
  return isNaN(d)
    ? value
    : d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};
const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};
function Icon({ name, size = 18 }) {
  const ref = useRef();
  useEffect(() => {
    const key = name
      .split("-")
      .map((x) => x[0].toUpperCase() + x.slice(1))
      .join("");
    const node = window.lucide && window.lucide.icons[key];
    if (node && ref.current)
      ref.current.replaceChildren(
        window.lucide.createElement(node, {
          "stroke-width": 1.8,
          "aria-hidden": "true",
        }),
      );
  }, [name]);
  return (
    <span
      className="icon"
      style={{ width: size, height: size }}
      ref={ref}
      aria-hidden="true"
    />
  );
}
function Button({ children, icon, className = "", ...props }) {
  return (
    <button className={"button " + className} {...props}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}
function Progress({ value, label, success = false }) {
  return (
    <div
      className={"progress " + (success ? "success" : "")}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value || 0}
    >
      <span style={{ width: (value || 0) + "%" }} />
    </div>
  );
}
function Empty({ title = "Nothing here yet", children }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Notice({ children, kind = "" }) {
  return (
    <div className={"notice " + kind}>
      <Icon name={kind === "error" ? "alert-circle" : "info"} />
      <p>{children}</p>
    </div>
  );
}
function Heading({ eyebrow, title, description, children, hero = false }) {
  return (
    <div className={"page-heading " + (hero ? "hero" : "")}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="row">{children}</div>
    </div>
  );
}
function Modal({ title, onClose, children, busy = false }) {
  const ref = useRef();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
    >
      <div className="dialog-header">
        <h2 id="dialog-title">{title}</h2>
        <Button
          icon="x"
          className="icon-button ghost"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        />
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
function Chart({ options, theme }) {
  const ref = useRef();
  useEffect(() => {
    if (!window.ApexCharts) return;
    const chart = new ApexCharts(ref.current, {
      ...options,
      theme: { mode: theme },
      chart: {
        ...options.chart,
        background: "transparent",
        fontFamily: "Plus Jakarta Sans, Noto Sans Arabic, Arial, sans-serif",
        foreColor: theme === "dark" ? "#b3bfd4" : "#53627a",
        toolbar: { show: false },
        animations: { enabled: false },
      },
      plotOptions:
        options.chart?.type === "radar"
          ? {
              ...options.plotOptions,
              radar: {
                ...options.plotOptions?.radar,
                size: Math.max(
                  25,
                  Math.min(90, (ref.current.clientWidth - 190) / 2),
                ),
                polygons: {
                  strokeColors: theme === "dark" ? "#39465c" : "#dce1ec",
                  connectorColors: theme === "dark" ? "#39465c" : "#dce1ec",
                  fill: {
                    colors:
                      theme === "dark"
                        ? ["#192233", "#222e44"]
                        : ["#ffffff", "#f6f7fb"],
                  },
                },
              },
            }
          : options.plotOptions,
      xaxis: {
        ...options.xaxis,
        labels: {
          style: {
            colors: Array((options.xaxis?.categories || []).length).fill(
              theme === "dark" ? "#b3bfd4" : "#53627a",
            ),
            fontSize: "11px",
          },
        },
      },
      colors: ["#7553c8", "#169367", "#ac751d"],
      tooltip: { theme },
      grid: { borderColor: theme === "dark" ? "#39465c" : "#dce1ec" },
      dataLabels: { enabled: false },
    });
    chart.render();
    let radarSize = Math.max(
      25,
      Math.min(90, (ref.current.clientWidth - 190) / 2),
    );
    const observer =
      options.chart?.type === "radar"
        ? new ResizeObserver(([entry]) => {
            const size = Math.max(
              25,
              Math.min(90, (entry.contentRect.width - 190) / 2),
            );
            if (size !== radarSize) {
              radarSize = size;
              chart.updateOptions(
                { plotOptions: { radar: { size } } },
                false,
                false,
              );
            }
          })
        : null;
    if (observer) observer.observe(ref.current);
    return () => {
      if (observer) observer.disconnect();
      chart.destroy();
    };
  }, [JSON.stringify(options), theme]);
  return <div ref={ref} className="chart" aria-hidden="true" />;
}
const rpc = (name, ...args) =>
  new Promise((resolve, reject) => {
    if (typeof google === "undefined" || !google.script || !google.script.run)
      return reject(
        new Error(
          "Open the deployed Apps Script app, or use local_test_dashboard.html for the local preview.",
        ),
      );
    google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler(reject)
      [name](...args);
  });
async function exportCV(db, member) {
  if (!window.docx)
    throw new Error(
      "Word export could not load. Reload the page and try again.",
    );
  const c = M.cvData(db, member);
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    Footer,
    PageNumber,
    AlignmentType,
  } = window.docx;
  const rtl = (text) =>
    /^[\s\p{P}\p{N}]*[\p{Script=Arabic}]/u.test(M.clean(text));
  const run = (text, opts = {}) =>
    new TextRun({
      text: M.clean(text),
      font: "Arial",
      size: 21,
      color: "172238",
      rightToLeft: rtl(text),
      ...opts,
    });
  const p = (text, opts = {}) =>
    new Paragraph({
      children: M.clean(text)
        .split(/\r?\n/)
        .map((line, i) => run(line, { break: i ? 1 : 0 })),
      bidirectional: rtl(text),
      alignment: rtl(text) ? AlignmentType.RIGHT : AlignmentType.LEFT,
      spacing: { after: 110, line: 300 },
      ...opts,
    });
  const heading = (text) =>
    new Paragraph({
      text,
      heading: HeadingLevel.HEADING_1,
      keepNext: true,
      spacing: { before: 280, after: 130 },
    });
  const children = [
    new Paragraph({
      children: [run(c.name, { size: 42, bold: true })],
      bidirectional: rtl(c.name),
      alignment: rtl(c.name) ? AlignmentType.RIGHT : AlignmentType.LEFT,
      spacing: { after: 90 },
      keepNext: true,
    }),
    p([c.role, c.department].filter(Boolean).join(" · "), { keepNext: true }),
    p([c.email, c.phone].filter(Boolean).join(" | "), {
      spacing: { after: 240 },
    }),
  ];
  if (c.overview) children.push(heading("PROFILE"), p(c.overview));
  if (c.education.length)
    children.push(heading("EDUCATION"), ...c.education.map((v) => p(v)));
  const groups = c.groups.filter((g) => g.items.length);
  if (groups.length) {
    children.push(
      heading("SKILLS & TOOLS"),
      p(
        "Recorded ratings use a 0–10 scale. Logged assessments are marked below.",
        {
          children: [
            run(
              "Recorded ratings use a 0–10 scale. Logged assessments are marked below.",
              { color: "53627A", size: 18 },
            ),
          ],
        },
      ),
    );
    groups.forEach((g) => {
      children.push(
        new Paragraph({
          children: [run(g.name, { bold: true, size: 23 })],
          keepNext: true,
          spacing: { before: 170, after: 90 },
        }),
      );
      g.items.forEach((item) =>
        children.push(
          p(
            `${item.label} — ${item.score}/10${item.source === "Logged assessment" ? " (logged assessment)" : ""}`,
          ),
        ),
      );
    });
  }
  if (c.tasks.length) {
    children.push(heading("TEAM PROJECT EXPERIENCE"));
    c.tasks.forEach((t) => {
      children.push(
        new Paragraph({
          children: [run(t.title, { bold: true })],
          keepNext: true,
          spacing: { before: 160, after: 70 },
        }),
      );
      children.push(
        p(
          `${t.status}${t.score !== null ? ` · Recorded score: ${t.score}/10` : ""}`,
        ),
      );
      if (t.description) children.push(p(t.description));
      if (t.dod) children.push(p("Definition of done: " + t.dod));
      if (t.feedback) children.push(p("Feedback: " + t.feedback));
    });
  }
  children.push(
    heading("TEAM PARTICIPATION"),
    p("Active eligible events; archived assignments are excluded."),
    ...M.TYPES.map((type) => {
      const v = c.progress.byType[type];
      return p(
        `${M.LABELS[type]}: ${v.completed} completed / ${v.total} eligible${v.percent !== null ? ` (${v.percent}%)` : ""}`,
      );
    }),
  );
  const doc = new Document({
    creator: "ASAR Team Hub",
    title: c.name + " — CV",
    description: "Recorded team profile; no inferred qualifications.",
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 21, color: "172238" },
          paragraph: { spacing: { after: 110, line: 300 }, widowControl: true },
        },
        heading1: {
          run: { font: "Arial", size: 23, bold: true, color: "5931B6" },
          paragraph: { keepNext: true },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  run("ASAR Team Hub · " + today() + " · Page ", {
                    size: 16,
                    color: "53627A",
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: "Arial",
                    size: 16,
                    color: "53627A",
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  saveBlob(
    await Packer.toBlob(doc),
    c.name.replace(/[^\p{L}\p{N} -]/gu, "").trim() + " CV.docx",
  );
}
function printCV(db, member) {
  const c = M.cvData(db, member);
  const escape = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (x) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[x],
    );
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("Allow popups to open the printable CV.");
  const section = (name, body) =>
    body ? `<section><h2>${name}</h2>${body}</section>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(c.name)} — CV</title><style>@page{size:A4;margin:18mm}*{box-sizing:border-box}body{font:11pt/1.6 Arial,sans-serif;color:#172238;max-width:760px;margin:30px auto;padding:20px}h1{font-size:26pt;line-height:1.2;margin:0 0 8px}h2{font-size:12pt;color:#5931b6;border-bottom:1px solid #dce1ec;padding-bottom:6px;margin:22px 0 10px;break-after:avoid}h3{font-size:11pt;margin:14px 0 6px;break-after:avoid}p{margin:6px 0;white-space:pre-line;overflow-wrap:anywhere;orphans:3;widows:3}.contact,.note{font-size:10pt;color:#53627a}.skills p{display:flex;justify-content:space-between;gap:16px;break-inside:avoid}.skills b{white-space:nowrap}.tools{display:flex;justify-content:flex-end;gap:10px;margin-bottom:25px}button{padding:10px 16px;background:#5931b6;color:white;border:0;border-radius:8px;font-size:11pt;cursor:pointer}@media print{body{margin:0;padding:0;max-width:none}.tools{display:none}}</style></head><body><div class="tools"><button onclick="window.print()">Print / Save as PDF</button></div><h1 dir="auto">${escape(c.name)}</h1><p>${escape([c.role, c.department].filter(Boolean).join(" · "))}</p><p class="contact">${escape([c.email, c.phone].filter(Boolean).join(" | "))}</p>${section("PROFILE", c.overview ? `<p dir="auto">${escape(c.overview)}</p>` : "")}${section("EDUCATION", c.education.map((e) => `<p dir="auto">${escape(e)}</p>`).join(""))}${section(
    "SKILLS & TOOLS",
    c.groups
      .filter((g) => g.items.length)
      .map(
        (g) =>
          `<div class="skills"><h3>${escape(g.name)}</h3>${g.items.map((i) => `<p><span>${escape(i.label)}${i.source === "Logged assessment" ? " <small>(logged assessment)</small>" : ""}</span><b>${i.score}/10</b></p>`).join("")}</div>`,
      )
      .join(""),
  )}${section("TEAM PROJECT EXPERIENCE", c.tasks.map((t) => `<h3 dir="auto">${escape(t.title)}</h3><p>${escape(t.status)}${t.score !== null ? " · Score: " + t.score + "/10" : ""}</p>${t.description ? `<p dir="auto">${escape(t.description)}</p>` : ""}${t.dod ? `<p>Definition of done: ${escape(t.dod)}</p>` : ""}${t.feedback ? `<p>Feedback: ${escape(t.feedback)}</p>` : ""}`).join(""))}${section(
    "TEAM PARTICIPATION",
    '<p class="note">Active eligible events; archived assignments are excluded.</p>' +
      M.TYPES.map((type) => {
        const v = c.progress.byType[type];
        return `<p>${M.LABELS[type]}: ${v.completed} completed / ${v.total} eligible</p>`;
      }).join(""),
  )}<p class="note">ASAR Team Hub · Recorded team profile · ${today()}</p></body></html>`;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}
function EventEditor({ event, type, db, onSave, onClose, busy, error }) {
  const row = event ? event.row : {};
  const [memberSearch, setMemberSearch] = useState("");
  const [draft, setDraft] = useState(() => ({
    key: event?.key || "",
    type,
    title: event?.title || "",
    description: event?.description || "",
    due: event?.due || "",
    members: event ? event.eligible.map(M.memberKey) : db.team.map(M.memberKey),
    status: M.status(row.Status),
    date: M.dateOnly(row.Date),
    loggingEnabled: event?.loggingEnabled || false,
    link: row.Link || row.Attachments || "",
    trackName: row["Track Name"] || "",
    obligation: row.Obligability || "Optional",
  }));
  const field = (key, label, props = {}) => (
    <label className={"field " + (props.full ? "full" : "")}>
      {label}
      <input
        className="input"
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        {...Object.fromEntries(
          Object.entries(props).filter(([k]) => k !== "full"),
        )}
      />
    </label>
  );
  return (
    <Modal
      title={`${event ? "Edit" : "Create"} ${type === "Meet" ? "meeting" : type.toLowerCase()}`}
      onClose={onClose}
      busy={busy}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(type === "Task" ? "saveTask" : "saveEvent", {
            key: draft.key,
            type,
            ...Object.fromEntries(
              M.EVENT_FORM_FIELDS[type].map((key) => [key, draft[key]]),
            ),
          });
        }}
      >
        <div className="form-grid">
          {field("title", "Title", {
            required: true,
            full: true,
            maxLength: 240,
          })}
          <label className="field full">
            Description
            <textarea
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
              maxLength={16000}
              placeholder={
                type === "Task"
                  ? "What needs to be done?"
                  : "A short note for participants (optional)"
              }
            />
          </label>
          {type === "Task" && (
            <>
              <label className="field">
                Status
                <select
                  value={draft.status}
                  onChange={(e) =>
                    setDraft({ ...draft, status: e.target.value })
                  }
                >
                  {M.STATUS.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              {field("due", "Due date", { type: "date" })}
            </>
          )}
          {type === "Meet" && (
            <>
              {field("date", "Meeting date", { type: "date", required: true })}
              {field("link", "Meeting link or location", {
                placeholder: "Call URL or meeting location",
              })}
              <label className="check-label field full">
                <input
                  type="checkbox"
                  checked={draft.loggingEnabled}
                  onChange={(e) =>
                    setDraft({ ...draft, loggingEnabled: e.target.checked })
                  }
                />
                Attendance logging open
              </label>
              <p className="field full muted form-note">
                Attendance submissions require admin approval.
              </p>
            </>
          )}
          {type === "Learning" && (
            <>
              {field("link", "Course URL", {
                type: "url",
                full: true,
                placeholder: "Course link (optional for offline learning)",
              })}
              <p className="field full muted form-note">
                Members upload evidence and submit for admin approval.
              </p>
            </>
          )}
          {type !== "Task" && (
            <details className="field full event-optional-settings">
              <summary>Optional settings</summary>
              <div className="form-grid">
                {field(
                  "due",
                  type === "Meet"
                    ? "Attendance deadline"
                    : "Completion deadline",
                  { type: "date" },
                )}
                {type === "Learning" && (
                  <>
                    {field("trackName", "Track name")}
                    <label className="field">
                      Requirement
                      <select
                        value={draft.obligation}
                        onChange={(e) =>
                          setDraft({ ...draft, obligation: e.target.value })
                        }
                      >
                        <option>Optional</option>
                        <option>Mandatory</option>
                      </select>
                    </label>
                  </>
                )}
              </div>
            </details>
          )}
          <div className="field full">
            <div className="row spread">
              <strong>
                {type === "Task" ? "Assignees" : "Eligible members"} /{" "}
                {draft.members.length}
              </strong>
              <div className="row">
                <button
                  type="button"
                  className="text-link"
                  onClick={() =>
                    setDraft({ ...draft, members: db.team.map(M.memberKey) })
                  }
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setDraft({ ...draft, members: [] })}
                >
                  Clear
                </button>
              </div>
            </div>
            <input
              className="input"
              aria-label="Find members to assign"
              placeholder="Find a teammate..."
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
            />
            <div className="members-picker">
              {db.team
                .filter((m) =>
                  M.norm(m.Name + " " + m.Mail).includes(M.norm(memberSearch)),
                )
                .map((m) => {
                  const key = M.memberKey(m);
                  return (
                    <label className="check-label" key={key}>
                      <input
                        type="checkbox"
                        checked={draft.members.includes(key)}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            members: e.target.checked
                              ? [...draft.members, key]
                              : draft.members.filter((v) => v !== key),
                          })
                        }
                      />
                      <span dir="auto">{m.Name}</span>
                    </label>
                  );
                })}
            </div>
            <small>Only selected members count toward progress.</small>
          </div>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="dialog-footer">
          <Button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="primary"
            icon="check"
            disabled={busy || !draft.members.length}
          >
            {busy
              ? "Saving..."
              : "Save " + (type === "Task" ? "task" : "event")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function CompletionEditor({ event, member, onSave, onClose, busy, error }) {
  const state = M.eventState(event, member, today());
  const updatingSkill = event.type === "Skill" && state.completed;
  const [evidence, setEvidence] = useState(
    updatingSkill ? state.submission?.Evidence || "" : "",
  );
  const [score, setScore] = useState(
    updatingSkill ? (state.submission?.Score ?? "") : "",
  );
  const [upload, setUpload] = useState(null);
  const [fileError, setFileError] = useState("");
  const [reading, setReading] = useState(false);
  const reviewed = M.REVIEW_TYPES.includes(event.type);
  return (
    <Modal
      title={
        reviewed
          ? "Submit for review"
          : updatingSkill
            ? "Update skill result"
            : "Record your completion"
      }
      onClose={onClose}
      busy={busy || reading}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (reading || fileError || (event.type === "Learning" && !upload))
            return;
          onSave(updatingSkill ? "updateSkillCompletion" : "completeEvent", {
            key: event.key,
            evidence,
            score,
            ...(upload ? { upload } : {}),
          });
        }}
        className="stack"
      >
        <div>
          <span className="badge accent">{M.LABELS[event.type]}</span>
          <h3 style={{ marginTop: 10 }}>{event.title}</h3>
          <p className="muted">
            {reviewed ? "Submission for " : "Completion will be recorded for "}
            <strong dir="auto">{member.Name}</strong>.
          </p>
          {reviewed && (
            <p className="muted">
              Your status stays Pending until an admin approves. You can
              withdraw or undo it later.
            </p>
          )}
        </div>
        {reviewed && (
          <label className="field evidence-upload">
            {event.type === "Learning"
              ? "Course evidence file"
              : "Attendance evidence file (optional)"}
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              required={event.type === "Learning"}
              disabled={busy || reading}
              onChange={async (e) => {
                const file = e.target.files[0];
                setUpload(null);
                setFileError("");
                if (!file) return;
                if (file.size > M.MAX_EVIDENCE_BYTES) {
                  setFileError("Choose a file up to 10 MB.");
                  return;
                }
                setReading(true);
                try {
                  const dataUrl = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () =>
                      reject(new Error("The file could not be read."));
                    reader.readAsDataURL(file);
                  });
                  const value = {
                    name: file.name,
                    mimeType: file.type,
                    base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
                  };
                  M.validateUpload(value);
                  setUpload(value);
                } catch (err) {
                  setFileError(err.message);
                } finally {
                  setReading(false);
                }
              }}
            />
            <small>
              Certificate, result or screenshot · PDF, PNG or JPEG · up to 10
              MB. Evidence is linked in the backend sheet for admin review.
            </small>
            {upload && (
              <span className="badge success">Ready: {upload.name}</span>
            )}
            {IS_LOCAL && (
              <small>
                Local preview keeps files for this page session. The deployed
                app saves them in Drive.
              </small>
            )}
          </label>
        )}
        <label className="field">
          Evidence or notes
          <textarea
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="Add a link, result, or a short note (optional)"
            maxLength={16000}
          />
        </label>
        {event.type === "Skill" && (
          <label className="field">
            Skill level (0–10, optional)
            <input
              className="input"
              type="number"
              min="0"
              max="10"
              step="0.1"
              value={score}
              onChange={(e) => setScore(e.target.value)}
            />
            <small>
              A recorded level updates your skill matrix and profile lists.
            </small>
          </label>
        )}
        {(error || fileError) && (
          <Notice kind="error">{error || fileError}</Notice>
        )}
        <div className="dialog-footer">
          <Button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="primary"
            disabled={
              busy ||
              reading ||
              !!fileError ||
              (event.type === "Learning" && !upload)
            }
            icon="check-circle"
          >
            {busy
              ? "Saving…"
              : reading
                ? "Reading file…"
                : reviewed
                  ? "Submit for review"
                  : updatingSkill
                    ? "Save skill result"
                    : "Confirm completion"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function EvidenceLink({ row }) {
  const link =
    IS_LOCAL && row["Evidence File ID"]?.startsWith("local-")
      ? LocalHub.fileUrl(row["Submission ID"])
      : safeUrl(row["Evidence URL"]);
  return link ? (
    <a
      className="button small"
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      download={IS_LOCAL ? row["Evidence Filename"] : undefined}
    >
      <Icon name="paperclip" size={14} />
      {row["Evidence Filename"] || "Open evidence"}
    </a>
  ) : row["Evidence Filename"] ? (
    <small>
      {row["Evidence Filename"]} · File unavailable in this preview session
    </small>
  ) : null;
}
function ReviewEditor({ submission, onSave, onClose, busy, error }) {
  const [note, setNote] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  return (
    <Modal title="Review submission" onClose={onClose} busy={busy}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const decision = e.nativeEvent.submitter.value;
          if (decision === "Uncompleted" && !note.trim()) {
            setFeedbackError(
              "Add feedback so the member knows what to update.",
            );
            return;
          }
          onSave("reviewSubmission", {
            submissionId: submission["Submission ID"],
            decision,
            note,
          });
        }}
      >
        <div>
          <span className="badge warning">Pending review</span>
          <h3 dir="auto">{submission["Event Name"]}</h3>
          <p dir="auto">{submission.Name}</p>
          <small>
            {submission.Email} · {dateLabel(M.dateOnly(submission.Timestamp))}
          </small>
        </div>
        <EvidenceLink row={submission} />
        {submission.Evidence && (
          <p className="submission-note" dir="auto">
            {submission.Evidence}
          </p>
        )}
        <label className="field">
          Reviewer feedback
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setFeedbackError("");
            }}
            maxLength={16000}
            placeholder="Required when returning for changes"
          />
        </label>
        {(error || feedbackError) && (
          <Notice kind="error">{error || feedbackError}</Notice>
        )}
        <div className="dialog-footer review-actions">
          <Button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" value="Uncompleted" disabled={busy}>
            Return for changes
          </Button>
          <Button
            type="submit"
            value="Completed"
            className="primary"
            icon="check"
            disabled={busy}
          >
            Approve completion
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function ReviewQueue({ db, type, onReview, busy }) {
  const rows = M.events(db)
    .filter((e) => e.type === type)
    .flatMap((e) => [...e.submissions.values()])
    .filter((r) => M.completionStatus(r) === "Pending")
    .sort((a, b) => a.Timestamp.localeCompare(b.Timestamp));
  return (
    <section className="panel review-queue" aria-label="Admin review queue">
      <div className="row spread">
        <div>
          <span className="eyebrow">Admin review</span>
          <h2>Awaiting your review</h2>
        </div>
        <span className="badge warning">{rows.length} pending</span>
      </div>
      {!rows.length ? (
        <p className="muted">
          New{" "}
          {type === "Learning" ? "course evidence" : "attendance submissions"}{" "}
          will appear here for approval.
        </p>
      ) : (
        <div className="review-list">
          {rows.map((r) => (
            <div className="review-item" key={r["Submission ID"]}>
              <div>
                <strong dir="auto">{r["Event Name"]}</strong>
                <p dir="auto">{r.Name}</p>
                <small>Submitted {dateLabel(M.dateOnly(r.Timestamp))}</small>
              </div>
              <Button
                className="small primary"
                onClick={() => onReview(r)}
                disabled={busy}
                aria-label={`Review ${r["Event Name"]} for ${r.Name}`}
              >
                Review submission
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
function EventCard({
  event,
  member,
  admin,
  onEdit,
  onComplete,
  onRevert,
  onArchive,
  onMove,
  onDrag,
  rating,
  requirementTarget = null,
  allowCompletion = true,
  busy,
}) {
  const state = M.eventState(event, member, today());
  const done = event.totalCompleted;
  const isDone =
    event.type === "Task"
      ? M.status(event.row.Status) === "Completed"
      : state.completed;
  const link = safeUrl(event.row.Link || event.row.Attachments);
  return (
    <article
      className={
        "event-card " +
        (isDone ? "completed " : "") +
        (state.pending ? "pending-review " : "") +
        (state.upcoming ? "upcoming-meeting" : "")
      }
      draggable={event.type === "Task" && admin && !busy}
      onDragStart={(e) => {
        if (!admin || event.type !== "Task") return;
        e.dataTransfer.setData("text/plain", event.key);
        e.dataTransfer.effectAllowed = "move";
        if (onDrag) onDrag(event.key);
      }}
      onDragEnd={() => onDrag && onDrag("")}
    >
      {event.type === "Meet" && (
        <div
          className={"meeting-schedule " + (state.upcoming ? "upcoming" : "")}
        >
          <Icon name="calendar-days" size={22} />
          <div>
            <strong>
              {event.meetingDate
                ? dateLabel(event.meetingDate)
                : "Date to be confirmed"}
            </strong>
            <small>
              {state.upcoming
                ? "Upcoming meeting"
                : event.meetingDate === today()
                  ? "Today"
                  : "Past meeting"}
            </small>
          </div>
        </div>
      )}
      {event.type === "Meet" && event.row.Attachments && !link && (
        <p className="meta">
          <Icon name="map-pin" size={14} />
          {event.row.Attachments}
        </p>
      )}
      <div className="row spread">
        <span
          className={
            "badge " +
            (isDone
              ? "success"
              : state.pending || state.closed
                ? "warning"
                : "accent")
          }
        >
          {isDone && <Icon name="check" size={13} />}
          {event.type === "Task"
            ? M.status(event.row.Status) === "InProgress"
              ? "In progress"
              : M.status(event.row.Status)
            : member
              ? !allowCompletion
                ? state.completed
                  ? "Completed"
                  : "Pending"
                : state.label
              : event.type}
        </span>
        {event.archived && <span className="badge">Archived</span>}
      </div>
      <h3 dir="auto">{event.title}</h3>
      {state.reviewRequired && state.eligible && (
        <ol className="completion-steps" aria-label="Completion status">
          {M.COMPLETION_STATES.map((status) => (
            <li
              key={status}
              className={state.status === status ? "current" : ""}
              aria-current={state.status === status ? "step" : undefined}
            >
              <span />
              {status}
            </li>
          ))}
        </ol>
      )}
      {state.pending && (
        <p className="review-hint">
          Submitted for admin review. Progress updates after approval.
        </p>
      )}
      {state.submission?.["Review Note"] && (
        <p className="review-hint" dir="auto">
          <strong>Reviewer feedback:</strong> {state.submission["Review Note"]}
        </p>
      )}
      {state.submission && <EvidenceLink row={state.submission} />}
      {rating && (
        <p className="meta">
          Recorded rating: <strong>{rating.score}/10</strong>
        </p>
      )}
      {event.requirement && (
        <span className="badge">Required project skill</span>
      )}
      {event.requirement && requirementTarget !== null && (
        <p className="meta">Target rating: {requirementTarget}/10</p>
      )}
      {event.description && (
        <p className="description" dir="auto">
          {event.description}
        </p>
      )}
      {event.targetSkill && (
        <p className="meta">
          <Icon name="sparkles" size={14} />
          {event.targetSkill}
        </p>
      )}
      {event.type === "Learning" && (
        <div className="row">
          <span className="badge">{event.row.Obligability || "Optional"}</span>
          {event.row.Platform && (
            <span className="meta">{event.row.Platform}</span>
          )}
        </div>
      )}
      <div className="meta">
        <Icon name="calendar" size={14} />
        {dateLabel(event.due)}
      </div>
      <div className="row spread">
        <span className="meta">
          <Icon name="users" size={14} />
          {done} / {event.totalEligible} completed
        </span>
        {event.unresolved.length > 0 && (
          <span className="badge warning" title={event.unresolved.join("\n")}>
            {event.unresolved.length} unmatched names
          </span>
        )}
      </div>
      {event.totalEligible > 0 && (
        <Progress
          label={`${event.title} team completion`}
          value={(100 * done) / event.totalEligible}
          success={done === event.totalEligible}
        />
      )}
      <footer>
        <div className="row">
          {event.type !== "Task" &&
            state.eligible &&
            !state.completed &&
            !state.pending &&
            allowCompletion && (
              <Button
                className="small primary"
                icon="check"
                disabled={busy || !state.canComplete}
                onClick={() => onComplete(event)}
              >
                {event.type === "Meet"
                  ? "Log attendance"
                  : event.type === "Learning"
                    ? "Request completion"
                    : "Complete"}
              </Button>
            )}
          {state.canRevert && allowCompletion && onRevert && (
            <Button
              className="small"
              icon="undo-2"
              disabled={busy}
              onClick={() => onRevert(event, state.submission)}
            >
              {event.type === "Skill"
                ? "Reset skill"
                : state.pending
                  ? "Withdraw submission"
                  : "Undo completion"}
            </Button>
          )}
          {event.type === "Skill" && state.completed && allowCompletion && (
            <Button
              className="small primary"
              icon="pencil-line"
              disabled={busy || state.closed || event.archived}
              onClick={() => onComplete(event)}
            >
              Update result
            </Button>
          )}
          {event.type !== "Task" &&
            state.eligible &&
            !state.completed &&
            !state.pending &&
            !state.canComplete &&
            allowCompletion && (
              <small className="completion-unavailable">
                {state.loggingDisabled
                  ? "An admin needs to open attendance logging."
                  : "Ask an admin to reopen this event."}
              </small>
            )}
          {link && (
            <a
              className="button small"
              href={link}
              target="_blank"
              rel="noopener noreferrer"
            >
              {event.type === "Learning" ? "Open course" : "Open link"}
              <Icon name="external-link" size={14} />
            </a>
          )}
          {event.type !== "Task" &&
            (!state.canComplete || !allowCompletion) &&
            !link && (
              <small>
                {state.completed
                  ? allowCompletion
                    ? "Your completion is recorded."
                    : "Completion is recorded for this member."
                  : state.closed
                    ? "Ask an admin to reopen."
                    : "View only"}
              </small>
            )}
        </div>
        {admin && !event.requirement && (
          <div className="row">
            <Button
              className="small"
              disabled={busy}
              onClick={() => onEdit(event)}
              aria-label={`Edit ${event.title}`}
              icon="pencil"
            >
              Edit
            </Button>
            {event.type !== "Learning" && (
              <Button
                className="small icon-button ghost"
                icon={event.archived ? "archive-restore" : "archive"}
                disabled={busy}
                onClick={() => onArchive(event)}
                aria-label={`${event.archived ? "Restore" : "Archive"} ${event.title}`}
              />
            )}
            {event.type === "Task" && onMove && (
              <select
                aria-label={`Move ${event.title}`}
                value={M.status(event.row.Status)}
                disabled={busy}
                onChange={(e) => onMove(event.key, e.target.value)}
              >
                {M.STATUS.map((s) => (
                  <option key={s} value={s}>
                    {s === "InProgress" ? "In progress" : s}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </footer>
    </article>
  );
}
function EventTab({
  type,
  db,
  member,
  admin,
  onEdit,
  onCreate,
  onComplete,
  onRevert,
  onReview,
  onArchive,
  onMove,
  busy,
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("board");
  const [dragKey, setDragKey] = useState("");
  const [dropTarget, setDropTarget] = useState("");
  const all = M.events(db).filter((e) => e.type === type);
  const visible = all.filter((e) => {
    const s = M.eventState(e, member, today());
    return (
      (filter === "archived" ? e.archived : !e.archived) &&
      (filter !== "mine" || s.eligible) &&
      (filter !== "completed" || s.completed) &&
      (filter !== "pending" || s.pending) &&
      (filter !== "open" || s.canComplete) &&
      M.norm(
        e.title +
          " " +
          e.description +
          " " +
          e.targetSkill +
          " " +
          (e.row["Track Name"] || ""),
      ).includes(M.norm(search))
    );
  });
  const card = (e) => (
    <EventCard
      key={e.key}
      event={e}
      member={member}
      admin={admin}
      onEdit={onEdit}
      onComplete={onComplete}
      onRevert={onRevert}
      onArchive={onArchive}
      onMove={onMove}
      onDrag={setDragKey}
      busy={busy}
    />
  );
  const tracks = [
    ...new Set(
      visible.map((e) => M.clean(e.row["Track Name"]) || "Other learning"),
    ),
  ];
  return (
    <>
      <Heading
        eyebrow="Team workspace"
        title={M.LABELS[type]}
        description={
          type === "Task"
            ? admin
              ? "Move tasks between columns or choose a status. Progress follows the task's board status."
              : "Track your assigned work and its current board status."
            : M.REVIEW_TYPES.includes(type)
              ? "Submit your work, track its review, and update it whenever needed. Only approved records count toward progress."
              : `Manage ${M.LABELS[type].toLowerCase()} and record your own completion here. Progress counts only eligible members.`
        }
      >
        {admin && (
          <Button
            className="primary"
            icon="plus"
            disabled={busy}
            onClick={() => onCreate(type)}
          >
            Create {type === "Meet" ? "meeting" : type.toLowerCase()}
          </Button>
        )}
      </Heading>
      {admin && M.REVIEW_TYPES.includes(type) && (
        <ReviewQueue db={db} type={type} onReview={onReview} busy={busy} />
      )}
      <div className="toolbar">
        <input
          className="input search"
          aria-label={`Search ${M.LABELS[type]}`}
          placeholder={`Search ${M.LABELS[type].toLowerCase()}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="row">
          <select
            className="filter"
            aria-label="Event filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All active</option>
            <option value="mine">Assigned to me</option>
            <option value="open">
              {type === "Task" ? "Open tasks" : "Ready to complete"}
            </option>
            <option value="completed">
              {type === "Task" ? "Completed" : "Completed by me"}
            </option>
            {M.REVIEW_TYPES.includes(type) && (
              <option value="pending">Pending review</option>
            )}
            {type !== "Learning" && <option value="archived">Archived</option>}
          </select>
          {type === "Task" && (
            <div className="segmented">
              <button
                className={view === "board" ? "active" : ""}
                aria-pressed={view === "board"}
                onClick={() => setView("board")}
              >
                Board
              </button>
              <button
                className={view === "list" ? "active" : ""}
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                Cards
              </button>
            </div>
          )}
          <span className="muted">
            {visible.length} {visible.length === 1 ? "event" : "events"}
          </span>
        </div>
      </div>
      {!admin && (
        <div style={{ marginBottom: 20 }}>
          <Notice>
            Event settings are managed by the admins listed in the sheet.
            {type === "Task"
              ? " Task progress follows its board status."
              : M.REVIEW_TYPES.includes(type)
                ? " Submit for admin approval; you can withdraw pending submissions or undo completion to make updates."
                : " Eligible members can record their completion."}
          </Notice>
        </div>
      )}
      {type === "Task" && admin && view === "board" && (
        <p className="board-hint">
          Drag a task into a column to change its status, or use its status
          selector.
        </p>
      )}
      {!visible.length ? (
        <Empty title="No matching events">
          Try another filter{admin ? " or create an event." : "."}
        </Empty>
      ) : type === "Task" && view === "board" ? (
        <div className="task-board">
          {M.STATUS.map((status) => (
            <section
              className={
                "task-column " +
                (dragKey && dropTarget === status ? "drop-target" : "")
              }
              key={status}
              data-task-status={status}
              onDragOver={(e) => {
                if (admin && !busy) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDropTarget(status);
                }
              }}
              onDragLeave={() => setDropTarget("")}
              onDrop={(e) => {
                e.preventDefault();
                const key = e.dataTransfer.getData("text/plain");
                if (admin && !busy && all.some((t) => t.key === key))
                  onMove(key, status);
                setDropTarget("");
                setDragKey("");
              }}
            >
              <h3>
                {status === "InProgress" ? "In progress" : status}
                <span className="badge">
                  {
                    visible.filter((e) => M.status(e.row.Status) === status)
                      .length
                  }
                </span>
              </h3>
              {visible
                .filter((e) => M.status(e.row.Status) === status)
                .map(card)}
            </section>
          ))}
        </div>
      ) : type === "Meet" ? (
        <div className="stack">
          {[true, false].map((upcoming) => {
            const rows = visible
              .filter(
                (e) => M.eventState(e, member, today()).upcoming === upcoming,
              )
              .sort((a, b) =>
                upcoming
                  ? a.meetingDate.localeCompare(b.meetingDate)
                  : b.meetingDate.localeCompare(a.meetingDate),
              );
            if (!rows.length) return null;
            return (
              <section key={String(upcoming)}>
                <div className="meeting-group-heading">
                  <h2>
                    {upcoming ? "Upcoming meetings" : "Today & past meetings"}
                  </h2>
                  <span className="badge">{rows.length}</span>
                </div>
                <div className="event-grid">{rows.map(card)}</div>
              </section>
            );
          })}
        </div>
      ) : type === "Learning" ? (
        tracks.map((track) => {
          const es = visible.filter(
            (e) => (M.clean(e.row["Track Name"]) || "Other learning") === track,
          );
          const mine = es.filter(
            (e) => M.eventState(e, member, today()).eligible,
          );
          const done = mine.filter(
            (e) => M.eventState(e, member, today()).completed,
          ).length;
          return (
            <section className="panel track" key={track}>
              <div className="track-header row spread">
                <div>
                  <p className="eyebrow">Learning track</p>
                  <h2>{track}</h2>
                </div>
                <div>
                  <strong>
                    {done} / {mine.length}
                  </strong>
                  <small> completed by you</small>
                </div>
              </div>
              <div className="event-grid">{es.map(card)}</div>
            </section>
          );
        })
      ) : (
        <div className="event-grid">{visible.map(card)}</div>
      )}
    </>
  );
}
function ProgressStats({ db, member }) {
  const p = M.progress(db, member);
  return (
    <div className="stats">
      {M.TYPES.map((type) => {
        const v = p.byType[type];
        return (
          <div className="stat" key={type} data-event-type={type}>
            <div className="row spread">
              <strong>{M.LABELS[type]}</strong>
              <Icon name={icons[type]} />
            </div>
            <div className="value">
              {v.completed}
              <span> / {v.total} eligible</span>
            </div>
            <Progress
              label={`${M.LABELS[type]} personal progress`}
              value={v.percent}
              success={v.percent === 100}
            />
            <small>
              {v.percent === null
                ? "No eligible events"
                : v.percent + "% complete"}
            </small>
          </div>
        );
      })}
    </div>
  );
}
function Overview({ db, member, onNavigate }) {
  const landing = useRef();
  const all = M.events(db).filter((e) => !e.archived);
  const own = all.filter((e) => M.eventState(e, member, today()).eligible);
  const mine = own
    .filter((e) => M.eventState(e, member, today()).canComplete)
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  const p = M.progress(db, member, all);
  const reviewed = own.filter((e) => M.REVIEW_TYPES.includes(e.type));
  const stages = M.COMPLETION_STATES.map((status) => ({
    status,
    count: reviewed.filter(
      (e) => M.eventState(e, member, today()).status === status,
    ).length,
  }));
  const pending = stages.find((s) => s.status === "Pending").count;
  const upcoming = own
    .filter((e) => M.eventState(e, member, today()).upcoming)
    .sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));
  const strengths = member
    ? M.skillGroups(db, member, all)
        .filter((g) => M.PROJECT_FIELDS.includes(g.name))
        .flatMap((g) => g.items)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
    : [];
  useEffect(() => {
    if (
      !window.IntersectionObserver ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.12 },
    );
    landing.current
      .querySelectorAll("[data-reveal]")
      .forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
  return (
    <div className="dashboard-landing" ref={landing}>
      <section className="landing-hero" aria-label="Your ASAR dashboard">
        <div className="landing-copy">
          <span className="landing-kicker">
            <span /> ASAR / Built together
          </span>
          <h1>
            {member
              ? `Welcome, ${M.clean(member.Name).split(/\s/)[0]}`
              : "Welcome to ASAR"}
          </h1>
          <h2>
            Build what’s next.
            <br />
            <em>Grow together.</em>
          </h2>
          <p>
            A shared direction. A clearer next step. Your work, learning and
            team, all moving forward.
          </p>
          <div className="row landing-actions">
            <Button
              className="landing-primary"
              icon="arrow-up-right"
              onClick={() => onNavigate("Task")}
            >
              Find your next task
            </Button>
            <Button
              className="landing-secondary"
              icon="users"
              onClick={() => onNavigate("intelligence")}
            >
              Explore your team
            </Button>
            <Button
              className="landing-secondary"
              icon="network"
              onClick={() => onNavigate("hierarchy")}
            >
              My subteams
            </Button>
          </div>
          <button
            className="scroll-cue"
            onClick={() =>
              document.getElementById("dashboard-momentum").scrollIntoView({
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? "instant"
                  : "smooth",
              })
            }
          >
            <Icon name="arrow-down" size={16} /> Scroll to see your momentum
          </button>
        </div>
        <div className="momentum-visual">
          <div className="orbit-line orbit-one" />
          <div className="orbit-line orbit-two" />
          <div
            className="momentum-dial"
            role="img"
            aria-label={`Your approved progress: ${p.completed} of ${p.total} eligible events, ${p.percent ?? 0} percent`}
          >
            <svg viewBox="0 0 240 240" aria-hidden="true">
              <circle cx="120" cy="120" r="100" className="dial-track" />
              <circle
                cx="120"
                cy="120"
                r="100"
                className="dial-value"
                pathLength="100"
                strokeDasharray={`${p.percent ?? 0} 100`}
              />
            </svg>
            <div>
              <span className="dial-eyebrow">YOUR MOMENTUM</span>
              <strong>{p.percent === null ? "—" : p.percent + "%"}</strong>
              <small>
                {p.completed} / {p.total} completed
              </small>
            </div>
          </div>
          <div className="orbit-chip orbit-top">
            <Icon name="sparkles" size={17} />
            <span>
              {M.requiredSkills(db, member || {}).length} required skills
            </span>
          </div>
          <div className="orbit-chip orbit-bottom">
            <Icon name="users" size={17} />
            <span>{db.team.length} people. One direction.</span>
          </div>
        </div>
      </section>
      <section
        className="landing-chapter"
        id="dashboard-momentum"
        data-reveal
        aria-label="Your progress snapshot"
      >
        <div className="chapter-heading">
          <div>
            <span className="eyebrow">01 / Make every step count</span>
            <h2>Your momentum, in view.</h2>
          </div>
          <p>
            Real progress across your assigned events. Courses and attendance
            count after approval.
          </p>
        </div>
        <ProgressStats db={db} member={member} />
      </section>
      <section
        className="landing-insights"
        data-reveal
        aria-label="Learning and attendance journey"
      >
        <div className="panel journey-panel">
          <div className="row spread">
            <span className="eyebrow">From effort to achievement</span>
            <Icon name="route" />
          </div>
          <h2>
            A little progress.
            <br />A bigger picture.
          </h2>
          <p className="muted">
            Your course and meeting submissions, from start to approval.
          </p>
          <div
            className="journey-bar"
            role="img"
            aria-label={stages
              .map((s) => `${s.count} ${s.status.toLowerCase()}`)
              .join(", ")}
          >
            {stages.map((s) => (
              <span
                key={s.status}
                className={"journey-segment stage-" + s.status.toLowerCase()}
                style={{ flex: s.count }}
              />
            ))}
          </div>
          <div className="journey-legend">
            {stages.map((s) => (
              <div key={s.status}>
                <span className={"stage-dot stage-" + s.status.toLowerCase()} />
                <strong>{s.count}</strong>
                <small>{s.status}</small>
              </div>
            ))}
          </div>
          <p className="review-hint">
            {pending
              ? `${pending} submission${pending === 1 ? " is" : "s are"} awaiting admin review. You can withdraw or update from the event card.`
              : "Finish a course, upload your evidence, and submit it for review. Every approved step moves you forward."}
          </p>
          <Button
            className="small"
            icon="arrow-up-right"
            onClick={() => onNavigate("Learning")}
          >
            Continue learning
          </Button>
        </div>
        <div className="panel strengths-panel">
          <span className="eyebrow">02 / Know your strengths</span>
          <h2>Skills worth building on.</h2>
          <p className="muted">Your highest recorded project skill ratings.</p>
          <div className="strength-bars">
            {strengths.length ? (
              strengths.map((s) => (
                <div key={s.label}>
                  <div className="row spread">
                    <strong dir="auto">{s.label}</strong>
                    <span>{s.score}/10</span>
                  </div>
                  <Progress
                    label={s.label + " recorded rating"}
                    value={s.score * 10}
                  />
                </div>
              ))
            ) : (
              <p className="muted">
                Your recorded skills will appear here as your profile grows.
              </p>
            )}
          </div>
          <Button
            className="small"
            icon="arrow-up-right"
            onClick={() => onNavigate("intelligence")}
          >
            See your full skill profile
          </Button>
        </div>
      </section>
      <section
        className="landing-chapter"
        data-reveal
        aria-label="Your next moves"
      >
        <div className="chapter-heading">
          <div>
            <span className="eyebrow">03 / Keep moving</span>
            <h2>Make your next move.</h2>
          </div>
          <p>
            A few things to focus on, and the people you’ll move forward with.
          </p>
        </div>
        <div className="two-col">
          <section className="panel">
            <div className="panel-heading">
              <h3>Your next steps</h3>
              <span className="badge accent">{mine.length} ready</span>
            </div>
            {!mine.length ? (
              <Empty
                title={
                  member
                    ? "You’re up to date"
                    : "Sign in to see your assignments"
                }
              >
                Open assignments will appear here. Pending reviews stay in your
                event tabs.
              </Empty>
            ) : (
              <ul className="event-list">
                {mine.slice(0, 5).map((e) => (
                  <li key={e.key} className="row spread">
                    <div className="grow">
                      <span className="badge">{M.LABELS[e.type]}</span>
                      <h3 style={{ marginTop: 6 }} dir="auto">
                        {e.title}
                      </h3>
                      <small>{dateLabel(e.due)}</small>
                    </div>
                    <Button
                      className="small"
                      icon="arrow-up-right"
                      onClick={() => onNavigate(e.type)}
                    >
                      View
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <div className="stack">
            <section className="panel next-meeting-panel">
              <span className="eyebrow">Coming up</span>
              <Icon name="calendar-days" size={26} />
              <h3>
                {upcoming.length
                  ? upcoming[0].title
                  : "Room for the next big idea."}
              </h3>
              <p className="muted">
                {upcoming.length
                  ? dateLabel(upcoming[0].meetingDate)
                  : "Your next scheduled team meeting will appear here."}
              </p>
              <Button className="small" onClick={() => onNavigate("Meet")}>
                View meetings
              </Button>
            </section>
            <section className="panel team-connection">
              <div className="avatar-stack" aria-hidden="true">
                {db.team.slice(0, 5).map((m) => (
                  <span key={M.memberKey(m)}>{initials(m.Name)}</span>
                ))}
              </div>
              <h3>{db.team.length} people. One shared direction.</h3>
              <p className="muted">
                Meet the leaders, explore departments, and find your place in
                the team.
              </p>
              <Button
                className="small"
                icon="git-branch"
                onClick={() => onNavigate("hierarchy")}
              >
                View team hierarchy
              </Button>
            </section>
          </div>
        </div>
      </section>
      <section
        className="panel coverage-panel"
        data-reveal
        aria-label="Team event coverage"
      >
        <div className="chapter-heading">
          <div>
            <span className="eyebrow">Together, it adds up</span>
            <h2>A team in motion.</h2>
          </div>
          <Button className="small" onClick={() => onNavigate("logs")}>
            View completion logs
          </Button>
        </div>
        <div className="coverage-visual">
          {M.TYPES.map((type) => {
            const es = all.filter((e) => e.type === type),
              total = es.reduce((s, e) => s + e.totalEligible, 0),
              done = es.reduce((s, e) => s + e.totalCompleted, 0);
            return (
              <div key={type} className="coverage-column">
                <div className="coverage-track">
                  <div
                    style={{ height: (total ? (100 * done) / total : 0) + "%" }}
                  />
                </div>
                <strong>
                  {done}
                  <small> / {total}</small>
                </strong>
                <span>
                  <Icon name={icons[type]} size={15} />
                  {M.LABELS[type]}
                </span>
              </div>
            );
          })}
        </div>
        <p className="muted coverage-caption">
          Recorded completions / eligible assignments across the whole team.
          Pending submissions are excluded.
        </p>
      </section>
      <div className="landing-signoff">
        <span className="brand-mark">A</span>
        <p>
          Built by the team.
          <br />
          <strong>Moved forward by you.</strong>
        </p>
      </div>
    </div>
  );
}
function SkillRequirementsEditor({ db, member, onSave, onClose, busy, error }) {
  const required = M.requiredSkills(db, member);
  const [draft, setDraft] = useState(() =>
    M.projectSkills(db).map((s) => {
      const existing = required.find(
        (r) =>
          M.skillKey(r.category, r.label) === M.skillKey(s.category, s.label),
      );
      return { ...s, required: !!existing, target: existing?.target ?? "" };
    }),
  );
  return (
    <Modal title="Manage required skills" onClose={onClose} busy={busy}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave("saveSkillRequirements", {
            memberId: M.memberKey(member),
            requirements: draft,
          });
        }}
        className="stack"
      >
        <p>
          Project skills required for <strong dir="auto">{member.Name}</strong>.
        </p>
        {M.PROJECT_FIELDS.map((category) => (
          <fieldset className="requirements-group" key={category}>
            <legend>{category}</legend>
            {draft
              .filter((r) => r.category === category)
              .map((r) => (
                <div
                  className="requirement-editor-row"
                  key={M.skillKey(category, r.label)}
                >
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={r.required}
                      onChange={(e) =>
                        setDraft(
                          draft.map((i) =>
                            i === r ? { ...i, required: e.target.checked } : i,
                          ),
                        )
                      }
                    />
                    <span>{r.label}</span>
                  </label>
                  <input
                    className="input"
                    aria-label={`Target rating for ${category}: ${r.label}`}
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    placeholder="Target /10"
                    value={r.target}
                    disabled={!r.required}
                    onChange={(e) =>
                      setDraft(
                        draft.map((i) =>
                          i === r ? { ...i, target: e.target.value } : i,
                        ),
                      )
                    }
                  />
                </div>
              ))}
          </fieldset>
        ))}
        {error && <Notice kind="error">{error}</Notice>}
        <div className="dialog-footer">
          <Button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button className="primary" type="submit" disabled={busy}>
            Save required skills
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function SkillsPage({
  db,
  member,
  admin,
  onComplete,
  onRevert,
  onManage,
  busy,
}) {
  const [selected, setSelected] = useState(
    member ? M.memberKey(member) : M.memberKey(db.team[0] || {}),
  );
  const [search, setSearch] = useState("");
  const selectedMember =
    db.team.find((m) => M.memberKey(m) === selected) || db.team[0];
  const all = useMemo(() => M.events(db), [db]);
  const groups = selectedMember ? M.skillGroups(db, selectedMember, all) : [];
  const required = selectedMember ? M.requiredSkills(db, selectedMember) : [];
  const mine =
    member &&
    selectedMember &&
    M.memberKey(member) === M.memberKey(selectedMember);
  const visible = required.filter((r) =>
    M.norm(r.label).includes(M.norm(search)),
  );
  const card = (r) => {
    const event = all.find(
      (e) =>
        e.requirement &&
        e.skillCategory === r.category &&
        M.norm(e.targetSkill) === M.norm(r.label),
    );
    const rating = groups
      .find((g) => g.name === r.category)
      ?.items.find((i) => M.norm(i.label) === M.norm(r.label));
    return (
      event && (
        <EventCard
          key={event.key}
          event={event}
          member={selectedMember}
          allowCompletion={!!mine}
          requirementTarget={r.target}
          admin={false}
          rating={rating}
          onComplete={onComplete}
          onRevert={onRevert}
          busy={busy}
        />
      )
    );
  };
  return (
    <>
      <Heading
        eyebrow="Project capabilities"
        title="Skills"
        description="The project skills required for each member, with their recorded ratings and completion."
      ></Heading>
      <section className="panel skills-member-picker">
        <label className="field">
          Team member
          <select
            aria-label="Skills for member"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {db.team.map((m) => (
              <option key={M.memberKey(m)} value={M.memberKey(m)}>
                {m.Name}
              </option>
            ))}
          </select>
        </label>
        <input
          className="input search"
          aria-label="Search required skills"
          placeholder="Find a project skill..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {admin && selectedMember && (
          <Button
            icon="sliders-horizontal"
            onClick={() => onManage(selectedMember)}
            disabled={busy}
          >
            Manage required skills
          </Button>
        )}
        <span className="badge">{required.length} required skills</span>
      </section>
      <div className="stack">
        {M.PROJECT_FIELDS.map((category) => {
          const rows = visible.filter((r) => r.category === category);
          return (
            rows.length > 0 && (
              <section key={category}>
                <div className="meeting-group-heading">
                  <h2>
                    {category === "Technology"
                      ? "Technologies & tools"
                      : category === "Hard Skill"
                        ? "Hard skills"
                        : "Soft skills"}
                  </h2>
                  <span className="badge">{rows.length}</span>
                </div>
                <div className="event-grid">{rows.map(card)}</div>
              </section>
            )
          );
        })}
        {!visible.length && (
          <Empty title="No required skills found">
            An admin can set this member's requirements from the project
            catalogue.
          </Empty>
        )}
      </div>
    </>
  );
}
function MemberProgress({ member, progress }) {
  return (
    <section
      className="panel member-progress"
      data-testid="progress-visuals"
      aria-labelledby="member-progress-title"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Assigned event progress</p>
          <h2 id="member-progress-title">How things are going</h2>
          <p>Completed / eligible for this member.</p>
        </div>
        <div className="member-progress-total">
          <strong>
            {progress.percent === null ? "--" : progress.percent + "%"}
          </strong>
          <small>
            {progress.completed} / {progress.total} overall
          </small>
        </div>
      </div>
      <div
        className="member-progress-graph"
        role="group"
        aria-label={`Event progress for ${member.Name}`}
      >
        {M.TYPES.map((type) => {
          const v = progress.byType[type];
          return (
            <div
              className="member-progress-row"
              data-event-type={type}
              key={type}
            >
              <div className="member-progress-label">
                <Icon name={icons[type]} size={15} />
                <span>{M.LABELS[type]}</span>
              </div>
              <Progress
                label={`${M.LABELS[type]} assigned event progress`}
                value={v.percent}
                success={v.percent === 100}
              />
              <strong>
                {v.completed} / {v.total}
                <small>
                  {v.percent === null ? "No events" : v.percent + "%"}
                </small>
              </strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}
function MemberSkillCard({ group, member, theme }) {
  const top = [...group.items].sort((a, b) => b.score - a.score).slice(0, 2);
  const short = (label) =>
    label.length > 13 ? label.slice(0, 10) + "..." : label;
  return (
    <section
      className="member-skill-card"
      aria-label={`${group.name} ratings`}
      data-skill-category={group.name}
    >
      <div className="member-skill-heading">
        <h3>
          {group.name === "Technology"
            ? "Technologies & tools"
            : group.name === "Hard Skill"
              ? "Hard skills"
              : group.name === "Soft Skill"
                ? "Soft skills"
                : group.name}
        </h3>
        <span className="badge">{group.items.length} rated</span>
      </div>
      {top.length > 0 && (
        <div className="member-strengths">
          <small>Highest rated</small>
          {top.map((i) => (
            <div key={i.label}>
              <span>{i.label}</span>
              <strong>{i.score}/10</strong>
            </div>
          ))}
        </div>
      )}
      {group.items.length >= 3 ? (
        <Chart
          theme={theme}
          options={{
            chart: { type: "radar", height: 270 },
            series: [
              { name: member.Name, data: group.items.map((i) => i.score) },
            ],
            xaxis: { categories: group.items.map((i) => short(i.label)) },
            yaxis: { min: 0, max: 10, tickAmount: 5, show: false },
            stroke: { width: 2 },
            fill: { opacity: 0.15 },
            markers: { size: 3 },
          }}
        />
      ) : group.items.length > 0 ? (
        <div className="member-small-ratings">
          {group.items.map((i) => (
            <div className="skill-item" key={i.label}>
              <div className="row spread">
                <span>{i.label}</span>
                <strong>{i.score}/10</strong>
              </div>
              <Progress label={i.label} value={i.score * 10} />
            </div>
          ))}
        </div>
      ) : (
        <Empty title="No recorded ratings">
          Ratings will appear when recorded in the sheet or a skill assessment.
        </Empty>
      )}
      {group.items.length > 0 && (
        <details className="member-rating-details">
          <summary>View all ratings</summary>
          {group.items.map((i) => (
            <div className="skill-item" key={i.label}>
              <div className="row spread">
                <span className="grow">{i.label}</span>
                <strong>{i.score}/10</strong>
              </div>
              <Progress label={i.label} value={i.score * 10} />
              {i.source === "Logged assessment" && (
                <small>Logged assessment</small>
              )}
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
function MemberLearningCard({ events, member, theme }) {
  const assigned = events.filter(
    (e) =>
      e.type === "Learning" &&
      e.eligible.some((m) => M.memberKey(m) === M.memberKey(member)),
  );
  const tracks = [
    ...new Set(
      assigned.map((e) => M.clean(e.row["Track Name"]) || "Other learning"),
    ),
  ].map((label) => {
    const rows = assigned.filter(
      (e) => (M.clean(e.row["Track Name"]) || "Other learning") === label,
    );
    const completed = rows.filter((e) =>
      e.completed.has(M.memberKey(member)),
    ).length;
    return {
      label,
      completed,
      total: rows.length,
      percent: Math.round((100 * completed) / rows.length),
    };
  });
  return (
    <section
      className="member-skill-card"
      aria-label="Learning track progress"
      data-skill-category="Learning"
    >
      <div className="member-skill-heading">
        <h3>Learning matrix</h3>
        <span className="badge">{tracks.length} tracks</span>
      </div>
      <p className="member-learning-caption">
        Completion across assigned learning tracks.
      </p>
      {tracks.length >= 3 ? (
        <Chart
          theme={theme}
          options={{
            chart: { type: "radar", height: 270 },
            series: [
              { name: "Completion %", data: tracks.map((t) => t.percent) },
            ],
            xaxis: {
              categories: tracks.map((t) =>
                t.label.length > 13 ? t.label.slice(0, 10) + "..." : t.label,
              ),
            },
            yaxis: { min: 0, max: 100, tickAmount: 5, show: false },
            stroke: { width: 2 },
            fill: { opacity: 0.15 },
            markers: { size: 3 },
          }}
        />
      ) : tracks.length ? (
        <div className="member-small-ratings">
          {tracks.map((t) => (
            <div className="skill-item" key={t.label}>
              <div className="row spread">
                <span>{t.label}</span>
                <strong>
                  {t.completed} / {t.total}
                </strong>
              </div>
              <Progress label={t.label} value={t.percent} />
            </div>
          ))}
        </div>
      ) : (
        <Empty title="No assigned learning">
          Assigned learning tracks will appear here.
        </Empty>
      )}
      {tracks.length > 0 && (
        <details className="member-rating-details">
          <summary>View track progress</summary>
          {tracks.map((t) => (
            <div className="skill-item" key={t.label}>
              <div className="row spread">
                <span className="grow">{t.label}</span>
                <strong>
                  {t.completed} / {t.total}
                </strong>
              </div>
              <Progress label={t.label} value={t.percent} />
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
function MemberProfileLists({ member, groups }) {
  const recorded = (value) => {
    if (!M.clean(value)) return [];
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      if (Array.isArray(parsed))
        return parsed
          .filter((g) => g && Array.isArray(g.items))
          .map((g) => ({
            category: M.clean(g.category),
            items: g.items
              .filter((item) => typeof item === "string" && M.clean(item))
              .map((label) => ({ label: M.clean(label) })),
          }))
          .filter((g) => g.items.length);
    } catch (_) {
      /* Plain text and recorded rating columns are supported as well. */
    }
    const ratings = M.parseRatings(value);
    return [
      {
        category: "",
        items: ratings.length
          ? ratings
          : M.clean(value)
              .split(/\r?\n/)
              .map((label) => ({ label: M.clean(label) }))
              .filter((i) => i.label),
      },
    ];
  };
  const ratingGroups = (names) =>
    groups
      .filter((g) => names.includes(g.name) && g.items.length)
      .map((g) => ({
        category:
          names.length > 1
            ? g.name === "Hard Skill"
              ? "Hard skills"
              : "Soft skills"
            : "",
        items: g.items,
      }));
  const sections = [
    {
      name: "Technology",
      icon: "cpu",
      color: "purple",
      rows: ratingGroups(["Technology"]),
    },
    {
      name: "Skills",
      icon: "sparkles",
      color: "amber",
      rows: [
        ...recorded(member.Skills),
        ...ratingGroups(["Hard Skill", "Soft Skill"]),
      ],
    },
    {
      name: "Knowledge",
      icon: "book-open",
      color: "purple",
      rows: recorded(member.Knowledge),
    },
    {
      name: "Abilities",
      icon: "lightbulb",
      color: "blue",
      rows: ratingGroups(["Abilities"]),
    },
    {
      name: "Personality",
      icon: "heart-handshake",
      color: "teal",
      rows: ratingGroups(["Personality"]),
    },
  ].map((section) => ({
    ...section,
    rows: section.rows.length ? section.rows : recorded(member[section.name]),
  }));
  return (
    <section className="member-profile-lists" aria-label="Member profile lists">
      {sections.map((section) => (
        <fieldset
          className={"profile-list-card team-color-" + section.color}
          key={section.name}
          aria-label={section.name + " profile list"}
        >
          <legend>
            <Icon name={section.icon} size={15} />
            {section.name}
          </legend>
          {section.rows.length ? (
            section.rows.map((group, index) => (
              <div className="profile-list-group" key={index}>
                {group.category && <h3>{group.category}</h3>}
                <ul>
                  {group.items.map((item, i) => (
                    <li key={i}>
                      <div className="row spread">
                        <span dir="auto">{item.label}</span>
                        {M.number(item.score) !== null && (
                          <strong>{item.score}/10</strong>
                        )}
                      </div>
                      {M.number(item.score) !== null && (
                        <Progress
                          label={section.name + ": " + item.label}
                          value={Number(item.score) * 10}
                        />
                      )}
                      {item.source === "Logged assessment" && (
                        <small>Logged assessment</small>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <p className="muted">No {section.name.toLowerCase()} recorded.</p>
          )}
        </fieldset>
      ))}
    </section>
  );
}
function MemberProfile({ db, member, theme, analysis, onExport, onPrint }) {
  const { groups, progress } = analysis.members.get(M.memberKey(member));
  const ed = M.education(member);
  const strongest = groups
    .filter((g) => !["Personality", "Abilities"].includes(g.name))
    .flatMap((g) => g.items)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  return (
    <div
      className="stack intelligence-member"
      data-testid="selected-member-profile"
    >
      <section
        className="panel member-profile-header"
        aria-label="Selected member"
      >
        <div className="member-profile-identity">
          <div className="avatar large">{initials(member.Name)}</div>
          <div className="grow">
            <h2 dir="auto">{member.Name}</h2>
            <p>
              {M.role(member)}
              {member.Department ? " | " + member.Department : ""}
            </p>
            <small>ID: {M.memberKey(member)}</small>
          </div>
        </div>
        <div className="member-profile-actions">
          <Button
            icon="download"
            className="primary small"
            onClick={() => onExport(member)}
          >
            Word CV
          </Button>
          <Button
            icon="printer"
            className="small"
            onClick={() => onPrint(member)}
          >
            Print / PDF
          </Button>
        </div>
        <div className="member-profile-kpis">
          <div>
            <small>Tasks completed</small>
            <strong>
              {progress.byType.Task.completed} / {progress.byType.Task.total}
            </strong>
          </div>
          <div>
            <small>Learning completed</small>
            <strong>
              {progress.byType.Learning.completed} /{" "}
              {progress.byType.Learning.total}
            </strong>
          </div>
          <div>
            <small>Overall progress</small>
            <strong>
              {progress.percent === null ? "--" : progress.percent + "%"}
            </strong>
          </div>
        </div>
        {strongest.length > 0 && (
          <div className="member-profile-strengths">
            <small>Top recorded skills</small>
            {strongest.map((i) => (
              <span className="badge" key={i.label}>
                {i.label} <strong>{i.score}/10</strong>
              </span>
            ))}
          </div>
        )}
      </section>
      <MemberProgress member={member} progress={progress} />
      <section
        className="panel member-skill-matrix"
        data-testid="skill-matrix"
        role="region"
        aria-label="Skill matrix"
      >
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Skills matrix</p>
            <h2>What this member brings</h2>
            <p>
              Recorded ratings out of 10. Expand a card for the full detail.
            </p>
          </div>
        </div>
        <div className="member-radar-grid">
          {["Hard Skill", "Soft Skill", "Technology"].map((name) => (
            <MemberSkillCard
              key={name}
              group={groups.find((g) => g.name === name)}
              member={member}
              theme={theme}
            />
          ))}
          <MemberLearningCard
            events={analysis.events}
            member={member}
            theme={theme}
          />
        </div>
      </section>
      <section className="panel member-profile-summary">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Profile summary</p>
            <h2>Overview & objective</h2>
          </div>
        </div>
        <p className="preline" dir="auto">
          {member.overview ||
            member.Overview ||
            "No profile overview recorded."}
        </p>
        <details className="member-contact-details">
          <summary>Contact & profile details</summary>
          <div className="member-profile-fields">
            <div>
              <h3>Contact</h3>
              <p>{member.Mail}</p>
              {member["Phone number"] && <p>{M.id(member["Phone number"])}</p>}
            </div>
            <div>
              <h3>Education</h3>
              {ed.length ? (
                ed.map((v, i) => (
                  <p dir="auto" key={i}>
                    {v}
                  </p>
                ))
              ) : (
                <p className="muted">No education recorded.</p>
              )}
            </div>
          </div>
        </details>
      </section>
      <MemberProfileLists member={member} groups={groups} />
    </div>
  );
}
function Intelligence({
  db,
  member,
  theme,
  onNavigate,
  onExport,
  onPrint,
  initialMemberId,
}) {
  const analysis = useMemo(() => {
    const eventRows = M.events(db);
    return {
      events: eventRows.filter((e) => !e.archived),
      members: new Map(
        db.team.map((m) => [
          M.memberKey(m),
          {
            progress: M.progress(db, m, eventRows),
            groups: M.skillGroups(db, m, eventRows),
          },
        ]),
      ),
    };
  }, [db]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(
    initialMemberId ||
      (member ? M.memberKey(member) : M.memberKey(db.team[0] || {})),
  );
  const team = db.team.filter((m) =>
    M.norm(m.Name + " " + m.Mail + " " + m.Department).includes(M.norm(search)),
  );
  const active = db.team.find((m) => M.memberKey(m) === selected) || db.team[0];
  return (
    <>
      <Heading
        eyebrow="Shared intelligence"
        title="Team Intelligence"
        description="Select a member to see their strengths and assigned-event progress."
      >
        <Button icon="git-branch" onClick={() => onNavigate("hierarchy")}>
          Team hierarchy
        </Button>
      </Heading>
      <div className="intelligence-layout">
        <aside
          className="panel intelligence-directory"
          role="region"
          aria-label="Team directory"
        >
          <div className="intelligence-directory-heading">
            <h2>Team directory</h2>
            <small>{team.length} members</small>
          </div>
          <input
            className="input"
            aria-label="Search team members"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search a member..."
          />
          <div className="intelligence-directory-list">
            {team.map((m) => {
              const p = analysis.members.get(M.memberKey(m)).progress;
              const isActive = active && M.memberKey(active) === M.memberKey(m);
              const isMe = member && M.memberKey(member) === M.memberKey(m);
              return (
                <button
                  key={M.memberKey(m)}
                  className={
                    "intelligence-directory-member " +
                    (isActive ? "selected" : "")
                  }
                  aria-label={`View ${m.Name}`}
                  aria-pressed={isActive}
                  onClick={() => setSelected(M.memberKey(m))}
                >
                  <span className="avatar">{initials(m.Name)}</span>
                  <span className="directory-member-info">
                    <strong dir="auto">{m.Name}</strong>
                    <small>{m.Department || M.role(m)}</small>
                    {isMe && <span className="badge accent">You</span>}
                  </span>
                  <span className="directory-member-progress">
                    <strong>
                      {p.percent === null ? "--" : p.percent + "%"}
                    </strong>
                    <small>
                      {p.completed}/{p.total}
                    </small>
                  </span>
                </button>
              );
            })}
            {!team.length && (
              <Empty title="No members found">
                Try a different name or department.
              </Empty>
            )}
          </div>
        </aside>
        <div className="intelligence-stage">
          {active ? (
            <MemberProfile
              db={db}
              member={active}
              theme={theme}
              analysis={analysis}
              onExport={onExport}
              onPrint={onPrint}
            />
          ) : (
            <Empty title="No team members yet">
              Add members to the Team sheet.
            </Empty>
          )}
        </div>
      </div>
    </>
  );
}
function Hierarchy({
  db,
  member,
  admin,
  onSave,
  busy,
  error,
  onNavigate,
  onViewMember,
}) {
  const structure = useMemo(() => M.teamStructure(db), [db]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const memberId = member ? M.memberKey(member) : "";
  const mine = structure.memberships.filter((r) => r.memberId === memberId);
  const head = db.team.find((m) => M.memberKey(m) === structure.headId);
  const shared = new Set(
    db.team
      .filter(
        (m) =>
          structure.memberships.filter((r) => r.memberId === M.memberKey(m))
            .length > 1,
      )
      .map(M.memberKey),
  );
  const leaders = new Set(
    structure.memberships
      .filter((r) => r.role === "Leader")
      .map((r) => r.memberId),
  );
  const validation = M.hierarchyErrors(db, structure);
  const draftErrors = draft ? M.hierarchyErrors(db, draft) : [];
  useEffect(() => {
    setFilter(
      !admin && memberId !== structure.headId && mine.length ? "mine" : "all",
    );
    setEditing(false);
    setSearch("");
  }, [memberId]);
  useEffect(() => {
    if (editing)
      document
        .querySelector(".structure-editor")
        ?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [editing]);
  const person = (r, teamId) => {
    const m = db.team.find((m) => M.memberKey(m) === r.memberId);
    if (!m) return null;
    const own = structure.memberships.filter((i) => i.memberId === r.memberId);
    return (
      <div
        className={"subteam-person " + (memberId === r.memberId ? "you" : "")}
        key={r.memberId}
      >
        <div className="avatar">{initials(m.Name)}</div>
        <div className="grow">
          <button
            className="person-profile-link"
            onClick={() => onViewMember(m)}
            aria-label={`View profile for ${m.Name}`}
            dir="auto"
          >
            {m.Name}
          </button>
          <div className="row">
            <span className={"badge " + (r.role === "Leader" ? "accent" : "")}>
              {r.role === "Leader" && <Icon name="crown" size={12} />}
              {r.role}
            </span>
            {memberId === r.memberId && (
              <small className="you-label">You</small>
            )}
            {own.length > 1 && (
              <button
                className="shared-person-link"
                onClick={() => {
                  setFilter("all");
                  setSearch(m.Name);
                }}
                title={own
                  .map(
                    (i) => structure.teams.find((t) => t.id === i.teamId)?.name,
                  )
                  .join(", ")}
              >
                {own.length} subteams <Icon name="network" size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };
  const visible = structure.teams.filter((t) => {
    const rows = structure.memberships.filter((r) => r.teamId === t.id);
    return (
      (filter !== "mine" || mine.some((r) => r.teamId === t.id)) &&
      (filter !== "shared" || rows.some((r) => shared.has(r.memberId))) &&
      M.norm(
        t.name +
          " " +
          t.description +
          " " +
          rows
            .map(
              (r) => db.team.find((m) => M.memberKey(m) === r.memberId)?.Name,
            )
            .join(" "),
      ).includes(M.norm(search))
    );
  });
  const unassigned = db.team.filter(
    (m) =>
      M.memberKey(m) !== structure.headId &&
      !structure.memberships.some((r) => r.memberId === M.memberKey(m)),
  );
  const begin = () => {
    setDraft(JSON.parse(JSON.stringify(structure)));
    setSelectedTeam(structure.teams[0]?.id || "");
    setMemberSearch("");
    setEditing(true);
  };
  const updateTeam = (id, changes) =>
    setDraft((d) => ({
      ...d,
      teams: d.teams.map((t) => (t.id === id ? { ...t, ...changes } : t)),
    }));
  const setMembership = (id, role) =>
    setDraft((d) => ({
      ...d,
      memberships: [
        ...d.memberships.filter(
          (r) => !(r.teamId === selectedTeam && r.memberId === id),
        ),
        ...(role ? [{ teamId: selectedTeam, memberId: id, role }] : []),
      ],
    }));
  const addTeam = () => {
    const id =
      "subteam-" +
      (window.crypto?.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString(36));
    setDraft((d) => ({
      ...d,
      teams: [
        ...d.teams,
        {
          id,
          name: "New subteam",
          description: "",
          color: M.TEAM_COLORS[d.teams.length % M.TEAM_COLORS.length],
        },
      ],
    }));
    setSelectedTeam(id);
  };
  return (
    <>
      <Heading
        eyebrow="People & connections"
        title="Team hierarchy & distribution"
        description="One team, connected through subteams. Lead, contribute or support wherever your skills are needed."
      >
        <Button icon="arrow-left" onClick={() => onNavigate("intelligence")}>
          Team Intelligence
        </Button>
        {admin && (
          <Button className="primary" icon="settings-2" onClick={begin}>
            Edit distribution
          </Button>
        )}
      </Heading>
      <section className="structure-hero" aria-label="Team structure overview">
        <div>
          <span className="eyebrow">Built to work together</span>
          <h2>
            Many strengths.
            <br />
            One connected team.
          </h2>
          <p>
            Shared leadership and flexible support, with a clear place for
            everyone.
          </p>
        </div>
        <div className="structure-metrics">
          {[
            [db.team.length, "People"],
            [structure.teams.length, "Subteams"],
            [leaders.size, "Subteam leaders"],
            [shared.size, "Shared contributors"],
          ].map(([count, label]) => (
            <div key={label}>
              <strong>{count}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>
      {validation.length > 0 && (
        <Notice kind="warning">{validation.join(" ")}</Notice>
      )}
      {member && (
        <section className="my-team-strip" aria-label="My subteam roles">
          <div>
            <span className="eyebrow">Your place in the team</span>
            <h3>
              {memberId === structure.headId
                ? "Team Leader"
                : mine.length
                  ? `${mine.length} subteam${mine.length === 1 ? "" : "s"}. Your own way to contribute.`
                  : "Ready to find your subteam."}
            </h3>
          </div>
          <div className="row">
            {mine.map((r) => (
              <button
                className="button small"
                key={r.teamId}
                onClick={() => {
                  setFilter("all");
                  setSearch(
                    structure.teams.find((t) => t.id === r.teamId).name,
                  );
                }}
              >
                {structure.teams.find((t) => t.id === r.teamId).name}
                <span className="badge accent">{r.role}</span>
              </button>
            ))}
            {!mine.length && (
              <small>
                {memberId === structure.headId
                  ? "You connect and guide all subteams."
                  : "An admin can assign your roles in team settings."}
              </small>
            )}
          </div>
        </section>
      )}
      <div className="toolbar structure-toolbar">
        <input
          className="input search"
          aria-label="Search team structure"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a subteam or teammate..."
        />
        <select
          className="filter"
          aria-label="Subteam view"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All subteams</option>
          <option value="mine">My subteams</option>
          <option value="shared">Shared contributors</option>
        </select>
        {search && (
          <Button className="small" onClick={() => setSearch("")}>
            Clear search
          </Button>
        )}
      </div>
      {head && (
        <div className="structure-root">
          <span className="badge accent">
            <Icon name="crown" size={14} />
            Team Leader
          </span>
          <div className="row">
            <div className="avatar large">{initials(head.Name)}</div>
            <div>
              <button
                className="person-profile-link"
                onClick={() => onViewMember(head)}
                aria-label={`View Team Leader profile for ${head.Name}`}
                dir="auto"
              >
                {head.Name}
              </button>
              <small>Guiding {structure.teams.length} connected subteams</small>
            </div>
          </div>
        </div>
      )}
      <div className="subteam-grid" aria-label="Subteam hierarchy">
        {visible.map((t, index) => {
          const rows = structure.memberships.filter((r) => r.teamId === t.id);
          const leading = rows.filter((r) => r.role === "Leader"),
            members = rows.filter((r) => r.role === "Member"),
            support = rows.filter((r) => r.role === "Support");
          return (
            <section
              className={"subteam-card team-color-" + t.color}
              key={t.id}
              aria-label={t.name}
            >
              <header>
                <span className="subteam-emblem">
                  <Icon name="network" size={25} />
                </span>
                <div>
                  <span className="eyebrow">
                    Subteam {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2>{t.name}</h2>
                </div>
                <span className="badge">{rows.length} people</span>
              </header>
              {t.description && (
                <p className="muted subteam-description">{t.description}</p>
              )}
              <div className="subteam-leaders">
                <h3>
                  <Icon name="crown" size={15} />
                  {leading.length === 1
                    ? "Subteam leader"
                    : "Shared leadership"}
                  <span>{leading.length}</span>
                </h3>
                {leading.map((r) => person(r, t.id))}
              </div>
              {members.length > 0 && (
                <div className="subteam-roster">
                  <h3>
                    Members <span>{members.length}</span>
                  </h3>
                  {members.map((r) => person(r, t.id))}
                </div>
              )}
              {support.length > 0 && (
                <div className="subteam-roster support-roster">
                  <h3>
                    <Icon name="handshake" size={15} />
                    Supporting this team <span>{support.length}</span>
                  </h3>
                  {support.map((r) => person(r, t.id))}
                </div>
              )}
              {!members.length && !support.length && (
                <p className="muted subteam-description">
                  Ready for more contributors.
                </p>
              )}
            </section>
          );
        })}
      </div>
      {!visible.length && (
        <Empty title="No matching subteams">
          Choose All subteams or clear your search to explore the team.
        </Empty>
      )}
      {unassigned.length > 0 && !search && filter === "all" && (
        <section
          className="panel unassigned-team"
          aria-label="Members awaiting a subteam"
        >
          <h2>Ready for a subteam</h2>
          <p className="muted">
            These members are part of ASAR and have no current subteam
            assignment.
          </p>
          <div className="unassigned-people">
            {unassigned.map((m) =>
              person({ memberId: M.memberKey(m), role: "Team member" }, ""),
            )}
          </div>
        </section>
      )}
      {editing && admin && draft && (
        <section
          className="panel structure-editor"
          aria-label="Subteam settings"
        >
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Admin settings</span>
              <h2>Edit distribution</h2>
              <p>
                Give every subteam one or more leaders. Each person can have a
                different role in multiple subteams.
              </p>
            </div>
            <Button
              className="small"
              icon="x"
              onClick={() => setEditing(false)}
              disabled={busy}
            >
              Close editor
            </Button>
          </div>
          <label className="field head-picker">
            Team Leader
            <select
              value={draft.headId}
              onChange={(e) => setDraft({ ...draft, headId: e.target.value })}
            >
              {db.team.map((m) => (
                <option key={M.memberKey(m)} value={M.memberKey(m)}>
                  {m.Name}
                </option>
              ))}
            </select>
          </label>
          <div className="row spread">
            <h3>Subteam settings</h3>
            <Button
              className="small"
              icon="plus"
              onClick={addTeam}
              disabled={busy}
            >
              Add subteam
            </Button>
          </div>
          <div className="subteam-setting-list">
            {draft.teams.map((t) => (
              <div className="subteam-setting" key={t.id}>
                <label className="field">
                  Name
                  <input
                    className="input"
                    aria-label={`Subteam name ${t.id}`}
                    value={t.name}
                    maxLength={100}
                    onChange={(e) => updateTeam(t.id, { name: e.target.value })}
                  />
                </label>
                <label className="field">
                  Purpose
                  <input
                    className="input"
                    aria-label={`Purpose for ${t.name}`}
                    value={t.description}
                    maxLength={1000}
                    onChange={(e) =>
                      updateTeam(t.id, { description: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  Color
                  <select
                    aria-label={`Color for ${t.name}`}
                    value={t.color}
                    onChange={(e) =>
                      updateTeam(t.id, { color: e.target.value })
                    }
                  >
                    {M.TEAM_COLORS.map((color) => (
                      <option key={color}>{color}</option>
                    ))}
                  </select>
                </label>
                <Button
                  className="small"
                  icon="trash-2"
                  aria-label={`Remove subteam ${t.name}`}
                  onClick={() => {
                    setDraft((d) => ({
                      ...d,
                      teams: d.teams.filter((x) => x.id !== t.id),
                      memberships: d.memberships.filter(
                        (r) => r.teamId !== t.id,
                      ),
                    }));
                    if (selectedTeam === t.id)
                      setSelectedTeam(
                        draft.teams.find((x) => x.id !== t.id)?.id || "",
                      );
                  }}
                  disabled={busy}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
          {draft.teams.length > 0 && (
            <>
              <div className="membership-toolbar">
                <label className="field">
                  Manage roles in subteam
                  <select
                    aria-label="Subteam to configure"
                    value={selectedTeam}
                    onChange={(e) => setSelectedTeam(e.target.value)}
                  >
                    {draft.teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name || "Unnamed subteam"}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  className="input search"
                  aria-label="Find member to assign"
                  placeholder="Search all members..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
              </div>
              <div
                className="table-scroll"
                role="region"
                aria-label="Subteam membership editor"
                tabIndex="0"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Team member</th>
                      <th>Role in this subteam</th>
                      <th>Other subteams</th>
                    </tr>
                  </thead>
                  <tbody>
                    {db.team
                      .filter((m) =>
                        M.norm(m.Name + " " + m.Mail).includes(
                          M.norm(memberSearch),
                        ),
                      )
                      .map((m) => {
                        const assigned = draft.memberships.find(
                          (r) =>
                            r.memberId === M.memberKey(m) &&
                            r.teamId === selectedTeam,
                        );
                        return (
                          <tr key={M.memberKey(m)}>
                            <td>
                              <strong dir="auto">{m.Name}</strong>
                              <small className="record-reviewer">
                                {m.Mail}
                              </small>
                            </td>
                            <td>
                              <select
                                aria-label={`Subteam role for ${m.Name}`}
                                value={assigned?.role || ""}
                                onChange={(e) =>
                                  setMembership(M.memberKey(m), e.target.value)
                                }
                                disabled={busy}
                              >
                                <option value="">Not assigned</option>
                                {M.MEMBERSHIP_ROLES.map((role) => (
                                  <option key={role}>{role}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              {draft.memberships
                                .filter(
                                  (r) =>
                                    r.memberId === M.memberKey(m) &&
                                    r.teamId !== selectedTeam,
                                )
                                .map((r) => (
                                  <span className="badge" key={r.teamId}>
                                    {
                                      draft.teams.find((t) => t.id === r.teamId)
                                        ?.name
                                    }{" "}
                                    / {r.role}
                                  </span>
                                ))}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {draftErrors.length > 0 && (
            <Notice kind="warning">{draftErrors.join(" ")}</Notice>
          )}
          {error && <Notice kind="error">{error}</Notice>}
          <div className="dialog-footer">
            <Button onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              className="primary"
              icon="check"
              disabled={busy || !!draftErrors.length}
              onClick={async () => {
                if (await onSave("saveHierarchy", { structure: draft })) {
                  setEditing(false);
                  window.scrollTo({ top: 0, behavior: "instant" });
                }
              }}
            >
              {busy ? "Saving..." : "Save distribution"}
            </Button>
          </div>
        </section>
      )}
    </>
  );
}
function History({ kind, db, member }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const legacy = M.events(db)
    .filter(
      (e) =>
        e.log &&
        M.list(
          M.truth(e.log["Legacy Captured"])
            ? e.log["Legacy Completed"]
            : e.log["Attendees/Completed"],
        ).length,
    )
    .map((e) => ({
      Timestamp: "Imported aggregate",
      Email: "",
      Name: M.list(
        M.truth(e.log["Legacy Captured"])
          ? e.log["Legacy Completed"]
          : e.log["Attendees/Completed"],
      ).join(", "),
      "Event Type": e.type,
      "Event Name": e.title,
      Evidence: "Legacy sheet record. Individual timestamps were not recorded.",
    }));
  const data =
    kind === "logs"
      ? [
          ...db.completions
            .filter((c) => M.TYPES.includes(c["Event Type"]))
            .slice()
            .reverse(),
          ...legacy,
        ]
      : db.activity
          .filter(
            (r) =>
              ![
                "completeEvent",
                "updateSkillCompletion",
                "attendEvent",
                "logEvent",
              ].includes(r.Action),
          )
          .slice()
          .reverse();
  const rows = data.filter(
    (r) =>
      (filter !== "mine" ||
        (member && M.norm(r.Email) === M.norm(member.Mail))) &&
      M.norm(Object.values(r).join(" ")).includes(M.norm(search)),
  );
  return (
    <>
      <Heading
        eyebrow="Team records"
        title={kind === "logs" ? "Completion logs" : "Activity history"}
        description={
          kind === "logs"
            ? "Event attendance and completion records, with the member, evidence, and recorded time."
            : "An audit of changes to tasks, events, and team distribution. Event completion records are available in Completion logs."
        }
      />
      <section className="panel">
        <div className="toolbar">
          <input
            className="input search"
            aria-label="Search records"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search records…"
          />
          <select
            className="filter"
            aria-label="Record filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All members</option>
            <option value="mine">My records</option>
          </select>
          <small>{rows.length} records</small>
        </div>
        {!rows.length ? (
          <Empty title="No matching records">
            Records appear here when members complete events or admins make
            changes.
          </Empty>
        ) : (
          <div
            className="table-scroll"
            role="region"
            aria-label={
              kind === "logs" ? "Completion records" : "Activity audit records"
            }
            tabIndex="0"
          >
            <table>
              <thead>
                <tr>
                  <th>Recorded</th>
                  <th>Member / account</th>
                  <th>{kind === "logs" ? "Type" : "Action"}</th>
                  <th>{kind === "logs" ? "Event" : "Target"}</th>
                  {kind === "logs" && <th>Status / review</th>}
                  <th>
                    {kind === "logs" ? "Evidence / result" : "Change details"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="timeline-time">
                      {M.clean(r.Timestamp).replace("T", " ").slice(0, 23)}
                    </td>
                    <td>
                      <p dir="auto">{r.Name || r.Email || "Unknown account"}</p>
                      {r.Name && r.Email && <small>{r.Email}</small>}
                    </td>
                    <td>
                      <span className="badge">
                        {r["Event Type"]
                          ? M.LABELS[r["Event Type"]] || r["Event Type"]
                          : r.Action}
                      </span>
                    </td>
                    <td dir="auto">{r["Event Name"] || r.Target}</td>
                    {kind === "logs" && (
                      <td>
                        <span
                          className={
                            "badge " +
                            (M.completionStatus(r) === "Completed"
                              ? "success"
                              : M.completionStatus(r) === "Pending"
                                ? "warning"
                                : "")
                          }
                        >
                          {M.completionStatus(r)}
                        </span>
                        {r["Reviewer Email"] && (
                          <small className="record-reviewer">
                            Reviewed by{" "}
                            {r["Reviewer Name"] || r["Reviewer Email"]}
                            <br />
                            {r["Reviewed At"]}
                          </small>
                        )}
                        {r["Review Note"] && (
                          <p dir="auto">{r["Review Note"]}</p>
                        )}
                        {r["Status Changed At"] && (
                          <small className="record-reviewer">
                            Last changed {r["Status Changed At"]}
                            <br />
                            {r["Status Changed By"]}
                          </small>
                        )}
                      </td>
                    )}
                    <td>
                      {kind === "logs" && <EvidenceLink row={r} />}
                      <p className="details-json" dir="auto">
                        {kind === "logs" ? r.Evidence : r.Details}
                      </p>
                      {kind === "logs" && M.number(r.Score) !== null && (
                        <strong>{r.Score}/10</strong>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <div className="panel loading">
          <h2>The page could not render</h2>
          <p>{this.state.error.message}</p>
          <Button onClick={() => location.reload()}>Reload</Button>
        </div>
      );
    return this.props.children;
  }
}
function App() {
  const [db, setDb] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("overview");
  const [modal, setModal] = useState(null);
  const [profileId, setProfileId] = useState("");
  const [toast, setToast] = useState("");
  const [theme, setTheme] = useState(
    () => localStorage.getItem("azar_theme") || "light",
  );
  const toastTimer = useRef();
  const notify = (message) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 5000);
  };
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("azar_theme", theme);
  }, [theme]);
  const load = async (reset = false) => {
    setBusy(true);
    setError("");
    try {
      setDb(IS_LOCAL ? await LocalHub.load(reset) : await rpc("getTeamData"));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    load();
    return () => clearTimeout(toastTimer.current);
  }, []);
  const navigate = (id, selectedMemberId = "") => {
    if (id === "intelligence") setProfileId(selectedMemberId);
    setTab(id);
    setError("");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const command = async (action, payload) => {
    setBusy(true);
    setError("");
    try {
      const result = IS_LOCAL
        ? await LocalHub.command(action, payload)
        : await rpc("executeHubCommand", action, payload);
      if (!result.success) throw new Error(result.error || "Update failed.");
      setDb(result.data);
      setModal(null);
      notify(
        result.unchanged
          ? "Your completion or submission is already recorded."
          : action === "completeEvent"
            ? M.REVIEW_TYPES.some((type) => payload.key.startsWith(type + ":"))
              ? "Submitted for admin review. Status: Pending."
              : "Completion recorded. Your progress is updated."
            : action === "revertCompletion"
              ? "Status reset to Uncompleted. You can submit an update."
              : action === "reviewSubmission"
                ? payload.decision === "Completed"
                  ? "Approved. Member progress is updated."
                  : "Returned to the member with your feedback."
                : "Changes saved.",
      );
      return true;
    } catch (e) {
      setError(e.message || String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const doExport = async (m) => {
    try {
      await exportCV(db, m);
      notify("Word CV exported from recorded sheet data.");
    } catch (e) {
      notify(e.message);
    }
  };
  const doPrint = (m) => {
    try {
      printCV(db, m);
    } catch (e) {
      notify(e.message);
    }
  };
  if (!db)
    return (
      <div className="panel loading">
        <p className="eyebrow">ASAR Team Hub</p>
        <h2>{error ? "Connection unavailable" : "Loading your team…"}</h2>
        <p className="muted">
          {error || "Reading team profiles, events, and completion records."}
        </p>
        {error && <Button onClick={() => load()}>Retry</Button>}
      </div>
    );
  const member = M.actor(db, db.activeUserSession?.email);
  const admin = M.isAdmin(db, member);
  const tabs = [
    ["overview", "Overview", "layout-dashboard"],
    ["Task", "Tasks", "check-square"],
    ["Meet", "Meetings", "calendar"],
    ["Learning", "Learning", "book-open"],
    ["Skill", "Skills", "sparkles"],
    ["intelligence", "Team Intelligence", "users"],
    ["logs", "Completion logs", "list-checks"],
    ["activity", "Activity", "history"],
  ];
  const edit = (e) => {
    setError("");
    setModal({ kind: "edit", type: e.type, event: e });
  };
  const create = (type) => {
    setError("");
    setModal({ kind: "edit", type });
  };
  const complete = (e) => {
    setError("");
    setModal({ kind: "complete", event: e });
  };
  const unmatched = [
    ...new Set(
      M.events(db)
        .filter((e) => !e.archived)
        .flatMap((e) => [...e.unresolved, ...e.legacyCompletions]),
    ),
  ];
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {IS_LOCAL && (
        <div className="preview-banner">
          <div>
            Local preview · {db.localSource} · Changes stay in this browser
            session until exported.
          </div>
          <label className="row">
            Preview account
            <select
              aria-label="Local preview account"
              value={db.activeUserSession.email}
              onChange={(e) => {
                setDb(LocalHub.select(e.target.value));
                setModal(null);
                setError("");
              }}
            >
              {db.team.map((m) => (
                <option key={M.memberKey(m)} value={m.Mail}>
                  {m.Name}
                  {M.isAdmin(db, m) ? " · Admin" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <header className="app-header">
        <div className="header-inner">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate("overview");
            }}
          >
            <div className="brand-mark">A</div>
            <div>
              <div className="brand-name">
                ASAR <span style={{ fontWeight: 500 }}>Team Hub</span>
              </div>
              <div className="brand-sub">People · progress · purpose</div>
            </div>
          </a>
          <div className="header-tools">
            <Button
              icon="refresh-cw"
              onClick={() => load(false)}
              disabled={busy}
              title="Refresh sheet data"
            >
              <span className="button-label">Refresh</span>
            </Button>
            <Button
              icon={theme === "light" ? "moon" : "sun"}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
              title="Switch theme"
            />
            <div className="avatar">{initials(member ? member.Name : "?")}</div>
            <div>
              <div className="account-name" dir="auto">
                {member ? member.Name : "Unidentified account"}
              </div>
              <div className="account-email">
                {db.activeUserSession.email || "Sign in through Google"}
              </div>
            </div>
            <span className={"badge " + (admin ? "accent" : "")}>
              {admin ? "Admin" : "Member"}
            </span>
          </div>
        </div>
        <nav className="tabs" aria-label="Main navigation">
          {tabs.map(([id, label, icon]) => (
            <button
              className={"tab " + (tab === id ? "active" : "")}
              aria-current={tab === id ? "page" : undefined}
              key={id}
              onClick={() => navigate(id)}
            >
              <Icon name={icon} size={16} />
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="main" id="main">
        <div
          className="stack"
          style={{ marginBottom: !member || error ? 20 : 0 }}
        >
          {!member && (
            <Notice kind="warning">
              Your Google account is not identified in the Team sheet. Sign in
              with your team email to record completions. An unidentified
              account has view access only.
            </Notice>
          )}
          {error && !modal && <Notice kind="error">{error}</Notice>}
        </div>
        {tab === "overview" && (
          <Overview db={db} member={member} onNavigate={navigate} />
        )}
        {M.TYPES.includes(tab) && tab !== "Skill" && (
          <EventTab
            key={tab}
            type={tab}
            db={db}
            member={member}
            admin={admin}
            onEdit={edit}
            onCreate={create}
            onComplete={complete}
            onRevert={(e, submission) =>
              command("revertCompletion", {
                key: e.key,
                submissionId: submission?.["Submission ID"] || "",
              })
            }
            onReview={(submission) => {
              setError("");
              setModal({ kind: "review", submission });
            }}
            onArchive={(e) =>
              command("archiveEvent", { key: e.key, archived: !e.archived })
            }
            onMove={(key, status) => command("moveTask", { key, status })}
            busy={busy}
          />
        )}
        {tab === "Skill" && (
          <SkillsPage
            key={member?.Mail || "anonymous"}
            db={db}
            member={member}
            admin={admin}
            onComplete={complete}
            onRevert={(e, submission) =>
              command("revertCompletion", {
                key: e.key,
                submissionId: submission?.["Submission ID"] || "",
              })
            }
            onManage={(m) => {
              setError("");
              setModal({ kind: "requirements", member: m });
            }}
            busy={busy}
          />
        )}
        {tab === "intelligence" && (
          <Intelligence
            initialMemberId={profileId}
            db={db}
            member={member}
            theme={theme}
            onNavigate={navigate}
            onExport={doExport}
            onPrint={doPrint}
          />
        )}
        {tab === "hierarchy" && (
          <Hierarchy
            db={db}
            member={member}
            admin={admin}
            onSave={command}
            busy={busy}
            error={error}
            onNavigate={navigate}
            onViewMember={(m) => {
              navigate("intelligence", M.memberKey(m));
            }}
          />
        )}
        {["logs", "activity"].includes(tab) && (
          <History key={tab} kind={tab} db={db} member={member} />
        )}
        {unmatched.length > 0 && ["logs", "intelligence"].includes(tab) && (
          <div style={{ marginTop: 20 }}>
            <Notice kind="warning">
              {unmatched.length} legacy names do not match the Team sheet. Add
              their exact old names to the member’s Aliases cell to include them
              in progress.{" "}
              <details>
                <summary>View unmatched names</summary>
                {unmatched.map((n) => (
                  <p key={n}>{n}</p>
                ))}
              </details>
            </Notice>
          </div>
        )}
      </main>
      <footer className="page-footer">
        <div className="row spread">
          <span>ASAR Team Hub · Progress from recorded team data</span>
          <span>
            {db.team.length} members ·{" "}
            {M.events(db).filter((e) => !e.archived).length} active events
          </span>
        </div>
        {IS_LOCAL && (
          <details className="export-tools">
            <summary>Local database tools</summary>
            <p>
              Refresh reloads the current session. Reload CSVs discards session
              edits. Export changed tables before importing them into the
              workbook.
            </p>
            <div className="row" style={{ marginTop: 12 }}>
              <Button
                className="small"
                onClick={() => load(true)}
                disabled={busy}
              >
                Reload CSVs
              </Button>
              {Object.entries(LocalHub.sheets)
                .filter(
                  ([key]) => !["supervisor", "skills", "exam"].includes(key),
                )
                .map(([key, name]) => (
                  <Button
                    key={key}
                    className="small"
                    onClick={() =>
                      saveBlob(
                        new Blob([LocalHub.csv(key)], {
                          type: "text/csv;charset=utf-8",
                        }),
                        name + ".csv",
                      )
                    }
                  >
                    Export {name}.csv
                  </Button>
                ))}
            </div>
          </details>
        )}
      </footer>
      {modal?.kind === "edit" && (
        <EventEditor
          event={modal.event}
          type={modal.type}
          db={db}
          onSave={command}
          onClose={() => {
            setModal(null);
            setError("");
          }}
          busy={busy}
          error={error}
        />
      )}
      {modal?.kind === "complete" && member && (
        <CompletionEditor
          event={modal.event}
          member={member}
          onSave={command}
          onClose={() => {
            setModal(null);
            setError("");
          }}
          busy={busy}
          error={error}
        />
      )}
      {modal?.kind === "requirements" && admin && (
        <SkillRequirementsEditor
          db={db}
          member={modal.member}
          onSave={command}
          onClose={() => {
            setModal(null);
            setError("");
          }}
          busy={busy}
          error={error}
        />
      )}
      {modal?.kind === "review" && admin && (
        <ReviewEditor
          submission={modal.submission}
          onSave={command}
          onClose={() => {
            setModal(null);
            setError("");
          }}
          busy={busy}
          error={error}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
