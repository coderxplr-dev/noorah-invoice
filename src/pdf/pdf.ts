import React from 'react';
import { pdf } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';

import { validateInvoice } from '../lib/invoice';
import type { InvoiceData, InvoiceFieldErrors } from '../types';
import { InvoicePdfDocument, configureInvoicePdfFonts } from './InvoicePdfDocument';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export class InvoicePdfValidationError extends Error {
  readonly errors: InvoiceFieldErrors;
  readonly firstErrorPath?: string;

  constructor(errors: InvoiceFieldErrors, firstErrorPath?: string) {
    super('Please correct the highlighted invoice fields before generating the PDF.');
    this.name = 'InvoicePdfValidationError';
    this.errors = errors;
    this.firstErrorPath = firstErrorPath;
  }
}

export class InvoicePdfGenerationError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super('The PDF could not be generated. Your invoice data has not been changed.');
    this.name = 'InvoicePdfGenerationError';
    this.cause = cause;
  }
}

function safeFilenamePart(value: string, fallback: string): string {
  const cleaned = value
    .normalize('NFKC')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^[._ -]+|[._ -]+$/g, '')
    .slice(0, 80);

  if (!cleaned || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned)) {
    return fallback;
  }
  return cleaned;
}

/** Returns a filesystem-safe name such as Invoice_S-23_June_2026.pdf. */
export function getInvoiceFilename(data: InvoiceData): string {
  const invoiceNumber = safeFilenamePart(data.invoiceNumber, 'Draft');
  const match = /^(\d{4})-(\d{2})$/.exec(data.billingMonth.trim());
  const year = match?.[1] ?? 'Unknown';
  const monthIndex = match ? Number(match[2]) - 1 : -1;
  const month = monthIndex >= 0 && monthIndex < MONTHS.length ? MONTHS[monthIndex] : 'Month';
  return `Invoice_${invoiceNumber}_${month}_${year}.pdf`;
}

/** Backwards-friendly explicit PDF alias. */
export const getInvoicePdfFilename = getInvoiceFilename;

async function renderInvoiceBlob(data: InvoiceData): Promise<Blob> {
  if (typeof window !== 'undefined') configureInvoicePdfFonts();

  try {
    const document = React.createElement(InvoicePdfDocument, { data }) as unknown as React.ReactElement<DocumentProps>;
    const instance = pdf(document);
    return await instance.toBlob();
  } catch (error) {
    if (error instanceof InvoicePdfValidationError) throw error;
    throw new InvoicePdfGenerationError(error);
  }
}

function assertValidForFinalPdf(data: InvoiceData): void {
  const validation = validateInvoice(data);
  if (!validation.valid) {
    throw new InvoicePdfValidationError(validation.errors, validation.firstErrorPath);
  }
}

/**
 * Produces the validated downloadable/printable PDF with the selected VAT setting.
 */
export async function createInvoiceBlob(data: InvoiceData): Promise<Blob> {
  assertValidForFinalPdf(data);
  return renderInvoiceBlob(data);
}

/**
 * Produces a validated PDF for the Preview PDF action.
 */
export async function createInvoicePreviewBlob(data: InvoiceData): Promise<Blob> {
  const validation = validateInvoice(data);
  if (!validation.valid) {
    throw new InvoicePdfValidationError(validation.errors, validation.firstErrorPath);
  }
  return renderInvoiceBlob(data);
}
