/* Runs real local and production adapters, responsive layouts, admin/member flows and CV exports. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { fileURLToPath, pathToFileURL } = require("node:url");
const { environment: backendEnvironment } = require("./backend-fixture.cjs");
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
async function openSyncErrors(page) {
  const indicator = page.getByRole("button", {
    name: /^Sync status: \d+ pending, [1-9]\d* failed$/,
  });
  await indicator.waitFor();
  if ((await indicator.getAttribute("aria-expanded")) !== "true")
    await indicator.click();
}
async function wireProductionRpc(page, handler) {
  await page.exposeFunction("testActionRpc", handler);
  await page.addInitScript(() => {
    window.google = { script: {} };
    Object.defineProperty(window.google.script, "run", {
      get() {
        let success, failure;
        const rpc = new Proxy(
          {},
          {
            get(_, name) {
              if (name === "withSuccessHandler")
                return (fn) => {
                  success = fn;
                  return rpc;
                };
              if (name === "withFailureHandler")
                return (fn) => {
                  failure = fn;
                  return rpc;
                };
              return (...args) =>
                window
                  .testActionRpc(name, args)
                  .then((data) => success(data))
                  .catch((error) => failure({ message: error.message }));
            },
          },
        );
        return rpc;
      },
    });
  });
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
          "References",
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
    "listed admins keep Admin badges alongside their team roles across the hub",
    async () => {
      const scope = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      const tags = await scope.newPage();
      tags.on("pageerror", (error) => pageErrors.push(error.message));
      try {
        const db = await page.evaluate(() => LocalHub.load());
        await tags.route("**/spreedsheet-copy/Admins.csv", (route) =>
          route.fulfill({
            contentType: "text/csv",
            body: `Email,Enabled\n${db.team[0].Mail},TRUE\n${db.team[1].Mail},TRUE\n${db.team[2].Mail},FALSE\n`,
          }),
        );
        await tags.goto(url + "/local_test_dashboard.html");
        await tags
          .getByRole("heading", { name: "Welcome, Abdallah" })
          .waitFor();
        assert.equal(
          await tags.locator(".landing-role-tags .admin-badge").count(),
          1,
        );
        assert.ok(
          (await tags.locator(".account-tags").innerText()).includes(
            "Team Leader",
          ),
        );
        await nav(tags, "Team Intelligence");
        const directory = tags.getByRole("region", {
          name: "Team directory",
          exact: true,
        });
        for (const index of [0, 1, 2]) {
          const person = directory.getByRole("button", {
            name: "View " + db.team[index].Name,
            exact: true,
          });
          assert.equal(
            await person.locator(".admin-badge").count(),
            index < 2 ? 1 : 0,
          );
        }
        await directory
          .getByRole("button", { name: "View " + db.team[1].Name, exact: true })
          .click();
        assert.equal(
          await tags.locator(".member-profile-header .admin-badge").count(),
          1,
        );
        assert.ok(
          (await tags.locator(".member-profile-identity").innerText()).includes(
            "Team member",
          ),
        );
        await tags
          .getByRole("button", { name: "Team hierarchy", exact: true })
          .click();
        assert.equal(
          await tags.locator(".structure-root .admin-badge").count(),
          1,
        );
        assert.equal(
          await tags
            .locator(".structure-root")
            .getByText("Team Leader", { exact: true })
            .count(),
          1,
        );
        const roster = tags.locator(".subteam-person").filter({
          has: tags.getByRole("button", {
            name: `View profile for ${db.team[1].Name}`,
            exact: true,
          }),
        });
        assert.equal(await roster.locator(".admin-badge").count(), 1);
        assert.equal(
          await roster.getByText("Member", { exact: true }).count(),
          1,
        );
        await tags
          .getByRole("button", { name: "Edit distribution", exact: true })
          .click();
        const memberRow = tags
          .getByRole("row")
          .filter({ has: tags.getByText(db.team[1].Name, { exact: true }) });
        assert.equal(await memberRow.locator(".admin-badge").count(), 1);
        await tags
          .getByRole("button", { name: "Close editor", exact: true })
          .click();
        await tags
          .getByLabel("Local preview account")
          .selectOption(db.team[1].Mail);
        assert.equal(
          await tags.locator(".account-tags .admin-badge").count(),
          1,
        );
        assert.ok(
          (await tags.locator(".account-tags").innerText()).includes(
            "Team member",
          ),
        );
        await tags
          .getByRole("button", { name: "Switch to dark theme", exact: true })
          .click();
        await tags.setViewportSize({ width: 390, height: 844 });
        await layout(tags);
        await tags.waitForTimeout(300);
        assert.deepEqual(await tags.evaluate(contrastAudit), []);
        await tags.evaluate(() => window.scrollTo(0, 0));
        await tags.screenshot({
          path: path.join(out, "hierarchy-admin-tags-mobile.png"),
          fullPage: true,
        });
        await tags
          .getByLabel("Local preview account")
          .selectOption(db.team[2].Mail);
        assert.equal(
          await tags.locator(".account-tags .admin-badge").count(),
          0,
        );
        assert.equal(
          await tags
            .getByRole("button", { name: "Edit distribution", exact: true })
            .count(),
          0,
        );
      } finally {
        await scope.close();
      }
    },
  );
  await check(
    "admins find and approve their own meeting attendance from cards and Completion logs",
    async () => {
      const scope = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      const attendance = await scope.newPage();
      attendance.on("pageerror", (error) => pageErrors.push(error.message));
      try {
        await attendance.goto(url + "/local_test_dashboard.html");
        await attendance
          .getByRole("heading", { name: "Welcome, Abdallah" })
          .waitFor();
        const db = await attendance.evaluate(() => LocalHub.load());
        const M = require("../web/model.js");
        const title = "Admin attendance check";
        await nav(attendance, "Meetings");
        await attendance
          .getByRole("button", { name: "Create meeting", exact: true })
          .click();
        const form = attendance.getByRole("dialog");
        await form.getByLabel("Title", { exact: true }).fill(title);
        await form.getByLabel("Meeting date", { exact: true }).fill(
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "Africa/Cairo",
          }).format(new Date()),
        );
        await form.getByLabel("Attendance logging open").check();
        await form
          .getByRole("button", { name: "Save event", exact: true })
          .click();
        await form.waitFor({ state: "hidden" });
        await attendance.getByLabel("Search Meetings").fill(title);
        const card = attendance.locator("article").filter({
          has: attendance.getByRole("heading", { name: title, exact: true }),
        });
        const submit = async () => {
          await card
            .getByRole("button", { name: "Log attendance", exact: true })
            .click();
          await submitReview(attendance, "Meet");
        };
        const approve = async () => {
          await attendance
            .getByRole("dialog")
            .getByRole("button", { name: "Approve completion", exact: true })
            .click();
          await attendance.getByRole("dialog").waitFor({ state: "hidden" });
        };
        const reviewCard = () =>
          card
            .getByRole("button", {
              name: `Review attendance for ${title}`,
              exact: true,
            })
            .click();
        const baseline = M.progress(
          await attendance.evaluate(() => LocalHub.load()),
          db.team[0],
        ).byType.Meet.completed;
        await submit();
        assert.equal(
          await attendance
            .getByRole("navigation")
            .getByRole("button", { name: "Meetings", exact: true })
            .locator(".nav-review-count")
            .innerText(),
          "1",
        );
        await reviewCard();
        assert.ok(
          (await attendance.getByRole("dialog").innerText()).includes(
            db.team[0].Name,
          ),
        );
        await approve();
        await card.getByText("Completed by you", { exact: true }).waitFor();
        const approved = await attendance.evaluate(() => LocalHub.load());
        assert.equal(
          M.progress(approved, db.team[0]).byType.Meet.completed,
          baseline + 1,
        );
        assert.equal(
          approved.completions.at(-1)["Reviewer Email"],
          db.team[0].Mail.toLowerCase(),
        );
        await card
          .getByRole("button", { name: "Undo completion", exact: true })
          .click();
        await submit();
        await nav(attendance, "Completion logs");
        await attendance.getByLabel("Record filter").selectOption("pending");
        const pendingRow = attendance.getByRole("row").filter({
          has: attendance.getByRole("cell", { name: title, exact: true }),
        });
        assert.equal(await pendingRow.count(), 1);
        await pendingRow
          .getByRole("button", { name: /^Review attendance for / })
          .click();
        await approve();
        assert.equal(await pendingRow.count(), 0);
        await nav(attendance, "Meetings");
        await attendance.getByLabel("Search Meetings").fill(title);
        await card
          .getByRole("button", { name: "Undo completion", exact: true })
          .click();
        await attendance
          .getByLabel("Local preview account")
          .selectOption(db.team[1].Mail);
        await submit();
        assert.equal(
          await card
            .getByRole("button", { name: /^Review attendance for / })
            .count(),
          0,
        );
        assert.equal(
          await attendance
            .getByRole("region", { name: "Admin review queue", exact: true })
            .count(),
          0,
        );
        await attendance
          .getByLabel("Local preview account")
          .selectOption(db.team[0].Mail);
        await attendance.getByLabel("Event filter").selectOption("pending");
        assert.equal(await card.count(), 1);
        await reviewCard();
        assert.ok(
          (await attendance.getByRole("dialog").innerText()).includes(
            db.team[1].Name,
          ),
        );
        await approve();
        assert.equal(await card.count(), 0);
        await attendance.getByLabel("Event filter").selectOption("all");
        await attendance
          .getByLabel("Local preview account")
          .selectOption(db.team[2].Mail);
        await submit();
        await attendance
          .getByLabel("Local preview account")
          .selectOption(db.team[0].Mail);
        await submit();
        await attendance
          .getByRole("button", { name: "Switch to dark theme", exact: true })
          .click();
        await attendance.setViewportSize({ width: 390, height: 844 });
        await reviewCard();
        const choices = attendance.getByRole("dialog");
        assert.equal(
          await choices
            .getByRole("button", {
              name: /^Review Admin attendance check for /,
            })
            .count(),
          2,
        );
        await layout(attendance);
        await attendance.waitForTimeout(300);
        assert.deepEqual(await attendance.evaluate(contrastAudit), []);
        await attendance.screenshot({
          path: path.join(out, "admin-attendance-review-mobile.png"),
          fullPage: false,
        });
        await choices
          .getByRole("button", {
            name: `Review ${title} for ${db.team[0].Name}`,
            exact: true,
          })
          .click();
        await approve();
        await reviewCard();
        await approve();
        assert.equal(
          await attendance
            .getByRole("navigation")
            .getByRole("button", { name: "Meetings", exact: true })
            .locator(".nav-review-count")
            .count(),
          0,
        );
        await card.getByText("Completed by you", { exact: true }).waitFor();
        await attendance.setViewportSize({ width: 1440, height: 1000 });
        await attendance.evaluate(() => window.scrollTo(0, 0));
        await attendance.screenshot({
          path: path.join(out, "admin-attendance-completed.png"),
          fullPage: true,
        });
      } finally {
        await scope.close();
      }
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
    "compact cards keep descriptions expandable, actions beside each other and all controls available across responsive themes",
    async () => {
      const e = backendEnvironment();
      e.context.executeHubCommand("saveSkillRequirements", {
        memberId: "1",
        requirements: [
          {
            label: "Python",
            category: "Hard Skill",
            required: true,
            target: 8,
          },
        ],
      });
      const description = Array.from(
        { length: 8 },
        (_, i) =>
          `Step ${i + 1}: Review the team's recorded progress, share evidence and follow up on any blockers. All details remain available when this description is expanded.`,
      ).join("\n");
      for (const type of ["Task", "Meet", "Learning"])
        e.context.executeHubCommand(
          type === "Task" ? "saveTask" : "saveEvent",
          {
            type,
            title: "Compact " + type,
            description,
            members: ["1"],
            newId: "compact",
            status: "InProgress",
            date: "2099-02-12",
            due: "2099-02-13",
            link: "https://example.com/event",
            loggingEnabled: true,
          },
        );
      e.context.executeHubCommand("addTaskLink", {
        key: "Task:task-compact",
        url: "https://example.com/very/long/evidence/path/that/remains/fully/accessible",
        newId: "compact-proof",
      });
      const scope = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      const ui = await scope.newPage();
      ui.on("pageerror", (error) => pageErrors.push(error.message));
      const measurements = [];
      try {
        await wireProductionRpc(ui, (name, args) =>
          JSON.parse(JSON.stringify(e.context[name](...args))),
        );
        await ui.goto(url + "/Index.html");
        await ui.getByRole("heading", { name: "Welcome, Abdallah" }).waitFor();
        for (const theme of ["light", "dark"]) {
          if (theme === "dark")
            await ui
              .getByRole("button", { name: "Switch to dark theme" })
              .click();
          await ui.waitForTimeout(250);
          for (const width of [1440, 768, 390, 320]) {
            await ui.setViewportSize({ width, height: 1000 });
            for (const [type, tab] of [
              ["Skill", "Skills"],
              ["Task", "Tasks"],
              ["Meet", "Meetings"],
              ["Learning", "Learning"],
            ]) {
              await nav(ui, tab);
              const title = type === "Skill" ? "Python" : "Compact " + type;
              const card = ui
                .locator(".event-card")
                .filter({
                  has: ui.getByRole("heading", { name: title, exact: true }),
                });
              await card.waitFor();
              await layout(ui);
              assert.deepEqual(await ui.evaluate(contrastAudit), []);
              const size = await card.boundingBox();
              measurements.push({
                type,
                theme,
                width,
                height: Math.round(size.height),
              });
              assert.ok(
                await card.evaluate(
                  (node) => node.scrollWidth <= node.clientWidth + 1,
                ),
                "Card contents must fit its width",
              );
              if (type !== "Skill") {
                await card
                  .getByRole("button", { name: "Edit " + title, exact: true })
                  .waitFor();
                await card
                  .getByRole("button", { name: "Delete " + title, exact: true })
                  .waitFor();
                await card
                  .getByRole("button", {
                    name: "Preview Telegram for " + title,
                    exact: true,
                  })
                  .waitFor();
                const more = card.getByRole("button", {
                  name: "Read more about " + title,
                  exact: true,
                });
                await more.waitFor();
                await more.click();
                assert.ok(
                  (await card.boundingBox()).height > size.height + 50,
                  "Expanded descriptions reveal the full content",
                );
                assert.equal(
                  await card.locator(".description").innerText(),
                  description,
                );
                await card
                  .getByRole("button", {
                    name: "Show less about " + title,
                    exact: true,
                  })
                  .click();
              }
              if (type === "Task") {
                const move = await card
                  .getByLabel("Move Compact Task", { exact: true })
                  .boundingBox();
                const add = await card
                  .getByRole("button", {
                    name: "Add evidence link",
                    exact: true,
                  })
                  .boundingBox();
                assert.ok(
                  Math.abs(move.y - add.y) <= 2,
                  `Task status and evidence shortcut share a row: ${theme}/${width}, move=${JSON.stringify(move)}, add=${JSON.stringify(add)}`,
                );
                const evidence = card.getByRole("link", {
                  name: /very\/long\/evidence/,
                });
                const remove = card.getByRole("button", {
                  name: /^Remove evidence link/,
                });
                assert.ok(
                  Math.abs(
                    (await evidence.boundingBox()).y -
                      (await remove.boundingBox()).y,
                  ) < 10,
                  "Evidence removal stays beside the URL",
                );
              }
              if (type === "Learning" && width >= 390) {
                const completion = await card
                  .getByRole("button", {
                    name: "Request completion",
                    exact: true,
                  })
                  .boundingBox();
                const course = await card
                  .getByRole("link", { name: "Open course", exact: true })
                  .boundingBox();
                assert.ok(
                  Math.abs(completion.y - course.y) <= 2,
                  "Course actions share a row where space allows",
                );
              }
              if (type === "Skill")
                await card
                  .getByRole("button", { name: "Complete", exact: true })
                  .waitFor();
              if (width === 1440 || width === 390)
                await card.screenshot({
                  path: path.join(
                    out,
                    `compact-${type.toLowerCase()}-${theme}-${width}.png`,
                  ),
                });
            }
          }
        }
        await nav(ui, "Tasks");
        await ui
          .getByRole("button", { name: "Edit Compact Task", exact: true })
          .click();
        assert.equal(
          await ui
            .getByRole("dialog")
            .getByLabel("Description", { exact: true })
            .inputValue(),
          description,
        );
        await ui
          .getByRole("dialog")
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        e.setEmail("member@example.com");
        await ui.reload();
        await ui.getByRole("heading", { name: "Welcome, Member" }).waitFor();
        await nav(ui, "Tasks");
        assert.equal(
          await ui
            .getByRole("button", { name: "Edit Compact Task", exact: true })
            .count(),
          0,
        );
        assert.equal(
          await ui.getByLabel("Move Compact Task", { exact: true }).count(),
          0,
        );
        fs.writeFileSync(
          path.join(out, "compact-card-layouts.json"),
          JSON.stringify(measurements, null, 2),
        );
      } finally {
        await scope.close();
      }
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
            "References",
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
    "completion records stay in Completion logs and user actions appear in Activity",
    async () => {
      await nav(page, "Completion logs");
      assert.ok(
        (await page.getByRole("main").innerText()).includes(
          "https://example.com/skill-evidence",
        ),
      );
      await nav(page, "Activity");
      await page.getByLabel("Activity category").selectOption("submissions");
      assert.ok((await page.locator(".activity-entry").count()) > 0);
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
    "course and attendance submissions support evidence, admin feedback, rejection, approval, withdrawal and undo",
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
            false,
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
        await page
          .getByRole("button", {
            name: `Review ${title} for ${member.Name}`,
            exact: true,
          })
          .click();
        let rejection = page.getByRole("dialog");
        if (type === "Meet") {
          await page.setViewportSize({ width: 390, height: 844 });
          await layout(page);
          await rejection.screenshot({
            path: path.join(out, "reject-attendance-mobile.png"),
          });
        }
        await rejection
          .getByRole("button", { name: "Reject submission", exact: true })
          .click();
        await rejection.waitFor({ state: "hidden", timeout: 1500 });
        const rejected = await page.evaluate(() => LocalHub.load());
        assert.equal(rejected.completions.at(-1).Status, "Uncompleted");
        assert.equal(
          JSON.parse(rejected.activity.at(-1).Details).decision,
          "Rejected",
        );
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page
          .getByLabel("Local preview account")
          .selectOption(member.Mail);
        await card
          .locator('.completion-steps [aria-current="step"]')
          .filter({ hasText: "Uncompleted" })
          .waitFor();
        assert.equal(M.progress(rejected, member).completed, baseline);
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
        (await page.getByRole("main").innerText()).includes(
          "Undid or withdrew completion",
        ),
      );
      assert.ok(
        (await page.getByRole("main").innerText()).includes(
          "Approved completion",
        ),
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
    "async event creation stays responsive through slow replies, failures, retries and reload",
    async () => {
      const scope = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      const ui = await scope.newPage();
      ui.on("pageerror", (error) => pageErrors.push(error.message));
      try {
        const initial = await page.evaluate(() => LocalHub.load());
        initial.activeUserSession = { email: initial.team[0].Mail };
        await ui.addInitScript((initial) => {
          window.remoteData = JSON.parse(
            sessionStorage.getItem("test_remote_data") ||
              JSON.stringify(initial),
          );
          window.pendingWrites = [];
          window.releaseWrite = (mode = "success") => {
            const request = window.pendingWrites.shift();
            if (!request) throw new Error("No pending request");
            if (mode === "fail") {
              const error = new Error("Test server temporarily unavailable");
              window.remoteData.activity.push(
                HubModel.failureActivity(
                  window.remoteData,
                  window.remoteData.activeUserSession.email,
                  request.action,
                  request.payload,
                  error,
                  new Date().toISOString(),
                ),
              );
              sessionStorage.setItem(
                "test_remote_data",
                JSON.stringify(window.remoteData),
              );
              request.failure(error);
              return;
            }
            const result = HubModel.transition(
              window.remoteData,
              window.remoteData.activeUserSession.email,
              request.action,
              request.payload,
              new Date().toISOString(),
            );
            window.remoteData = result.db;
            sessionStorage.setItem(
              "test_remote_data",
              JSON.stringify(window.remoteData),
            );
            if (mode === "lost")
              request.failure(new Error("Test connection lost after saving"));
            else
              request.success({
                success: true,
                data: JSON.parse(JSON.stringify(window.remoteData)),
                unchanged: result.unchanged,
              });
          };
          window.google = { script: {} };
          Object.defineProperty(window.google.script, "run", {
            get: () => ({
              withSuccessHandler(callback) {
                this.success = callback;
                return this;
              },
              withFailureHandler(callback) {
                this.failure = callback;
                return this;
              },
              getTeamData() {
                this.success(JSON.parse(JSON.stringify(window.remoteData)));
              },
              executeHubCommand(action, payload) {
                window.pendingWrites.push({
                  action,
                  payload,
                  success: this.success,
                  failure: this.failure,
                });
              },
            }),
          });
        }, initial);
        await ui.goto(url + "/Index.html");
        await ui.getByRole("heading", { name: "Welcome, Abdallah" }).waitFor();
        const openCreate = async (type, title) => {
          await nav(
            ui,
            { Task: "Tasks", Meet: "Meetings", Learning: "Learning" }[type],
          );
          await ui
            .getByRole("button", {
              name:
                "Create " + (type === "Meet" ? "meeting" : type.toLowerCase()),
              exact: true,
            })
            .click();
          const dialog = ui.getByRole("dialog");
          await dialog.getByLabel("Title", { exact: true }).fill(title);
          if (type === "Meet")
            await dialog
              .getByLabel("Meeting date", { exact: true })
              .fill("2099-01-01");
          return dialog;
        };
        const submit = async (dialog, type) => {
          await dialog
            .getByRole("button", {
              name: type === "Task" ? "Save task" : "Save event",
              exact: true,
            })
            .click();
          await dialog.waitFor({ state: "hidden", timeout: 1500 });
        };
        let dialog = await openCreate("Task", "Async task A");
        const beforeCount = await ui.locator(".page-footer").innerText();
        await submit(dialog, "Task");
        await ui.waitForFunction(() => window.pendingWrites.length === 1);
        assert.equal(await ui.locator(".page-footer").innerText(), beforeCount);
        assert.equal(
          await ui
            .getByRole("button", { name: "Create task", exact: true })
            .isEnabled(),
          true,
        );
        dialog = await openCreate("Task", "Async task B");
        await dialog
          .getByLabel("Description", { exact: true })
          .fill("Keep this new draft open");
        await ui.evaluate(() => releaseWrite());
        await ui.waitForFunction(() =>
          remoteData.tasks.some((row) => row["Task Title"] === "Async task A"),
        );
        assert.equal(
          await dialog.getByLabel("Title", { exact: true }).inputValue(),
          "Async task B",
        );
        assert.equal(
          await dialog.getByLabel("Description", { exact: true }).inputValue(),
          "Keep this new draft open",
        );
        await submit(dialog, "Task");
        await ui.waitForFunction(() => pendingWrites.length === 1);
        await submit(await openCreate("Meet", "Async meeting C"), "Meet");
        await ui.getByRole("button", { name: "Refresh", exact: true }).click();
        await submit(
          await openCreate("Learning", "Async course D"),
          "Learning",
        );
        assert.equal(await ui.evaluate(() => pendingWrites.length), 1);
        await ui.evaluate(() => releaseWrite());
        await ui.waitForFunction(
          () => pendingWrites[0]?.payload.title === "Async meeting C",
        );
        await ui.evaluate(() => releaseWrite());
        await ui.waitForFunction(
          () => pendingWrites[0]?.payload.title === "Async course D",
        );
        const stableId = await ui.evaluate(
          () => pendingWrites[0].payload.newId,
        );
        await ui.evaluate(() => releaseWrite("fail"));
        await openSyncErrors(ui);
        const courseNotice = ui
          .getByRole("region", { name: "Unsaved changes", exact: true })
          .locator(".sync-error")
          .filter({ hasText: "Async course D" });
        await courseNotice
          .getByRole("button", { name: "Retry save", exact: true })
          .waitFor();
        await nav(ui, "Activity");
        await ui.getByLabel("Activity category").selectOption("errors");
        await ui
          .getByLabel("Activity entries")
          .getByText("Test server temporarily unavailable", { exact: true })
          .waitFor();
        await openSyncErrors(ui);
        await courseNotice
          .getByRole("button", { name: "Retry save", exact: true })
          .click();
        await ui.waitForFunction(() => pendingWrites.length === 1);
        assert.equal(
          await ui.evaluate(() => pendingWrites[0].payload.newId),
          stableId,
        );
        await ui.evaluate(() => releaseWrite("lost"));
        await openSyncErrors(ui);
        await courseNotice
          .getByRole("button", { name: "Retry save", exact: true })
          .waitFor();
        await openSyncErrors(ui);
        await courseNotice
          .getByRole("button", { name: "Retry save", exact: true })
          .click();
        await ui.waitForFunction(() => pendingWrites.length === 1);
        await ui.evaluate(() => releaseWrite());
        await ui.waitForFunction(() => pendingWrites.length === 0);
        assert.equal(
          await ui.evaluate(
            () =>
              remoteData.learning.filter(
                (row) => row["Topic name"] === "Async course D",
              ).length,
          ),
          1,
        );
        await submit(await openCreate("Task", "Restored async draft"), "Task");
        await ui.waitForFunction(() => pendingWrites.length === 1);
        await ui.reload();
        await ui.getByRole("heading", { name: "Welcome, Abdallah" }).waitFor();
        await openSyncErrors(ui);
        const restored = ui
          .getByRole("region", { name: "Unsaved changes", exact: true })
          .locator(".sync-error")
          .filter({ hasText: "Restored async draft" });
        await restored
          .getByRole("button", { name: "Retry save", exact: true })
          .waitFor();
        assert.equal(await ui.evaluate(() => pendingWrites.length), 0);
        await restored
          .getByRole("button", { name: "Retry save", exact: true })
          .click();
        await ui.waitForFunction(() => pendingWrites.length === 1);
        await nav(ui, "Tasks");
        await ui.screenshot({
          path: path.join(out, "async-event-saving.png"),
          fullPage: true,
        });
        await ui.evaluate(() => releaseWrite());
        await ui.waitForFunction(() => pendingWrites.length === 0);
        assert.equal(
          await ui.evaluate(
            () =>
              remoteData.tasks.filter(
                (row) => row["Task Title"] === "Restored async draft",
              ).length,
          ),
          1,
        );
      } finally {
        await scope.close();
      }
    },
  );
  await check(
    "task evidence is inline, course files are optional, and members join meetings without editing settings",
    async () => {
      const scope = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      const ui = await scope.newPage();
      ui.on("pageerror", (error) => pageErrors.push(error.message));
      try {
        await ui.goto(url + "/local_test_dashboard.html");
        await ui.getByRole("heading", { name: "Welcome, Abdallah" }).waitFor();
        const db = await ui.evaluate(() => LocalHub.load());
        await nav(ui, "Tasks");
        await ui
          .getByRole("button", { name: "Create task", exact: true })
          .click();
        let dialog = ui.getByRole("dialog");
        await dialog
          .getByLabel("Title", { exact: true })
          .fill("Inline task proof");
        await dialog
          .getByRole("button", { name: "Clear", exact: true })
          .click();
        for (const index of [0, 1])
          await dialog
            .getByRole("checkbox", { name: db.team[index].Name, exact: true })
            .check();
        await dialog
          .getByRole("button", { name: "Save task", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden" });
        await ui
          .getByLabel("Local preview account")
          .selectOption(db.team[1].Mail);
        const task = ui.locator("article.event-card").filter({
          has: ui.getByRole("heading", {
            name: "Inline task proof",
            exact: true,
          }),
        });
        await task
          .getByRole("button", { name: "Add evidence link", exact: true })
          .click();
        await task
          .getByLabel("Evidence URL", { exact: true })
          .fill("https://example.com/task-issue");
        assert.equal(await task.locator(".task-link-form input").count(), 1);
        assert.equal(
          await task
            .locator(".task-link-form select, .task-link-form textarea")
            .count(),
          0,
        );
        await task
          .getByRole("button", { name: "Save link", exact: true })
          .click();
        await task
          .getByRole("link", {
            name: "https://example.com/task-issue",
            exact: true,
          })
          .waitFor();
        assert.equal(await ui.getByRole("dialog").count(), 0);
        assert.equal(
          await task.getByRole("button", { name: /^Edit / }).count(),
          0,
        );
        await ui.setViewportSize({ width: 390, height: 844 });
        await layout(ui);
        assert.deepEqual(await ui.evaluate(contrastAudit), []);
        await task.screenshot({
          path: path.join(out, "task-inline-evidence-mobile.png"),
        });
        await ui.setViewportSize({ width: 1440, height: 1000 });
        const after = await ui.evaluate(() => LocalHub.load());
        assert.equal(
          after.tasks.find((row) => row["Task Title"] === "Inline task proof")
            .Status,
          "Pending",
        );
        await ui
          .getByLabel("Local preview account")
          .selectOption(db.team[2].Mail);
        assert.equal(
          await task
            .getByRole("button", { name: "Add evidence link", exact: true })
            .count(),
          0,
        );
        await ui
          .getByLabel("Local preview account")
          .selectOption(db.team[0].Mail);
        await nav(ui, "Meetings");
        await ui
          .getByRole("button", { name: "Create meeting", exact: true })
          .click();
        dialog = ui.getByRole("dialog");
        await dialog
          .getByLabel("Title", { exact: true })
          .fill("Joinable online meeting");
        await dialog
          .getByLabel("Meeting date", { exact: true })
          .fill("2099-01-01");
        await dialog
          .getByLabel("Meeting link or location", { exact: true })
          .fill("https://meet.google.com/abc-defg-hij");
        const toggle = dialog.getByRole("switch", {
          name: "Attendance logging open",
          exact: true,
        });
        await toggle.check();
        const box = await toggle.boundingBox();
        assert.ok(box.width >= 40 && box.height >= 24);
        await ui.screenshot({
          path: path.join(out, "meeting-logging-switch.png"),
        });
        await dialog
          .getByRole("button", { name: "Save event", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden" });
        await ui
          .getByLabel("Local preview account")
          .selectOption(db.team[1].Mail);
        const meet = ui.locator("article.event-card").filter({
          has: ui.getByRole("heading", {
            name: "Joinable online meeting",
            exact: true,
          }),
        });
        assert.equal(
          await meet
            .getByRole("link", { name: "Join meeting", exact: true })
            .getAttribute("href"),
          "https://meet.google.com/abc-defg-hij",
        );
        assert.equal(
          await meet.getByRole("button", { name: /^Edit / }).count(),
          0,
        );
        const denied = await ui.evaluate(async () => {
          const data = await LocalHub.load();
          const meeting = HubModel.events(data).find(
            (event) => event.title === "Joinable online meeting",
          );
          try {
            await LocalHub.command("saveEvent", {
              key: meeting.key,
              type: "Meet",
              title: meeting.title,
              date: "2099-01-01",
              members: data.team.map(HubModel.memberKey),
              loggingEnabled: false,
            });
            return "allowed";
          } catch (error) {
            return error.message;
          }
        });
        assert.ok(denied.includes("Admins sheet"));
        await meet
          .getByRole("button", { name: "Log attendance", exact: true })
          .click();
        await submitReview(ui, "Meet");
        await ui
          .getByLabel("Local preview account")
          .selectOption(db.team[0].Mail);
        await nav(ui, "Learning");
        await ui
          .getByRole("button", { name: "Create learning", exact: true })
          .click();
        dialog = ui.getByRole("dialog");
        await dialog
          .getByLabel("Title", { exact: true })
          .fill("Course without evidence file");
        await dialog
          .getByRole("button", { name: "Save event", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden" });
        const course = ui.locator("article.event-card").filter({
          has: ui.getByRole("heading", {
            name: "Course without evidence file",
            exact: true,
          }),
        });
        await course
          .getByRole("button", { name: "Request completion", exact: true })
          .click();
        dialog = ui.getByRole("dialog");
        assert.equal(
          await dialog.locator('input[type="file"]').getAttribute("required"),
          null,
        );
        await dialog
          .getByRole("button", { name: "Submit for review", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden" });
        await course
          .getByRole("button", {
            name: "Review completions for Course without evidence file",
            exact: true,
          })
          .click();
        await ui
          .getByRole("dialog")
          .getByRole("button", { name: "Approve completion", exact: true })
          .click();
        await ui.getByRole("dialog").waitFor({ state: "hidden" });
        await course.getByText("Completed by you", { exact: true }).waitFor();
        const record = await ui.evaluate(() =>
          LocalHub.load().then((data) => data.completions.at(-1)),
        );
        assert.equal(record["Evidence Filename"], "");
        await nav(ui, "Activity");
        await ui.getByLabel("Activity category").selectOption("evidence");
        await ui.getByText("Added task evidence", { exact: false }).waitFor();
        await ui.screenshot({
          path: path.join(out, "activity-task-evidence.png"),
          fullPage: true,
        });
      } finally {
        await scope.close();
      }
    },
  );
  await check(
    "all actions respond immediately while task moves, URL evidence, learning submissions and reviews save in the background",
    async () => {
      const e = backendEnvironment();
      e.context.executeHubCommand("saveTask", {
        title: "Realtime task",
        newId: "realtime",
        members: ["1"],
        status: "Pending",
      });
      e.context.executeHubCommand("saveEvent", {
        type: "Learning",
        title: "Realtime course",
        newId: "realtime",
        members: ["1"],
      });
      const pending = [];
      const scope = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      const ui = await scope.newPage();
      ui.on("pageerror", (error) => pageErrors.push(error.message));
      const release = (failure = false) => {
        const request = pending.shift();
        assert.ok(request, "A background request must be pending");
        if (failure) request.reject(new Error("Test network unavailable"));
        else {
          try {
            request.resolve(
              JSON.parse(
                JSON.stringify(e.context.executeHubCommand(...request.args)),
              ),
            );
          } catch (error) {
            request.reject(error);
          }
        }
      };
      try {
        await wireProductionRpc(ui, (name, args) =>
          name === "executeHubCommand"
            ? new Promise((resolve, reject) =>
                pending.push({ args, resolve, reject }),
              )
            : JSON.parse(JSON.stringify(e.context[name](...args))),
        );
        await ui.goto(url + "/Index.html");
        await ui.getByRole("heading", { name: "Welcome, Abdallah" }).waitFor();
        await nav(ui, "Tasks");
        const task = ui.locator(".event-card").filter({
          has: ui.getByRole("heading", {
            name: "Realtime task",
            exact: true,
          }),
        });
        await task
          .getByLabel("Move Realtime task", { exact: true })
          .selectOption("Completed");
        await ui
          .locator('[data-task-status="Completed"]')
          .getByRole("heading", { name: "Realtime task", exact: true })
          .waitFor({ timeout: 1500 });
        assert.equal(e.context.getTeamData().tasks.at(-1).Status, "Pending");
        await task
          .getByLabel("Move Realtime task", { exact: true })
          .selectOption("InProgress");
        await ui
          .locator('[data-task-status="InProgress"]')
          .getByRole("heading", { name: "Realtime task", exact: true })
          .waitFor({ timeout: 1500 });
        for (const status of ["Blocked", "Backlog", "InProgress"])
          await task
            .getByLabel("Move Realtime task", { exact: true })
            .selectOption(status);
        const sync = ui.getByRole("button", {
          name: /^Sync status: 2 pending, 0 failed$/,
        });
        await sync.waitFor();
        const size = await sync.boundingBox();
        assert.ok(
          size.width <= 60 && size.height <= 40,
          "Header sync status stays compact",
        );
        assert.equal(
          await ui.getByRole("region", { name: "Unsaved changes" }).count(),
          0,
        );
        assert.equal(await ui.locator(".event-saves").count(), 0);
        await task
          .getByRole("button", { name: "Edit Realtime task", exact: true })
          .click();
        let dialog = ui.getByRole("dialog");
        await dialog
          .getByLabel("Description", { exact: true })
          .fill("Keep this newer form open");
        release();
        await ui.waitForTimeout(100);
        assert.equal(
          await dialog.getByLabel("Description", { exact: true }).inputValue(),
          "Keep this newer form open",
        );
        assert.equal(
          await task
            .getByLabel("Move Realtime task", { exact: true })
            .inputValue(),
          "InProgress",
        );
        release();
        await dialog
          .getByRole("button", { name: "Save task", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden", timeout: 1500 });
        await task
          .getByText("Keep this newer form open", { exact: true })
          .waitFor({ timeout: 1500 });
        await ui.waitForTimeout(100);
        release();
        await task
          .getByRole("button", { name: "Add evidence link", exact: true })
          .click();
        assert.equal(await task.locator(".task-link-form input").count(), 1);
        assert.equal(
          await task
            .locator(".task-link-form select, .task-link-form textarea")
            .count(),
          0,
        );
        await task
          .getByLabel("Evidence URL", { exact: true })
          .fill("https://example.com/realtime-proof");
        await task
          .getByRole("button", { name: "Save link", exact: true })
          .click();
        await task
          .getByRole("link", {
            name: "https://example.com/realtime-proof",
            exact: true,
          })
          .waitFor({ timeout: 1500 });
        await ui.waitForTimeout(100);
        release(true);
        await task
          .getByRole("link", {
            name: "https://example.com/realtime-proof",
            exact: true,
          })
          .waitFor({ state: "hidden" });
        await openSyncErrors(ui);
        await ui
          .getByRole("button", { name: "Retry update", exact: true })
          .click();
        await task
          .getByRole("link", {
            name: "https://example.com/realtime-proof",
            exact: true,
          })
          .waitFor({ timeout: 1500 });
        await ui.waitForTimeout(100);
        release();
        await nav(ui, "Learning");
        const course = ui.locator(".event-card").filter({
          has: ui.getByRole("heading", {
            name: "Realtime course",
            exact: true,
          }),
        });
        await course
          .getByRole("button", { name: "Request completion", exact: true })
          .click();
        dialog = ui.getByRole("dialog");
        await dialog
          .getByRole("button", { name: "Submit for review", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden", timeout: 1500 });
        await course
          .getByText("Pending review", { exact: true })
          .waitFor({ timeout: 1500 });
        await ui
          .getByRole("button", { name: /^Sync status: 1 pending, 0 failed$/ })
          .waitFor();
        assert.equal(await ui.locator(".event-saves").count(), 0);
        assert.equal(e.context.getTeamData().completions.length, 0);
        await nav(ui, "Tasks");
        await ui
          .getByRole("button", { name: "Create task", exact: true })
          .click();
        dialog = ui.getByRole("dialog");
        await dialog
          .getByLabel("Title", { exact: true })
          .fill("Keep this dialog through the reply");
        release();
        await ui.waitForTimeout(100);
        assert.equal(
          await dialog.getByLabel("Title", { exact: true }).inputValue(),
          "Keep this dialog through the reply",
        );
        await dialog
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        await nav(ui, "Learning");
        await course
          .getByRole("button", {
            name: "Review completions for Realtime course",
            exact: true,
          })
          .click();
        await ui
          .getByRole("dialog")
          .getByRole("button", { name: "Approve completion", exact: true })
          .click();
        await ui
          .getByRole("dialog")
          .waitFor({ state: "hidden", timeout: 1500 });
        await course
          .getByText("Completed by you", { exact: true })
          .waitFor({ timeout: 1500 });
        assert.equal(e.context.getTeamData().completions[0].Status, "Pending");
        await ui.setViewportSize({ width: 390, height: 844 });
        await layout(ui);
        await ui.waitForTimeout(300);
        assert.deepEqual(await ui.evaluate(contrastAudit), []);
        await ui.screenshot({
          path: path.join(out, "realtime-updates-mobile.png"),
          fullPage: true,
        });
        release();
        await ui.waitForTimeout(100);
        assert.equal(
          e.context.getTeamData().completions[0].Status,
          "Completed",
        );
        assert.equal(pending.length, 0);
      } finally {
        await scope.close();
      }
    },
  );
  await check(
    "members apply through the Google Form and admins remove members without deleting their history",
    async () => {
      const e = backendEnvironment(),
        scope = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
        }),
        ui = await scope.newPage();
      ui.on("pageerror", (error) => pageErrors.push(error.message));
      try {
        await wireProductionRpc(ui, (name, args) =>
          JSON.parse(JSON.stringify(e.context[name](...args))),
        );
        await ui.goto(url + "/Index.html");
        await ui.getByRole("heading", { name: "Welcome, Abdallah" }).waitFor();
        const href = await ui
          .getByRole("link", { name: "Apply to join", exact: true })
          .getAttribute("href");
        assert.equal(
          href,
          "https://docs.google.com/forms/d/e/1FAIpQLSclQb-3UAbKnRMVAmCxFr1gMiJ36KNIXpUnDx4-1vkJB7d55A/viewform?usp=dialog",
        );
        await nav(ui, "Team Intelligence");
        await ui
          .getByRole("button", { name: "View Member", exact: true })
          .click();
        await ui
          .getByRole("button", { name: "Remove member", exact: true })
          .click();
        await ui
          .getByRole("dialog")
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        assert.equal(
          await ui
            .getByRole("button", { name: "View Member", exact: true })
            .count(),
          1,
        );
        await ui
          .getByRole("button", { name: "Remove member", exact: true })
          .click();
        await ui
          .getByRole("dialog")
          .getByRole("button", { name: "Confirm removal", exact: true })
          .click();
        await ui
          .getByRole("dialog")
          .waitFor({ state: "hidden", timeout: 1500 });
        await ui
          .getByRole("button", { name: "View Member", exact: true })
          .waitFor({ state: "hidden" });
        assert.equal(e.context.getTeamData().team.length, 2);
        assert.equal(e.context.getTeamData().team[1].Active, "FALSE");
        await ui.setViewportSize({ width: 390, height: 844 });
        await layout(ui);
        await ui.screenshot({
          path: path.join(out, "member-removal-mobile.png"),
          fullPage: true,
        });
        e.setEmail("member@example.com");
        await ui.reload();
        await nav(ui, "Team Intelligence");
        assert.equal(
          await ui
            .getByRole("button", { name: "Remove member", exact: true })
            .count(),
          0,
        );
        assert.equal(
          await ui
            .getByRole("link", { name: "Apply to join", exact: true })
            .getAttribute("href"),
          href,
        );
      } finally {
        await scope.close();
      }
    },
  );
  await check(
    "Telegram previews require explicit admin confirmation and deliver the exact approved message in the background",
    async () => {
      const e = backendEnvironment();
      const privateToken = "123456:" + "private_browser_test_token".repeat(2);
      e.scriptProperties.set("TELEGRAM_BOT_TOKEN", privateToken);
      e.scriptProperties.set("TELEGRAM_CHAT_ID", "-4488318175");
      e.context.setupTelegramNotifications();
      const scope = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      const ui = await scope.newPage();
      ui.on("pageerror", (error) => pageErrors.push(error.message));
      const externalRequests = [];
      ui.on("request", (request) => {
        if (request.url().includes("api.telegram.org"))
          externalRequests.push(request.url());
      });
      try {
        await ui.exposeFunction("testHubRpc", (name, args) => {
          assert.ok(
            ["getTeamData", "getTelegramPreview", "executeHubCommand"].includes(
              name,
            ),
          );
          return JSON.parse(JSON.stringify(e.context[name](...args)));
        });
        await ui.addInitScript(() => {
          window.google = { script: {} };
          Object.defineProperty(window.google.script, "run", {
            get() {
              let success, failure;
              const rpc = new Proxy(
                {},
                {
                  get(_, name) {
                    if (name === "withSuccessHandler")
                      return (fn) => {
                        success = fn;
                        return rpc;
                      };
                    if (name === "withFailureHandler")
                      return (fn) => {
                        failure = fn;
                        return rpc;
                      };
                    return (...args) =>
                      window
                        .testHubRpc(name, args)
                        .then((data) => success(data))
                        .catch((error) => failure({ message: error.message }));
                  },
                },
              );
              return rpc;
            },
          });
        });
        await ui.goto(url + "/Index.html");
        await ui.getByRole("heading", { name: "Welcome, Abdallah" }).waitFor();
        await nav(ui, "Meetings");
        await ui
          .getByRole("button", { name: "Create meeting", exact: true })
          .click();
        let dialog = ui.getByRole("dialog");
        await dialog
          .getByLabel("Title", { exact: true })
          .fill("Telegram preview meeting");
        await dialog
          .getByLabel("Meeting date", { exact: true })
          .fill("2099-02-12");
        await dialog
          .getByLabel("Meeting link or location", { exact: true })
          .fill("https://meet.example.com/asar");
        await dialog
          .getByRole("button", { name: "Save event", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden" });
        const card = ui.locator(".event-card").filter({
          has: ui.getByRole("heading", {
            name: "Telegram preview meeting",
            exact: true,
          }),
        });
        const preview = () =>
          card.getByRole("button", {
            name: "Preview Telegram for Telegram preview meeting",
            exact: true,
          });
        await preview().waitFor();
        await preview().click();
        dialog = ui.getByRole("dialog");
        await dialog
          .getByRole("button", { name: "Send to Telegram", exact: true })
          .waitFor();
        assert.match(
          await dialog.locator("pre").innerText(),
          /Join meeting: https:\/\/meet.example.com\/asar/,
        );
        assert.ok((await dialog.locator("pre .telegram-bold").count()) >= 4);
        assert.ok((await dialog.locator("pre .telegram-italic").count()) >= 2);
        assert.ok(
          (await dialog.locator("pre").innerText()).startsWith(
            "\ud83d\udcc5 NEW MEETING",
          ),
        );
        assert.equal(await dialog.locator("pre img, pre script").count(), 0);
        assert.equal(
          e.requests.filter((r) => r.method === "sendMessage").length,
          0,
        );
        await dialog.screenshot({
          path: path.join(out, "telegram-admin-preview.png"),
        });
        await dialog
          .getByRole("button", { name: "Close preview", exact: true })
          .click();
        e.setEmail("member@example.com");
        await ui.reload();
        await nav(ui, "Meetings");
        await preview().click();
        dialog = ui.getByRole("dialog");
        await dialog
          .getByText("Only an admin can send this announcement.", {
            exact: true,
          })
          .waitFor();
        assert.equal(
          await dialog
            .getByRole("button", { name: "Send to Telegram", exact: true })
            .count(),
          0,
        );
        await ui.setViewportSize({ width: 390, height: 844 });
        await layout(ui);
        assert.deepEqual(await ui.evaluate(contrastAudit), []);
        await dialog.screenshot({
          path: path.join(out, "telegram-member-preview-mobile.png"),
        });
        await dialog
          .getByRole("button", { name: "Close preview", exact: true })
          .click();
        e.setEmail("head@example.com");
        await ui.reload();
        await nav(ui, "Meetings");
        await ui
          .getByRole("button", { name: "Switch to dark theme", exact: true })
          .click();
        await preview().click();
        dialog = ui.getByRole("dialog");
        await dialog
          .getByRole("button", { name: "Send to Telegram", exact: true })
          .waitFor();
        const approved = await dialog.locator("pre").innerText();
        await ui.waitForTimeout(300);
        assert.deepEqual(await ui.evaluate(contrastAudit), []);
        await dialog.screenshot({
          path: path.join(out, "telegram-admin-preview-mobile-dark.png"),
        });
        await dialog
          .getByRole("button", { name: "Send to Telegram", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden" });
        await card.getByText("Telegram: Queued", { exact: true }).waitFor();
        assert.equal(
          e.requests.filter((r) => r.method === "sendMessage").length,
          0,
        );
        e.context.hubTelegramWorker_();
        assert.equal(
          e.requests.filter((r) => r.method === "sendMessage")[0].payload.text,
          approved,
        );
        await ui.getByTitle("Refresh sheet data", { exact: true }).click();
        await card.getByText("Telegram: Sent", { exact: true }).waitFor();
        await preview().click();
        dialog = ui.getByRole("dialog");
        await dialog
          .getByText("This announcement has already been sent.", {
            exact: true,
          })
          .waitFor();
        assert.equal(
          await dialog
            .getByRole("button", { name: "Send to Telegram", exact: true })
            .count(),
          0,
        );
        await dialog
          .getByRole("button", { name: "Close preview", exact: true })
          .click();
        await nav(ui, "Activity");
        await ui.getByLabel("Activity category").selectOption("telegram");
        await ui
          .getByText("Telegram announcement · Sent", { exact: false })
          .waitFor();
        assert.equal((await ui.content()).includes(privateToken), false);
        assert.deepEqual(externalRequests, []);
        assert.equal(
          e.requests.filter((r) => r.method === "sendMessage").length,
          1,
        );
        e.context.executeHubCommand("saveTask", {
          title: "Telegram permission failure",
          members: ["1"],
          newId: "telegram-failure",
          status: "Pending",
        });
        const retryKey = "Task:task-telegram-failure";
        const retryPreview = e.context.getTelegramPreview(retryKey);
        e.context.executeHubCommand("queueTelegramNotification", {
          key: retryKey,
          receipt: retryPreview.receipt,
        });
        e.fetch(() => ({ code: 403, body: { ok: false, error_code: 403 } }));
        e.context.hubTelegramWorker_();
        await ui.getByTitle("Refresh sheet data", { exact: true }).click();
        await ui
          .getByText("Telegram announcement · Failed", { exact: false })
          .waitFor();
        assert.equal(await ui.locator(".activity-entry").count(), 2);
        await ui.getByLabel("Activity category").selectOption("errors");
        await ui
          .getByText(
            "The bot cannot post in this group. Check its membership and permissions.",
            { exact: true },
          )
          .waitFor();
        assert.equal(await ui.locator(".activity-entry").count(), 1);
      } finally {
        await scope.close();
      }
    },
  );
  await check(
    "admin event deletion confirms, responds immediately, rolls back failures and retains attendance history",
    async () => {
      const e = backendEnvironment();
      for (const type of ["Task", "Meet", "Learning"])
        e.context.executeHubCommand(
          type === "Task" ? "saveTask" : "saveEvent",
          {
            type,
            title: "Delete test " + type,
            members: ["1"],
            newId: "delete-ui",
            date: "2099-01-01",
            loggingEnabled: true,
          },
        );
      e.context.executeHubCommand("completeEvent", {
        key: "Meet:meet-delete-ui",
        newId: "retained-attendance",
      });
      const scope = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      const ui = await scope.newPage();
      ui.on("pageerror", (error) => pageErrors.push(error.message));
      const pending = [];
      const release = (fail = false) => {
        const request = pending.shift();
        assert.ok(request);
        if (fail) request.reject(new Error("Delete connection failed"));
        else
          request.resolve(
            JSON.parse(
              JSON.stringify(e.context.executeHubCommand(...request.args)),
            ),
          );
      };
      try {
        await wireProductionRpc(ui, (name, args) =>
          name === "executeHubCommand"
            ? new Promise((resolve, reject) =>
                pending.push({ args, resolve, reject }),
              )
            : JSON.parse(JSON.stringify(e.context[name](...args))),
        );
        await ui.goto(url + "/Index.html");
        await ui.getByRole("heading", { name: "Welcome, Abdallah" }).waitFor();
        await nav(ui, "Learning");
        await ui
          .getByRole("button", {
            name: "Preview Telegram for Course",
            exact: true,
          })
          .waitFor();
        for (const [type, tab] of [
          ["Task", "Tasks"],
          ["Meet", "Meetings"],
          ["Learning", "Learning"],
        ]) {
          await nav(ui, tab);
          if (type === "Learning")
            await ui.setViewportSize({ width: 390, height: 844 });
          const title = "Delete test " + type;
          const card = ui.locator(".event-card").filter({
            has: ui.getByRole("heading", { name: title, exact: true }),
          });
          await card
            .getByRole("button", { name: "Delete " + title, exact: true })
            .click();
          let dialog = ui.getByRole("dialog");
          await dialog.getByText(title, { exact: true }).waitFor();
          await dialog
            .getByRole("button", { name: "Cancel", exact: true })
            .click();
          assert.equal(pending.length, 0);
          await card
            .getByRole("button", { name: "Delete " + title, exact: true })
            .click();
          await dialog
            .getByRole("button", { name: "Delete event", exact: true })
            .click();
          await dialog.waitFor({ state: "hidden", timeout: 1500 });
          await card.waitFor({ state: "hidden", timeout: 1500 });
          assert.ok(
            e.context
              .getTeamData()
              [
                { Task: "tasks", Meet: "meet", Learning: "learning" }[type]
              ].some(
                (row) => !row.Deleted && Object.values(row).includes(title),
              ),
          );
          await ui.waitForTimeout(100);
          if (type === "Task") {
            release(true);
            await card.waitFor();
            await openSyncErrors(ui);
            await ui
              .getByRole("button", { name: "Retry update", exact: true })
              .click();
            await card.waitFor({ state: "hidden", timeout: 1500 });
            await ui.waitForTimeout(100);
          }
          release();
          await ui
            .getByRole("button", { name: /^Sync status:/ })
            .waitFor({ state: "hidden" });
          assert.equal(await ui.locator(".event-saves").count(), 0);
          await layout(ui);
        }
        await nav(ui, "Completion logs");
        await ui.getByText("Event deleted", { exact: true }).waitFor();
        assert.equal(
          await ui
            .getByRole("button", { name: /^Review attendance for/ })
            .count(),
          0,
        );
        assert.equal(e.context.getTeamData().completions.length, 1);
        await ui.screenshot({
          path: path.join(out, "deleted-event-history-mobile.png"),
          fullPage: true,
        });
      } finally {
        await scope.close();
      }
    },
  );
  await check(
    "References accepts member links, preserves authenticated attribution and restricts deletion to admins in responsive themes",
    async () => {
      const e = backendEnvironment("member@example.com");
      const scope = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      const ui = await scope.newPage();
      ui.on("pageerror", (error) => pageErrors.push(error.message));
      try {
        await wireProductionRpc(ui, (name, args) =>
          JSON.parse(JSON.stringify(e.context[name](...args))),
        );
        await ui.goto(url + "/Index.html");
        await ui.getByRole("heading", { name: "Welcome, Member" }).waitFor();
        await nav(ui, "References");
        await ui.getByRole("button", { name: "Add link", exact: true }).click();
        let dialog = ui.getByRole("dialog");
        await dialog
          .getByLabel("Title", { exact: true })
          .fill("ASAR firmware repository");
        await dialog
          .getByLabel("URL", { exact: true })
          .fill("https://github.com/example/asar");
        await dialog
          .getByLabel("Description (optional)", { exact: true })
          .fill("Setup, source code and releases. <script> stays plain text.");
        await dialog
          .getByRole("button", { name: "Add link", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden", timeout: 1500 });
        const card = ui.locator(".reference-card");
        await card
          .getByRole("link", { name: "ASAR firmware repository", exact: true })
          .waitFor();
        assert.equal(
          await card.getByRole("link").getAttribute("href"),
          "https://github.com/example/asar",
        );
        await card.getByText("Added by Member", { exact: true }).waitFor();
        assert.equal(
          await card.getByRole("button", { name: /^Delete reference/ }).count(),
          0,
        );
        await ui
          .getByRole("button", { name: /^Sync status:/ })
          .waitFor({ state: "hidden" });
        await ui
          .getByRole("searchbox", { name: "Search references", exact: true })
          .fill("missing");
        await ui
          .getByRole("heading", { name: "No matching references" })
          .waitFor();
        await ui
          .getByRole("searchbox", { name: "Search references", exact: true })
          .fill("firmware");
        await card.waitFor();
        for (const theme of ["light", "dark"]) {
          if (theme === "dark")
            await ui
              .getByRole("button", { name: "Switch to dark theme" })
              .click();
          await ui.waitForTimeout(250);
          for (const width of [1440, 768, 390]) {
            await ui.setViewportSize({ width, height: 1000 });
            await layout(ui);
            assert.deepEqual(await ui.evaluate(contrastAudit), []);
          }
          await ui.screenshot({
            path: path.join(out, "references-member-" + theme + "-mobile.png"),
            fullPage: true,
          });
        }
        e.setEmail("head@example.com");
        await ui.getByTitle("Refresh sheet data", { exact: true }).click();
        await card
          .getByRole("button", {
            name: "Delete reference ASAR firmware repository",
            exact: true,
          })
          .waitFor();
        await card.getByRole("button", { name: /^Delete reference/ }).click();
        dialog = ui.getByRole("dialog");
        await dialog
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        await card.waitFor();
        await card.getByRole("button", { name: /^Delete reference/ }).click();
        await dialog
          .getByRole("button", { name: "Delete link", exact: true })
          .click();
        await card.waitFor({ state: "hidden", timeout: 1500 });
        await ui
          .getByRole("button", { name: /^Sync status:/ })
          .waitFor({ state: "hidden" });
        const db = e.context.getTeamData();
        assert.equal(db.references.length, 1);
        assert.equal(db.references[0].Deleted, "TRUE");
        assert.equal(db.references[0]["Added By"], "member@example.com");
        await nav(ui, "Activity");
        await ui.getByText("Added reference link", { exact: false }).waitFor();
        await ui
          .getByText("Deleted reference link", { exact: false })
          .waitFor();
      } finally {
        await scope.close();
      }
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
      db.activity.push(
        ...Array.from({ length: 2000 }, (_, index) => ({
          Timestamp: new Date(
            Date.UTC(2026, 9, 18, 10, 0, index),
          ).toISOString(),
          Email: db.team[index % 2].Mail,
          Action: index % 11 === 0 ? "completeEvent" : "moveTask",
          Target: "Activity trace " + index,
          Details:
            index === 1999
              ? "null"
              : JSON.stringify(
                  index % 25 === 0
                    ? {
                        outcome: "Failed",
                        error: "Test permission error",
                        event: "Task:trace",
                        requestId: "trace-" + index,
                      }
                    : {
                        type: "Task",
                        previousStatus: "Pending",
                        status: "InProgress",
                      },
                ),
        })),
      );
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
      await nav(prod, "Activity");
      assert.equal(await prod.locator(".activity-entry").count(), 40);
      await prod
        .getByRole("button", { name: "Show more activity", exact: true })
        .click();
      assert.equal(await prod.locator(".activity-entry").count(), 80);
      await prod.getByLabel("Search activity").fill("Activity trace 1999");
      assert.equal(await prod.locator(".activity-entry").count(), 1);
      await prod.getByLabel("Activity member").selectOption(db.team[1].Mail);
      assert.equal(await prod.locator(".activity-entry").count(), 1);
      await prod.getByLabel("Search activity").fill("");
      await prod.getByLabel("Activity category").selectOption("errors");
      assert.equal(await prod.locator(".activity-entry").count(), 40);
      await prod.locator(".activity-entry").first().locator("summary").click();
      await prod
        .locator(".activity-entry")
        .first()
        .getByText("Request", { exact: true })
        .waitFor();
      await prod.setViewportSize({ width: 390, height: 844 });
      await layout(prod);
      await prod.screenshot({
        path: path.join(out, "reviewer-activity-mobile.png"),
        fullPage: true,
      });
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
