# Team applications

New members apply through the existing [ASAR Team Application form](https://docs.google.com/forms/d/e/1FAIpQLSclQb-3UAbKnRMVAmCxFr1gMiJ36KNIXpUnDx4-1vkJB7d55A/viewform?usp=dialog). The hub links to it from Overview and Team Intelligence. It does not create members through a separate in-app form.

`TeamApplications.gs` is the form-bound version of the supplied `onFormSubmit` script. It keeps the spreadsheet ID and skill-grid format, with writes matched to column headers. Existing Role/Rule, Department, Reports To, aliases, education, extra skills, formulas and Active flags remain intact. New identities join as active Team members; the Admins sheet remains manually controlled. Resubmitting a removed member's application does not reactivate them.

1. Open the Google Form in edit mode, then open its Apps Script editor and replace the previous form script with `TeamApplications.gs`. Install it in the form project, separately from the hub's `Code.gs`.
2. In the form's settings, set **Collect email addresses → Verified**. The submitted Mail must match that signed-in Google account. This prevents a respondent from updating another member's identity/profile by typing their email or ID. The existing Full name, ID, Mail, Phone number, Overview and three rating grids are supported.
3. Add one installable trigger for `onFormSubmit`: **From form → On form submit**. Authorize the script owner's spreadsheet access. Remove the old duplicate submission trigger if one already exists. A spreadsheet-bound `namedValues` trigger is a different event type and is rejected.
4. Submit the real form using an authorized test applicant. Confirm a new Team row or the correct existing profile was updated, hierarchy fields stayed intact, and Activity contains a `teamApplication` entry. Refresh the hub to load that member. Repository tests exercise the trigger with fake responses and sheets; they do not submit a real application.

An existing record must match both ID and Mail. Conflicting IDs/emails fail rather than merging two members or changing account ownership. The form reads new skill ratings but never grants event management rights. The trigger uses a lock to prevent concurrent form submissions from appending duplicate identities; existing rows are updated one field at a time, preserving unrelated cells.

When a verified member updates their full name, the exact previous name is retained in Aliases so existing assignments and historical attendance still resolve to the same ID.

Admins remove members from **Team Intelligence → select member → Remove member → Confirm removal**. This sets Team Active to FALSE and disables their subteam memberships; it preserves their profile, completions, evidence and activity. The overall Team Leader, a subteam's sole leader, and the last enabled admin must be replaced before removal. To restore someone later, an admin can set Team Active to TRUE in the sheet and restore their distribution; previous records remain available.
