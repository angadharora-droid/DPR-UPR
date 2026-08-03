# CPH Purchase Requisition System (DPR → UPR)

Digitizes Centre Point Hospitality's Department Purchase Requisition → Unit Purchase Requisition workflow: POS min-max import → Department Head DPR → Unit Head consolidation & verification → PDF → email to the Purchase Head.

**Stack:** React + Vite + Tailwind · Node.js + Express · MongoDB (Mongoose) · JWT auth · Nodemailer · PDFKit

## Quick start

Prereqs: Node 18+, MongoDB running on `localhost:27017` (or set `MONGODB_URI`).

```bash
# 1. Backend
cd server
npm install
copy .env.example .env        # adjust if needed; works as-is for local dev
node src/seed.js              # seed master data + demo unit "pablo" (add --fresh to wipe first)
npm run dev                   # API on http://localhost:5001

# 2. Frontend (second terminal)
cd client
npm install
npm run dev                   # app on http://localhost:5173 (proxies /api to :5001)
```


### API base URL

The client calls the API at the same origin (`/api`) by default — right for local dev (Vite proxy), the single Railway service, and the Vercel rewrite in `client/vercel.json`. To point a client build at a different API host, set `VITE_API_URL` (e.g. `https://dprupr.centrepointgroup.in`) in the build environment (Vercel → Project → Environment Variables).

### Email

With `SMTP_HOST` empty in `server/.env`, sending runs in **dev mode**: the send flow completes, the UPR is marked Sent, and the email (with PDF attachment) is logged on the server instead of delivered. Fill in the SMTP settings for real delivery. The recipient defaults to the active Purchase Head user's email (`PURCHASE_HEAD_EMAIL` is the fallback); the Unit Head can override it per send.

**Per-unit sender:** each unit can send from its own mailbox — Admin → Units → **Mailbox** sets the unit's sender email + password (host/port stay the global `SMTP_HOST`/`SMTP_PORT`). Units without a mailbox fall back to the group `SMTP_USER`/`MAIL_FROM`. The mailbox password is write-only: it is never returned by the API nor written to audit logs.

## Daily workflow

1. **Department Head** creates today's DPR — it always starts **blank**.
2. **Kitchen/Bar:** click **Import POS File** on the DPR screen and pick the min-max report exported from POS (Excel `.xlsx`/`.xls` or CSV). Rows load grouped by category with Required Qty defaulting to the POS suggestion (editable). Re-importing replaces POS rows but keeps manually added items; every import is archived as a min-max report. HouseKeeping has no feed and no import button — items are added manually under its category headers. Any department can add manual items. Sign & Submit locks the DPR.
   File format (header row required): `Category, Item, UOM, Closing Stock, Buffer Days, Required Qty`. Unknown items are auto-created as POS-linked; unknown categories are reported and skipped. Sample files to try: [sample-data/](sample-data/) (regenerate with `node src/makeSamples.js`).
   *(Admin → Min-Max Import still exists as an optional central archive of feeds; it does not feed DPRs.)*
   **Raw-material catalog & search-first entry:** each unit can carry its own raw-material catalog — Admin → Units → **Raw materials** uploads the POS raw-material export/report (`.xlsx`/`.csv`; both the bare export and the printable report with title rows work). With a catalog loaded the DPR screen becomes search-first: a search bar adds items (↑↓/Enter, term highlighting, multi-word matching), and each pick fills the item name and UOM (purchase unit) and files the line under the material's POS category automatically — categories come from the Excel and are auto-created in the department's master on save, so empty category sections are never shown. Items not in the catalog can still be added manually (they go to Other). Re-uploading replaces the unit's catalog; inactive and duplicate rows are skipped.
3. **Unit Head** sees per-department status, can send a DPR back for re-edit, and consolidates submitted DPRs into one UPR. Quantity/remark edits, additions, and removals are audit-logged against the department head's original values. **Verify & Lock** signs the UPR and generates the PDF.
4. **Send** emails the PDF to the Purchase Head (`UPR — <unit> — <date>` subject) and locks the cycle. The PDF stays downloadable from History and the Purchase portal.

## Decisions taken on the open questions

1. **Required-qty formula** — the POS feed already carries `Required Qty`; the system imports it as `systemRequiredQty` rather than recomputing. (The sample files use `buffer_days × 8 − closing_stock` just to generate plausible numbers.) Plug a formula into `services/importer.js` if POS ever stops providing it.
2. **DPR cycle** — daily; one DPR per department per unit per calendar day (unique index on unit+department+cycleDate).
3. **Re-edit after submission** — yes: the Unit Head can "Send back" a submitted DPR (returns to Draft, removes its lines from the draft UPR). Blocked once the UPR is verified — corrections then require the next cycle.
4. **Purchase Head portal** — included read-only: list of sent UPRs across all units, filterable by unit, with PDF download. Email remains the primary channel.
5. **Categories** — per-unit master data, seeded from the group-wide standard (`server/src/masterData.js`) when a unit is created; Admin can add per-unit categories after.
6. **UPR column order** — kept as the current template: Buffer Days before Required Qty (DPR entry uses the same order, so they match anyway).
7. **Purchase Head** — one central role for the whole group.
8. **Bulk-clone on onboarding** — yes: Add Unit offers "Clone full setup from <existing unit>" (departments + categories + items).
9. **Multi-unit users** — strictly one user → one unit in v1. A person overseeing two cafes needs two logins.

## Structure

```
server/
  src/
    index.js            Express app + Mongo connection
    seed.js             demo/seed data (--fresh wipes everything first)
    makeSamples.js      writes sample POS Excel files to sample-data/
    masterData.js       group-wide department/category master + demo items
    models/             Unit, Department, Category, Item, RawMaterial,
                        User, MinMaxReport, Dpr, Upr, AuditLog
    middleware/auth.js  JWT auth, role guard, unit scoping
    routes/             auth, adminUnits, adminUsers, adminMaster,
                        minmax (archive import), dpr (incl. POS file
                        import), upr, reports
    services/           importer.js (Excel/CSV parsing + line building),
                        pdf.js (UPR PDF), mailer.js (SMTP/dev), audit.js
  storage/uprs/         generated UPR PDFs
client/
  src/
    pages/              Login, DeptDashboard, DprEntry, UnitDashboard,
                        UprReview, UprSend, AdminOverview, AdminUnits,
                        AdminUsers, AdminMaster, AdminImport, History,
                        PurchasePortal
    components/Layout.jsx  shell, nav, status badges
    AuthContext.jsx     login state + role-based home routing
    api.js              fetch wrapper + PDF download
```

## Enforced business rules

- HouseKeeping & Maintenance never shows or receives min-max suggested quantities.
- Submitted DPRs are locked for the Department Head; Draft→Submitted→(sent back)→Draft is the only path back.
- Verified/Sent UPRs are immutable; sending twice is rejected.
- Every post-submission quantity change (unit-head edit/add/remove) is written to the audit log with old and new values, actor, and timestamp.
- All non-admin queries are scoped to the user's own unit server-side; cross-unit access returns 403.
