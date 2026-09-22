import Decimal from 'decimal.js';
import { assetUrl } from './assets';

import type {
  BillingBasis,
  CalculatedEmployeeRow,
  CalculatedInvoice,
  CalculatedInvoiceRow,
  EmployeeRow,
  InvoiceData,
  InvoiceFieldErrors,
  InvoiceValidationOptions,
  InvoiceValidationResult,
  SaudiDateTimeDefaults,
  ServiceRow,
} from '../types';

const VAT_RATE = new Decimal('0.15');
const ZERO = new Decimal(0);
const MONEY_PLACES = 2;
const INPUT_DECIMAL_PATTERN = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
const FOUR_PLACE_DECIMAL_PATTERN = /^(?:\d+(?:\.\d{1,4})?|\.\d{1,4})$/;
const TWO_PLACE_DECIMAL_PATTERN = /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/;
const BILLING_BASES: readonly BillingBasis[] = ['Hour', 'Day', 'Month'];
const MONTH_NAMES = [
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
const MONTH_NAMES_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

let generatedRowSequence = 0;

interface WorkingInvoiceRow {
  id: string;
  kind: 'service' | 'employee';
  descriptionEn: string;
  descriptionAr: string;
  billingBasis: BillingBasis;
  quantity: string;
  unitRate: string;
  gross: Decimal;
  sourceRowIds: string[];
  grouped: boolean;
}

interface EmployeeCandidate {
  source: EmployeeRow;
  sourceIndex: number;
  descriptionEn: string;
  descriptionAr: string;
  quantity: Decimal;
  rate: Decimal;
  gross: Decimal;
  groupingKey: string;
}

function nextRowId(prefix: 'service' | 'employee'): string {
  generatedRowSequence += 1;
  return `${prefix}-${generatedRowSequence}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function trimmed(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function parseDecimal(value: string | number | Decimal | null | undefined): Decimal | null {
  if (Decimal.isDecimal(value)) {
    return value.isFinite() ? value : null;
  }

  const text = String(value ?? '').trim();
  if (!INPUT_DECIMAL_PATTERN.test(text)) return null;

  try {
    const parsed = new Decimal(text);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

function nonNegativeDecimal(value: string | number | Decimal | null | undefined): Decimal {
  const parsed = parseDecimal(value);
  return parsed && parsed.greaterThanOrEqualTo(0) ? parsed : ZERO;
}

function positiveDecimal(value: string | number | Decimal | null | undefined): Decimal {
  const parsed = parseDecimal(value);
  return parsed && parsed.greaterThan(0) ? parsed : ZERO;
}

function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(MONEY_PLACES, Decimal.ROUND_HALF_UP);
}

function sumDecimals(values: Decimal[]): Decimal {
  return values.reduce((sum, value) => sum.plus(value), ZERO);
}

function asMoney(value: Decimal): string {
  return roundMoney(value).toFixed(MONEY_PLACES);
}

function decimalText(value: Decimal, maximumPlaces = 4, minimumPlaces = 0): string {
  const rounded = value.toDecimalPlaces(maximumPlaces, Decimal.ROUND_HALF_UP);
  let result = rounded.toFixed(maximumPlaces);

  if (maximumPlaces > minimumPlaces && result.includes('.')) {
    const [integer, fraction = ''] = result.split('.');
    const trimmedFraction = fraction.replace(/0+$/, '');
    const retainedFraction = trimmedFraction.padEnd(minimumPlaces, '0');
    result = retainedFraction ? `${integer}.${retainedFraction}` : integer;
  }

  return result === '-0' ? '0' : result;
}

function addThousandsSeparators(decimalTextValue: string): string {
  const negative = decimalTextValue.startsWith('-');
  const unsigned = negative ? decimalTextValue.slice(1) : decimalTextValue;
  const [integer, fraction] = unsigned.split('.');
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${groupedInteger}${fraction === undefined ? '' : `.${fraction}`}`;
}

function isValidBillingMonth(value: string): boolean {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

function billingMonthParts(value: string): { year: string; monthIndex: number } | null {
  if (!isValidBillingMonth(value)) return null;
  const [year, month] = value.split('-');
  return { year, monthIndex: Number(month) - 1 };
}

function isValidIssueDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function isValidIssueTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59 && Number(match[3]) <= 59;
}

function isPositiveInput(value: string): boolean {
  const text = trimmed(value);
  if (!FOUR_PLACE_DECIMAL_PATTERN.test(text)) return false;
  return new Decimal(text).greaterThan(0);
}

/**
 * Allocate an integer number of cents proportionally by largest remainder.
 * Equal remainders are resolved by original row order, making output stable.
 */
function allocateCents(targetCents: Decimal, weightCents: Decimal[]): Decimal[] {
  const allocations = weightCents.map(() => ZERO);
  if (targetCents.isZero() || weightCents.length === 0) return allocations;

  const weightTotal = sumDecimals(weightCents);
  if (weightTotal.isZero()) return allocations;

  const remainders: Array<{ index: number; remainder: Decimal }> = [];
  let allocated = ZERO;

  weightCents.forEach((weight, index) => {
    const exact = targetCents.times(weight).dividedBy(weightTotal);
    const base = exact.floor();
    allocations[index] = base;
    allocated = allocated.plus(base);
    remainders.push({ index, remainder: exact.minus(base) });
  });

  let remaining = targetCents.minus(allocated).toNumber();
  remainders.sort((left, right) => {
    const remainderComparison = right.remainder.comparedTo(left.remainder);
    return remainderComparison || left.index - right.index;
  });

  for (let position = 0; position < remaining; position += 1) {
    const target = remainders[position % remainders.length].index;
    allocations[target] = allocations[target].plus(1);
  }

  return allocations;
}

function serviceWorkingRows(rows: ServiceRow[]): WorkingInvoiceRow[] {
  return rows.map((row, index) => {
    const quantity = positiveDecimal(row.quantity);
    const rate = positiveDecimal(row.unitRate);
    return {
      id: row.id || `service-${index + 1}`,
      kind: 'service',
      descriptionEn: trimmed(row.descriptionEn),
      descriptionAr: trimmed(row.descriptionAr),
      billingBasis: row.billingBasis,
      quantity: trimmed(row.quantity),
      unitRate: trimmed(row.unitRate),
      gross: roundMoney(quantity.times(rate)),
      sourceRowIds: [row.id || `service-${index + 1}`],
      grouped: false,
    };
  });
}

function employeeCandidates(rows: EmployeeRow[]): EmployeeCandidate[] {
  return rows.map((row, index) => {
    const quantity = positiveDecimal(row.quantity);
    const rate = positiveDecimal(row.unitRate);
    const descriptionEn = trimmed(row.invoiceDescriptionEn);
    const descriptionAr = trimmed(row.invoiceDescriptionAr);
    const validRateForGrouping = parseDecimal(row.unitRate);
    const rateKey = validRateForGrouping?.greaterThan(0)
      ? validRateForGrouping.toString()
      : `invalid-rate-${index}`;

    return {
      source: row,
      sourceIndex: index,
      descriptionEn,
      descriptionAr,
      quantity,
      rate,
      gross: roundMoney(quantity.times(rate)),
      groupingKey: JSON.stringify([descriptionEn, descriptionAr, row.billingBasis, rateKey]),
    };
  });
}

function employeeWorkingRows(rows: EmployeeRow[]): WorkingInvoiceRow[] {
  const candidates = employeeCandidates(rows);
  const groups = new Map<string, EmployeeCandidate[]>();

  candidates.forEach((candidate) => {
    const group = groups.get(candidate.groupingKey);
    if (group) group.push(candidate);
    else groups.set(candidate.groupingKey, [candidate]);
  });

  const groupCalculations = new Map<
    string,
    {
      canGroup: boolean;
      roundedSourceTotal: Decimal;
      quantityTotal: Decimal;
    }
  >();
  groups.forEach((group, groupingKey) => {
    const roundedSourceTotal = sumDecimals(group.map((entry) => entry.gross));
    const quantityTotal = sumDecimals(group.map((entry) => entry.quantity));
    const groupedCharge = roundMoney(quantityTotal.times(group[0].rate));
    groupCalculations.set(groupingKey, {
      canGroup: group.length > 1 && groupedCharge.equals(roundedSourceTotal),
      roundedSourceTotal,
      quantityTotal,
    });
  });

  const emittedGroups = new Set<string>();
  const result: WorkingInvoiceRow[] = [];

  candidates.forEach((candidate) => {
    const group = groups.get(candidate.groupingKey) ?? [candidate];
    const groupCalculation = groupCalculations.get(candidate.groupingKey) ?? {
      canGroup: false,
      roundedSourceTotal: candidate.gross,
      quantityTotal: candidate.quantity,
    };

    if (groupCalculation.canGroup) {
      if (emittedGroups.has(candidate.groupingKey)) return;
      emittedGroups.add(candidate.groupingKey);
      const firstId = group[0].source.id || `employee-${group[0].sourceIndex + 1}`;
      result.push({
        id: `group-${firstId}`,
        kind: 'employee',
        descriptionEn: candidate.descriptionEn,
        descriptionAr: candidate.descriptionAr,
        billingBasis: candidate.source.billingBasis,
        quantity: decimalText(groupCalculation.quantityTotal),
        unitRate: trimmed(candidate.source.unitRate),
        gross: groupCalculation.roundedSourceTotal,
        sourceRowIds: group.map(
          (entry) => entry.source.id || `employee-${entry.sourceIndex + 1}`,
        ),
        grouped: true,
      });
      return;
    }

    // A rounding mismatch makes the would-be grouped quantity x rate unable to
    // explain the source total, so this employee stays at its original position.
    const sourceId = candidate.source.id || `employee-${candidate.sourceIndex + 1}`;
    result.push({
      id: sourceId,
      kind: 'employee',
      descriptionEn: candidate.descriptionEn,
      descriptionAr: candidate.descriptionAr,
      billingBasis: candidate.source.billingBasis,
      quantity: trimmed(candidate.source.quantity),
      unitRate: trimmed(candidate.source.unitRate),
      gross: candidate.gross,
      sourceRowIds: [sourceId],
      grouped: false,
    });
  });

  return result;
}

function employeeBreakdownRows(rows: EmployeeRow[]): CalculatedEmployeeRow[] {
  return rows.map((row, index) => {
    const gross = roundMoney(positiveDecimal(row.quantity).times(positiveDecimal(row.unitRate)));
    const grossAmount = asMoney(gross);
    return {
      id: row.id || `employee-${index + 1}`,
      employeeName: trimmed(row.employeeName),
      designationEn: trimmed(row.designationEn),
      designationAr: trimmed(row.designationAr),
      invoiceDescriptionEn: trimmed(row.invoiceDescriptionEn),
      invoiceDescriptionAr: trimmed(row.invoiceDescriptionAr),
      billingBasis: row.billingBasis,
      quantity: trimmed(row.quantity),
      unitRate: trimmed(row.unitRate),
      grossAmount,
      amount: grossAmount,
    };
  });
}

export function createServiceRow(id = nextRowId('service')): ServiceRow {
  return {
    id,
    descriptionEn: '',
    descriptionAr: '',
    billingBasis: 'Hour',
    quantity: '',
    unitRate: '',
  };
}

export function createEmployeeRow(id = nextRowId('employee')): EmployeeRow {
  return {
    id,
    employeeName: '',
    designationEn: '',
    designationAr: '',
    invoiceDescriptionEn: '',
    invoiceDescriptionAr: '',
    billingBasis: 'Hour',
    quantity: '',
    unitRate: '',
  };
}

/** Current date/time expressed in Saudi Arabia (UTC+03:00). */
export function getSaudiNow(now = new Date()): SaudiDateTimeDefaults {
  const saudi = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const year = saudi.getUTCFullYear();
  const month = pad2(saudi.getUTCMonth() + 1);
  const day = pad2(saudi.getUTCDate());
  const hours = pad2(saudi.getUTCHours());
  const minutes = pad2(saudi.getUTCMinutes());
  const seconds = pad2(saudi.getUTCSeconds());

  return {
    issueDate: `${year}-${month}-${day}`,
    issueTime: `${hours}:${minutes}:${seconds}`,
    billingMonth: `${year}-${month}`,
  };
}

export function blankInvoiceData(now = new Date()): InvoiceData {
  const defaults = getSaudiNow(now);
  return {
    sellerNameEn: 'NOORAH ZAID AL QARNI',
    sellerNameAr: '',
    sellerAddressEn: '',
    sellerAddressAr: '',
    sellerVatNumber: '',
    sellerCrNumber: '',
    sellerLogo: assetUrl('brand-logo.png'),

    buyerNameEn: '',
    buyerNameAr: '',
    buyerAddressEn: '',
    buyerAddressAr: '',
    buyerCityEn: '',
    buyerCityAr: '',
    buyerVatNumber: '',
    buyerCrNumber: '',

    invoiceNumber: '',
    issueDate: defaults.issueDate,
    issueTime: defaults.issueTime,
    billingMonth: defaults.billingMonth,
    currency: 'SAR',
    footerNote: '',
    includeBreakdown: false,

    entryMode: 'service',
    serviceRows: [createServiceRow()],
    employeeRows: [],
    discount: '0',
    applyVat: false,
  };
}

/** Explicitly fictional demonstration data; never loaded without user action. */
export function sampleInvoiceData(now = new Date()): InvoiceData {
  const defaults = getSaudiNow(now);
  return {
    sellerNameEn: 'Fictional Manpower Services LLC',
    sellerNameAr: 'شركة خدمات القوى العاملة التجريبية',
    sellerAddressEn: 'Sample Building, King Fahd Road, Riyadh, Saudi Arabia',
    sellerAddressAr: 'مبنى تجريبي، طريق الملك فهد، الرياض، المملكة العربية السعودية',
    sellerVatNumber: '300000000000003',
    sellerCrNumber: 'SAMPLE-CR-001',
    sellerLogo: assetUrl('brand-logo.png'),

    buyerNameEn: 'Fictional Industrial Client LLC',
    buyerNameAr: 'شركة العميل الصناعي التجريبية',
    buyerAddressEn: 'Sample Industrial Area, Jubail, Saudi Arabia',
    buyerAddressAr: 'المنطقة الصناعية التجريبية، الجبيل، المملكة العربية السعودية',
    buyerCityEn: 'Jubail',
    buyerCityAr: 'الجبيل',
    buyerVatNumber: '',
    buyerCrNumber: '',

    invoiceNumber: 'S-23',
    issueDate: defaults.issueDate,
    issueTime: defaults.issueTime,
    billingMonth: defaults.billingMonth,
    currency: 'SAR',
    footerNote: '',
    includeBreakdown: false,

    entryMode: 'service',
    serviceRows: [
      {
        id: 'sample-service-1',
        descriptionEn: 'Senior QC/QA Coordinator',
        descriptionAr: 'منسق أول لمراقبة وضمان الجودة',
        billingBasis: 'Hour',
        quantity: '295',
        unitRate: '24.00',
      },
      {
        id: 'sample-service-2',
        descriptionEn: 'Senior Fabricator',
        descriptionAr: 'فني تصنيع أول',
        billingBasis: 'Hour',
        quantity: '242',
        unitRate: '24.00',
      },
      {
        id: 'sample-service-3',
        descriptionEn: 'Loader Operator',
        descriptionAr: 'مشغل لودر',
        billingBasis: 'Hour',
        quantity: '253',
        unitRate: '24.00',
      },
      {
        id: 'sample-service-4',
        descriptionEn: 'Forklift Operators',
        descriptionAr: 'مشغلو الرافعات الشوكية',
        billingBasis: 'Hour',
        quantity: '792',
        unitRate: '18.00',
      },
      {
        id: 'sample-service-5',
        descriptionEn: 'Laborers',
        descriptionAr: 'عمال',
        billingBasis: 'Hour',
        quantity: '572',
        unitRate: '16.00',
      },
    ],
    employeeRows: [],
    discount: '0',
    applyVat: true,
  };
}

/**
 * Trim accidental surrounding whitespace without translating or otherwise
 * rewriting user-supplied wording.
 */
export function normalizeInvoiceData(data: InvoiceData): InvoiceData {
  return {
    ...data,
    sellerNameEn: trimmed(data.sellerNameEn),
    sellerNameAr: trimmed(data.sellerNameAr),
    sellerAddressEn: trimmed(data.sellerAddressEn),
    sellerAddressAr: trimmed(data.sellerAddressAr),
    sellerVatNumber: trimmed(data.sellerVatNumber),
    sellerCrNumber: trimmed(data.sellerCrNumber),
    buyerNameEn: trimmed(data.buyerNameEn),
    buyerNameAr: trimmed(data.buyerNameAr),
    buyerAddressEn: trimmed(data.buyerAddressEn),
    buyerAddressAr: trimmed(data.buyerAddressAr),
    buyerCityEn: trimmed(data.buyerCityEn),
    buyerCityAr: trimmed(data.buyerCityAr),
    buyerVatNumber: trimmed(data.buyerVatNumber),
    buyerCrNumber: trimmed(data.buyerCrNumber),
    invoiceNumber: trimmed(data.invoiceNumber),
    issueDate: trimmed(data.issueDate),
    issueTime: trimmed(data.issueTime),
    billingMonth: trimmed(data.billingMonth),
    footerNote: trimmed(data.footerNote),
    discount: trimmed(data.discount) || '0',
    serviceRows: data.serviceRows.map((row) => ({
      ...row,
      id: trimmed(row.id),
      descriptionEn: trimmed(row.descriptionEn),
      descriptionAr: trimmed(row.descriptionAr),
      quantity: trimmed(row.quantity),
      unitRate: trimmed(row.unitRate),
    })),
    employeeRows: data.employeeRows.map((row) => ({
      ...row,
      id: trimmed(row.id),
      employeeName: trimmed(row.employeeName),
      designationEn: trimmed(row.designationEn),
      designationAr: trimmed(row.designationAr),
      invoiceDescriptionEn: trimmed(row.invoiceDescriptionEn),
      invoiceDescriptionAr: trimmed(row.invoiceDescriptionAr),
      quantity: trimmed(row.quantity),
      unitRate: trimmed(row.unitRate),
    })),
  };
}

/**
 * Calculate a complete draft without throwing on partially entered form data.
 * Final actions must call validateInvoice first.
 */
export function calculateInvoice(data: InvoiceData): CalculatedInvoice {
  const workingRows =
    data.entryMode === 'combined'
      ? [...serviceWorkingRows(data.serviceRows), ...employeeWorkingRows(data.employeeRows)]
      : data.entryMode === 'employee'
      ? employeeWorkingRows(data.employeeRows)
      : serviceWorkingRows(data.serviceRows);

  const subtotal = roundMoney(sumDecimals(workingRows.map((row) => row.gross)));
  const enteredDiscount = roundMoney(nonNegativeDecimal(data.discount));
  const discount = Decimal.min(enteredDiscount, subtotal);
  const discountCents = discount.times(100);
  const grossCents = workingRows.map((row) => row.gross.times(100));
  const allocatedDiscountCents = allocateCents(discountCents, grossCents);
  const taxableAmounts = workingRows.map((row, index) =>
    row.gross.minus(allocatedDiscountCents[index].dividedBy(100)),
  );
  const taxableTotal = roundMoney(subtotal.minus(discount));
  const vatTotal = data.applyVat ? roundMoney(taxableTotal.times(VAT_RATE)) : ZERO;
  const taxableCents = taxableAmounts.map((amount) => amount.times(100));
  const allocatedVatCents = allocateCents(vatTotal.times(100), taxableCents);

  const rows: CalculatedInvoiceRow[] = workingRows.map((row, index) => {
    const allocatedDiscount = allocatedDiscountCents[index].dividedBy(100);
    const taxable = taxableAmounts[index];
    const vat = allocatedVatCents[index].dividedBy(100);
    const total = taxable.plus(vat);
    const totalAmount = asMoney(total);
    return {
      id: row.id,
      kind: row.kind,
      descriptionEn: row.descriptionEn,
      descriptionAr: row.descriptionAr,
      billingBasis: row.billingBasis,
      quantity: row.quantity,
      unitRate: row.unitRate,
      grossAmount: asMoney(row.gross),
      allocatedDiscount: asMoney(allocatedDiscount),
      taxableAmount: asMoney(taxable),
      taxRate: data.applyVat ? '15%' : '0%',
      vatAmount: asMoney(vat),
      totalAmount,
      totalIncludingVat: totalAmount,
      sourceRowIds: row.sourceRowIds,
      grouped: row.grouped,
    };
  });

  return {
    rows,
    serviceSubtotal: asMoney(sumDecimals(workingRows.filter(row => row.kind === 'service').map(row => row.gross))),
    employeeSubtotal: asMoney(sumDecimals(workingRows.filter(row => row.kind === 'employee').map(row => row.gross))),
    breakdownRows: data.entryMode !== 'service' ? employeeBreakdownRows(data.employeeRows) : [],
    totals: {
      subtotal: asMoney(subtotal),
      discount: asMoney(discount),
      taxableTotal: asMoney(taxableTotal),
      vatAmount: asMoney(vatTotal),
      grandTotal: asMoney(taxableTotal.plus(vatTotal)),
    },
    billingMonthNote: formatBillingMonthNote(data.billingMonth),
    billingMonthShort: formatBillingMonthShort(data.billingMonth),
    issueTimestamp: formatIssueTimestamp(data.issueDate, data.issueTime),
  };
}

export function validateInvoice(
  data: InvoiceData,
  options: InvoiceValidationOptions = {},
): InvoiceValidationResult {
  const errors: InvoiceFieldErrors = {};
  const addError = (path: string, message: string): void => {
    if (!errors[path]) errors[path] = message;
  };
  const requireText = (path: string, value: string, label: string): void => {
    if (!trimmed(value)) addError(path, `${label} is required.`);
  };

  requireText('sellerNameEn', data.sellerNameEn, 'Company name in English');
  requireText('sellerNameAr', data.sellerNameAr, 'Company name in Arabic');
  requireText('sellerAddressEn', data.sellerAddressEn, 'Seller address in English');
  requireText('sellerAddressAr', data.sellerAddressAr, 'Seller address in Arabic');
  requireText('sellerVatNumber', data.sellerVatNumber, 'Seller VAT number');
  requireText('sellerCrNumber', data.sellerCrNumber, 'Seller CR number');

  const sellerVatNumber = trimmed(data.sellerVatNumber);
  if (sellerVatNumber && !/^\d{15}$/.test(sellerVatNumber)) {
    addError('sellerVatNumber', 'Seller VAT number must contain exactly 15 digits.');
  }

  requireText('buyerNameEn', data.buyerNameEn, 'Client company name in English');
  requireText('buyerNameAr', data.buyerNameAr, 'Client company name in Arabic');
  requireText('buyerAddressEn', data.buyerAddressEn, 'Buyer address in English');
  requireText('buyerAddressAr', data.buyerAddressAr, 'Buyer address in Arabic');
  requireText('buyerCityEn', data.buyerCityEn, 'Buyer city in English');

  const buyerVatNumber = trimmed(data.buyerVatNumber);
  if (buyerVatNumber && !/^\d{15}$/.test(buyerVatNumber)) {
    addError('buyerVatNumber', 'Client VAT number must contain exactly 15 digits when supplied.');
  }

  requireText('invoiceNumber', data.invoiceNumber, 'Invoice number');
  requireText('issueDate', data.issueDate, 'Issue date');
  if (trimmed(data.issueDate) && !isValidIssueDate(trimmed(data.issueDate))) {
    addError('issueDate', 'Enter a valid issue date.');
  }
  requireText('issueTime', data.issueTime, 'Issue time');
  if (trimmed(data.issueTime) && !isValidIssueTime(trimmed(data.issueTime))) {
    addError('issueTime', 'Enter issue time including seconds (HH:mm:ss).');
  }
  requireText('billingMonth', data.billingMonth, 'Billing month');
  if (trimmed(data.billingMonth) && !isValidBillingMonth(trimmed(data.billingMonth))) {
    addError('billingMonth', 'Enter a valid billing month.');
  }
  if (data.currency !== 'SAR') addError('currency', 'Currency must be SAR.');
  if (typeof data.includeBreakdown !== 'boolean') {
    addError('includeBreakdown', 'Choose whether to include the employee breakdown.');
  }
  if (data.entryMode === 'service' && data.includeBreakdown) {
    addError('includeBreakdown', 'Employee breakdown is available only in Employee mode.');
  }

  const validateQuantityAndRate = (
    rowPath: string,
    quantity: string,
    unitRate: string,
  ): void => {
    if (!isPositiveInput(quantity)) {
      addError(
        `${rowPath}.quantity`,
        'Quantity must be a positive number with no more than 4 decimal places.',
      );
    }
    if (!isPositiveInput(unitRate)) {
      addError(
        `${rowPath}.unitRate`,
        'Unit rate must be a positive SAR amount with no more than 4 decimal places.',
      );
    }
  };

  if (data.entryMode === 'service' || data.entryMode === 'combined') {
    if (data.serviceRows.length === 0 && data.entryMode === 'service') {
      addError('serviceRows', 'Add at least one service row.');
    }
    data.serviceRows.forEach((row, index) => {
      const rowPath = `serviceRows.${index}`;
      requireText(`${rowPath}.descriptionEn`, row.descriptionEn, 'Service description in English');
      if (!BILLING_BASES.includes(row.billingBasis)) {
        addError(`${rowPath}.billingBasis`, 'Choose Hour, Day, or Month.');
      }
      validateQuantityAndRate(rowPath, row.quantity, row.unitRate);
    });
  }
  if (data.entryMode === 'employee' || data.entryMode === 'combined') {
    if (data.employeeRows.length === 0) {
      addError('employeeRows', 'Add at least one employee row.');
    }
    data.employeeRows.forEach((row, index) => {
      const rowPath = `employeeRows.${index}`;
      requireText(`${rowPath}.employeeName`, row.employeeName, 'Employee name');
      requireText(`${rowPath}.designationEn`, row.designationEn, 'Employee designation');
      requireText(
        `${rowPath}.invoiceDescriptionEn`,
        row.invoiceDescriptionEn,
        'Invoice description in English',
      );
      if (!BILLING_BASES.includes(row.billingBasis)) {
        addError(`${rowPath}.billingBasis`, 'Choose Hour, Day, or Month.');
      }
      validateQuantityAndRate(rowPath, row.quantity, row.unitRate);
    });
  } else if (data.entryMode !== 'service') {
    addError('entryMode', 'Choose Service rows or Employee rows.');
  }

  const discountText = trimmed(data.discount) || '0';
  if (!TWO_PLACE_DECIMAL_PATTERN.test(discountText)) {
    addError('discount', 'Discount must be a non-negative SAR amount with no more than 2 decimals.');
  } else {
    const discount = new Decimal(discountText);
    const subtotal = new Decimal(calculateInvoice({ ...data, discount: '0' }).totals.subtotal);
    if (discount.greaterThan(subtotal)) {
      addError('discount', 'Discount cannot exceed the subtotal.');
    }
  }



  const firstErrorPath = Object.keys(errors)[0];
  return {
    valid: firstErrorPath === undefined,
    errors,
    ...(firstErrorPath ? { firstErrorPath } : {}),
  };
}

export function formatMoney(value: string | number | Decimal): string {
  const parsed = parseDecimal(value) ?? ZERO;
  return addThousandsSeparators(asMoney(parsed));
}

export function formatSar(value: string | number | Decimal): string {
  return `SAR ${formatMoney(value)}`;
}

export function formatQuantity(value: string | number | Decimal): string {
  const parsed = parseDecimal(value) ?? ZERO;
  return addThousandsSeparators(decimalText(parsed, 4));
}

export function formatRate(value: string | number | Decimal): string {
  const parsed = parseDecimal(value) ?? ZERO;
  return addThousandsSeparators(decimalText(parsed, 4, 2));
}

export function billingBasisUnit(basis: BillingBasis, quantity: string | number | Decimal): string {
  const parsed = parseDecimal(quantity) ?? ZERO;
  const singular = parsed.equals(1);
  if (basis === 'Hour') return singular ? 'hr' : 'hrs';
  if (basis === 'Day') return singular ? 'day' : 'days';
  return singular ? 'month' : 'months';
}

export function formatQuantityWithUnit(
  quantity: string | number | Decimal,
  basis: BillingBasis,
): string {
  return `${formatQuantity(quantity)} ${billingBasisUnit(basis, quantity)}`;
}

export function formatBillingMonthNote(value: string): string {
  const parts = billingMonthParts(trimmed(value));
  return parts ? `This Invoice Month Of ${MONTH_NAMES[parts.monthIndex]} - ${parts.year}` : '';
}

export function formatBillingMonthShort(value: string): string {
  const parts = billingMonthParts(trimmed(value));
  return parts ? `${MONTH_NAMES_SHORT[parts.monthIndex]}-${parts.year.slice(-2)}` : '';
}

export function formatIssueTimestamp(issueDate: string, issueTime: string): string {
  const date = trimmed(issueDate);
  const time = trimmed(issueTime).slice(0, 5);
  return [date, time].filter(Boolean).join(' ');
}

export function sanitizeFilenamePart(value: string): string {
  return trimmed(value)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80);
}

export function buildInvoiceFilename(data: InvoiceData): string {
  const month = billingMonthParts(trimmed(data.billingMonth));
  const invoiceNumber = sanitizeFilenamePart(data.invoiceNumber) || 'Draft';
  const monthPart = month ? `${MONTH_NAMES[month.monthIndex]}_${month.year}` : 'Undated';
  return `Invoice_${invoiceNumber}_${monthPart}.pdf`;
}
