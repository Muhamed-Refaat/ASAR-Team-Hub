# Repository rules

## Synchronization

- Keep production and local interfaces identical. Edit shared `web/` sources and run `python tools/build_dashboard.py` to regenerate `Index.html`, `local_test_dashboard.html`, and `Code.gs`.
- Use `python sync_local_db.py` to import the workbook and regenerate CSVs plus the embedded local fallback. Do not hand-edit CSVs without updating the workbook.
- Schema changes must be reflected in the workbook, CSVs, local adapter, and Apps Script controller. Preserve nonempty source cells.

## UI and data

- Use React 18, lightweight pinned CDNs, Lucide icons and ApexCharts. Shared CSS uses consistent spacing and accessible light/dark design tokens, Plus Jakarta Sans with an Arabic font fallback, visible keyboard focus, and responsive layouts.
- Missing ratings and qualifications stay missing. Display only recorded profile, education, task, assessment and completion data in the interface and CVs.
- CVs use shared web/cv.js layouts for Word and PDF: a professional A4 header, two-column content and toolkit sidebar. Omit placeholders, empty sections, internal ratings and participation counters. Include actual team appointments, completed or active project work, and approved completed learning; never present pending learning or backlog assignments as experience.
- Event management belongs in Tasks, Meetings, Learning, and Skills; Exams is inactive. Learning courses cannot be archived. Meeting attendance requires the admin-controlled Logging Enabled flag. Required skills follow per-member sheet definitions and SkillRequirements overrides.
- Team Intelligence uses the searchable member directory and selected profile, with the member's progress graph before the radar matrix. Show Technology, Skills, Knowledge, Abilities and Personality as text-only lists directly below the overview using recorded data; no counters, ratings or progress bars in these lists, and no team event-counter section. Completion logs and Activity follow Team Intelligence in navigation.
- Event management belongs in the dedicated event tabs. Tasks have a separate management action. Completion records belong in Completion logs; Activity displays management changes.
- Only explicitly listed Admins can create/edit/archive/reopen events, review submissions or edit distribution. A leadership role alone is not authorization. Courses and attendance use Uncompleted/Pending/Completed; pending records never count as completed. Course submission requires PDF/PNG/JPEG evidence up to 10 MB, stored in Drive with sheet metadata. Attendance evidence is optional. Preserve all attempts and review history. Members can withdraw pending or undo approved records; stale reviews must fail. Task completion follows board Status only; no completion form or personal task completion writes. Skills retain direct completion.
- The dashboard is a landing page with real progress visuals, scroll reveals and reduced-motion support. Keep styling, lookups and the delivery copy synchronized using tools/style_workbook.py when changing workbook data/schema.
- The production backend must authorize from `Session.getActiveUser().getEmail()`. Never trust payload identities, substitute the effective user, or default to the first team member.
- Keep exactly one overall Team Leader. Subteams have one or more leaders. TeamMemberships stores one Leader/Member/Support role per member per subteam, and members can belong to several subteams. Derive compatibility Team Role/Department/Reports To summaries from these relationships. Leadership grants no Admins permissions. Disable removed settings rows rather than deleting or reordering them.
- Skills shows required project skills only, with Update result and Reset skill for the signed-in member. Retain all attempts and original ratings; only the latest completed assessment per event affects the skill matrix. Prior standalone assessments remain archived history. Completion/request controls for courses, meetings and skills stay on event cards. Tasks use drag/drop or the status dropdown.
- Event creation uses only essential type-specific fields in HubModel.EVENT_FORM_FIELDS/EVENT_COLUMNS. Preserve legacy source cells; hide obsolete columns in the workbook and avoid overwriting them during edits. Extra course/meeting details stay in optional settings.
- Legacy aliases are explicit, never guessed. Retain historical invited/completed totals when names cannot yet be linked to current members.

## Verification

Run the model/backend tests, the real local browser workflow, and the data/CV audit before declaring changes complete. Browser evidence must cover responsive layouts, text contrast, permission controls, completion and matrix updates, hierarchy and CV exports. Follow the deployment steps in README when publishing; a local mock is not proof of a hosted deployment.
