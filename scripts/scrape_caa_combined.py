"""
Combined CAA scraper:
1. First scrape Active programs from default page (2,423)
2. Then submit form with "All" filter to get non-active programs
3. Merge and deduplicate
"""
import csv
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

OUTPUT_CSV = Path("/Users/macbook/Desktop/project/Observator/refined_data/02_programs/caa_accredited_programs_full.csv")
LOG_FILE = Path("/Users/macbook/Desktop/project/Observator/refined_data/02_programs/_CAA_SCRAPING_LOG.md")
URL = "https://caa.ae/Pages/Programs/All.aspx"


def extract_all_rows(page, label=""):
    """Extract all visible rows via DataTables pagination."""
    info = page.evaluate("""
    () => {
        try {
            const dt = jQuery('#programsGrid').DataTable();
            return dt.page.info();
        } catch(e) { return { recordsDisplay: 0, pages: 0 }; }
    }
    """)
    total = info.get('recordsDisplay', 0)
    pages = info.get('pages', 0)
    print(f"  [{label}] {total} records, {pages} pages")

    rows = []
    for pg in range(pages):
        page.evaluate(f"() => {{ jQuery('#programsGrid').DataTable().page({pg}).draw(false); }}")
        page.wait_for_timeout(150)

        page_rows = page.evaluate("""
        () => {
            const results = [];
            for (const row of document.querySelectorAll('#programsGrid tbody tr')) {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 9) {
                    const pLink = cells[0].querySelector('a');
                    const iLink = cells[2].querySelector('a');
                    results.push({
                        program_name: cells[0].textContent.trim(),
                        program_name_ar: cells[1].textContent.trim(),
                        institution_name: cells[2].textContent.trim(),
                        institution_name_ar: cells[3].textContent.trim(),
                        program_level: cells[4].textContent.trim(),
                        emirate: cells[6].textContent.trim(),
                        field_of_study: cells[7].textContent.trim(),
                        program_status: cells[8].textContent.trim(),
                        degree_level: cells[9] ? cells[9].textContent.trim() : '',
                        institute_no: cells[10] ? cells[10].textContent.trim() : '',
                        status_code: cells[11] ? cells[11].textContent.trim() : '',
                        program_url: pLink ? pLink.getAttribute('href') : '',
                        institution_url: iLink ? iLink.getAttribute('href') : ''
                    });
                }
            }
            return results;
        }
        """)
        rows.extend(page_rows)
        if (pg + 1) % 10 == 0:
            print(f"    Page {pg + 1}/{pages}: {len(rows)} rows")

    return rows


log_lines = []
def log(msg):
    print(msg)
    log_lines.append(msg)

log("# CAA Programs Scraping Log")
log(f"## Started: {time.strftime('%Y-%m-%d %H:%M:%S')}")
log(f"## URL: {URL}")
log(f"## Strategy: Two-pass approach (Active default + All via form submit)")
log("")

all_programs = {}  # key -> program dict

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1920, "height": 1080})
    page = ctx.new_page()

    # Pass 1: Default page (Active programs)
    log("### Pass 1: Active programs (default page)...")
    page.goto(URL, wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(3000)

    active_rows = extract_all_rows(page, "Active")
    for row in active_rows:
        key = (row['program_name'], row['institution_name'])
        all_programs[key] = row
    log(f"Active pass: {len(active_rows)} rows, {len(all_programs)} unique")

    # Pass 2: Submit form with "All" filter for non-active programs
    log("\n### Pass 2: All programs (form submit)...")

    # Need to reload and set filter
    page.goto(URL, wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(3000)

    # Open Advanced Search
    page.evaluate("""
    () => {
        for (const link of document.querySelectorAll('a')) {
            if (link.textContent.includes('Advanced Search')) { link.click(); return; }
        }
    }
    """)
    page.wait_for_timeout(1000)

    # Set status to "All" via selectize
    page.evaluate("""
    () => {
        const ddl = document.querySelector('#ddlStatusOfProgram');
        const sel = ddl.selectize;
        if (sel) sel.setValue(' ', false);
        ddl.value = ' ';
        document.querySelector('#__EVENTTARGET').value = ddl.name;
    }
    """)
    page.wait_for_timeout(500)

    # Submit and wait
    with page.expect_navigation(timeout=60000, wait_until="networkidle"):
        page.evaluate("() => { document.querySelector('form').submit(); }")
    page.wait_for_timeout(3000)

    all_rows = extract_all_rows(page, "All")
    new_from_all = 0
    for row in all_rows:
        key = (row['program_name'], row['institution_name'])
        if key not in all_programs:
            all_programs[key] = row
            new_from_all += 1
    log(f"All pass: {len(all_rows)} rows, {new_from_all} new unique (total: {len(all_programs)})")

    # Pass 3: Try individual non-active statuses for any we might have missed
    for status_code, status_name in [('O', 'In Teach Out'), ('X', 'Inactive'), ('C', 'Closed'), ('S', 'Admission Ceased'), ('P', 'Probation'), ('R', 'Renamed')]:
        log(f"\n### Pass 3: {status_name}...")
        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(3000)

        page.evaluate("""
        () => {
            for (const link of document.querySelectorAll('a')) {
                if (link.textContent.includes('Advanced Search')) { link.click(); return; }
            }
        }
        """)
        page.wait_for_timeout(1000)

        page.evaluate(f"""
        (code) => {{
            const ddl = document.querySelector('#ddlStatusOfProgram');
            const sel = ddl.selectize;
            if (sel) sel.setValue(code, false);
            ddl.value = code;
            document.querySelector('#__EVENTTARGET').value = ddl.name;
        }}
        """, status_code)
        page.wait_for_timeout(500)

        try:
            with page.expect_navigation(timeout=60000, wait_until="networkidle"):
                page.evaluate("() => { document.querySelector('form').submit(); }")
            page.wait_for_timeout(3000)

            status_rows = extract_all_rows(page, status_name)
            new_count = 0
            for row in status_rows:
                key = (row['program_name'], row['institution_name'])
                if key not in all_programs:
                    all_programs[key] = row
                    new_count += 1
            log(f"  {status_name}: {len(status_rows)} rows, {new_count} new (total: {len(all_programs)})")
        except Exception as e:
            log(f"  {status_name}: Failed - {e}")

    browser.close()

# Convert to list
programs_list = list(all_programs.values())

# Results
log(f"\n## Results Summary")
log(f"- **Total unique programs: {len(programs_list)}**")

statuses = {}
for prog in programs_list:
    s = prog.get('program_status', 'Unknown')
    statuses[s] = statuses.get(s, 0) + 1
log(f"- By accreditation status:")
for s, c in sorted(statuses.items(), key=lambda x: -x[1]):
    log(f"  - {s}: {c}")

emirates = {}
for prog in programs_list:
    e = prog.get('emirate', 'Unknown')
    emirates[e] = emirates.get(e, 0) + 1
log(f"- By emirate:")
for e, c in sorted(emirates.items(), key=lambda x: -x[1]):
    log(f"  - {e}: {c}")

fields = {}
for prog in programs_list:
    f = prog.get('field_of_study', 'Unknown')
    fields[f] = fields.get(f, 0) + 1
log(f"- By field of study:")
for f, c in sorted(fields.items(), key=lambda x: -x[1]):
    log(f"  - {f}: {c}")

institutions = sorted(set(prog['institution_name'] for prog in programs_list))
log(f"- **Unique institutions: {len(institutions)}**")

degree_levels = {}
for prog in programs_list:
    d = prog.get('degree_level', 'Unknown')
    degree_levels[d] = degree_levels.get(d, 0) + 1
log(f"- By degree level:")
for d, c in sorted(degree_levels.items(), key=lambda x: -x[1]):
    log(f"  - {d}: {c}")

# Write CSV
fieldnames = [
    'institution_name', 'program_name', 'degree_level', 'field_of_study',
    'accreditation_status', 'emirate', 'program_level', 'program_name_ar',
    'institution_name_ar', 'institute_no', 'status_code',
    'program_url', 'institution_url', 'source'
]

OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
    writer.writeheader()
    for prog in sorted(programs_list, key=lambda x: (x['institution_name'], x['program_name'])):
        writer.writerow({
            'institution_name': prog.get('institution_name', ''),
            'program_name': prog.get('program_name', ''),
            'degree_level': prog.get('degree_level', ''),
            'field_of_study': prog.get('field_of_study', ''),
            'accreditation_status': prog.get('program_status', ''),
            'emirate': prog.get('emirate', ''),
            'program_level': prog.get('program_level', ''),
            'program_name_ar': prog.get('program_name_ar', ''),
            'institution_name_ar': prog.get('institution_name_ar', ''),
            'institute_no': prog.get('institute_no', ''),
            'status_code': prog.get('status_code', ''),
            'program_url': prog.get('program_url', ''),
            'institution_url': prog.get('institution_url', ''),
            'source': 'caa.ae'
        })

log(f"\n- CSV saved: {OUTPUT_CSV}")

log(f"\n### All {len(institutions)} institutions:")
for inst in institutions:
    count = sum(1 for prog in programs_list if prog['institution_name'] == inst)
    log(f"  - {inst} ({count} programs)")

log(f"\n## Completed: {time.strftime('%Y-%m-%d %H:%M:%S')}")

with open(LOG_FILE, 'w', encoding='utf-8') as f:
    f.write('\n'.join(log_lines))

print(f"\nDone. {len(programs_list)} programs saved to {OUTPUT_CSV}")
