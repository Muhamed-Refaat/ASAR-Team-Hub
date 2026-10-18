const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  vm = require("node:vm");
const M = require("../web/model.js");
const { environment } = require("./backend-fixture.cjs");
function fixture() {
  const e = environment();
  e.context.SpreadsheetApp.openById = () => e.ss;
  vm.runInContext(
    fs.readFileSync("forms/TeamApplications.gs", "utf8"),
    e.context,
  );
  return e;
}
function response({
  id = "3",
  mail = "new@example.com",
  verified = mail,
  name = "New member",
} = {}) {
  const basic = (title, value) => ({
    getItem: () => ({ getTitle: () => title }),
    getResponse: () => value,
  });
  const grid = (title) => ({
    getItem: () => ({
      getTitle: () => title,
      asGridItem: () => ({
        getRows: () => ["Python\nprogramming", "Second"],
        getColumns: () => ["1", "2", "3", "4", "5"],
      }),
    }),
    getResponse: () => ["4", ""],
  });
  return {
    response: {
      getId: () => "response-1",
      getRespondentEmail: () => verified,
      getItemResponses: () => [
        basic("Full name", name),
        basic("ID", id),
        basic("Mail", mail),
        basic("Phone number", "+20123"),
        basic("Overview", "Overview text"),
        grid(" Hard Skills Rating "),
        grid("Soft Skills Rating"),
        grid("Technologies and Tools"),
      ],
    },
  };
}
test("form adds a verified applicant with no management rights and logs the application", () => {
  const e = fixture();
  e.context.onFormSubmit(response());
  const db = e.context.getTeamData(),
    member = M.actor(db, "new@example.com");
  assert.equal(member.Name, "New member");
  assert.equal(member.Role, "Team member");
  assert.equal(member.Active, "TRUE");
  assert.equal(M.isAdmin(db, member), false);
  assert.equal(M.parseRatings(member["Hard Skill"])[0].score, 4);
  assert.equal(
    M.parseRatings(member.Technology)[0].label,
    "Python programming",
  );
  assert.equal(db.activity.at(-1).Action, "teamApplication");
  assert.equal(e.locked(), false);
});
test("form profile updates preserve sparse headers, hierarchy, extra cells and removal state", () => {
  const e = fixture();
  e.sheets.Team.rows[0].push("", "Education", "Active");
  e.sheets.Team.rows[1].push("", "Original education", "FALSE");
  e.context.onFormSubmit(
    response({ id: "1", mail: "head@example.com", name: "Updated name" }),
  );
  const db = e.context.getTeamData(),
    row = db.team[0];
  assert.equal(db.team.length, 2);
  assert.equal(row.Name, "Updated name");
  assert.equal(row.Role, "Team Leader");
  assert.equal(row.Education, "Original education");
  assert.equal(row.Active, "FALSE");
  assert.equal(row.Aliases, "Abdallah Allam");
  assert.equal(M.resolveMember(db, "Abdallah Allam").Name, "Updated name");
  assert.equal(M.actor(db, "head@example.com"), null);
  assert.equal(e.sheets.Team.rows[0][6], "");
});
test("form rejects identity collisions, unverified email, mismatched accounts and wrong trigger types", () => {
  const e = fixture();
  assert.throws(() => e.context.onFormSubmit({ namedValues: {} }), /From form/);
  assert.throws(
    () => e.context.onFormSubmit(response({ id: "1" })),
    /another team record/,
  );
  assert.throws(
    () => e.context.onFormSubmit(response({ verified: "" })),
    /Verified/,
  );
  assert.throws(
    () => e.context.onFormSubmit(response({ verified: "other@example.com" })),
    /Verified/,
  );
  assert.equal(e.sheets.Team.rows.length, 3);
  assert.equal(e.locked(), false);
});
