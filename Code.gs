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
    .setTitle('Azar Project Team')
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
  
  return {
    supervisor: getSheetData(ss, 'Supervisor'),
    team: getSheetData(ss, 'Team'),
    skills: getSheetData(ss, 'Skill'),
    learning: getSheetData(ss, 'Learning'),
    meet: getSheetData(ss, 'Meet'),
    exam: getSheetData(ss, 'Exam'),
    tasks: getSheetData(ss, 'Task'),
    logs: getSheetData(ss, 'Log')
  };
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
function logEvent(type, name, invitedList, dueDate) {
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
  
  return { success: true, newId: newId };
}

/**
 * Registers attendance/completion of an event.
 * Appends the member's name to the newline-separated list in Column E (Attendees/Completed).
 */
function attendEvent(eventId, userName) {
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
