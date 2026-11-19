# Multimedia Hub V1.0 — Ghana Pilot vendor comparison

Local-first dashboard built from `Ghana Rendering Quotation_Updated.xlsx` and the vendor folders next to this app.
Nothing is uploaded; edits live in this browser (localStorage + IndexedDB) and the Excel file is never modified.

## Launch

```bash
cd multimedia-hub
node server.js          # → http://localhost:4310 (binds to 127.0.0.1 only)
```

Requires Node 18+. `npm install` is only needed to rebuild the seed data.

## Refresh data after the workbook or folders change

```bash
npm install             # first time only
npm run seed            # re-reads the workbook + vendor folders → public/data/seed.js, public/media/
```

Then use **Import Data → Discard local edits & reload project data** in the app (or import the workbook directly in the browser).

## Structure

- `server.js` – static server with HTTP Range (video seeking); `/files/…` serves the project folder read-only.
- `public/lib/parse.js` – workbook parser shared by browser import and seed builder (quotes, scoring sheet, floating + in-cell images, video links).
- `public/app.js`, `styles.css`, `index.html` – the dashboard (vanilla JS, no build step).
- `tools/build-seed.js` – seed builder; the folder → vendor map is at the top of the file.

## Data rules

- Vendor names, prices, unit prices, notes, criteria, weights and scores come from the workbook's cached values.
- SGD totals are the workbook's own (its budget FX rates); the app performs no currency conversion.
- Images are attributed by the vendor header above the “Reference Images” block; anything else is listed as “needs manual confirmation”.
- Timeline / revision rounds are the matching phrases from the workbook's Key Notes; otherwise “Not stated”.

## Deferred to V2

- Next.js/TypeScript/shadcn rebuild if the tool outgrows a single page; access control + secure storage before any deployment.
- Write edits back to Excel / export comparison as PDF or XLSX.
- Auto price-score from the price ratio (workbook formula 8.1); verified-rate currency converter.
- PDF/ZIP portfolio previews, video thumbnails, transcoding for codecs the browser cannot play.
- Persistent folder handles (File System Access API) instead of copying files into browser storage.
- Multi-project support, per-reviewer scoring, change history.
