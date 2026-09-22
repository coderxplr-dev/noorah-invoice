# Manpower Invoice Studio

Brand: NOORAH ZAID AL QARNI. The login screen uses the administrator credentials supplied for this project. It is a browser-only convenience gate, not secure authentication: the client contains a password hash and access can be bypassed. No password or login session is saved in browser storage; refresh requires signing in again. Use a backend or identity provider before deploying this as a protected application.

## GitHub Pages deployment

Push this project to the `main` branch of `coderxplr-dev/noorah-invoice`. In the repository's Settings > Pages, select **GitHub Actions** as the source. The included Deploy invoice app to GitHub Pages workflow tests, builds, and deploys on every push to main, or can be started manually from Actions. The expected address is `https://coderxplr-dev.github.io/noorah-invoice/` once deployment succeeds.

GitHub Pages is static hosting: the login is not an access-control boundary. Do not commit real invoices, passwords, or private customer/employee data. Generated PDFs, local environment files, and build artifacts are ignored by Git.

Use **Auto-generate random number** beside Invoice Number for an editable random identifier. This does not guarantee uniqueness or implement a controlled invoice sequence.

Choose **Services + Employees** to include both in one invoice. Services and their subtotal appear first, then an individual employee table and employee subtotal, followed by combined totals, discount and the selected VAT. Employees do not appear in the goods/services table. Both sets of charges are counted exactly once.

A responsive, browser-only React and TypeScript application for preparing bilingual English/Arabic manpower tax invoices. It supports direct service rows or employee rows, deterministic decimal calculations, proportional discount and VAT allocation, an optional employee breakdown, live preview, PDF download and printing.

## Run locally

Requirements: Node.js 18 or newer and pnpm.

```bash
pnpm install
pnpm dev
```

Open the local URL shown by Vite (normally `http://localhost:5173`).

## Verify and build

```bash
pnpm test
pnpm build
```

To render the fictional verification invoice in `output/pdf/` using the current Saudi month in its filename:

```bash
pnpm render:sample
```

## Data and privacy

- The app has no backend, database, account system, government integration, email delivery, employee directory, or timesheet upload.
- Buyer, invoice, and billing-row data stay in the current browser tab and are not automatically stored.
- Seller details remain in memory only. Previously remembered seller details are removed when the workspace opens.
- The supplied logo and bundled Noto fonts are local assets. Noto font licensing is included at `public/fonts/OFL.txt`.

## PDF behavior

- Download PDF creates a real A4 PDF with selectable text using `@react-pdf/renderer`.
- **Apply 15% VAT** controls the charge: unchecked means zero VAT in the preview, PDF and QR. Download and Print are available with VAT on or off.
- Billing month defaults to the current Saudi month, including sample data, and remains independently editable.
- All calculations used by the form, HTML preview, and PDF come from `src/lib/invoice.ts`.
- A generated ZATCA Phase 1-style QR symbol is placed in the invoice header’s logo slot when the seller name, 15-digit seller VAT number, issue timestamp and calculated totals are complete. It encodes TLV tags 1–5 (seller, VAT number, timestamp, invoice total and VAT total) with an ISO-8601 Saudi-local `+03:00` timestamp. The supplied/reference QR is not hard-coded; the symbol is regenerated from the current invoice values. This standalone generator does not perform ZATCA Phase 2 signing, onboarding or submission.
