# Azar Project Team Dashboard

Azar Project Team is a highly interactive, collaborative team management and intelligence dashboard. It is designed to track team members, roles, skill metrics, task assignments, and calculate attendance rates for events and learning tracks.

This application is built as a **Google Apps Script (GAS) Web App**, utilizing Google Sheets as a lightweight, secure backend database.

## 🚀 Key Features

*   **Simulated Login Dropdown**: Easily switch between all synchronized team members (fully dynamic as the team grows) to audit individual dashboards and permission roles (stores profile in browser `localStorage`).
*   **Dynamic Skill Radar Chart**: Compiles member skills dynamically based on your `Skill` sheet columns, completed sheet logs, tasks, and team roles (scales automatically as new skill records are added!).
*   **Live Webcast Alerts**: Webcasts the latest created event from the sheet and issues warnings/notifications if a user has active or overdue tasks.
*   **Deadline Lock Protocol**: Closed/Overdue events are locked from completion. Team Leads can re-open events by setting new due dates directly from the web interface.
*   **Grouped Learning Tracks UI**: Courses fetched from the `Learning` sheet are grouped dynamically by learning track phase. The dashboard dynamically renders tracking boundaries, UI badges (e.g., Mandatory/Optional, Estimated Hours), track-level overview metadata, and computed progress bars using standard Vanilla JS mapping directly inside the React app. (Accessible via the backend `?action=learning` JSON API).
*   **Team Intelligence Hub**: Compiles a performance card for all members. Clicking on a card opens a modal detailing their dynamic skill mapping and task statistics.

---

## 🛠️ Repository File Structure

*   **`Code.gs`**: The production Apps Script server-side database controller (manages spreadsheet reads and mutations).
*   **`Index.html`**: The production Apps Script frontend template. Built on client-side React 18, Tailwind CSS, ApexCharts, and Lucide.
*   **`local_test_dashboard.html`**: A fully functional local testing dashboard. Mocks Google Sheets by loading separate CSV database tables.
*   **`sync_local_db.py`**: A python synchronization utility script. Parsed and extracts separate `.csv` tables from the master Excel workbook.
*   **`spreedsheet-copy/`**: Contains the separate CSV database files (`Team.csv`, `Learning.csv`, `Log.csv`, etc.) parsed by the local test dashboard, alongside the master Excel backup (`ASAR-Team-Hub.xlsx`).
*   **`GEMINI.md`**: Foundational repository rules and synchronization mandates.

---

## 🧪 Local Testing Workflow

To prevent regressions, you should test all features locally using separate CSV database files before deploying to production.

### 1. Synchronize Local CSV Databases
If you have updated the master Excel workbook (`spreedsheet-copy/ASAR-Team-Hub.xlsx`), or to re-generate the CSV sheets from scratch, execute:
```bash
python sync_local_db.py
```
This script dynamically parses, filters, and standardizes dates and formats from Excel sheets, exporting clean CSV arrays under `spreedsheet-copy/`.

### 2. Launch Local Test Dashboard
1.  Open your terminal in the repository root directory:
    ```bash
    cd ASAR-Team-Hub
    ```
2.  Start a local HTTP web server:
    *   **Python**: `python -m http.server 8000`
    *   **Node**: `npx serve`
3.  Open your browser and navigate to:
    ```
    http://localhost:8000/local_test_dashboard.html
    ```
4.  Perform logs, complete tasks, or re-open events. Use the **Sheets API Console** at the bottom of the screen to inspect execution logs in real-time.
5.  Click the **Export Updated Log.csv** button in the console to download updated logs from your local session.

> 🚨 **CORS Note**: Opening `local_test_dashboard.html` directly as a `file://` URL will run in "Local Preview (Embedded Fallback)" mode due to browser disk security limits. To fetch separated CSV sheets from the disk, a local server is required.

---

## 📦 Production Deployment

To publish your dashboard live in your Google Workspace:

1.  Open your [Google Sheets Database](https://docs.google.com/spreadsheets/d/188lG-b__CVXFxj2ebrGXilpfw8-Y7Q-O9KrGzkOWqkU/edit?gid=103397222#gid=103397222).
2.  Navigate to **Extensions** > **Apps Script**.
3.  Replace the default code in `Code.gs` with the content of `Code.gs` from this repository.
4.  Create a new HTML file named `Index` and paste the contents of `Index.html` from this repository.
5.  Save your project.
6.  Click **Deploy** > **New deployment** > **Web app**:
    *   **Execute as**: `Me`
    *   **Who has access**: `Anyone`
7.  Deploy and navigate to your production URL.

---

## 🚨 Synchronization Mandate

As defined in **`GEMINI.md`**, any edit, styling correction, feature addition, or schema update made to the production files (`Code.gs` and `Index.html`) **MUST** be mirrored in `local_test_dashboard.html` (and the local CSV directory) to keep development and local verification completely in sync.
