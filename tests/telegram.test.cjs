const { test } = require("node:test");
const assert = require("node:assert/strict");
const M = require("../web/model.js");
const T = require("../web/telegram.js");
const { environment } = require("./backend-fixture.cjs");
const token = "123456:" + "test_private_token_".repeat(3);
function connected() {
  const e = environment();
  e.scriptProperties.set("TELEGRAM_BOT_TOKEN", token);
  e.scriptProperties.set("TELEGRAM_CHAT_ID", "-4488318175");
  e.context.setupTelegramNotifications();
  return e;
}
function create(e, type = "Task", suffix = "one") {
  const payload = {
    newId: suffix,
    title: "New " + type + " " + suffix,
    members: ["1", "2"],
    description: "Review this <content> & Arabic مرحباً",
    status: "Pending",
    type,
    date: "2099-02-12",
    due: "2099-02-13",
    link: "https://meet.example.com/asar",
    loggingEnabled: true,
  };
  e.context.executeHubCommand(
    type === "Task" ? "saveTask" : "saveEvent",
    payload,
  );
  return { key: type + ":" + type.toLowerCase() + "-" + suffix, payload };
}
function confirm(e, key) {
  const p = e.context.getTelegramPreview(key);
  assert.equal(p.canSend, true);
  e.context.executeHubCommand("queueTelegramNotification", {
    key,
    receipt: p.receipt,
  });
  return p;
}
const sends = (e) => e.requests.filter((r) => r.method === "sendMessage");
const delivery = (e, key) => T.deliveries(e.context.getTeamData()).get(key);

test("imported courses have previews without invented creators and can be announced once per destination", () => {
  const e = connected();
  const key = M.events(e.context.getTeamData()).find(
    (event) => event.type === "Learning",
  ).key;
  const p = e.context.getTelegramPreview(key);
  assert.equal(p.canSend, true);
  assert.match(p.preview.text, /NEW COURSE/);
  assert.equal(p.preview.text.includes("Created by:"), false);
  e.setEmail("member@example.com");
  assert.equal(e.context.getTelegramPreview(key).canSend, false);
  e.setEmail("head@example.com");
  confirm(e, key);
  e.context.hubTelegramWorker_();
  assert.equal(sends(e).length, 1);
  assert.equal(e.context.getTelegramPreview(key).canSend, false);
  e.scriptProperties.set("TELEGRAM_CHAT_ID", "-5382073850");
  e.scriptProperties.set("TELEGRAM_CHAT_TITLE", "test");
  assert.equal(e.context.getTelegramPreview(key).canSend, true);
  confirm(e, key);
  e.context.hubTelegramWorker_();
  assert.deepEqual(
    sends(e).map((row) => row.payload.chat_id),
    ["-4488318175", "-5382073850"],
  );
  assert.equal(
    T.deliveries(e.context.getTeamData(), "-4488318175").get(key).status,
    "Sent",
  );
  assert.equal(e.context.getTelegramPreview(key).canSend, false);
});

test("Telegram setup verifies the intended group without posting; creations and previews never send", () => {
  const e = connected();
  assert.deepEqual(
    e.requests.map((r) => r.method),
    ["getMe", "getChat", "getChatMember"],
  );
  e.context.setupTelegramNotifications();
  assert.equal(e.triggers.length, 1);
  for (const type of ["Task", "Meet", "Learning"]) {
    const { key } = create(e, type);
    const p = e.context.getTelegramPreview(key);
    assert.equal(p.canSend, true);
    assert.ok(
      p.preview.text.includes(
        type === "Meet"
          ? "Join meeting:"
          : type === "Learning"
            ? "Course:"
            : "Status: Pending",
      ),
    );
    assert.ok(p.preview.text.includes("Abdallah Allam, Member"));
    e.context.hubTelegramWorker_();
  }
  assert.equal(sends(e).length, 0);
  assert.equal(JSON.stringify(e.context.getTeamData()).includes(token), false);
  assert.equal(
    JSON.stringify(e.context.getTelegramPreview("Task:task-one")).includes(
      token,
    ),
    false,
  );
});

test("members may preview but cannot send or configure; receipts are personal, expire and detect edits", () => {
  const e = connected(),
    { key, payload } = create(e);
  const adminPreview = e.context.getTelegramPreview(key);
  e.setEmail("member@example.com");
  assert.equal(e.context.getTelegramPreview(key).canSend, false);
  assert.throws(
    () =>
      e.context.executeHubCommand("queueTelegramNotification", {
        key,
        receipt: adminPreview.receipt,
        email: "head@example.com",
      }),
    /Only explicitly/,
  );
  assert.throws(
    () => e.context.setupTelegramNotifications(),
    /Only explicitly/,
  );
  e.sheets.Admins.appendRow(["member@example.com", true]);
  assert.throws(
    () =>
      e.context.executeHubCommand("queueTelegramNotification", {
        key,
        receipt: adminPreview.receipt,
      }),
    /preview again/,
  );
  e.sheets.Admins.rows.at(-1)[1] = false;
  assert.throws(
    () => e.context.pauseTelegramNotifications(),
    /Only explicitly/,
  );
  e.setEmail("");
  assert.throws(() => e.context.getTelegramPreview(key), /Sign in/);
  e.setEmail("head@example.com");
  assert.throws(
    () =>
      e.context.executeHubCommand("queueTelegramNotification", {
        key,
        receipt: "forged",
      }),
    /preview again/,
  );
  e.advance(11 * 60 * 1000);
  assert.throws(
    () =>
      e.context.executeHubCommand("queueTelegramNotification", {
        key,
        receipt: adminPreview.receipt,
      }),
    /preview again/,
  );
  const fresh = e.context.getTelegramPreview(key);
  e.context.executeHubCommand("saveTask", {
    ...payload,
    key,
    title: "Changed after preview",
  });
  assert.throws(
    () =>
      e.context.executeHubCommand("queueTelegramNotification", {
        key,
        receipt: fresh.receipt,
      }),
    /event or destination changed/,
  );
  assert.equal(sends(e).length, 0);
});

test("confirmed delivery uses the exact approved text and button; duplicate requests do not repost", () => {
  const e = connected(),
    { key } = create(e, "Meet");
  const p = confirm(e, key);
  assert.equal(sends(e).length, 0);
  assert.equal(delivery(e, key).status, "Queued");
  // A different mutation during Telegram I/O must remain intact after delivery updates.
  e.fetch(({ method, payload }) => {
    assert.equal(e.locked(), false);
    assert.equal(method, "sendMessage");
    e.context.executeHubCommand("moveTask", {
      key: "Task:task-1",
      status: "InProgress",
    });
    return { code: 200, body: { ok: true, result: { message_id: 987 } } };
  });
  e.context.hubTelegramWorker_();
  assert.equal(sends(e)[0].payload.text, p.preview.text);
  assert.deepEqual(
    JSON.parse(JSON.stringify(sends(e)[0].payload.entities)),
    JSON.parse(JSON.stringify(p.preview.entities)),
  );
  assert.equal(
    sends(e)[0].payload.reply_markup.inline_keyboard[0][0].text,
    "🚀 Open Team Hub",
  );
  assert.equal(
    sends(e)[0].payload.reply_markup.inline_keyboard[0][0].url,
    p.preview.url,
  );
  assert.equal(sends(e)[0].payload.chat_id, "-4488318175");
  assert.equal(delivery(e, key).status, "Sent");
  assert.equal(delivery(e, key).messageId, 987);
  assert.equal(e.sheets.Task.rows[1][2], "InProgress");
  assert.equal(
    e.context.executeHubCommand("queueTelegramNotification", {
      key,
      receipt: p.receipt,
    }).unchanged,
    true,
  );
  e.context.hubTelegramWorker_();
  assert.equal(sends(e).length, 1);
  assert.equal(e.context.getTelegramPreview(key).canSend, false);
});

test("rate limits and Telegram outages retry with backoff; permanent failures preserve a reviewable attempt", () => {
  const e = connected(),
    { key } = create(e);
  confirm(e, key);
  e.fetch(() => ({
    code: 429,
    body: { ok: false, error_code: 429, parameters: { retry_after: 180 } },
  }));
  e.context.hubTelegramWorker_();
  assert.equal(delivery(e, key).status, "Retrying");
  e.advance(120000);
  e.context.hubTelegramWorker_();
  assert.equal(sends(e).length, 1);
  e.advance(61000);
  e.fetch(() => ({ code: 503, body: { ok: false, error_code: 503 } }));
  e.context.hubTelegramWorker_();
  assert.equal(delivery(e, key).attempts, 2);
  assert.equal(delivery(e, key).status, "Retrying");
  e.advance(121000);
  e.fetch(() => ({
    code: 403,
    body: { ok: false, error_code: 403, description: token },
  }));
  e.context.hubTelegramWorker_();
  assert.equal(delivery(e, key).status, "Failed");
  assert.equal(delivery(e, key).attempts, 3);
  assert.equal(JSON.stringify(e.context.getTeamData()).includes(token), false);
  assert.equal(e.context.getTelegramPreview(key).canSend, true);
});

test("lost responses and expired delivery leases require a fresh preview before retrying", () => {
  const e = connected(),
    { key } = create(e);
  confirm(e, key);
  e.fetch(({ url }) => {
    throw new Error("Request timed out: " + url);
  });
  e.context.hubTelegramWorker_();
  assert.equal(delivery(e, key).status, "Unconfirmed");
  assert.equal(JSON.stringify(e.context.getTeamData()).includes(token), false);
  e.advance(10 * 60 * 1000);
  e.context.hubTelegramWorker_();
  assert.equal(sends(e).length, 1);
  const previous = e.context
    .getTeamData()
    .activity.filter((r) => r.Action === "telegramNotification");
  confirm(e, key);
  assert.equal(
    e.context
      .getTeamData()
      .activity.filter((r) => r.Action === "telegramNotification").length,
    previous.length + 1,
  );
  const claim = e.context.hubTelegramClaim_();
  assert.equal(claim.item.status, "Sending");
  e.advance(121000);
  e.context.hubTelegramWorker_();
  assert.equal(delivery(e, key).status, "Unconfirmed");
  assert.equal(sends(e).length, 1);
});

test("pausing delivery and revoking installer admin rights preserve queued messages without sending", () => {
  const e = connected(),
    { key } = create(e);
  confirm(e, key);
  e.context.pauseTelegramNotifications();
  e.context.hubTelegramWorker_();
  assert.equal(sends(e).length, 0);
  e.context.setupTelegramNotifications();
  e.sheets.Admins.rows[1][1] = false;
  e.context.hubTelegramWorker_();
  assert.equal(sends(e).length, 0);
  assert.equal(delivery(e, key).status, "Queued");
  e.sheets.Admins.rows[1][1] = true;
  e.context.hubTelegramWorker_();
  assert.equal(sends(e).length, 1);
});

test("queued messages are spaced outside the save lock and bounded per worker run", () => {
  const e = connected();
  for (let index = 0; index < 6; index++)
    confirm(e, create(e, "Task", "batch-" + index).key);
  e.context.hubTelegramWorker_();
  assert.equal(sends(e).length, 5);
  for (let index = 1; index < 5; index++)
    assert.ok(sends(e)[index].time - sends(e)[index - 1].time >= 3200);
  e.advance(60000);
  e.context.hubTelegramWorker_();
  assert.equal(sends(e).length, 6);
  assert.equal(e.locked(), false);
});

test("styled announcements use emoji, readable dates and exact UTF-16 formatting without interpreting member text as HTML", () => {
  for (const type of ["Task", "Meet", "Learning"]) {
    const e = connected();
    const { key, payload } = create(e, type);
    const title = "🚀 مرحباً <b>Design & build</b>";
    e.context.executeHubCommand(type === "Task" ? "saveTask" : "saveEvent", {
      ...payload,
      key,
      title,
      description: '<img src=x onerror="alert(1)">',
    });
    const p = e.context.getTelegramPreview(key).preview;
    assert.ok(
      p.text.startsWith(
        {
          Task: "📌 NEW TASK",
          Meet: "📅 NEW MEETING",
          Learning: "🎓 NEW COURSE",
        }[type],
      ),
    );
    assert.ok(p.text.includes("👥 Assigned to: Abdallah Allam, Member"));
    assert.ok(p.text.includes('<img src=x onerror="alert(1)">'));
    const formatted = JSON.parse(
      JSON.stringify(T.entities(p.text, p.entities)),
    );
    assert.deepEqual(formatted, JSON.parse(JSON.stringify(p.entities)));
    assert.equal(
      T.fragments(p.text, p.entities)
        .map((part) => part.text)
        .join(""),
      p.text,
    );
    assert.ok(
      p.entities.some(
        (item) =>
          item.type === "bold" &&
          p.text.slice(item.offset, item.offset + item.length) === title,
      ),
    );
    if (type === "Meet") assert.ok(p.text.includes("12 Feb 2099 (Cairo)"));
    confirm(e, key);
    e.context.hubTelegramWorker_();
    assert.equal(sends(e)[0].payload.parse_mode, undefined);
    assert.equal(sends(e)[0].payload.text, p.text);
    assert.deepEqual(
      JSON.parse(JSON.stringify(sends(e)[0].payload.entities)),
      formatted,
    );
  }
});

test("preview fragments reject unsafe, overlapping and surrogate-splitting entities and retain legacy plain messages", () => {
  const text = "🚀 <script>literal</script>";
  const valid = { type: "bold", offset: 3, length: 8 };
  const styles = [
    { type: "text_link", offset: 3, length: 8, url: "javascript:alert(1)" },
    { type: "bold", offset: 1, length: 1 },
    { type: "italic", offset: -1, length: 10 },
    valid,
    { type: "italic", offset: 4, length: 2 },
    { type: "bold", offset: 1000, length: 2 },
  ];
  assert.deepEqual(T.entities(text, styles), [valid]);
  assert.equal(
    T.fragments(text, styles)
      .map((part) => part.text)
      .join(""),
    text,
  );
  const e = connected(),
    { key } = create(e);
  confirm(e, key);
  const rows = e.sheets.Activity.rows;
  const index = rows[0].indexOf("Details");
  const data = JSON.parse(rows.at(-1)[index]);
  data.telegram.text = "Legacy plain announcement";
  delete data.telegram.entities;
  rows.at(-1)[index] = JSON.stringify(data);
  const p = e.context.getTelegramPreview(key).preview;
  assert.equal(p.text, "Legacy plain announcement");
  assert.deepEqual(JSON.parse(JSON.stringify(p.entities)), []);
  e.context.hubTelegramWorker_();
  assert.equal(sends(e)[0].payload.text, p.text);
  assert.equal(sends(e)[0].payload.entities, undefined);
});

test("notification formatting bounds long text, preserves Unicode and refuses history or unsafe links", () => {
  const e = connected(),
    { key, payload } = create(e, "Learning");
  e.context.executeHubCommand("saveEvent", {
    ...payload,
    key,
    description: "محتوى".repeat(2000),
    title: "Long ".repeat(100),
    link: "https://example.com/" + "a".repeat(4000),
  });
  const p = e.context.getTelegramPreview(key);
  assert.ok(p.preview.text.length <= 4096);
  assert.ok(p.preview.text.includes("محتوى"));
  assert.ok(p.preview.text.includes("Open Team Hub for the event link"));
  assert.throws(
    () => e.context.getTelegramPreview("Task:task-1"),
    /Choose a saved/,
  );
  const unsafe = T.preview(
    M,
    e.context.getTeamData(),
    key,
    "javascript:alert(1)",
  );
  assert.equal(unsafe.url, "");
  e.context.executeHubCommand("saveEvent", {
    ...payload,
    key,
    title: "Another edit",
  });
  assert.equal(T.creations(e.context.getTeamData()).size, 1);
});

test("setup rejects missing credentials and posting restrictions; group discovery returns no message content", () => {
  const e = environment();
  assert.throws(
    () => e.context.setupTelegramNotifications(),
    /Script Properties/,
  );
  assert.equal(e.requests.length, 0);
  e.scriptProperties.set("TELEGRAM_BOT_TOKEN", token);
  e.scriptProperties.set("TELEGRAM_CHAT_ID", "-4488318175");
  e.fetch(({ method }) => ({
    code: 200,
    body: {
      ok: true,
      result:
        method === "getMe"
          ? { id: 123 }
          : method === "getChat"
            ? { id: -4488318175, type: "group" }
            : { status: "restricted", can_send_messages: false },
    },
  }));
  assert.throws(
    () => e.context.setupTelegramNotifications(),
    /allow it to send messages/,
  );
  assert.equal(e.triggers.length, 0);
  assert.notEqual(
    e.scriptProperties.get("TELEGRAM_NOTIFICATIONS_ENABLED"),
    "true",
  );
  e.fetch(() => ({
    code: 200,
    body: {
      ok: true,
      result: [
        {
          message: {
            chat: { id: -4488318175, title: "ASAR Team", type: "group" },
            text: "PRIVATE GROUP MESSAGE",
          },
        },
        {
          message: {
            chat: { id: 789, title: "Private", type: "private" },
            text: "PRIVATE PERSONAL MESSAGE",
          },
        },
      ],
    },
  }));
  const groups = e.context.findTelegramGroups();
  assert.equal(groups.length, 1);
  assert.equal(groups[0].chatId, "-4488318175");
  assert.equal(JSON.stringify(groups).includes("PRIVATE"), false);
  e.setEmail("member@example.com");
  assert.throws(() => e.context.findTelegramGroups(), /Only explicitly/);
});

test("switching to the test group blocks old production approvals and sends new confirmations only to test", () => {
  const e = connected();
  const old = create(e, "Task", "production");
  const receipt = e.context.getTelegramPreview(old.key);
  confirm(e, old.key);
  e.scriptProperties.set("TELEGRAM_CHAT_ID", "-5382073850");
  e.fetch(({ method, payload }) => ({
    code: 200,
    body: {
      ok: true,
      result:
        method === "getMe"
          ? { id: 123 }
          : method === "getChat"
            ? { id: Number(payload.chat_id), title: "test", type: "group" }
            : method === "getChatMember"
              ? { status: "member" }
              : { message_id: 321 },
    },
  }));
  e.context.setupTelegramNotifications();
  assert.equal(e.scriptProperties.get("TELEGRAM_CHAT_ID"), "-5382073850");
  const newer = create(e, "Meet", "test-only");
  const p = e.context.getTelegramPreview(newer.key);
  assert.equal(p.chatTitle, "test");
  confirm(e, newer.key);
  e.context.hubTelegramWorker_();
  assert.equal(delivery(e, old.key).status, "Failed");
  assert.equal(sends(e).length, 1);
  assert.equal(sends(e)[0].payload.chat_id, "-5382073850");
  assert.equal(delivery(e, newer.key).status, "Sent");
  assert.throws(
    () =>
      e.context.executeHubCommand("queueTelegramNotification", {
        key: old.key,
        receipt: receipt.receipt,
      }),
    /preview again|destination changed/,
  );
});

test("changing the recipient invalidates an unsent preview and preserves an already approved destination", () => {
  const e = connected(),
    { key } = create(e);
  const p = e.context.getTelegramPreview(key);
  e.scriptProperties.set("TELEGRAM_CHAT_ID", "-1004488318175");
  assert.throws(
    () =>
      e.context.executeHubCommand("queueTelegramNotification", {
        key,
        receipt: p.receipt,
      }),
    /destination changed/,
  );
  e.scriptProperties.set("TELEGRAM_CHAT_ID", "-4488318175");
  confirm(e, key);
  e.scriptProperties.set("TELEGRAM_CHAT_ID", "-1004488318175");
  e.context.hubTelegramWorker_();
  assert.equal(sends(e).length, 0);
  assert.equal(delivery(e, key).status, "Failed");
  assert.match(delivery(e, key).error, /destination changed/);
});
