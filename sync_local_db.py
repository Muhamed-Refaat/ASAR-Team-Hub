"""Import the supplied workbook, preserve sparse headers, and rebuild local data/UI."""
import argparse
import csv
import datetime as dt
from pathlib import Path
import shutil
import uuid
import openpyxl

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'spreedsheet-copy'
WORKBOOK = DATA / 'ASAR-Team-Hub.xlsx'
NEW_SHEETS = {
    'Admins': ['Email', 'Name', 'Enabled'],
    'SkillEvents': ['Event Name', 'Target Skill', 'Description', 'Date', 'Event ID', 'Invited/Assigned', 'Due to Date', 'Archived', 'Skill Category'],
    'Completion': ['Timestamp', 'Event Type', 'Event ID', 'Event Name', 'Member ID', 'Name', 'Email', 'Evidence', 'Score',
                   'Submission ID', 'Status', 'Evidence File ID', 'Evidence URL', 'Evidence Filename', 'Evidence MIME Type', 'Evidence Size',
                   'Reviewer Email', 'Reviewer Name', 'Reviewed At', 'Review Note', 'Status Changed At', 'Status Changed By'],
    'SkillRequirements': ['Member ID', 'Skill', 'Category', 'Required', 'Target Score'],
    'Subteams': ['Subteam ID', 'Name', 'Description', 'Color', 'Active'],
    'TeamMemberships': ['Subteam ID', 'Member ID', 'Role', 'Active'],
}

def upgrade(wb):
    for name, headers in NEW_SHEETS.items():
        if name not in wb:
            wb.create_sheet(name).append(headers)
        else:
            sheet = wb[name]
            existing = {str(c.value).strip(): c.column for c in sheet[1] if c.value is not None and str(c.value).strip()}
            last = max(existing.values(), default=0)
            for column in headers:
                if column not in existing:
                    last += 1
                    sheet.cell(1, last, column)
                    existing[column] = last
    for name, columns in {
        'Team': ['Role', 'Reports To', 'Department', 'Aliases', 'Knowledge', 'Skills'],
        'Task': ['Event ID', 'Due to Date'],
        'Meet': ['Event ID', 'Invited/Assigned', 'Due to Date', 'Archived', 'Logging Enabled'],
        'Exam': ['Event ID', 'Invited/Assigned', 'Due to Date', 'Description', 'Archived'],
        'Learning': ['Event ID', 'Invited/Assigned', 'Due to Date', 'Description', 'Archived'],
        'Log': ['Source ID', 'Archived'],
    }.items():
        sheet = wb[name]
        headers = {str(c.value).strip(): c.column for c in sheet[1] if c.value is not None}
        last = max(headers.values(), default=0)
        for column in columns:
            if column not in headers:
                last += 1
                sheet.cell(1, last, column)
                headers[column] = last
        if name in ('Task', 'Meet', 'Exam', 'Learning'):
            for r in range(2, sheet.max_row + 1):
                if sheet.cell(r, 1).value and not sheet.cell(r, headers['Event ID']).value:
                    sheet.cell(r, headers['Event ID'], f'{name.lower()}-{uuid.uuid4().hex[:16]}')
        if name == 'Team':
            for r in range(2, sheet.max_row + 1):
                if sheet.cell(r, 1).value and not sheet.cell(r, headers['Role']).value:
                    sheet.cell(r, headers['Role'], 'Team member')
    # Migrate the existing provisional departments once. IDs match the shared model fallback.
    if wb['Subteams'].max_row == 1 and wb['TeamMemberships'].max_row == 1:
        sheet = wb['Team']
        columns = {str(c.value).strip(): c.column for c in sheet[1] if c.value}
        members = [r for r in range(2, sheet.max_row + 1) if sheet.cell(r, columns['Name']).value]
        names = list(dict.fromkeys(str(sheet.cell(r, columns['Department']).value or '').strip() for r in members))
        names = [name for name in names if name]
        colors = ['purple', 'teal', 'blue', 'amber', 'rose']
        for i, name in enumerate(names):
            wb['Subteams'].append([f'legacy-{i+1}', name, '', colors[i % len(colors)], True])
        for r in members:
            name = str(sheet.cell(r, columns['Department']).value or '').strip()
            if not name: continue
            role = 'Leader' if str(sheet.cell(r, columns['Role']).value).strip() == 'Leader' else 'Member'
            wb['TeamMemberships'].append([f'legacy-{names.index(name)+1}', str(sheet.cell(r, columns['ID']).value).removesuffix('.0'), role, True])
    # The Skills page now manages requirements only. Keep old assessments as archived history.
    for name in ('SkillEvents', 'Log'):
        sheet = wb[name]
        columns = {str(c.value).strip(): c.column for c in sheet[1] if c.value}
        for r in range(2, sheet.max_row + 1):
            is_skill = name == 'SkillEvents' or str(sheet.cell(r, columns['Event Type']).value or '').strip() == 'Skill'
            source_id = str(sheet.cell(r, columns.get('Source ID', columns.get('Event ID'))).value or '')
            if is_skill and not source_id.startswith('required-'):
                sheet.cell(r, columns['Archived'], True)

def initialize_distribution(wb):
    """One-time provisional distribution explicitly requested by the user."""
    sheet = wb['Team']
    headers = {str(c.value).strip(): c.column for c in sheet[1] if c.value}
    members = [r for r in range(2, sheet.max_row + 1) if sheet.cell(r, headers['Name']).value]
    heads = [r for r in members if str(sheet.cell(r, headers['Name']).value).strip().lower() == 'abdallah refaat allam']
    if len(heads) != 1:
        raise ValueError('Cannot uniquely identify the requested Team Leader.')
    head = heads[0]
    leader_rows = [members[i] for i in (2, 4, 6)]
    departments = ['Software & AI', 'Electronics & Embedded', 'Mechanics & Integration']
    def member_id(row):
        return str(sheet.cell(row, headers['ID']).value).removesuffix('.0')
    for index, row in enumerate(members):
        if row == head:
            role, parent, department = 'Team Leader', '', ''
        elif row in leader_rows:
            role, parent, department = 'Leader', member_id(head), departments[leader_rows.index(row)]
        else:
            manager = leader_rows[index % len(leader_rows)]
            role, parent, department = 'Team member', member_id(manager), departments[leader_rows.index(manager)]
        sheet.cell(row, headers['Role'], role)
        sheet.cell(row, headers['Reports To'], parent)
        sheet.cell(row, headers['Department'], department)
    sheet.cell(head, headers['Aliases'], 'Abdallah Allm\nAbdallah-Allam\nAbdallah Refaat')
    admins = wb['Admins']
    if not any(c.value for row in admins.iter_rows(min_row=2) for c in row):
        admins.append([sheet.cell(head, headers['Mail']).value, sheet.cell(head, headers['Name']).value, True])

def serialize(value):
    if isinstance(value, dt.datetime):
        return value.isoformat(sep=' ', timespec='seconds') if value.time() != dt.time() else value.date().isoformat()
    if isinstance(value, dt.date):
        return value.isoformat()
    if value is None:
        return ''
    if isinstance(value, bool):
        return 'TRUE' if value else 'FALSE'
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return '\n'.join(line.rstrip() for line in str(value).split('\n')).rstrip()

def sync_database(upgrade_schema=False, provisional_distribution=False):
    if not WORKBOOK.exists():
        raise FileNotFoundError(WORKBOOK)
    if upgrade_schema or provisional_distribution:
        backup = DATA / 'ASAR-Team-Hub.before-schema.xlsx'
        if not backup.exists():
            shutil.copy2(WORKBOOK, backup)
        wb = openpyxl.load_workbook(WORKBOOK)
        upgrade(wb)
        if provisional_distribution:
            initialize_distribution(wb)
        wb.save(WORKBOOK)
        wb.close()
    wb = openpyxl.load_workbook(WORKBOOK, data_only=True)
    for sheet in wb:
        output_name = 'Skill' if sheet.title.lower() in ('skill', 'skills') else sheet.title
        if output_name == 'Skill' and str(sheet.cell(2, 1).value).upper() == 'SKILL':
            header_row = 2
            headers = ['Hard Skill', 'Technical Competency', 'Specific Technical Application', 'Soft Skill', 'Description', 'Engineering Layer', 'Technology', 'Function in Architecture']
            columns = list(range(1, 9))
        else:
            header_row = 1
            columns = [c.column for c in sheet[1] if c.value is not None and str(c.value).strip()]
            headers = [str(sheet.cell(1, c).value).strip() for c in columns]
        if not headers:
            continue
        with (DATA / f'{output_name}.csv').open('w', newline='', encoding='utf-8') as handle:
            writer = csv.writer(handle)
            writer.writerow(headers)
            count = 0
            for r in range(header_row + 1, sheet.max_row + 1):
                values = [sheet.cell(r, c).value for c in columns]
                if any(v is not None and str(v).strip() for v in values):
                    writer.writerow([serialize(v) for v in values])
                    count += 1
        print(f'{output_name}: {count} records')
    wb.close()
    from tools.build_dashboard import build
    build()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--upgrade-schema', action='store_true')
    parser.add_argument('--provisional-distribution', action='store_true', help='One-time: initialize the distribution approved by the user.')
    args = parser.parse_args()
    sync_database(args.upgrade_schema, args.provisional_distribution)
