// Install in the Google Form's Apps Script project, separately from the hub web app.
const ASAR_FORM_SPREADSHEET_ID = "188lG-b__CVXFxj2ebrGXilpfw8-Y7Q-O9KrGzkOWqkU";

function onFormSubmit(e) {
  if (!e || !e.response)
    throw new Error("Use a From form / On form submit installable trigger.");
  const response = e.response;
  const submitted = {};
  response.getItemResponses().forEach((item) => {
    const title = String(item.getItem().getTitle())
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    const value = String(item.getResponse() || "").trim();
    if (title.includes("hard skill"))
      submitted["Hard Skill"] = formatGridResponse(item);
    else if (title.includes("soft skill"))
      submitted["Soft Skill"] = formatGridResponse(item);
    else if (title.includes("technolog") || title.includes("tool"))
      submitted.Technology = formatGridResponse(item);
    else if (title.includes("mail")) submitted.Mail = value.toLowerCase();
    else if (title.includes("phone")) submitted["Phone number"] = value;
    else if (title.includes("overview")) submitted.overview = value;
    else if (/\bid\b/.test(title)) submitted.ID = value.replace(/\.0+$/, "");
    else if (title.includes("name")) submitted.Name = value;
  });
  if (
    !submitted.Name ||
    !submitted.ID ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitted.Mail || "")
  )
    throw new Error("Full name, ID and a valid Mail address are required.");
  const verifiedEmail = String(response.getRespondentEmail() || "")
    .trim()
    .toLowerCase();
  if (!verifiedEmail || verifiedEmail !== submitted.Mail)
    throw new Error(
      "Enable Collect email addresses → Verified in the form settings, and submit with the Google account matching Mail.",
    );

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.openById(ASAR_FORM_SPREADSHEET_ID);
    const sheet = ss.getSheetByName("Team");
    if (!sheet) throw new Error("The Team sheet is missing.");
    const data = sheet.getDataRange().getValues();
    const headers = (data[0] || []).map((value) => String(value || "").trim());
    const required = [...Object.keys(submitted), "Role", "Active", "Aliases"];
    required.forEach((field) => {
      if (!headers.includes(field)) headers.push(field);
    });
    const idColumn = headers.indexOf("ID"),
      emailColumn = headers.indexOf("Mail");
    const matches = data.slice(1).flatMap((row, index) => {
      const rowId = String(row[idColumn] || "")
        .trim()
        .replace(/\.0+$/, "");
      const rowEmail = String(row[emailColumn] || "")
        .trim()
        .toLowerCase();
      return rowId === submitted.ID || rowEmail === submitted.Mail
        ? [{ row, number: index + 2, rowId, rowEmail }]
        : [];
    });
    if (
      matches.length > 1 ||
      (matches.length === 1 &&
        (matches[0].rowId !== submitted.ID ||
          matches[0].rowEmail !== submitted.Mail))
    )
      throw new Error(
        "This ID or Mail belongs to another team record. Ask an admin to correct the identity before resubmitting.",
      );
    if (matches.length) {
      const previousName = String(
        matches[0].row[headers.indexOf("Name")] || "",
      ).trim();
      if (previousName && previousName !== submitted.Name) {
        const aliases = String(matches[0].row[headers.indexOf("Aliases")] || "")
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter(Boolean);
        if (!aliases.includes(previousName)) aliases.push(previousName);
        submitted.Aliases = aliases.join("\n");
      }
    }
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    const asCell = (value) =>
      /^[=+@]/.test(String(value)) ? "'" + value : value;
    if (matches.length) {
      // Never overwrite role/hierarchy, extra profile fields, formulas or a removal flag.
      Object.entries(submitted).forEach(([field, value]) => {
        sheet
          .getRange(matches[0].number, headers.indexOf(field) + 1)
          .setValue(asCell(value));
      });
    } else {
      const member = { ...submitted, Role: "Team member", Active: "TRUE" };
      sheet.appendRow(headers.map((field) => asCell(member[field] || "")));
    }
    let activity = ss.getSheetByName("Activity");
    if (!activity) activity = ss.insertSheet("Activity");
    const activityData = activity.getDataRange().getValues();
    const activityHeaders = (activityData[0] || []).map((value) =>
      String(value || "").trim(),
    );
    while (
      activityHeaders.length &&
      !activityHeaders[activityHeaders.length - 1]
    )
      activityHeaders.pop();
    ["Timestamp", "Email", "Action", "Target", "Details"].forEach((field) => {
      if (!activityHeaders.includes(field)) activityHeaders.push(field);
    });
    activity
      .getRange(1, 1, 1, activityHeaders.length)
      .setValues([activityHeaders]);
    const record = {
      Timestamp: new Date().toISOString(),
      Email: verifiedEmail,
      Action: "teamApplication",
      Target: submitted.Name,
      Details: JSON.stringify({
        outcome: "Succeeded",
        memberId: submitted.ID,
        operation: matches.length ? "Updated profile" : "Joined team",
        responseId: response.getId(),
      }),
    };
    activity.appendRow(
      activityHeaders.map((field) => asCell(record[field] || "")),
    );
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

function formatGridResponse(itemResponse) {
  const grid = itemResponse.getItem().asGridItem();
  const rows = grid.getRows(),
    columns = grid.getColumns(),
    answers = itemResponse.getResponse();
  return rows
    .flatMap((row, index) => {
      const rating = columns.indexOf(answers[index]) + 1;
      return answers[index] && rating > 0
        ? ["{" + String(row).replace(/\n/g, " ").trim() + " , " + rating + "}"]
        : [];
    })
    .join("\n");
}
