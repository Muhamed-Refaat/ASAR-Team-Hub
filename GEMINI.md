# Repository Mandates & Rules

Welcome to the **Azar Project Team Dashboard** repository. To maintain structural consistency, all developers must strictly adhere to the following standards.

## 🚨 Synchronization Mandate
*   **Production & Local Interface Parity**: Any feature, styling, script, or bug-fix implemented in the production files (`Code.gs` and `Index.html`) **MUST** have a corresponding, mirrored implementation in the local test dashboard (`local_test_dashboard.html`).
*   **Database Alignment**: If any modification is made to the production Google Sheet database structure, corresponding modifications **MUST** be applied to:
    1.  The separate local CSV database files in the `spreedsheet-copy/` directory.
    2.  The embedded mock fallback data strings in `local_test_dashboard.html`.
*   **Utility Sync Script**: Always use the **`sync_local_db.py`** script to parse and regenerate the local CSV database tables from the master Excel workbook. Do not edit `.csv` files manually unless synchronized with the Excel workbook.

## 📊 Database Schema & Sheets
The master Excel workbook (`spreedsheet-copy/ASAR-Team-Hub.xlsx`) consists of the following synchronized sheets (the obsolete `Skill` sheet has been deleted):
1.  **`Supervisor`**: Name, phone
2.  **`Team`**: Name, ID, Mail, Phone number, Rule, overview, Hard Skill, Soft Skill, Technology, Personality, Abilities, Education
    *   *Note*: Member skills and competencies are integrated directly as structural, serialized rating blocks within the respective columns (e.g., `Hard Skill`, `Soft Skill`, `Technology`) rather than using a separate sheet.
3.  **`Learning`**: Topic name, Track ID, Track Name, Obligability, Skill, Platform, Link
    *   *Note*: Courses map to target skills using the `Skill` column, powering the educational directory filters.
4.  **`Meet`**: Meeting title, Meeting Type, Date, Description, Attachments
5.  **`Exam`**: Exam name, Date, Category , # Attendee
6.  **`Task`**: Task Title, Task description, Break down (DOD), Assignees, Status, Score, Feedback, ETA, ATA, Scale
7.  **`Log`**: Event Type, Event ID, Event Name, Invited/Assigned, Attendees/Completed, Due to Date

## 📋 Comprehensive Upgrade Project Plan
The `plan-copy/` directory contains our master engineering blueprint, **Architectural Transformation for Autonomous Mobile Robotics**:
*   `ASAR ROBOT Plan .docx`: Master Word document.
*   `ASAR ROBOT Plan.html`: Beautiful, interactive standalone web application for the team plan.
*   **Core Systems Blueprint**:
    *   **3-Tier Compute Architecture**: Embedded Linux (Raspberry Pi 4/5) ➔ RTOS/Navigation Router (ESP32 Gateway) ➔ Motor Actuation/Sensing (Arduino Mega 2560).
    *   **EKF State Fusion**: Extended Kalman Filter merging MPU-6050 accelerometer/gyroscope telemetry and wheel encoders.
    *   **Power Isolation & Protection PCB**: 3 isolated power rails (5V Logic, 9V Gate, 12.6V Motor) to decouple logic compute from high-current actuator noise.
    *   **Arabic Educational Path**: 7 comprehensive modules mapped directly to 10 key technical domains.

## 🛠️ Tech Stack & Conventions
*   **Aesthetics**: Follow the **SaaS Minimalist** design standard—light background primary, thin borders (`1px`), generous white space, soft shadows, and clean sans-serif typography (`Plus Jakarta Sans`).
*   **Reactivity**: Built with client-side **React 18** and **Tailwind CSS**. Avoid injecting bloated libraries; leverage lightweight CDNs.
*   **Charts**: Always use **ApexCharts** for interactive data representation (radar, donut, columns, area).
*   **Icons**: Use **Lucide Icons** via the React `<Icon />` wrapper component to maintain unified iconography.
*   **Active Session Handling**: Fetch active user session details (Email & Name) from the Google Apps Script backend on application start. The name is automatically resolved from the `Team` sheet using the session email, falling back to the email prefix.
*   **Event Log POST Integration**: Form submissions to log new events must package parameters into a JSON object and submit to the Web App URL via HTTP POST (`doPost(e)`). Fallback to standard Google Apps Script RPC (`google.script.run.logEvent`) if POST submission fails or the URL is not retrieved.

## 🧪 Local Testing Workflow
*   Never merge code that has not been verified locally using the CORS Server simulation in `local_test_dashboard.html`.
*   Run `python -m http.server 8000` or `npx serve` locally to test dynamic CSV table reads and writes.
*   **Synchronizing local CSVs**: Run the command below to sync local CSV files from the Excel workbook:
    ```bash
    python sync_local_db.py
    ```
