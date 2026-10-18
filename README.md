# ASAR Team Hub

A Google Apps Script team dashboard backed by Google Sheets, with a matching local preview generated from the workbook in `spreedsheet-copy/ASAR-Team-Hub.xlsx`.

The interface has dedicated Tasks, Meetings, Learning, and Skills tabs. Tasks use board status; courses, meetings and required skills expose their personal actions on their cards. Completion logs hold submission records; Activity covers user actions, reviews, evidence, management changes and errors. Completed events have a green border, check mark, and explicit status label.

Creating an event responds immediately: the form closes and a saving draft appears while the backend runs asynchronously. Event saves reports success or keeps the draft with Retry save if confirmation fails. You can navigate and create other events meanwhile. Writes and refreshes are serialized, retries reuse stable IDs, and drafts never count as confirmed progress. Session storage retains unconfirmed fields across reloads when available; a restored draft waits for Retry or a refresh rather than silently resubmitting. A completed background save does not close a newer form.

New tasks, meetings and courses offer **Preview Telegram** after saving. Members can inspect the message; an explicitly listed admin must confirm **Send to Telegram**. Approved messages are delivered by a background worker, with status and retry history in Activity. Bot credentials remain in Apps Script settings. Follow [the Telegram setup guide](docs/telegram-setup.md) to create your bot and connect the team group. Local preview never posts messages.

The dashboard opens as a landing page: a purple/teal hero, circular personal progress graphic, floating skill/team details, and scroll-revealed chapters for progress, review stages, recorded strengths, next steps, upcoming meetings and team coverage. Every number comes from the current data. Both themes, keyboard focus and reduced-motion preferences are supported.

Team Intelligence keeps the searchable member directory and selected profile. Four personal progress bars remain before the radar matrix. Technology, Skills, Knowledge, Abilities and Personality appear as text-only lists directly below Overview & objective, using recorded fields without counters, ratings or progress bars; missing data is shown as empty. Team event counters have been removed from this page. The Completion logs and Activity tabs now follow Team Intelligence in navigation. Word/PDF exports and the new subteam hierarchy remain available.

Word and PDF CVs share a professional A4 layout with a prominent name and contact header, structured experience and engineering skills, and a compact toolkit/working-style sidebar. They use actual team appointments, completed or active project tasks and approved completed courses. Empty fields, placeholder values, internal ratings and event counters are omitted. Arabic names and profile text retain their reading direction; Word documents remain editable.

Preview the workbook-based example: [PDF](deliverables/cv-preview/Abdallah-Refaat-Allam-CV.pdf) or [editable Word document](deliverables/cv-preview/Abdallah-Refaat-Allam-CV.docx). These samples use the source workbook, without browser-test assignments.

All other actions respond immediately too: task moves, edits, completion requests, reviews, undo, evidence links, required skills, hierarchy and member removal. The UI projects changes with **Saving changes**, then reconciles the server reply. Failures roll back unconfirmed changes and retain **Retry update** in Event saves; newer choices remain visible while older requests finish. Stable command IDs prevent retries from duplicating submissions or assessment attempts. Uploads remain in memory for retry while the page stays open; in-progress update requests are not persisted across a full reload. CV exports use confirmed data. The app refreshes in the background when you return to its tab/window.

## Run locally

```powershell
python -m pip install -r requirements.txt
python sync_local_db.py
python -m http.server 8000 --bind 127.0.0.1
```

Open [the local dashboard](http://localhost:8000/local_test_dashboard.html). The preview account picker is available only locally. Local changes remain in the page session; use **Local database tools** to export changed tables before reloading CSVs. The generated page also supports `file://` using an identical embedded workbook snapshot. Fonts and runtime libraries load from pinned CDNs, so the initial page load needs internet access.

## Admins and hierarchy

The `Admins` sheet is manually maintained, with columns `Email`, `Name`, `Enabled`. Add an exact team email and set `Enabled` to `TRUE`. A name-only row is also supported when it uniquely matches a Team member. An email takes precedence if both fields are provided. `FALSE` disables the row. Roles do not automatically grant event management rights.

Initial configuration approved for this update:

| Member | Role | Provisional department |
| --- | --- | --- |
| Abdallah Refaat Allam | Team Leader and initial event admin | Entire team |
| Mohamed hamada shabaan | Leader | Software & AI |
| Abdelrhman Mohamed Abdelfttah Soliman | Leader | Electronics & Embedded |
| Mohamed farhat nasr ali | Leader | Mechanics & Integration |

An admin can change the distribution from **Team Intelligence -> Team hierarchy -> Edit distribution** or open **My subteams** from the dashboard. There is one overall Team Leader. Every subteam has one or more leaders; each person can lead, contribute as a Member, or Support multiple subteams. Member and leader views show their own subteams first, shared contributors, role badges and direct profile links. Leadership does not grant admin permission.

Enabled admins have an additional **Admin** badge beside their team roles in the hierarchy, directory, profile, dashboard and account header. The badge reflects the `Admins` sheet, including admins whose team role is Member or Support; disabled admins and leaders without explicit permission do not receive it.

`Subteams` stores ID, Name, Description, Color and Active. `TeamMemberships` stores Subteam ID, Member ID, Role (Leader/Member/Support) and Active. Team Role/Department/Reports To are compatibility summaries; normalized membership rows hold all relationships. Edits upsert rows and disable removed memberships or subteams so source rows remain stable. The importer migrates the current provisional departments once. Put exact historical names in Team `Aliases`, separated by newlines, to connect imported completions without guessing names.

New members use **Apply to join**, linked to the existing [ASAR Team Application form](https://docs.google.com/forms/d/e/1FAIpQLSclQb-3UAbKnRMVAmCxFr1gMiJ36KNIXpUnDx4-1vkJB7d55A/viewform?usp=dialog). Its separate [form-bound Apps Script and installation guide](forms/README.md) are included in the repo. Profile updates preserve roles, hierarchy and removal flags. Enable verified email collection and install the Form submission trigger as described in that guide.

Admins remove a selected member from **Team Intelligence → Remove member → Confirm removal**. This sets `Team.Active` to `FALSE` and disables their memberships, preserving their rows, completions, evidence and activity. Inactive members lose write access and are excluded from current assignments and progress denominators. Transfer the overall leadership or a sole subteam leadership first, and keep at least one enabled admin. Missing/blank Active flags remain compatible with existing sheets; the backend adds the column on the first removal. A later form submission cannot reactivate a removed member.

## Data model

| Sheet | Purpose |
| --- | --- |
| Team | Names, IDs, contacts, overview, recorded skill ratings, education, hierarchy, aliases |
| Admins | Manually maintained event-management permissions |
| Subteams | Named subteams, purpose, visual color and active state |
| TeamMemberships | Per-subteam leaders, members and supporters; multiple memberships per person |
| Task, Meet, Learning | Source events and assignments |
| SkillEvents | Hidden historical standalone assessments; prior records are retained and archived |
| SkillRequirements | Per-member project skill requirements: Member ID, Skill, Category, Required, optional Target Score |
| SKILLs / Skill | Skill catalogue; the existing two-header-row SKILLs sheet is supported |
| Log | Event-level invited/completed aggregates, linked through Source ID |
| Completion | Individual submission attempts, three-state review status, authenticated member, evidence attachment metadata, reviewer, feedback, review time and last status change |
| Activity | User actions, approvals, task evidence, settings changes and authenticated request errors with safe request IDs |
| Lookups | Member IDs/names/emails, event keys/titles, enabled reviewers, project skills and allowed dropdown values |
| Workbook Guide | Instructions for the workflow, permissions, evidence, lookups and deployment |

The importer preserves sparse columns, dates, multiline cells and all nonempty source cells. It canonicalizes the two-row skill catalogue into `Skill.csv` without truncating soft skills or technologies. Stable Event IDs prevent renames from disconnecting completion records. Legacy log-only events remain editable in their type tab.

Course, meeting and skill submissions are idempotent and per member. Tasks use shared board Status only: drag/drop or the status dropdown updates progress for all assignees, and moving away from Completed reverses that progress. No task completion form or personal completion entry is created. Historical task records remain stored. Deadlines stay open through the end of the date in Africa/Cairo. Tasks may be archived; courses cannot. Missing ratings and qualifications stay missing.

Courses and meeting attendance use **Uncompleted → Pending → Completed**. Evidence is optional for both: submit without a file, or attach a PDF, PNG or JPEG up to 10 MB. Supplied files are still validated and shared with reviewers. Submitting never increases progress: an explicitly listed admin must approve it. Returning a submission requires feedback and restores Uncompleted. Required skills retain direct completion. Course cards show **Request completion**, meeting cards show **Log attendance**, and required skill cards show **Complete**. These actions are independent of event settings. Closed actions stay visible with an explanation; pending and approved cards show withdrawal/undo controls where supported.

To approve attendance, open **Meetings → Review attendance** on the meeting card, select the attendee if several are pending, then choose **Approve completion**. The Attendance approvals queue above the cards provides the same review flow. Admins can also open **Completion logs → Pending review** and review an individual record there. This includes the admin's own attendance. Meetings, Learning and Completion logs display pending-review counts for admins; their event Pending review filter covers all members awaiting approval. Historical attempts and withdrawn submissions are excluded from review actions.

Members can **Withdraw submission** while Pending or **Undo completion** after approval, including imported historical completions. Undo always returns their own status to Uncompleted and removes that completion from progress and Log aggregates. It is allowed after deadlines or assignment changes. Resubmission still requires current eligibility, an open deadline, meeting logging permission where applicable, and a fresh admin review. Previous attempts, evidence, reviewer details and status-change audit remain recorded; stale or withdrawn attempts cannot be approved.

The `Completion` sheet adds `Submission ID`, `Status`, `Evidence File ID`, `Evidence URL`, `Evidence Filename`, `Evidence MIME Type`, `Evidence Size`, `Reviewer Email`, `Reviewer Name`, `Reviewed At`, `Review Note`, `Status Changed At`, and `Status Changed By`. The latest attempt for each event/member controls current status. Existing blank-status completions and imported Log totals remain accepted historical data; no reviewer is invented. Use app actions for review and undo so the aggregate Log and Activity audit stay synchronized.

Production uploads are saved in the submitting user's **ASAR Team Hub - Evidence** Drive folder. Each attachment is shared with the currently enabled admins and its ID/URL are written to the sheet; file bytes are not stored in cells. Uploads are validated before Drive is touched, retries do not create duplicate files, and failures before persistence remove the unused file. [Google's Drive file API](https://developers.google.com/apps-script/reference/drive/file) defines these attachment and sharing operations. If a new admin needs to review older evidence, the file owner must share it with that admin. Local preview attachments are downloadable session-only files, not persistent Drive uploads.

The styled, import-ready delivery is [`deliverables/ASAR-Team-Hub-Updated.xlsx`](deliverables/ASAR-Team-Hub-Updated.xlsx). It matches the source workbook and includes a guide, named dropdown lists, member/event lookup formulas in Completion, freeze panes, filters, rating validation, review-state colors and upcoming-meeting highlighting. The original Exam data is preserved in a hidden inactive tab. Run `python tools/style_workbook.py` to refresh styling, roster/event lookups, CSVs, generated interfaces and the delivery copy after changing source data. Excel or Google Sheets calculates lookup formulas on opening.

Required skills initially follow each member's recorded Hard Skill, Soft Skill, and Technology entries. Admins can override these in Skills using the project catalogue. `SkillRequirements` rows use the member's ID and exact Category/Skill, with `Required` set to `TRUE` or `FALSE`; an optional target rating is shown on the skill card. Requirement changes preserve recorded ratings and past completions. Members can use **Update result** or **Reset skill** on their own skill cards without opening event settings. Updates append an assessment attempt; reset clears completion and excludes that event's assessment from the current matrix while preserving original Team ratings and history. Re-completing records a fresh result. Viewing another member never exposes controls to log on their behalf.

Admins can drag tasks between Kanban columns or use the status selector. Both actions save the shared status through authenticated server checks and update progress for all assignees.

Meeting `Date` is the scheduled date. `Logging Enabled` must be `TRUE` for attendance logging; admins can open or close it in the meeting editor. A scheduled date alone does not close logging. An explicit `Due to Date` remains the completion deadline. Upcoming meetings have a separate section and a highlighted date card. Exams have been removed from the app, progress, and exports; the original workbook data remains preserved.

Meeting URLs have a direct **Join meeting** hyperlink, and the attendance switch stays in admin settings. Task assignees and admins can use **Add evidence link** on a task card with a single URL field. Purpose and note fields are removed; older stored metadata stays intact. Authors can remove their own links and admins can remove any; removal preserves history. The app-managed `Task.Evidence Links` column stores attribution without adding another sheet. These actions never change task status. Learning and meeting submissions retain their optional evidence fields.

Activity opens from cached data and refreshes in the background. It shows 40 entries at a time with Show more, searches cached text, and filters by member or by submissions, reviews, task evidence, management changes and errors. Expand View details for account, action, event and request IDs. Error auditing records the authenticated actor and a short error, excluding uploads and full payloads.

`python sync_local_db.py --upgrade-schema` adds missing columns/sheets and stable IDs, preserving an initial `ASAR-Team-Hub.before-schema.xlsx` backup. The already-run `--provisional-distribution` option is a one-time initializer for the distribution above; do not rerun it after making your own distribution changes.

## Essential event forms

Tasks ask for title, description, assignees, status and due date. Meetings ask for title, date, participants, link/location and whether attendance logging is open. Courses ask for title, course link and assigned members. Course track/requirement/deadline and meeting attendance deadline are grouped under Optional settings. Assignment pickers include search. Duration units, task scoring/feedback, track numbers, platform, meeting type and related-skill fields have been removed from active forms. Old values remain in hidden workbook columns and are preserved during edits.

The Skills page has no standalone assessment section or creation control; admins manage each member's required project skills.

## Edit and verify

Edit `web/app.jsx`, `web/theme.css`, `web/model.js`, `web/cv.js`, `web/sync.js`, `web/actions.js`, `web/telegram.js`, `web/local.js`, and `web/backend.gs`. The generator embeds the same React application, CV layouts, notification formatter, styles and data model into both dashboards and the Apps Script server. Generated `Index.html`, `local_test_dashboard.html`, and `Code.gs` are ready to use without a build step in Apps Script.

```powershell
python tools/build_dashboard.py
npm ci
npm test
npm run test:browser
python -m unittest discover -s tests -p data_audit.py -v
git diff --check
```

Browser checks use installed Chrome (override with `PLAYWRIGHT_CHANNEL`), start their own localhost server, and exercise desktop/tablet/mobile in both themes, text contrast, event permissions and completions, hierarchy updates, production RPC, embedded fallback, and real Word/PDF downloads. Screenshots, sample CVs, and reports are written to ignored `test-results/`.

Verification covers model/server transitions, evidence storage and failures, the full review/undo UI, scroll visuals and reduced motion, all eight tabs at 1440/768/390 pixels in both themes, text contrast, Word/PDF exports, source-cell preservation, lookup/schema integrity and delivery-workbook parity. Reports and artifacts are written to `test-results/`.

Verified on 2026-10-18: all 66 model/server/background-update/form/Telegram tests, 26 browser workflows and 8 data/workbook/CV audits passed. New coverage holds server replies to verify immediate task moves, URL evidence, learning submissions, reviews, failure rollback, safe retries and preservation of newer forms. Member removal tests preserve source rows/history, deny inactive accounts, update denominators and protect required leaders/admins. Form tests cover verified identities, sparse headers, profile aliases and preserved roles/removal flags. Existing Telegram, completion/undo, hierarchy, responsive themes, contrast and professional CV checks pass. Browser reports show no failures or script errors. Live deployment and Google Form trigger installation remain separate setup steps.

## Apps Script deployment

1. Import `deliverables/ASAR-Team-Hub-Updated.xlsx` into Google Sheets, or apply its additional sheets/columns to an existing live sheet while preserving live records. Retain the Admins list, Team hierarchy and new Completion fields. Set `SPREADSHEET_ID` in `web/backend.gs` if importing into a new spreadsheet, then rebuild.
2. Replace the Apps Script `Code.gs` and `Index` files with generated `Code.gs` and `Index.html`.
3. Set the project's timezone to **Africa/Cairo**.
4. Deploy a web app with **Execute as: User accessing the web app** and restrict access to signed-in Google accounts. Allow the requested Drive authorization for evidence uploads. Each user needs spreadsheet permissions for the operations they perform. The app checks the authenticated active-user email against Team and Admins on every mutation. Do not deploy anonymously or substitute a payload email for identity. [Google documents when active-user email is unavailable](https://developers.google.com/apps-script/reference/base/session).
5. Verify a real admin and a real member account after deployment. Local tests exercise the production adapter and server contract; they do not publish or verify a hosted deployment.

For an existing deployment with live sheet edits, update the script files and deploy a new version without replacing the spreadsheet. The backend adds the app-managed `Task.Evidence Links` column on its first task-link write.

Writes use confirmed Apps Script RPC responses; the JSON POST endpoint applies the same authorization and validation. No opaque `no-cors` response is treated as a successful write. Apps Script writes are serialized with a script lock to prevent simultaneous completions from overwriting one another.
