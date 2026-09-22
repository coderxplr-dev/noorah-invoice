import { describe, expect, it } from 'vitest';

import type { EmployeeRow, InvoiceData, ServiceRow } from '../types';
import {
  blankInvoiceData,
  buildInvoiceFilename,
  calculateInvoice,
  createEmployeeRow,
  createServiceRow,
  formatBillingMonthNote,
  formatBillingMonthShort,
  formatIssueTimestamp,
  formatMoney,
  formatQuantity,
  formatQuantityWithUnit,
  formatRate,
  formatSar,
  getSaudiNow,
  normalizeInvoiceData,
  sampleInvoiceData,
  sanitizeFilenamePart,
  validateInvoice,
} from './invoice';

const NOW = new Date('2026-09-21T12:34:56.000Z');

function validServiceInvoice(): InvoiceData {
  return sampleInvoiceData(NOW);
}

function serviceRow(overrides: Partial<ServiceRow> = {}): ServiceRow {
  return {
    id: 'service-test',
    descriptionEn: 'Consulting service',
    descriptionAr: 'خدمة استشارية',
    billingBasis: 'Hour',
    quantity: '1',
    unitRate: '100',
    ...overrides,
  };
}

function employeeRow(id: string, overrides: Partial<EmployeeRow> = {}): EmployeeRow {
  return {
    id,
    employeeName: `Employee ${id}`,
    designationEn: 'Technician',
    designationAr: 'فني',
    invoiceDescriptionEn: 'Technical manpower',
    invoiceDescriptionAr: 'قوى عاملة فنية',
    billingBasis: 'Hour',
    quantity: '1',
    unitRate: '10',
    ...overrides,
  };
}

function asEmployeeInvoice(rows: EmployeeRow[]): InvoiceData {
  return {
    ...validServiceInvoice(),
    entryMode: 'employee',
    includeBreakdown: true,
    serviceRows: [],
    employeeRows: rows,
  };
}

describe('defaults and helpers', () => {
  it('creates Saudi local date and time including seconds', () => {
    expect(getSaudiNow(new Date('2026-01-01T21:05:09.000Z'))).toEqual({
      issueDate: '2026-01-02',
      issueTime: '00:05:09',
      billingMonth: '2026-01',
    });
  });

  it('creates an editable blank model with the supplied brand logo', () => {
    const blank = blankInvoiceData(NOW);
    expect(blank.sellerLogo).toBe(`${import.meta.env.BASE_URL}brand-logo.png`);
    expect(blank.issueDate).toBe('2026-09-21');
    expect(blank.issueTime).toBe('15:34:56');
    expect(blank.currency).toBe('SAR');
    expect(blank.discount).toBe('0');
    expect(blank.applyVat).toBe(false);
    expect(blank.serviceRows).toHaveLength(1);
  });

  it('creates complete empty service and employee rows', () => {
    expect(createServiceRow('s-1')).toEqual({
      id: 's-1',
      descriptionEn: '',
      descriptionAr: '',
      billingBasis: 'Hour',
      quantity: '',
      unitRate: '',
    });
    expect(createEmployeeRow('e-1')).toMatchObject({
      id: 'e-1',
      employeeName: '',
      designationEn: '',
      invoiceDescriptionEn: '',
      billingBasis: 'Hour',
      quantity: '',
      unitRate: '',
    });
  });

  it('formats money, quantities, rates, units, and billing periods', () => {
    expect(formatMoney('42368')).toBe('42,368.00');
    expect(formatSar('48723.2')).toBe('SAR 48,723.20');
    expect(formatQuantity('1234.5000')).toBe('1,234.5');
    expect(formatRate('24')).toBe('24.00');
    expect(formatRate('24.1234')).toBe('24.1234');
    expect(formatQuantityWithUnit('1', 'Month')).toBe('1 month');
    expect(formatQuantityWithUnit('0.5', 'Month')).toBe('0.5 months');
    expect(formatQuantityWithUnit('295', 'Hour')).toBe('295 hrs');
    expect(formatBillingMonthNote('2026-06')).toBe('This Invoice Month Of June - 2026');
    expect(formatBillingMonthShort('2026-06')).toBe('Jun-26');
    expect(formatIssueTimestamp('2026-06-03', '14:05:59')).toBe('2026-06-03 14:05');
  });

  it('normalizes only surrounding whitespace and preserves Arabic content and leading zeros', () => {
    const data = validServiceInvoice();
    data.sellerNameAr = '  شركة تجريبية طويلة الاسم  ';
    data.sellerVatNumber = ' 003000000000003 ';
    data.serviceRows[0].descriptionEn = '  Senior QC/QA Coordinator  ';
    data.serviceRows[0].unitRate = ' 024.00 ';

    const normalized = normalizeInvoiceData(data);
    expect(normalized.sellerNameAr).toBe('شركة تجريبية طويلة الاسم');
    expect(normalized.sellerVatNumber).toBe('003000000000003');
    expect(normalized.serviceRows[0].descriptionEn).toBe('Senior QC/QA Coordinator');
    expect(normalized.serviceRows[0].unitRate).toBe('024.00');
  });

  it('sanitizes a useful deterministic PDF filename', () => {
    const data = validServiceInvoice();
    data.invoiceNumber = ' S/23:* ';
    expect(sanitizeFilenamePart(data.invoiceNumber)).toBe('S-23');
    expect(buildInvoiceFilename(data)).toBe('Invoice_S-23_September_2026.pdf');
    expect(data.billingMonth).toBe(getSaudiNow(NOW).billingMonth);
  });
});

describe('calculations', () => {
  it('combines additional services and employee charges exactly once', () => {
    const data = asEmployeeInvoice([employeeRow('a'), employeeRow('b')]);
    data.entryMode = 'combined';
    data.serviceRows = [serviceRow({ id: 'extra', unitRate: '100' })];
    const result = calculateInvoice(data);
    expect(result.rows).toHaveLength(2);
    expect(result.breakdownRows).toHaveLength(2);
    expect(result.totals.subtotal).toBe('120.00');
    expect(result.serviceSubtotal).toBe('100.00');
    expect(result.employeeSubtotal).toBe('20.00');
    expect(result.totals.grandTotal).toBe('138.00');
    expect(validateInvoice(data).valid).toBe(true);
    data.serviceRows[0].quantity = '0';
    expect(validateInvoice(data).errors['serviceRows.0.quantity']).toBeDefined();
  });
  it('matches the five-row verification example exactly', () => {
    const calculated = calculateInvoice(sampleInvoiceData(NOW));
    expect(calculated.rows.map((row) => row.grossAmount)).toEqual([
      '7080.00',
      '5808.00',
      '6072.00',
      '14256.00',
      '9152.00',
    ]);
    expect(calculated.totals).toEqual({
      subtotal: '42368.00',
      discount: '0.00',
      taxableTotal: '42368.00',
      vatAmount: '6355.20',
      grandTotal: '48723.20',
    });
  });

  it('rounds every source row before summing the subtotal', () => {
    const data = validServiceInvoice();
    data.serviceRows = [
      serviceRow({ id: 'a', quantity: '1', unitRate: '0.335' }),
      serviceRow({ id: 'b', quantity: '1', unitRate: '0.335' }),
    ];
    const calculated = calculateInvoice(data);
    expect(calculated.rows.map((row) => row.grossAmount)).toEqual(['0.34', '0.34']);
    expect(calculated.totals.subtotal).toBe('0.68');
  });

  it('groups employee rows when descriptions, basis, rate, and rounded math match', () => {
    const data = asEmployeeInvoice([
      employeeRow('a', { quantity: '1.25', unitRate: '24.00' }),
      employeeRow('b', { quantity: '2.75', unitRate: '24' }),
    ]);
    const calculated = calculateInvoice(data);

    expect(calculated.rows).toHaveLength(1);
    expect(calculated.rows[0]).toMatchObject({
      quantity: '4',
      unitRate: '24.00',
      grossAmount: '96.00',
      sourceRowIds: ['a', 'b'],
      grouped: true,
    });
    expect(calculated.breakdownRows).toHaveLength(2);
    expect(calculated.breakdownRows.map((row) => row.grossAmount)).toEqual(['30.00', '66.00']);
  });

  it('does not group employees with different rates, units, or invoice descriptions', () => {
    const data = asEmployeeInvoice([
      employeeRow('a'),
      employeeRow('b', { unitRate: '11' }),
      employeeRow('c', { billingBasis: 'Day' }),
      employeeRow('d', { invoiceDescriptionAr: 'وصف مختلف' }),
    ]);
    const calculated = calculateInvoice(data);
    expect(calculated.rows).toHaveLength(4);
    expect(calculated.rows.every((row) => !row.grouped)).toBe(true);
  });

  it('retains separate employee invoice rows when grouping would hide a rounding mismatch', () => {
    const data = asEmployeeInvoice([
      employeeRow('a', { quantity: '1', unitRate: '0.335' }),
      employeeRow('b', { quantity: '1', unitRate: '0.335' }),
    ]);
    const calculated = calculateInvoice(data);

    expect(calculated.rows).toHaveLength(2);
    expect(calculated.rows.map((row) => row.grossAmount)).toEqual(['0.34', '0.34']);
    expect(calculated.totals.subtotal).toBe('0.68');
  });

  it('supports daily and agreed monthly fraction billing without inferred proration', () => {
    const data = validServiceInvoice();
    data.serviceRows = [
      serviceRow({ id: 'day', billingBasis: 'Day', quantity: '26', unitRate: '100' }),
      serviceRow({ id: 'month', billingBasis: 'Month', quantity: '0.5', unitRate: '8000' }),
    ];
    const calculated = calculateInvoice(data);
    expect(calculated.rows.map((row) => [row.billingBasis, row.grossAmount])).toEqual([
      ['Day', '2600.00'],
      ['Month', '4000.00'],
    ]);
    expect(calculated.totals.subtotal).toBe('6600.00');
  });

  it('allocates a discount proportionally in whole cents with a deterministic largest remainder', () => {
    const data = validServiceInvoice();
    data.serviceRows = [
      serviceRow({ id: 'a', quantity: '1', unitRate: '0.05' }),
      serviceRow({ id: 'b', quantity: '1', unitRate: '0.03' }),
      serviceRow({ id: 'c', quantity: '1', unitRate: '0.02' }),
    ];
    data.discount = '0.03';

    const calculated = calculateInvoice(data);
    expect(calculated.rows.map((row) => row.allocatedDiscount)).toEqual(['0.01', '0.01', '0.01']);
    expect(calculated.rows.map((row) => row.taxableAmount)).toEqual(['0.04', '0.02', '0.01']);
    expect(calculated.totals.discount).toBe('0.03');
    expect(calculated.totals.taxableTotal).toBe('0.07');
  });

  it('resolves equal discount remainders by original row order', () => {
    const data = validServiceInvoice();
    data.serviceRows = [
      serviceRow({ id: 'a', quantity: '1', unitRate: '0.01' }),
      serviceRow({ id: 'b', quantity: '1', unitRate: '0.01' }),
      serviceRow({ id: 'c', quantity: '1', unitRate: '0.01' }),
    ];
    data.discount = '0.01';
    const calculated = calculateInvoice(data);
    expect(calculated.rows.map((row) => row.allocatedDiscount)).toEqual(['0.01', '0.00', '0.00']);
  });

  it('allocates VAT rounding so row VAT always sums to total VAT', () => {
    const data = validServiceInvoice();
    data.serviceRows = [
      serviceRow({ id: 'a', quantity: '1', unitRate: '0.10' }),
      serviceRow({ id: 'b', quantity: '1', unitRate: '0.10' }),
      serviceRow({ id: 'c', quantity: '1', unitRate: '0.10' }),
    ];
    const calculated = calculateInvoice(data);

    expect(calculated.totals.vatAmount).toBe('0.05');
    expect(calculated.rows.map((row) => row.vatAmount)).toEqual(['0.02', '0.02', '0.01']);
    expect(
      calculated.rows.reduce((sum, row) => sum + Number(row.vatAmount), 0).toFixed(2),
    ).toBe(calculated.totals.vatAmount);
  });

  it('never adds VAT cumulatively when calculated repeatedly', () => {
    const data = validServiceInvoice();
    const first = calculateInvoice(data);
    const second = calculateInvoice(data);
    expect(second).toEqual(first);
    expect(data.discount).toBe('0');
    expect(data.serviceRows[0].unitRate).toBe('24.00');
  });

  it('is tolerant of incomplete drafts and clamps an excessive draft discount safely', () => {
    const data = blankInvoiceData(NOW);
    data.serviceRows = [serviceRow({ quantity: '', unitRate: '-5' })];
    data.discount = '999';
    expect(() => calculateInvoice(data)).not.toThrow();
    expect(calculateInvoice(data).totals).toEqual({
      subtotal: '0.00',
      discount: '0.00',
      taxableTotal: '0.00',
      vatAmount: '0.00',
      grandTotal: '0.00',
    });
  });
});

describe('validation', () => {
  it('accepts complete sample data for final generation', () => {
    expect(validateInvoice(validServiceInvoice())).toEqual({ valid: true, errors: {} });
  });

  it('reports flat field paths in form order and row field paths', () => {
    const data = blankInvoiceData(NOW);
    data.sellerNameEn = '';
    const result = validateInvoice(data);

    expect(result.valid).toBe(false);
    expect(result.firstErrorPath).toBe('sellerNameEn');
    expect(result.errors).toMatchObject({
      sellerNameEn: expect.any(String),
      sellerNameAr: expect.any(String),
      buyerNameEn: expect.any(String),
      invoiceNumber: expect.any(String),
      'serviceRows.0.descriptionEn': expect.any(String),
      'serviceRows.0.quantity': expect.any(String),
      'serviceRows.0.unitRate': expect.any(String),
    });
  });

  it('requires a 15-digit seller VAT number while preserving leading zeros', () => {
    const data = validServiceInvoice();
    data.sellerVatNumber = '001234567890123';
    expect(validateInvoice(data).errors.sellerVatNumber).toBeUndefined();

    data.sellerVatNumber = '1234 56789012345';
    expect(validateInvoice(data).errors.sellerVatNumber).toContain('15 digits');
  });

  it('allows an omitted buyer VAT number and validates it when supplied', () => {
    const data = validServiceInvoice();
    data.buyerVatNumber = '';
    expect(validateInvoice(data).errors.buyerVatNumber).toBeUndefined();

    data.buyerVatNumber = '123';
    expect(validateInvoice(data).errors.buyerVatNumber).toContain('15 digits');
  });

  it('rejects missing rows and invalid quantity/rate values or excess precision', () => {
    const noRows = validServiceInvoice();
    noRows.serviceRows = [];
    expect(validateInvoice(noRows).errors.serviceRows).toContain('at least one');

    const data = validServiceInvoice();
    data.serviceRows = [serviceRow({ quantity: '0', unitRate: '1.12345' })];
    const errors = validateInvoice(data).errors;
    expect(errors['serviceRows.0.quantity']).toContain('positive');
    expect(errors['serviceRows.0.unitRate']).toContain('4 decimal');
  });

  it('validates all required employee fields with employee row paths', () => {
    const data = asEmployeeInvoice([
      employeeRow('bad', {
        employeeName: '',
        designationEn: '',
        invoiceDescriptionEn: '',
        quantity: '-1',
        unitRate: '0',
      }),
    ]);
    const errors = validateInvoice(data).errors;
    expect(errors).toMatchObject({
      'employeeRows.0.employeeName': expect.any(String),
      'employeeRows.0.designationEn': expect.any(String),
      'employeeRows.0.invoiceDescriptionEn': expect.any(String),
      'employeeRows.0.quantity': expect.any(String),
      'employeeRows.0.unitRate': expect.any(String),
    });
  });

  it('rejects discounts over subtotal and discount fractions below one halala', () => {
    const over = validServiceInvoice();
    over.discount = '42368.01';
    expect(validateInvoice(over).errors.discount).toContain('cannot exceed');

    const tooPrecise = validServiceInvoice();
    tooPrecise.discount = '1.001';
    expect(validateInvoice(tooPrecise).errors.discount).toContain('2 decimals');
  });

  it('switches VAT off and back on without accumulating tax, including discounts', () => {
    const data = validServiceInvoice();
    data.discount = '100';
    data.applyVat = false;
    expect(validateInvoice(data).valid).toBe(true);
    expect(validateInvoice(data, { requireVatConfirmation: false }).errors.applyVat).toBeUndefined();

    expect(calculateInvoice(data).totals.vatAmount).toBe('0.00');
    expect(calculateInvoice(data).totals.grandTotal).toBe('42268.00');
    expect(calculateInvoice(data).rows.every(row => row.taxRate === '0%' && row.vatAmount === '0.00')).toBe(true);
    data.applyVat = true;
    expect(calculateInvoice(data).totals.vatAmount).toBe('6340.20');
    data.applyVat = false;
    data.applyVat = true;
    expect(calculateInvoice(data).totals.grandTotal).toBe('48608.20');
  });

  it('disables employee breakdown in service mode', () => {
    const data = validServiceInvoice();
    data.includeBreakdown = true;
    expect(validateInvoice(data).errors.includeBreakdown).toContain('Employee mode');
  });

  it('validates a real date, billing month, and time including seconds', () => {
    const data = validServiceInvoice();
    data.issueDate = '2026-02-30';
    data.issueTime = '24:61';
    data.billingMonth = '2026-13';
    const errors = validateInvoice(data).errors;
    expect(errors.issueDate).toBeDefined();
    expect(errors.issueTime).toContain('seconds');
    expect(errors.billingMonth).toBeDefined();
  });
});
