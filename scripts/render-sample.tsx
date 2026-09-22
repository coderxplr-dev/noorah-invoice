import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToFile } from '@react-pdf/renderer';
import React from 'react';

import { createEmployeeRow, sampleInvoiceData } from '../src/lib/invoice';
import {
  InvoicePdfDocument,
  configureInvoicePdfFonts,
} from '../src/pdf/InvoicePdfDocument';
import { getInvoiceFilename } from '../src/pdf/pdf';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fontDirectory = path.join(repositoryRoot, 'public', 'fonts');
const outputDirectory = path.join(repositoryRoot, 'output', 'pdf');

configureInvoicePdfFonts({
  latinRegular: path.join(fontDirectory, 'NotoSans-Regular.ttf'),
  latinSemiBold: path.join(fontDirectory, 'NotoSans-SemiBold.ttf'),
  arabicRegular: path.join(fontDirectory, 'NotoSansArabic-Regular.ttf'),
  arabicSemiBold: path.join(fontDirectory, 'NotoSansArabic-SemiBold.ttf'),
});

await mkdir(outputDirectory, { recursive: true });

const logoPath = path.join(repositoryRoot, 'public', 'brand-logo.png');
const sample = sampleInvoiceData();
if (process.argv.includes('--combined')) {
  sample.entryMode = 'combined';
  sample.employeeRows = [{
    ...createEmployeeRow('sample-employee'),
    employeeName: 'Sample Employee',
    designationEn: 'Technician',
    designationAr: 'فني',
    invoiceDescriptionEn: 'Technician',
    quantity: '160',
    unitRate: '24',
  }];
}
sample.sellerLogo = existsSync(logoPath)
  ? `data:image/png;base64,${(await readFile(logoPath)).toString('base64')}`
  : null;

const outputPath = path.join(outputDirectory, getInvoiceFilename(sample));
await renderToFile(<InvoicePdfDocument data={sample} />, outputPath);

console.log(`Rendered sample invoice: ${outputPath}`);
