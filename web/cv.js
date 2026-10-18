/* Professional CV layouts shared by the Word export and printable document. */
const HubCV = (() => {
  const palette = {
    ink: "192238",
    accent: "6040B5",
    muted: "566176",
    line: "DFE2EC",
    tint: "F5F4FA",
  };
  const rtl = (text) =>
    /^[\s\p{P}\p{N}]*[\p{Script=Arabic}]/u.test(String(text || ""));
  const escape = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  const sections = (cv) => {
    const experience = [
      ...cv.appointments.map((item) => ({
        title: item.role,
        subtitle: item.team,
      })),
      ...cv.tasks
        .filter((item) => item.includedInCV && item.title)
        .map((item) => ({
          title: item.title,
          subtitle: item.status.startsWith("Completed")
            ? "Completed project task"
            : "Project task · In progress",
          body: item.description,
        })),
    ];
    const main = [
      { title: "Profile", text: cv.overview },
      { title: "Team experience", entries: experience },
      { title: "Engineering skills", items: cv.technical },
      {
        title: "Professional development",
        entries: cv.learning.map((item) => ({
          title: item.title,
          subtitle: [item.track, "Completed"].filter(Boolean).join(" · "),
          url: item.url,
        })),
      },
      { title: "Knowledge", items: cv.knowledge },
      { title: "Additional capabilities", items: cv.abilities },
    ];
    const aside = [
      { title: "Technical toolkit", items: cv.tools },
      { title: "Working style", items: cv.interpersonal },
      { title: "Education", items: cv.education },
    ];
    const hasContent = (section) =>
      section.text || section.entries?.length || section.items?.length;
    return { main: main.filter(hasContent), aside: aside.filter(hasContent) };
  };
  function word(cv, docx) {
    const {
      Document,
      Paragraph,
      TextRun,
      Table,
      TableRow,
      TableCell,
      ExternalHyperlink,
      Footer,
      PageNumber,
      AlignmentType,
      BorderStyle,
      WidthType,
      TableLayoutType,
      HeadingLevel,
    } = docx;
    const run = (text, options = {}) =>
      new TextRun({
        text: String(text || ""),
        font: "Calibri",
        size: 20,
        color: palette.ink,
        rightToLeft: rtl(text),
        ...options,
      });
    const paragraph = (text, options = {}) =>
      new Paragraph({
        children: String(text || "")
          .split(/\r?\n/)
          .map((line, index) => run(line, { break: index ? 1 : 0 })),
        bidirectional: rtl(text),
        alignment: rtl(text) ? AlignmentType.RIGHT : AlignmentType.LEFT,
        spacing: { after: 100, line: 280 },
        widowControl: true,
        ...options,
      });
    const heading = (title) =>
      paragraph(title.toUpperCase(), {
        heading: HeadingLevel.HEADING_1,
        keepNext: true,
        children: [
          run(title.toUpperCase(), {
            size: 19,
            bold: true,
            color: palette.accent,
            characterSpacing: 22,
          }),
        ],
        spacing: { before: 220, after: 130 },
        border: {
          bottom: {
            color: palette.line,
            size: 5,
            style: BorderStyle.SINGLE,
            space: 7,
          },
        },
      });
    const link = (text, url, options = {}) =>
      new ExternalHyperlink({
        link: url,
        children: [run(text, { color: palette.accent, ...options })],
      });
    const render = (section, compact) => {
      const size = compact ? 18 : 20;
      const children = [heading(section.title)];
      if (section.text) children.push(paragraph(section.text));
      (section.items || []).forEach((item) =>
        children.push(
          paragraph(item, {
            children: [
              run("•  ", { color: palette.accent, size }),
              run(item, { size }),
            ],
            spacing: { after: 85, line: 260 },
          }),
        ),
      );
      (section.entries || []).forEach((item) => {
        children.push(
          paragraph(item.title, {
            children: [
              item.url
                ? link(item.title, item.url, { bold: true })
                : run(item.title, { bold: true }),
            ],
            keepNext: true,
            spacing: { before: 110, after: 45, line: 270 },
          }),
        );
        if (item.subtitle)
          children.push(
            paragraph(item.subtitle, {
              children: [
                run(item.subtitle, { size: 18, color: palette.muted }),
              ],
              keepNext: !!item.body,
              spacing: { after: 90, line: 260 },
            }),
          );
        if (item.body) children.push(paragraph(item.body));
      });
      return children;
    };
    const content = sections(cv);
    const contacts = [];
    if (cv.email)
      contacts.push(link(cv.email, "mailto:" + cv.email, { size: 19 }));
    if (cv.phone) {
      if (contacts.length)
        contacts.push(run("   |   ", { color: palette.muted, size: 18 }));
      contacts.push(
        link(cv.phone, "tel:" + cv.phone.replace(/[^+\d]/g, ""), { size: 19 }),
      );
    }
    const children = [
      paragraph("ASAR TEAM  /  CURRICULUM VITAE", {
        children: [
          run("ASAR TEAM  /  CURRICULUM VITAE", {
            color: palette.accent,
            bold: true,
            size: 17,
            characterSpacing: 28,
          }),
        ],
        spacing: { after: 190 },
        keepNext: true,
      }),
      paragraph(cv.name, {
        children: [
          run(cv.name, {
            font: rtl(cv.name) ? "Arial" : "Calibri",
            size: 58,
            bold: true,
          }),
        ],
        spacing: { after: 100, line: 280 },
        keepNext: true,
      }),
    ];
    if (cv.role)
      children.push(
        paragraph(cv.role, {
          children: [
            run(cv.role, { size: 24, color: palette.accent, bold: true }),
          ],
          keepNext: true,
          spacing: { after: 65 },
        }),
      );
    if (cv.department)
      children.push(
        paragraph(cv.department, {
          children: [run(cv.department, { size: 19, color: palette.muted })],
          keepNext: true,
          spacing: { after: 90 },
        }),
      );
    children.push(
      paragraph("", {
        children: contacts,
        spacing: { after: 220 },
        border: {
          bottom: {
            color: palette.accent,
            size: 16,
            style: BorderStyle.SINGLE,
            space: 14,
          },
        },
      }),
    );
    const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
    const main = content.main.flatMap((section) => render(section, false));
    const aside = content.aside.flatMap((section) => render(section, true));
    if (main.length && aside.length)
      children.push(
        new Table({
          width: { size: 10106, type: WidthType.DXA },
          columnWidths: [6506, 3600],
          layout: TableLayoutType.FIXED,
          borders: {
            top: noBorder,
            bottom: noBorder,
            left: noBorder,
            right: noBorder,
            insideHorizontal: noBorder,
            insideVertical: noBorder,
          },
          rows: [
            new TableRow({
              cantSplit: false,
              children: [
                new TableCell({
                  children: main,
                  width: { size: 6506, type: WidthType.DXA },
                  margins: { top: 0, bottom: 0, left: 0, right: 360 },
                }),
                new TableCell({
                  children: aside,
                  width: { size: 3600, type: WidthType.DXA },
                  margins: { top: 0, bottom: 180, left: 250, right: 250 },
                  shading: { fill: palette.tint },
                }),
              ],
            }),
          ],
        }),
      );
    else children.push(...main, ...aside);
    return new Document({
      creator: "ASAR Team Hub",
      title: cv.name + " — Curriculum Vitae",
      description:
        "Professional profile, team contributions and recorded skills.",
      styles: {
        default: {
          document: {
            run: { font: "Calibri", size: 20, color: palette.ink },
            paragraph: {
              spacing: { after: 100, line: 280 },
              widowControl: true,
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: {
                top: 850,
                right: 900,
                bottom: 850,
                left: 900,
                footer: 430,
              },
            },
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  border: {
                    top: {
                      color: palette.line,
                      size: 4,
                      style: BorderStyle.SINGLE,
                      space: 8,
                    },
                  },
                  alignment: AlignmentType.RIGHT,
                  children: [
                    run(cv.name + "   /   ", {
                      color: palette.muted,
                      size: 16,
                    }),
                    new TextRun({
                      children: [PageNumber.CURRENT],
                      font: "Calibri",
                      size: 16,
                      color: palette.muted,
                    }),
                    run(" / ", { size: 16, color: palette.muted }),
                    new TextRun({
                      children: [PageNumber.TOTAL_PAGES],
                      font: "Calibri",
                      size: 16,
                      color: palette.muted,
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
  }
  function html(cv) {
    const content = sections(cv);
    const render = (section) =>
      `<section class="cv-section"><h2>${escape(section.title)}</h2>${
        section.text ? `<p dir="auto">${escape(section.text)}</p>` : ""
      }${section.items ? `<ul>${section.items.map((item) => `<li dir="auto">${escape(item)}</li>`).join("")}</ul>` : ""}${(
        section.entries || []
      )
        .map(
          (item) =>
            `<article class="cv-entry"><h3 dir="auto">${item.url ? `<a href="${escape(item.url)}">${escape(item.title)}</a>` : escape(item.title)}</h3>${
              item.subtitle
                ? `<p class="cv-entry-meta" dir="auto">${escape(item.subtitle)}</p>`
                : ""
            }${item.body ? `<p dir="auto">${escape(item.body)}</p>` : ""}</article>`,
        )
        .join("")}</section>`;
    const contacts = [
      cv.email
        ? `<a href="mailto:${escape(cv.email)}">${escape(cv.email)}</a>`
        : "",
      cv.phone
        ? `<a href="tel:${escape(cv.phone.replace(/[^+\d]/g, ""))}">${escape(cv.phone)}</a>`
        : "",
    ]
      .filter(Boolean)
      .join('<span aria-hidden="true"> / </span>');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(cv.name)} — Curriculum Vitae</title><style>
@page { size: A4; margin: 15mm; }
* { box-sizing: border-box; }
body { margin: 0; padding: 28px 20px 48px; color: #${palette.ink}; background: #eef0f5; font-family: "Segoe UI", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.cv-toolbar { max-width: 210mm; margin: 0 auto 18px; display: flex; align-items: center; justify-content: space-between; gap: 16px; font-size: 12px; color: #${palette.muted}; }
.cv-toolbar button { border: 0; border-radius: 8px; background: #${palette.accent}; color: white; font: 600 12px "Segoe UI", Arial, sans-serif; padding: 12px 18px; cursor: pointer; }
.cv-toolbar button:focus-visible { outline: 3px solid #b6a6e8; outline-offset: 3px; }
.cv-document { max-width: 210mm; margin: auto; padding: 15mm; background: white; box-shadow: 0 12px 45px #19223818; }
.cv-header { border-bottom: 3px solid #${palette.accent}; padding-bottom: 6mm; margin-bottom: 5mm; }
.cv-kicker { margin: 0 0 5mm; font-size: 8pt; letter-spacing: 1.6px; font-weight: 700; color: #${palette.accent}; }
h1 { margin: 0 0 3mm; font-size: 30pt; line-height: 1.12; font-weight: 750; letter-spacing: -1.1px; overflow-wrap: anywhere; }
.cv-role { margin: 0 0 1.5mm; color: #${palette.accent}; font-size: 12pt; font-weight: 600; }
.cv-department { margin: 0 0 3mm; font-size: 9pt; color: #${palette.muted}; }
.cv-contact { display: flex; flex-wrap: wrap; gap: 3mm; font-size: 9pt; line-height: 1.5; }
a { color: inherit; text-decoration: none; overflow-wrap: anywhere; }
.cv-contact a { color: #${palette.muted}; }
.cv-body { display: grid; grid-template-columns: minmax(0, 1fr) 60mm; gap: 7mm; align-items: start; }
.cv-body.cv-single { grid-template-columns: 1fr; }
.cv-main, .cv-aside { min-width: 0; }
.cv-aside { background: #${palette.tint}; padding: 0 4mm 4mm; border-top: 2px solid #${palette.accent}; }
.cv-section { margin: 0 0 5mm; }
.cv-section:last-child { margin-bottom: 0; }
h2 { font-size: 8.5pt; line-height: 1.5; text-transform: uppercase; letter-spacing: 1.25px; color: #${palette.accent}; margin: 0 0 3mm; padding-top: 2mm; padding-bottom: 2mm; border-bottom: 1px solid #${palette.line}; break-after: avoid; }
p { font-size: 9.5pt; line-height: 1.6; margin: 0 0 2.5mm; white-space: pre-line; overflow-wrap: anywhere; orphans: 3; widows: 3; }
ul { padding-inline-start: 4mm; margin: 0; }
li { font-size: 9.3pt; line-height: 1.55; margin-bottom: 1.8mm; padding-inline-start: 0.5mm; overflow-wrap: anywhere; break-inside: avoid; }
li::marker { color: #${palette.accent}; font-size: 8pt; }
.cv-aside li { font-size: 8.5pt; line-height: 1.55; }
.cv-entry { margin-bottom: 3mm; break-inside: avoid; }
h3 { font-size: 10pt; line-height: 1.45; margin: 0 0 1mm; break-after: avoid; }
.cv-entry-meta { color: #${palette.muted}; font-size: 8.5pt; line-height: 1.5; }
.cv-footer { display: flex; justify-content: space-between; gap: 5mm; border-top: 1px solid #${palette.line}; margin-top: 7mm; padding-top: 3mm; font-size: 8pt; color: #${palette.muted}; }
@media screen and (max-width: 650px) { body { padding: 16px 10px; } .cv-document { padding: 8mm; } .cv-body { grid-template-columns: 1fr; } h1 { font-size: 25pt; } }
@media print { body { padding: 0; background: white; } .cv-toolbar { display: none; } .cv-document { padding: 0; max-width: none; box-shadow: none; } .cv-header { break-inside: avoid; } .cv-section { break-inside: auto; } }
</style></head><body><div class="cv-toolbar"><span>Curriculum vitae</span><button onclick="window.print()">Print / Save as PDF</button></div><main class="cv-document">
<header class="cv-header"><p class="cv-kicker">ASAR TEAM / CURRICULUM VITAE</p><h1 dir="auto">${escape(cv.name)}</h1>${cv.role ? `<p class="cv-role">${escape(cv.role)}</p>` : ""}${cv.department ? `<p class="cv-department" dir="auto">${escape(cv.department)}</p>` : ""}${contacts ? `<div class="cv-contact">${contacts}</div>` : ""}</header>
<div class="cv-body${content.aside.length && content.main.length ? "" : " cv-single"}">${content.main.length ? `<div class="cv-main">${content.main.map(render).join("")}</div>` : ""}${content.aside.length ? `<aside class="cv-aside">${content.aside.map(render).join("")}</aside>` : ""}</div>
<footer class="cv-footer"><span dir="auto">${escape(cv.name)}</span><span>ASAR Team</span></footer></main></body></html>`;
  }
  return { word, html, sections };
})();
if (typeof module !== "undefined" && module.exports) module.exports = HubCV;
