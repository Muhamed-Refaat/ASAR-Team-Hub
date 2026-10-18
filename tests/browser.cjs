/* Runs real local and production adapters, responsive layouts, admin/member flows and CV exports. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { fileURLToPath, pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "..");
const out = path.join(root, "test-results");
fs.mkdirSync(out, { recursive: true });
const mime = {
  ".html": "text/html",
  ".csv": "text/csv",
  ".js": "text/javascript",
  ".css": "text/css",
};
const server = http.createServer((req, res) => {
  const file = path.resolve(
    root,
    "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
  );
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(file, (err, data) => {
    res.writeHead(err ? 404 : 200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
    });
    res.end(err ? "Not found" : data);
  });
});
const failures = [];
const checks = [];
async function check(label, fn) {
  if (
    process.env.HUB_BROWSER_CHECK &&
    !new RegExp(process.env.HUB_BROWSER_CHECK).test(label)
  )
    return;
  try {
    await fn();
    checks.push(label);
    console.log("PASS " + label);
  } catch (e) {
    failures.push({ label, message: e.message });
    console.error("FAIL " + label + ": " + e.message);
  }
}
async function nav(page, label) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: label, exact: true })
    .click();
}
const evidenceBytes = Buffer.from("%PDF-1.4\nASAR test certificate\n%%EOF");
async function submitReview(page, type) {
  const dialog = page.getByRole("dialog");
  if (type === "Learning") {
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "certificate.pdf",
      mimeType: "application/pdf",
      buffer: evidenceBytes,
    });
    await dialog.getByText("Ready: certificate.pdf", { exact: true }).waitFor();
  }
  await dialog
    .getByRole("button", { name: "Submit for review", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
}
async function approveReview(page, title, name) {
  await page
    .getByRole("button", { name: `Review ${title} for ${name}`, exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Approve completion", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}
async function layout(page) {
  const measure = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(
    measure.scroll <= measure.width + 1,
    `Document overflow: ${measure.scroll} > ${measure.width}`,
  );
  assert.equal(
    await page.getByText("The page could not render", { exact: true }).count(),
    0,
  );
}
function contrastAudit() {
  const parse = (value) => {
    const nums = value.match(/[\d.]+/g);
    return nums && nums.length >= 3 ? nums.slice(0, 4).map(Number) : null;
  };
  const blend = (top, bottom) => {
    const a = top[3] ?? 1;
    return top.slice(0, 3).map((v, i) => v * a + bottom[i] * (1 - a));
  };
  const luminance = (c) =>
    c
      .map((v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      })
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const results = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent.trim();
    const el = walker.currentNode.parentElement;
    if (!text || !el || el.closest("script,style,noscript,.apexcharts-tooltip"))
      continue;
    const range = document.createRange();
    range.selectNodeContents(walker.currentNode);
    const r = range.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (
      r.width === 0 ||
      r.height === 0 ||
      !el.checkVisibility({
        visibilityProperty: true,
        opacityProperty: true,
      }) ||
      s.visibility === "hidden" ||
      s.display === "none" ||
      el.closest("button:disabled")
    )
      continue;
    let bg = [255, 255, 255];
    const chain = [];
    for (let a = el; a; a = a.parentElement) chain.push(a);
    chain.reverse().forEach((a) => {
      const color = parse(getComputedStyle(a).backgroundColor);
      if (color) bg = blend(color, bg);
    });
    const fg = parse(el.tagName === "text" ? s.fill : s.color);
    if (!fg) continue;
    const f = blend(fg, bg);
    const l1 = luminance(f),
      l2 = luminance(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const min =
      parseFloat(s.fontSize) >= 24 ||
      (parseFloat(s.fontSize) >= 18.66 && Number(s.fontWeight) >= 700)
        ? 3
        : 4.5;
    if (ratio < min - 0.01)
      results.push({
        text: text.slice(0, 70),
        ratio: +ratio.toFixed(2),
        min,
        color: s.color,
        bg,
      });
  }
  return results;
}
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  context.setDefaultTimeout(15000);
  context.setDefaultNavigationTimeout(45000);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(url + "/local_test_dashboard.html", {
    waitUntil: "domcontentloaded",
  });
  await page
    .getByRole("heading", { name: "Welcome, Abdallah" })
    .waitFor({ timeout: 60000 });
  await check(
    "fresh workbook local data, initial admin and one Team Leader",
    async () => {
      const data = await page.evaluate(() => LocalHub.load());
      assert.equal(data.team.length, 26);
      assert.equal(data.activity.length, 35);
      assert.equal(data.skills.length, 11);
      assert.equal(data.team.filter((m) => m.Role === "Team Leader").length, 1);
      assert.equal(
        data.team.find((m) => m.Role === "Team Leader").Name,
        "Abdallah Refaat Allam",
      );
      assert.equal(data.activeUserSession.isAdmin, true);
      assert.deepEqual(
        await page
          .getByRole("navigation")
          .getByRole("button")
          .allTextContents(),
        [
          "Overview",
          "Tasks",
          "Meetings",
          "Learning",
          "Skills",
          "Team Intelligence",
          "Completion logs",
          "Activity",
        ],
      );
      const current = await page.evaluate(() =>
        LocalHub.load().then((db) =>
          HubModel.hierarchyErrors(db, HubModel.teamStructure(db)),
        ),
      );
      assert.deepEqual(current, []);
      await page.screenshot({
        path: path.join(out, "overview-desktop.png"),
        fullPage: true,
      });
    },
  );
  await check(
    "dashboard landing reveals real progress visuals while scrolling and supports reduced motion",
    async () => {
      await nav(page, "Overview");
      const snapshot = await page.evaluate(() => LocalHub.load());
      const model = require("../web/model.js");
      const person = model.actor(snapshot, snapshot.activeUserSession.email);
      const p = model.progress(snapshot, person);
      await page
        .getByRole("img", {
          name: `Your approved progress: ${p.completed} of ${p.total} eligible events, ${p.percent ?? 0} percent`,
          exact: true,
        })
        .waitFor();
      await page
        .getByRole("button", {
          name: "Scroll to see your momentum",
          exact: true,
        })
        .click();
      await page.waitForFunction(() => window.scrollY > 150);
      await page
        .getByRole("region", {
          name: "Learning and attendance journey",
          exact: true,
        })
        .scrollIntoViewIfNeeded();
      await page.waitForFunction(() =>
        document
          .querySelector(".landing-insights")
          .classList.contains("is-revealed"),
      );
      const stages = model
        .events(snapshot)
        .filter(
          (e) =>
            !e.archived &&
            model.eventState(e, person, new Date().toISOString().slice(0, 10))
              .eligible &&
            model.REVIEW_TYPES.includes(e.type),
        );
      assert.equal(
        await page
          .locator(".journey-legend strong")
          .allTextContents()
          .then((xs) => xs.reduce((s, x) => s + Number(x), 0)),
        stages.length,
      );
      assert.equal(await page.locator(".coverage-column").count(), 4);
      await page.emulateMedia({ reducedMotion: "reduce" });
      assert.equal(
        await page
          .locator(".landing-insights")
          .evaluate((el) => getComputedStyle(el).animationName),
        "none",
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(700);
      await page.screenshot({
        path: path.join(out, "overview-desktop.png"),
        fullPage: true,
      });
    },
  );
  await check(
    "all dedicated tabs render at desktop, tablet and mobile in both themes, with no overflow and readable contrast",
    async () => {
      const contrast = [];
      for (const theme of ["light", "dark"]) {
        if (theme === "dark") {
          await page
            .getByRole("button", { name: "Switch to dark theme" })
            .click();
          await page.waitForTimeout(200);
        }
        for (const width of [1440, 768, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          for (const label of [
            "Overview",
            "Tasks",
            "Meetings",
            "Learning",
            "Skills",
            "Completion logs",
            "Activity",
            "Team Intelligence",
          ]) {
            await nav(page, label);
            await layout(page);
            const issues = await page.evaluate(contrastAudit);
            if (issues.length)
              contrast.push({ theme, width, tab: label, issues });
            if (
              width === 390 &&
              ["Overview", "Tasks", "Team Intelligence"].includes(label)
            )
              await page.screenshot({
                path: path.join(
                  out,
                  `${label.replace(/ /g, "-").toLowerCase()}-${theme}-mobile.png`,
                ),
                fullPage: true,
              });
          }
          await page
            .getByRole("button", { name: "Team hierarchy", exact: true })
            .click();
          await layout(page);
          if (width === 1440)
            await page.screenshot({
              path: path.join(out, "hierarchy-" + theme + "-desktop.png"),
              fullPage: true,
            });
        }
      }
      fs.writeFileSync(
        path.join(out, "contrast.json"),
        JSON.stringify(contrast, null, 2),
      );
      assert.equal(contrast.length, 0, JSON.stringify(contrast.slice(0, 2)));
    },
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (await page.getByRole("button", { name: "Switch to light theme" }).count())
    await page.getByRole("button", { name: "Switch to light theme" }).click();
  const scriptingSkill = "High-Level Scripting & Middleware (Python)";
  await check(
    "Skills shows required project skills without scheduled assessment or creation controls",
    async () => {
      await nav(page, "Skills");
      assert.equal(
        await page
          .getByRole("button", { name: "Create skill", exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByRole("heading", { name: "Skill assessments", exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Manage required skills", exact: true })
          .count(),
        1,
      );
      assert.ok(
        await page
          .getByRole("heading", { name: "Technologies & tools", exact: true })
          .count(),
      );
    },
  );
  await check(
    "members complete their required skills and see updated matrix and profile lists",
    async () => {
      const data = await page.evaluate(() => LocalHub.load());
      await page
        .getByLabel("Local preview account")
        .selectOption(data.team[1].Mail);
      const card = page.locator("article").filter({
        has: page.getByRole("heading", { name: scriptingSkill, exact: true }),
      });
      assert.equal(
        await page.getByRole("button", { name: /^Edit / }).count(),
        0,
      );
      await card.getByRole("button", { name: "Complete", exact: true }).click();
      await page
        .getByRole("dialog")
        .getByLabel("Evidence or notes")
        .fill("https://example.com/skill-evidence");
      await page.getByRole("dialog").getByLabel("Skill level").fill("7");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm completion", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.ok((await card.getAttribute("class")).includes("completed"));
      await nav(page, "Team Intelligence");
      assert.equal(
        await page.getByText("Team event counters", { exact: false }).count(),
        0,
      );
      assert.equal(await page.locator(".member-progress-row").count(), 4);
      const db = await page.evaluate(() => LocalHub.load());
      const M = require("../web/model.js");
      assert.equal(
        M.skillGroups(db, db.team[1])[0].items.find(
          (i) => i.label === scriptingSkill,
        ).score,
        7,
      );
      const skills = page.getByRole("group", {
        name: "Skills profile list",
        exact: true,
      });
      assert.ok((await skills.innerText()).includes(scriptingSkill));
      assert.equal(await skills.locator("strong, .progress, small").count(), 0);
      assert.equal((await skills.innerText()).includes("7/10"), false);
    },
  );
  await check(
    "completion records appear in Completion logs and stay out of Activity",
    async () => {
      await nav(page, "Completion logs");
      assert.ok(
        (await page.getByRole("main").innerText()).includes(
          "https://example.com/skill-evidence",
        ),
      );
      await nav(page, "Activity");
      assert.equal(
        await page
          .getByRole("cell", { name: "completeEvent", exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByText("https://example.com/skill-evidence", { exact: true })
          .count(),
        0,
      );
    },
  );
  await check(
    "subteam settings support co-leaders and multi-team support, with a seamless leader view and profile links",
    async () => {
      const db = await page.evaluate(() => LocalHub.load());
      await page
        .getByLabel("Local preview account")
        .selectOption(db.team[0].Mail);
      await nav(page, "Team Intelligence");
      await page
        .getByRole("button", { name: "Team hierarchy", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Edit distribution", exact: true })
        .click();
      const target = db.team[1],
        colleague = db.team[2];
      const initial = require("../web/model.js").teamStructure(db);
      await page
        .getByLabel("Subteam to configure", { exact: true })
        .selectOption(initial.teams[0].id);
      await page
        .getByLabel("Subteam role for " + target.Name, { exact: true })
        .selectOption("Leader");
      await page
        .getByLabel("Subteam to configure", { exact: true })
        .selectOption(initial.teams[1].id);
      await page
        .getByLabel("Subteam role for " + target.Name, { exact: true })
        .selectOption("Support");
      await page
        .getByRole("button", { name: "Add subteam", exact: true })
        .click();
      await page
        .getByRole("region", { name: "Subteam settings", exact: true })
        .locator('input[aria-label^="Subteam name"]')
        .last()
        .fill("Integration Lab");
      await page
        .getByLabel("Purpose for Integration Lab", { exact: true })
        .fill("Cross-team testing and integration");
      assert.equal(
        await page
          .getByRole("button", { name: "Save distribution", exact: true })
          .isDisabled(),
        true,
      );
      await page
        .getByLabel("Subteam role for " + colleague.Name, { exact: true })
        .selectOption("Leader");
      await page
        .getByLabel("Subteam role for " + target.Name, { exact: true })
        .selectOption("Support");
      await page
        .getByRole("button", { name: "Save distribution", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Edit distribution", exact: true })
        .waitFor({ state: "hidden" });
      const updated = await page.evaluate(() => LocalHub.load());
      const structure = require("../web/model.js").teamStructure(updated);
      assert.equal(structure.teams.length, 4);
      assert.equal(
        structure.memberships.filter((r) => r.memberId === String(target.ID))
          .length,
        3,
      );
      assert.equal(
        structure.memberships.filter(
          (r) => r.teamId === initial.teams[0].id && r.role === "Leader",
        ).length,
        2,
      );
      assert.equal(
        updated.team.filter((m) => m.Role === "Team Leader").length,
        1,
      );
      for (const theme of ["light", "dark"]) {
        if (
          await page
            .getByRole("button", {
              name: `Switch to ${theme} theme`,
              exact: true,
            })
            .count()
        )
          await page
            .getByRole("button", {
              name: `Switch to ${theme} theme`,
              exact: true,
            })
            .click();
        await page.waitForTimeout(250);
        for (const width of [1440, 768, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          await layout(page);
          assert.deepEqual(await page.evaluate(contrastAudit), []);
          await page.screenshot({
            path: path.join(out, `hierarchy-shared-${theme}-${width}.png`),
            fullPage: true,
          });
        }
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page
        .getByRole("button", { name: "Switch to light theme", exact: true })
        .click();
      await page.getByLabel("Local preview account").selectOption(target.Mail);
      assert.equal(
        await page
          .getByRole("button", { name: "Edit distribution", exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page.getByLabel("Subteam view", { exact: true }).inputValue(),
        "mine",
      );
      assert.equal(
        await page
          .getByRole("region", { name: "My subteam roles", exact: true })
          .getByText("Support", { exact: true })
          .count(),
        2,
      );
      await page
        .getByRole("region", { name: "Integration Lab", exact: true })
        .getByRole("button", {
          name: "View profile for " + colleague.Name,
          exact: true,
        })
        .click();
      await page
        .locator(".intelligence-directory-member.selected")
        .filter({ hasText: colleague.Name })
        .waitFor();
      await page
        .getByLabel("Local preview account")
        .selectOption(db.team[0].Mail);
    },
  );
  await check(
    "every dedicated event form saves its own fields, edits deadlines, and archives/restores without losing completion",
    async () => {
      const cases = [
        ["Tasks", "Create task", "Task"],
        ["Meetings", "Create meeting", "Meet"],
        ["Learning", "Create learning", "Learning"],
      ];
      for (const [tab, button, type] of cases) {
        console.log("  FORM " + type + ": create");
        await nav(page, tab);
        await page.getByRole("button", { name: button, exact: true }).click();
        const dialog = page.getByRole("dialog");
        const title = "Browser form " + type;
        await dialog.getByLabel("Title", { exact: true }).fill(title);
        await dialog
          .getByLabel("Description", { exact: true })
          .fill("Verified " + type + " description");
        if (type !== "Task")
          await dialog.locator(".event-optional-settings > summary").click();
        const deadline =
          type === "Task"
            ? "Due date"
            : type === "Meet"
              ? "Attendance deadline"
              : "Completion deadline";
        await dialog.getByLabel(deadline, { exact: true }).fill("2099-10-20");
        if (type === "Task") {
          assert.equal(
            await dialog.getByLabel("Definition of done").count(),
            0,
          );
          assert.equal(
            await dialog.getByLabel("Recorded task score").count(),
            0,
          );
        }
        if (type === "Meet") {
          await dialog
            .getByLabel("Meeting date", { exact: true })
            .fill("2099-10-19");
          await dialog.getByLabel("Attendance logging open").check();
          await dialog
            .getByLabel("Meeting link or location")
            .fill("https://example.com/meeting");
        }
        if (type === "Learning") {
          await dialog.getByLabel("Track name").fill("Browser learning track");
          await dialog
            .getByLabel("Course URL")
            .fill("https://example.com/course");
        }
        await dialog
          .getByRole("button", {
            name: type === "Task" ? "Save task" : "Save event",
            exact: true,
          })
          .click();
        await dialog.waitFor({ state: "hidden" });
        console.log("  FORM " + type + ": complete");
        let card = page.locator("article").filter({
          has: page.getByRole("heading", { name: title, exact: true }),
        });
        if (type === "Task") {
          assert.equal(
            await card
              .getByRole("button", { name: "Complete", exact: true })
              .count(),
            0,
          );
          await card
            .getByLabel("Move " + title, { exact: true })
            .selectOption("Completed");
          assert.equal(await page.getByRole("dialog").count(), 0);
        } else {
          await card
            .getByRole("button", {
              name: type === "Meet" ? "Log attendance" : "Request completion",
              exact: true,
            })
            .click();
          await submitReview(page, type);
          assert.equal(
            await card.getByText("Pending review", { exact: true }).count(),
            1,
          );
          const snapshot = await page.evaluate(() => LocalHub.load());
          await approveReview(page, title, snapshot.team[0].Name);
        }
        assert.ok((await card.getAttribute("class")).includes("completed"));
        console.log("  FORM " + type + ": edit");
        await card
          .getByRole("button", { name: "Edit " + title, exact: true })
          .click();
        const editDialog = page.getByRole("dialog");
        if (type !== "Task")
          await editDialog
            .locator(".event-optional-settings > summary")
            .click();
        await editDialog
          .getByLabel(deadline, { exact: true })
          .fill("2099-11-20");
        await page
          .getByRole("dialog")
          .getByRole("button", {
            name: type === "Task" ? "Save task" : "Save event",
            exact: true,
          })
          .click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        if (type !== "Learning") {
          console.log("  FORM " + type + ": archive and restore");
          await card
            .getByRole("button", { name: "Archive " + title, exact: true })
            .click();
          await card.waitFor({ state: "hidden" });
          await page
            .getByLabel("Event filter", { exact: true })
            .selectOption("archived");
          card = page.locator("article").filter({
            has: page.getByRole("heading", { name: title, exact: true }),
          });
          await card
            .getByRole("button", { name: "Restore " + title, exact: true })
            .click();
          await page
            .getByLabel("Event filter", { exact: true })
            .selectOption("all");
          assert.ok((await card.getAttribute("class")).includes("completed"));
        } else {
          assert.equal(
            await card
              .getByRole("button", { name: "Archive " + title, exact: true })
              .count(),
            0,
          );
          assert.equal(
            await page
              .getByLabel("Event filter", { exact: true })
              .locator('option[value="archived"]')
              .count(),
            0,
          );
        }
        const data = await page.evaluate(() => LocalHub.load());
        const M = require("../web/model.js");
        const e = M.events(data).find((e) => e.title === title);
        assert.equal(e.due, "2099-11-20");
        if (type === "Task") assert.equal(M.number(e.row.Score), null);
        console.log("  FORM " + type + ": verified");
      }
    },
  );
  await check(
    "required soft skill completion updates the correct matrix category while preserving historical records",
    async () => {
      await nav(page, "Skills");
      const db = await page.evaluate(() => LocalHub.load());
      const M = require("../web/model.js");
      await page
        .getByLabel("Skills for member")
        .selectOption(String(db.team[0].ID));
      const label = M.requiredSkills(db, db.team[0]).find(
        (r) => r.category === "Soft Skill",
      ).label;
      const card = page.locator("article").filter({
        has: page.getByRole("heading", { name: label, exact: true }),
      });
      await card.getByRole("button", { name: "Complete", exact: true }).click();
      await page.getByRole("dialog").getByLabel("Skill level").fill("8");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm completion", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await nav(page, "Team Intelligence");
      const soft = page.getByRole("region", {
        name: "Soft Skill ratings",
        exact: true,
      });
      assert.ok(
        (await soft.locator(".member-strengths").innerText()).includes(label),
      );
      assert.ok(
        (await soft.locator(".member-strengths").innerText()).includes("8/10"),
      );
      const after = await page.evaluate(() => LocalHub.load());
      const historical = M.events(after).find(
        (e) => e.type === "Skill" && e.title === "Python",
      );
      assert.equal(historical.totalEligible, 23);
      assert.equal(historical.totalCompleted, 8);
    },
  );
  await check(
    "member directory shows one member's four progress bars before the radar matrix",
    async () => {
      const db = await page.evaluate(() => LocalHub.load());
      await nav(page, "Team Intelligence");
      const directory = page.getByRole("region", {
        name: "Team directory",
        exact: true,
      });
      assert.equal(await directory.getByRole("button").count(), 26);
      assert.equal(
        await page
          .getByRole("region", {
            name: "Event completion counters",
            exact: true,
          })
          .count(),
        0,
      );
      await page.getByLabel("Search team members").fill(db.team[1].Name);
      assert.equal(await directory.getByRole("button").count(), 1);
      await directory
        .getByRole("button", { name: "View " + db.team[1].Name, exact: true })
        .click();
      const selected = page.locator('[data-testid="selected-member-profile"]');
      assert.equal(
        await selected
          .getByRole("heading", { name: db.team[1].Name, exact: true })
          .count(),
        1,
      );
      const M = require("../web/model.js");
      const progress = M.progress(db, db.team[1]);
      for (const name of [
        "Technology",
        "Skills",
        "Knowledge",
        "Abilities",
        "Personality",
      ]) {
        await selected
          .getByRole("group", { name: name + " profile list", exact: true })
          .waitFor({ state: "visible" });
      }
      const technology = selected.getByRole("group", {
        name: "Technology profile list",
        exact: true,
      });
      const recordedTechnology = M.skillGroups(db, db.team[1]).find(
        (g) => g.name === "Technology",
      ).items;
      assert.equal(
        await technology.getByRole("listitem").count(),
        recordedTechnology.length,
      );
      assert.deepEqual(
        await technology.getByRole("listitem").allTextContents(),
        recordedTechnology.map((item) => item.label),
      );
      const overview = await selected
        .locator(".member-profile-summary")
        .boundingBox();
      const lists = await selected
        .getByRole("region", { name: "Member profile lists", exact: true })
        .boundingBox();
      assert.ok(lists.y >= overview.y + overview.height - 1);
      assert.equal(
        await page.getByText("Team event counters", { exact: false }).count(),
        0,
      );
      for (const type of M.TYPES) {
        const text = await selected
          .locator(`.member-progress-row[data-event-type="${type}"]`)
          .innerText();
        assert.ok(
          text.includes(
            `${progress.byType[type].completed} / ${progress.byType[type].total}`,
          ),
        );
      }
      assert.equal(
        await page.getByRole("button", { name: "Exams", exact: true }).count(),
        0,
      );
      assert.equal(
        await page.locator(".member-radar-grid > section").count(),
        4,
      );
      assert.ok(
        (await page.locator('[data-testid="progress-visuals"]').boundingBox())
          .y <
          (await page.locator('[data-testid="skill-matrix"]').boundingBox()).y,
      );
      await page.getByLabel("Search team members").fill("");
      await page.screenshot({
        path: path.join(out, "team-intelligence-desktop.png"),
        fullPage: true,
      });
    },
  );
  await check(
    "admin drags tasks between Kanban columns and members have no board management controls",
    async () => {
      await nav(page, "Tasks");
      const card = page.locator("article").filter({
        has: page.getByRole("heading", {
          name: "Browser form Task",
          exact: true,
        }),
      });
      assert.equal(await card.getAttribute("draggable"), "true");
      await card.dragTo(page.locator('[data-task-status="InProgress"]'));
      await page.waitForFunction(
        async () =>
          (await LocalHub.load()).tasks.find(
            (t) => t["Task Title"] === "Browser form Task",
          ).Status === "InProgress",
      );
      await card
        .getByLabel("Move Browser form Task", { exact: true })
        .selectOption("Blocked");
      await page.waitForFunction(
        async () =>
          (await LocalHub.load()).tasks.find(
            (t) => t["Task Title"] === "Browser form Task",
          ).Status === "Blocked",
      );
      const db = await page.evaluate(() => LocalHub.load());
      await page
        .getByLabel("Local preview account")
        .selectOption(db.team[1].Mail);
      assert.equal(await card.getAttribute("draggable"), "false");
      assert.equal(
        await card
          .getByLabel("Move Browser form Task", { exact: true })
          .count(),
        0,
      );
      await page
        .getByLabel("Local preview account")
        .selectOption(db.team[0].Mail);
    },
  );
  await check(
    "upcoming meetings stand out and admin controls enforce attendance logging for members",
    async () => {
      await nav(page, "Meetings");
      const card = page.locator("article").filter({
        has: page.getByRole("heading", {
          name: "Browser form Meet",
          exact: true,
        }),
      });
      assert.ok(
        (await card.getAttribute("class")).includes("upcoming-meeting"),
      );
      assert.equal(
        await card.getByText("Upcoming meeting", { exact: true }).count(),
        1,
      );
      await card
        .getByRole("button", { name: "Edit Browser form Meet", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByLabel("Attendance logging open")
        .uncheck();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Save event", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      const db = await page.evaluate(() => LocalHub.load());
      await page
        .getByLabel("Local preview account")
        .selectOption(db.team[2].Mail);
      assert.equal(
        await card
          .getByRole("button", { name: "Log attendance", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(
        await card
          .getByText("Attendance logging closed", { exact: true })
          .count(),
        1,
      );
      const denied = await page.evaluate(async () => {
        const db = await LocalHub.load();
        const e = HubModel.events(db).find(
          (e) => e.title === "Browser form Meet",
        );
        try {
          await LocalHub.command("completeEvent", { key: e.key });
        } catch (error) {
          return error.message;
        }
        return "allowed";
      });
      assert.ok(denied.includes("Attendance logging is disabled"));
      await page
        .getByLabel("Local preview account")
        .selectOption(db.team[0].Mail);
      await card
        .getByRole("button", { name: "Edit Browser form Meet", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByLabel("Attendance logging open")
        .check();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Save event", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page
        .getByLabel("Local preview account")
        .selectOption(db.team[2].Mail);
      await card
        .getByRole("button", { name: "Log attendance", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Submit for review", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(
        await card.getByText("Pending review", { exact: true }).count(),
        1,
      );
      await page
        .getByLabel("Local preview account")
        .selectOption(db.team[0].Mail);
      await approveReview(page, "Browser form Meet", db.team[2].Name);
      await page.screenshot({
        path: path.join(out, "upcoming-meetings-desktop.png"),
        fullPage: true,
      });
    },
  );
  await check(
    "course and attendance submissions support evidence, admin feedback, approval, withdrawal and undo",
    async () => {
      const M = require("../web/model.js");
      const db = await page.evaluate(() => LocalHub.load());
      const member = db.team[1],
        admin = db.team[0];
      for (const [type, tab] of [
        ["Learning", "Learning"],
        ["Meet", "Meetings"],
      ]) {
        const title = "Browser form " + type;
        await page
          .getByLabel("Local preview account")
          .selectOption(member.Mail);
        await nav(page, tab);
        assert.equal(
          await page
            .getByRole("region", { name: "Admin review queue" })
            .count(),
          0,
        );
        const card = page.locator("article").filter({
          has: page.getByRole("heading", { name: title, exact: true }),
        });
        const before = await page.evaluate(() => LocalHub.load());
        const baseline = M.progress(before, member).completed;
        const open = async () =>
          card
            .getByRole("button", {
              name:
                type === "Meet"
                  ? "Log attendance"
                  : type === "Learning"
                    ? "Request completion"
                    : "Complete",
              exact: true,
            })
            .click();
        await open();
        if (type === "Learning") {
          assert.equal(
            await page
              .getByRole("dialog")
              .getByRole("button", { name: "Submit for review", exact: true })
              .isDisabled(),
            true,
          );
          await page
            .getByRole("dialog")
            .locator('input[type="file"]')
            .setInputFiles({
              name: "fake.pdf",
              mimeType: "application/pdf",
              buffer: Buffer.from("Not a PDF"),
            });
          await page
            .getByText(
              "The file contents do not match the selected PDF or image format.",
              { exact: true },
            )
            .waitFor();
        }
        await submitReview(page, type);
        assert.equal(
          await card.getByText("Pending review", { exact: true }).count(),
          1,
        );
        const pending = await page.evaluate(() => LocalHub.load());
        assert.equal(M.progress(pending, member).completed, baseline);
        if (type === "Learning") {
          const downloadPending = page.waitForEvent("download");
          await card
            .getByRole("link", { name: "certificate.pdf", exact: true })
            .click();
          const download = await downloadPending;
          const artifact = path.join(out, "course-evidence.pdf");
          await download.saveAs(artifact);
          assert.deepEqual(fs.readFileSync(artifact), evidenceBytes);
          await page.screenshot({
            path: path.join(out, "course-pending-desktop.png"),
            fullPage: true,
          });
          for (const theme of ["light", "dark"]) {
            if (
              await page
                .getByRole("button", {
                  name: `Switch to ${theme} theme`,
                  exact: true,
                })
                .count()
            )
              await page
                .getByRole("button", {
                  name: `Switch to ${theme} theme`,
                  exact: true,
                })
                .click();
            await page.setViewportSize({ width: 390, height: 844 });
            await page.waitForTimeout(300); // Let theme color transitions settle before measuring contrast.
            await layout(page);
            assert.deepEqual(await page.evaluate(contrastAudit), []);
            if (theme === "dark")
              await page.screenshot({
                path: path.join(out, "course-pending-mobile.png"),
                fullPage: true,
              });
          }
          await page.setViewportSize({ width: 1440, height: 1000 });
          await page
            .getByRole("button", { name: "Switch to light theme", exact: true })
            .click();
        }
        const first = pending.completions.at(-1)["Submission ID"];
        await card
          .getByRole("button", { name: "Withdraw submission", exact: true })
          .click();
        await card
          .locator('.completion-steps [aria-current="step"]')
          .filter({ hasText: "Uncompleted" })
          .waitFor();
        await open();
        await submitReview(page, type);
        await page.getByLabel("Local preview account").selectOption(admin.Mail);
        await page
          .getByRole("button", {
            name: `Review ${title} for ${member.Name}`,
            exact: true,
          })
          .click();
        const review = page.getByRole("dialog");
        if (type === "Learning") {
          assert.equal(
            await review
              .getByRole("link", { name: "certificate.pdf", exact: true })
              .count(),
            1,
          );
          await page.screenshot({
            path: path.join(out, "admin-evidence-review.png"),
            fullPage: true,
          });
        }
        await review
          .getByRole("button", { name: "Return for changes", exact: true })
          .click();
        await review
          .getByText("Add feedback so the member knows what to update.", {
            exact: true,
          })
          .waitFor();
        await review
          .getByLabel("Reviewer feedback", { exact: true })
          .fill("Please provide a clearer record");
        await review
          .getByRole("button", { name: "Return for changes", exact: true })
          .click();
        await review.waitFor({ state: "hidden" });
        await page
          .getByLabel("Local preview account")
          .selectOption(member.Mail);
        await card
          .getByText("Please provide a clearer record", { exact: false })
          .waitFor();
        await open();
        await submitReview(page, type);
        await page.getByLabel("Local preview account").selectOption(admin.Mail);
        const stale = await page.evaluate(async (id) => {
          try {
            await LocalHub.command("reviewSubmission", {
              submissionId: id,
              decision: "Completed",
            });
            return "allowed";
          } catch (e) {
            return e.message;
          }
        }, first);
        assert.ok(stale.includes("no longer pending"));
        await approveReview(page, title, member.Name);
        await page
          .getByLabel("Local preview account")
          .selectOption(member.Mail);
        await card.getByText("Completed by you", { exact: true }).waitFor();
        const approved = await page.evaluate(() => LocalHub.load());
        assert.equal(M.progress(approved, member).completed, baseline + 1);
        assert.equal(
          approved.completions.at(-1)["Reviewer Email"],
          admin.Mail.toLowerCase(),
        );
        await card
          .getByRole("button", { name: "Undo completion", exact: true })
          .click();
        const undone = await page.evaluate(() => LocalHub.load());
        assert.equal(M.progress(undone, member).completed, baseline);
        assert.equal(undone.completions.at(-1).Status, "Uncompleted");
        assert.equal(
          undone.completions.at(-1)["Reviewer Email"],
          admin.Mail.toLowerCase(),
        );
        await open();
        await submitReview(page, type);
        await page.getByLabel("Local preview account").selectOption(admin.Mail);
        await approveReview(page, title, member.Name);
      }
      await nav(page, "Completion logs");
      assert.ok(
        (await page.getByRole("main").innerText()).includes("Status / review"),
      );
      assert.ok(
        (await page.getByRole("main").innerText()).includes("Reviewed by"),
      );
      await nav(page, "Activity");
      assert.ok(
        (await page.getByRole("main").innerText()).includes("revertCompletion"),
      );
      assert.ok(
        (await page.getByRole("main").innerText()).includes("reviewSubmission"),
      );
    },
  );
  await check(
    "required project skills are managed per member and completion updates that member's skill profile",
    async () => {
      await nav(page, "Skills");
      const db = await page.evaluate(() => LocalHub.load());
      const label = "Embedded Systems & Firmware (C/C++)";
      await page
        .getByLabel("Skills for member")
        .selectOption(String(db.team[1].ID));
      const original = await page
        .locator("article")
        .filter({
          has: page.getByRole("heading", { name: label, exact: true }),
        })
        .count();
      assert.equal(original, 1);
      await page
        .getByRole("button", { name: "Manage required skills", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("checkbox", { name: label, exact: true })
        .uncheck();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Save required skills", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(
        await page
          .locator("article")
          .filter({
            has: page.getByRole("heading", { name: label, exact: true }),
          })
          .count(),
        0,
      );
      await page
        .getByRole("button", { name: "Manage required skills", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("checkbox", { name: label, exact: true })
        .check();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Save required skills", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page
        .getByLabel("Local preview account")
        .selectOption(db.team[1].Mail);
      assert.equal(
        await page
          .getByRole("button", { name: "Manage required skills", exact: true })
          .count(),
        0,
      );
      const card = page.locator("article").filter({
        has: page.getByRole("heading", { name: label, exact: true }),
      });
      await card.getByRole("button", { name: "Complete", exact: true }).click();
      await page.getByRole("dialog").getByLabel("Skill level").fill("4");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm completion", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(
        await card.getByText("Completed by you", { exact: true }).count(),
        1,
      );
      const updated = await page.evaluate(() => LocalHub.load());
      assert.equal(
        require("../web/model.js")
          .skillGroups(updated, updated.team[1])[0]
          .items.find((i) => i.label === label).score,
        4,
      );
      await page
        .getByLabel("Local preview account")
        .selectOption(db.team[0].Mail);
      await page
        .getByLabel("Skills for member")
        .selectOption(String(db.team[1].ID));
      assert.equal(
        await card.getByText("Completed", { exact: true }).count(),
        1,
      );
      assert.equal(
        await card
          .getByRole("button", { name: "Complete", exact: true })
          .count(),
        0,
      );
    },
  );
  await check(
    "skill cards let members update, reset and re-complete their own results without opening event settings",
    async () => {
      const db = await page.evaluate(() => LocalHub.load());
      const label = "Embedded Systems & Firmware (C/C++)";
      await page
        .getByLabel("Local preview account")
        .selectOption(db.team[1].Mail);
      await nav(page, "Skills");
      const card = page.locator("article").filter({
        has: page.getByRole("heading", { name: label, exact: true }),
      });
      assert.equal(
        await card.getByRole("button", { name: "Edit", exact: true }).count(),
        0,
      );
      await card
        .getByRole("button", { name: "Update result", exact: true })
        .click();
      assert.equal(
        await page.getByRole("dialog").getByLabel("Skill level").inputValue(),
        "4",
      );
      await page.getByRole("dialog").getByLabel("Skill level").fill("6");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Save skill result", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await card.getByText("6/10", { exact: true }).waitFor();
      await card
        .getByRole("button", { name: "Reset skill", exact: true })
        .click();
      await card
        .getByRole("button", { name: "Complete", exact: true })
        .waitFor();
      const reset = await page.evaluate(() => LocalHub.load());
      const M = require("../web/model.js");
      assert.equal(
        M.events(reset)
          .find((e) => e.requirement && e.title === label)
          .completed.has(String(db.team[1].ID)),
        false,
      );
      const baseline = M.parseRatings(db.team[1]["Hard Skill"]).find(
        (s) => s.label === label,
      ).score;
      assert.equal(
        M.skillGroups(reset, reset.team[1])[0].items.find(
          (s) => s.label === label,
        ).score,
        baseline,
      );
      await card.getByRole("button", { name: "Complete", exact: true }).click();
      await page.getByRole("dialog").getByLabel("Skill level").fill("5");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm completion", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await card.getByText("5/10", { exact: true }).waitFor();
      await page.screenshot({
        path: path.join(out, "skill-card-update-reset.png"),
        fullPage: true,
      });
      await page
        .getByLabel("Local preview account")
        .selectOption(db.team[0].Mail);
      await page
        .getByLabel("Skills for member")
        .selectOption(String(db.team[1].ID));
      assert.equal(
        await card
          .getByRole("button", { name: "Reset skill", exact: true })
          .count(),
        0,
      );
      assert.equal(
        await card
          .getByRole("button", { name: "Update result", exact: true })
          .count(),
        0,
      );
    },
  );
  await check(
    "professional Word and PDF CVs preserve recorded skills, omit empty content and paginate on A4",
    async () => {
      await nav(page, "Team Intelligence");
      const downloads = [];
      for (const index of [0, 1, 2]) {
        const db = await page.evaluate(() => LocalHub.load());
        const name = db.team[index].Name;
        const cv = require("../web/model.js").cvData(db, db.team[index]);
        await page
          .getByRole("region", { name: "Team directory", exact: true })
          .getByRole("button", {
            name: "View " + name,
            exact: true,
          })
          .click();
        const pending = page.waitForEvent("download");
        await page
          .getByRole("button", { name: "Word CV", exact: true })
          .click();
        const download = await pending;
        await download.saveAs(path.join(out, `member-${index + 1}.docx`));
        downloads.push({
          file: `member-${index + 1}.docx`,
          name,
          technical: cv.technical,
          tools: cv.tools,
        });
        const popupPending = page.waitForEvent("popup");
        await page
          .getByRole("button", { name: "Print / PDF", exact: true })
          .click();
        const popup = await popupPending;
        await popup.waitForLoadState("domcontentloaded");
        assert.equal(
          await popup.getByRole("heading", { name, exact: true }).count(),
          1,
        );
        const cvText = await popup.locator(".cv-document").innerText();
        for (const label of [...cv.technical, ...cv.tools])
          assert.ok(cvText.includes(label), label);
        for (const absent of [
          "TEAM PARTICIPATION",
          "eligible",
          "Logged assessment",
          "/10",
          "undefined",
          "null",
        ])
          assert.equal(cvText.includes(absent), false, absent);
        if (!cv.education.length)
          assert.equal(
            await popup
              .getByRole("heading", { name: "Education", exact: true })
              .count(),
            0,
          );
        if (!cv.overview)
          assert.equal(
            await popup
              .getByRole("heading", { name: "Profile", exact: true })
              .count(),
            0,
          );
        await popup.setViewportSize({ width: 1000, height: 1150 });
        await popup.emulateMedia({ media: "print" });
        assert.ok(
          await popup
            .locator(".cv-document")
            .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        );
        await popup.pdf({
          path: path.join(out, `member-${index + 1}.pdf`),
          format: "A4",
          printBackground: true,
          preferCSSPageSize: true,
        });
        await popup.screenshot({
          path: path.join(out, `cv-member-${index + 1}.png`),
          fullPage: true,
        });
        fs.writeFileSync(
          path.join(out, `member-${index + 1}.html`),
          await popup.content(),
        );
        await popup.close();
      }
      const longHTML = await page.evaluate(async () => {
        const db = await LocalHub.load();
        const cv = HubModel.cvData(db, db.team[1]);
        cv.technical = Array.from(
          { length: 70 },
          (_, index) =>
            `${cv.technical[index % cv.technical.length]} — Layout check ${String(index + 1).padStart(3, "0")}`,
        );
        return HubCV.html(cv);
      });
      const longCV = await context.newPage();
      await longCV.setContent(longHTML);
      await longCV.emulateMedia({ media: "print" });
      await longCV.pdf({
        path: path.join(out, "cv-layout-long.pdf"),
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
      });
      await longCV.close();
      fs.writeFileSync(
        path.join(out, "cv-exports.json"),
        JSON.stringify(downloads, null, 2),
      );
    },
  );
  await check(
    "production frontend uses authenticated RPC adapter and contains no local member switcher",
    async () => {
      const db = await page.evaluate(() => LocalHub.load());
      db.team[0].Knowledge = JSON.stringify([
        { category: "Recorded knowledge", items: ["Control theory"] },
      ]);
      db.team[0].Abilities = "Recorded troubleshooting ability";
      db.team[0].Personality = JSON.stringify([
        { category: "Recorded working style", items: ["Collaborative"] },
      ]);
      const prod = await context.newPage();
      prod.on("pageerror", (e) => pageErrors.push(e.message));
      await prod.addInitScript((data) => {
        window.google = {
          script: {
            run: {
              withSuccessHandler(handler) {
                this.success = handler;
                return this;
              },
              withFailureHandler(handler) {
                this.failure = handler;
                return this;
              },
              getTeamData() {
                this.success(data);
              },
              executeHubCommand(action, payload) {
                try {
                  const result = HubModel.transition(
                    data,
                    data.activeUserSession.email,
                    action,
                    payload,
                    new Date().toISOString(),
                  );
                  data = result.db;
                  data.activeUserSession = { email: data.team[0].Mail };
                  this.success({ success: true, data });
                } catch (e) {
                  this.failure(e);
                }
              },
            },
          },
        };
      }, db);
      await prod.goto(url + "/Index.html", { waitUntil: "domcontentloaded" });
      await prod
        .getByRole("heading", { name: "Welcome, Abdallah" })
        .waitFor({ timeout: 60000 });
      assert.equal(await prod.getByLabel("Local preview account").count(), 0);
      await nav(prod, "Team Intelligence");
      await prod
        .getByRole("group", { name: "Knowledge profile list", exact: true })
        .getByText("Control theory", { exact: true })
        .waitFor();
      await prod
        .getByRole("group", { name: "Abilities profile list", exact: true })
        .getByText("Recorded troubleshooting ability", { exact: true })
        .waitFor();
      await prod
        .getByRole("group", { name: "Personality profile list", exact: true })
        .getByText("Collaborative", { exact: true })
        .waitFor();
      await nav(prod, "Meetings");
      await layout(prod);
      await prod.close();
    },
  );
  await check(
    "embedded file preview uses the same fresh workbook snapshot",
    async () => {
      const filePage = await context.newPage();
      await filePage.goto(
        pathToFileURL(path.join(root, "local_test_dashboard.html")).href,
        { waitUntil: "domcontentloaded" },
      );
      await filePage
        .getByRole("heading", { name: "Welcome, Abdallah" })
        .waitFor({ timeout: 60000 });
      const db = await filePage.evaluate(() => LocalHub.load());
      assert.equal(db.team.length, 26);
      assert.equal(db.activity.length, 35);
      assert.equal(db.localSource, "Workbook snapshot");
      await filePage.close();
    },
  );
  await check("no browser script errors", async () =>
    assert.deepEqual(pageErrors, []),
  );
  fs.writeFileSync(
    path.join(out, "browser-report.json"),
    JSON.stringify({ checks, failures, pageErrors }, null, 2),
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  if (failures.length) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
