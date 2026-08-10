# Repository Mandates & Rules

Welcome to the **Azar Project Team Dashboard** repository. To maintain structural consistency, all developers must strictly adhere to the following standards.

## 🚨 Synchronization Mandate
*   **Production & Local Interface Parity**: Any feature, styling, script, or bug-fix implemented in the production files (`Code.gs` and `Index.html`) **MUST** have a corresponding, mirrored implementation in the local test dashboard (`local_test_dashboard.html`).
*   **Database Alignment**: If any modification is made to the production Google Sheet database structure, corresponding modifications **MUST** be applied to:
    1.  The separate local CSV database files in the `spreedsheet-copy/` directory.
    2.  The embedded mock fallback data strings in `local_test_dashboard.html`.

## 🛠️ Tech Stack & Conventions
*   **Aesthetics**: Follow the **SaaS Minimalist** design standard—light background primary, thin borders (`1px`), generous white space, soft shadows, and clean sans-serif typography (`Plus Jakarta Sans`).
*   **Reactivity**: Built with client-side **React 18** and **Tailwind CSS**. Avoid injecting bloated libraries; leverage lightweight CDNs.
*   **Charts**: Always use **ApexCharts** for interactive data representation (radar, donut, columns, area).
*   **Icons**: Use **Lucide Icons** via the React `<Icon />` wrapper component to maintain unified iconography.

## 🧪 Local Testing Workflow
*   Never merge code that has not been verified locally using the CORS Server simulation in `local_test_dashboard.html`.
*   Run `python -m http.server 8000` or `npx serve` locally to test dynamic CSV table reads and writes.
