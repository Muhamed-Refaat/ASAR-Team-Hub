/**
 * Azar Project Team - Backend Controller (Code.gs)
 * This file manages data read/write requests from the frontend Google Sheet.
 */

// Spreadsheet ID from the project README.md
const SPREADSHEET_ID = "188lG-b__CVXFxj2ebrGXilpfw8-Y7Q-O9KrGzkOWqkU";

/**
 * Serves the web application.
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'learning') {
    const ss = getSpreadsheet();
    const data = getSheetData(ss, 'Learning');
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('ASAR Project Team')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Gets the active spreadsheet.
 * Handles both bound and unbound script configurations.
 */
function getSpreadsheet() {
  try {
    return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (err) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
}

/**
 * Reads all data sheets and compiles them into a single JSON object.
 * This is called by the front end upon loading.
 */
function getTeamData() {
  const ss = getSpreadsheet();
  let webAppUrl = "";
  try {
    webAppUrl = ScriptApp.getService().getUrl();
  } catch(e) {
    // Ignore if not published as a web app yet
  }
  
  const session = getActiveUserSession();
  
  return {
    supervisor: getSheetData(ss, 'Supervisor'),
    team: getSheetData(ss, 'Team'),
    skills: getSkillsData(ss),
    learning: getSheetData(ss, 'Learning'),
    meet: getSheetData(ss, 'Meet'),
    exam: getSheetData(ss, 'Exam'),
    tasks: getSheetData(ss, 'Task'),
    logs: getSheetData(ss, 'Log'),
    webAppUrl: webAppUrl,
    activeUserSession: session
  };
}

/**
 * Gets the active user's session data (email and name).
 */
function getActiveUserSession() {
  let email = "";
  try {
    email = Session.getActiveUser().getEmail();
  } catch (err) {
    // Handle sandboxed/unauthenticated views
  }
  email = email || "test.user@azar.com";
  let name = "";
  
  try {
    const ss = getSpreadsheet();
    const teamSheet = ss.getSheetByName('Team');
    if (teamSheet) {
      const lastRow = teamSheet.getLastRow();
      const lastCol = teamSheet.getLastColumn();
      if (lastRow >= 2 && lastCol >= 1) {
        const values = teamSheet.getRange(1, 1, lastRow, lastCol).getValues();
        const headers = values[0].map(h => String(h).trim().toLowerCase());
        const emailIdx = headers.indexOf('mail');
        const nameIdx = headers.indexOf('name');
        
        if (emailIdx !== -1 && nameIdx !== -1) {
          for (let i = 1; i < values.length; i++) {
            const row = values[i];
            if (String(row[emailIdx]).trim().toLowerCase() === email.trim().toLowerCase()) {
              name = String(row[nameIdx]).trim();
              break;
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Error finding user by email in getActiveUserSession:", err);
  }
  
  return {
    email: email,
    name: name || (email ? email.split('@')[0] : "Test User")
  };
}

/**
 * Handles HTTP POST requests to log a new event or create a custom event via standard JSON payload.
 */
function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const action = postData.action || "logEvent";

    if (action === "updateTask") {
      const result = updateTaskStatus(postData);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "createTask") {
      const result = createTask(postData);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "createEvent") {
      const type = postData.type;
      const name = postData.name;
      const invitedList = postData.invitedList || [];
      const dueDate = postData.dueDate || "";
      
      const result = logEvent(type, name, invitedList, dueDate, postData.email || postData.userName);
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "Event created successfully via POST (createEvent)",
        eventId: result.newId
      })).setMimeType(ContentService.MimeType.JSON);
      
    } else {
      // Default: logEvent
      const type = postData.type;
      const name = postData.name;
      const email = postData.email;
      const userName = postData.userName;
      const dueDate = postData.dueDate || "";
      
      const ss = getSpreadsheet();
      const teamSheet = ss.getSheetByName('Team');
      let invitedList = [];
      if (teamSheet) {
        const lastRow = teamSheet.getLastRow();
        if (lastRow >= 2) {
          const values = teamSheet.getRange(2, 1, lastRow - 1, 1).getValues();
          invitedList = values.map(r => r[0]);
        }
      }
      
      const result = logEvent(type, name, invitedList, dueDate, email || userName);
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "Event logged successfully via POST",
        eventId: result.newId
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Helper function to parse a sheet's rows into an array of objects.
 * Automatically serializes Date objects to formatted strings.
 */
function getSheetData(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return [];
  
  const range = sheet.getRange(1, 1, lastRow, lastCol);
  const values = range.getValues();
  
  const headers = values[0].map(h => h ? String(h).trim() : '');
  const activeHeadersLength = headers.filter(h => h !== '').length;
  
  const data = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    // Check if the row contains any content
    const hasData = row.some(cell => cell !== '' && cell !== null && cell !== undefined);
    if (!hasData) continue;
    
    const rowObj = {};
    for (let j = 0; j < activeHeadersLength; j++) {
      const header = headers[j];
      const val = row[j];
      
      if (val instanceof Date) {
        rowObj[header] = Utilities.formatDate(val, Session.getScriptTimeZone() || "GMT", "yyyy-MM-dd");
      } else {
        rowObj[header] = val;
      }
    }
    data.push(rowObj);
  }
  return data;
}

/**
 * Logs a new event to the 'Log' sheet.
 * Appends a row containing the type, generated Event ID, event name,
 * newline-separated list of invited members, and the open-window due date.
 */
function logEvent(type, name, invitedList, dueDate, actorEmail) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Log');
  if (!sheet) throw new Error("Log sheet not found");
  
  // Auto-increment Event ID based on current max ID in Column B (2)
  let maxId = 0;
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const ids = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      const id = parseFloat(ids[i][0]);
      if (!isNaN(id) && id > maxId) {
        maxId = id;
      }
    }
  }
  const newId = maxId + 1;
  
  // Format invited list to a newline-separated string
  const invitedStr = Array.isArray(invitedList) ? invitedList.join('\n') : String(invitedList);
  
  // Convert due date string to Date object
  let dateVal = "";
  if (dueDate) {
    const parts = dueDate.split('-');
    if (parts.length === 3) {
      dateVal = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      dateVal = new Date(dueDate);
    }
  }
  
  sheet.appendRow([type, newId, name, invitedStr, "", dateVal]);
  recordActivity(actorEmail || getActiveUserSession().email, 'logEvent', name, { type: type, eventId: newId });
  
  return { success: true, newId: newId };
}

/**
 * Registers attendance/completion of an event.
 * Appends the member's name to the newline-separated list in Column E (Attendees/Completed).
 */
function attendEvent(eventId, userName, userEmail) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Log');
  if (!sheet) throw new Error("Log sheet not found");
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error("No events found in Log");
  
  const ids = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  let rowIdx = -1;
  for (let i = 0; i < ids.length; i++) {
    if (parseFloat(ids[i][0]) === parseFloat(eventId)) {
      rowIdx = i + 2;
      break;
    }
  }
  
  if (rowIdx === -1) throw new Error("Event ID not found: " + eventId);
  
  const cell = sheet.getRange(rowIdx, 5);
  const attendeesVal = String(cell.getValue()).trim();
  
  let attendees = attendeesVal ? attendeesVal.split('\n').map(x => x.trim()) : [];
  const normUserName = userName.trim();
  
  if (!attendees.includes(normUserName)) {
    attendees.push(normUserName);
    cell.setValue(attendees.join('\n'));
  }
  recordActivity(userEmail || getActiveUserSession().email, 'attendEvent', eventId, { userName: normUserName });
  
  return { success: true };
}

/**
 * Re-opens a closed or overdue event by setting a new due date in the 'Log' sheet.
 */
function reopenEvent(eventId, newDueDate) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Log');
  if (!sheet) throw new Error("Log sheet not found");
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error("No events found in Log");
  
  const ids = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  let rowIdx = -1;
  for (let i = 0; i < ids.length; i++) {
    if (parseFloat(ids[i][0]) === parseFloat(eventId)) {
      rowIdx = i + 2;
      break;
    }
  }
  
  if (rowIdx === -1) throw new Error("Event ID not found: " + eventId);
  
  let dateVal = "";
  if (newDueDate) {
    const parts = newDueDate.split('-');
    if (parts.length === 3) {
      dateVal = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      dateVal = new Date(newDueDate);
    }
  }
  
  sheet.getRange(rowIdx, 6).setValue(dateVal);
  
  return { success: true };
}

/** Supports both the legacy "SKILLs" tab and the canonical "Skill" tab. */
function getSkillsData(ss) {
  const canonical = getSheetData(ss, 'Skill');
  return canonical.length ? canonical : getSheetData(ss, 'SKILLs');
}

/**
 * Updates a task row without changing the spreadsheet's existing column order.
 * The frontend sends the stable task title plus the fields the user edited.
 */
function updateTaskStatus(payload) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Task');
  if (!sheet) throw new Error("Task sheet not found");

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) throw new Error("No tasks found");
  const headers = values[0].map(h => String(h || '').trim());
  const titleCol = headers.indexOf('Task Title');
  const descriptionCol = headers.indexOf('Task description');
  const dodCol = headers.indexOf('Break down (DOD)');
  const assigneesCol = headers.indexOf('Assignees');
  const statusCol = headers.indexOf('Status');
  const scoreCol = headers.indexOf('Score');
  const feedbackCol = headers.indexOf('Feedback');
  const ataCol = headers.indexOf('ATA');
  const etaCol = headers.indexOf('ETA');
  const scaleCol = headers.indexOf('Scale');
  let archivedCol = headers.indexOf('Archived');
  if (titleCol < 0 || statusCol < 0) throw new Error("Task Title or Status column not found");
  if (archivedCol < 0) {
    archivedCol = headers.length;
    sheet.getRange(1, archivedCol + 1).setValue('Archived');
  }

  const wanted = String(payload.title || '').trim().toLowerCase();
  let rowNumber = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][titleCol] || '').trim().toLowerCase() === wanted) {
      rowNumber = i + 1;
      break;
    }
  }
  if (rowNumber < 0) throw new Error("Task not found: " + payload.title);

  if (payload.status !== undefined || payload.Status !== undefined) sheet.getRange(rowNumber, statusCol + 1).setValue(payload.status ?? payload.Status);
  if (titleCol >= 0 && (payload.newTitle !== undefined || payload.taskTitle !== undefined)) sheet.getRange(rowNumber, titleCol + 1).setValue(payload.newTitle ?? payload.taskTitle);
  if (descriptionCol >= 0 && payload.description !== undefined) sheet.getRange(rowNumber, descriptionCol + 1).setValue(payload.description);
  if (dodCol >= 0 && payload.dod !== undefined) sheet.getRange(rowNumber, dodCol + 1).setValue(payload.dod);
  if (assigneesCol >= 0 && payload.assignees !== undefined) sheet.getRange(rowNumber, assigneesCol + 1).setValue(Array.isArray(payload.assignees) ? payload.assignees.join(',') : payload.assignees);
  if (scoreCol >= 0 && (payload.score !== undefined || payload.Score !== undefined) && (payload.score ?? payload.Score) !== '') sheet.getRange(rowNumber, scoreCol + 1).setValue(Number(payload.score ?? payload.Score));
  if (feedbackCol >= 0 && (payload.feedback !== undefined || payload.Feedback !== undefined)) sheet.getRange(rowNumber, feedbackCol + 1).setValue(payload.feedback ?? payload.Feedback);
  if (ataCol >= 0 && (payload.ata !== undefined || payload.ATA !== undefined) && (payload.ata ?? payload.ATA) !== '') sheet.getRange(rowNumber, ataCol + 1).setValue(payload.ata ?? payload.ATA);
  if (etaCol >= 0 && payload.eta !== undefined) sheet.getRange(rowNumber, etaCol + 1).setValue(payload.eta);
  if (scaleCol >= 0 && payload.scale !== undefined) sheet.getRange(rowNumber, scaleCol + 1).setValue(payload.scale);
  if (payload.archived !== undefined) sheet.getRange(rowNumber, archivedCol + 1).setValue(payload.archived ? 'TRUE' : '');
  recordActivity(payload.email || getActiveUserSession().email, 'updateTask', payload.title, { status: payload.status || payload.Status || 'Pending', score: payload.score || payload.Score || '' });
  return { success: true, message: 'Task updated' };
}

/** Creates a task using the headers already present in the Task sheet. */
function createTask(payload) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Task');
  if (!sheet) throw new Error("Task sheet not found");
  const values = sheet.getDataRange().getValues();
  if (!values.length) throw new Error("Task sheet has no header row");
  const headers = values[0].map(h => String(h || '').trim());
  const row = headers.map(header => {
    const key = header.toLowerCase();
    if (key === 'task title') return payload.title || '';
    if (key === 'task description') return payload.description || '';
    if (key === 'break down (dod)') return payload.dod || '';
    if (key === 'assignees') return Array.isArray(payload.assignees) ? payload.assignees.join(',') : (payload.assignees || '');
    if (key === 'status') return payload.status || 'Pending';
    if (key === 'score') return payload.score || '';
    if (key === 'feedback') return payload.feedback || '';
    if (key === 'eta') return payload.eta || '';
    if (key === 'scale') return payload.scale || 'day';
    if (key === 'archived') return payload.archived ? 'TRUE' : '';
    return '';
  });
  sheet.appendRow(row);
  recordActivity(payload.email || getActiveUserSession().email, 'createTask', payload.title, { assignees: payload.assignees || [] });
  return { success: true, message: 'Task created' };
}

/** Writes an immutable audit row so every progress change is attributable to an account email. */
function recordActivity(email, action, target, details) {
  try {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('Activity');
    if (!sheet) {
      sheet = ss.insertSheet('Activity');
      sheet.appendRow(['Timestamp', 'Email', 'Action', 'Target', 'Details']);
    }
    sheet.appendRow([new Date(), email || '', action || '', String(target || ''), JSON.stringify(details || {})]);
  } catch (err) {
    console.error('Activity audit failed:', err);
  }
}
