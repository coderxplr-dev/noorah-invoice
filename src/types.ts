export type BillingBasis = 'Hour' | 'Day' | 'Month';

export type EntryMode = 'service' | 'employee' | 'combined';

export interface ServiceRow {
  id: string;
  descriptionEn: string;
  descriptionAr: string;
  billingBasis: BillingBasis;
  /** Decimal text entered by the user. */
  quantity: string;
  /** VAT-exclusive SAR amount entered by the user. */
  unitRate: string;
}

export interface EmployeeRow {
  id: string;
  employeeName: string;
  designationEn: string;
  designationAr: string;
  invoiceDescriptionEn: string;
  invoiceDescriptionAr: string;
  billingBasis: BillingBasis;
  /** Approved hours, days, or the agreed month fraction. */
  quantity: string;
  /** VAT-exclusive SAR amount entered by the user. */
  unitRate: string;
}

/**
 * The single source of truth shared by the editor, HTML preview, and PDF.
 * User-entered decimals intentionally remain strings until they reach the
 * Decimal.js calculation boundary.
 */
export interface InvoiceData {
  sellerNameEn: string;
  sellerNameAr: string;
  sellerAddressEn: string;
  sellerAddressAr: string;
  sellerVatNumber: string;
  sellerCrNumber: string;
  sellerLogo: string | null;

  buyerNameEn: string;
  buyerNameAr: string;
  buyerAddressEn: string;
  buyerAddressAr: string;
  buyerCityEn: string;
  buyerCityAr: string;
  buyerVatNumber: string;
  buyerCrNumber: string;

  invoiceNumber: string;
  /** YYYY-MM-DD in Saudi local time. */
  issueDate: string;
  /** HH:mm:ss in Saudi local time. */
  issueTime: string;
  /** YYYY-MM, independently selected from issueDate. */
  billingMonth: string;
  currency: 'SAR';
  footerNote: string;
  includeBreakdown: boolean;

  entryMode: EntryMode;
  serviceRows: ServiceRow[];
  employeeRows: EmployeeRow[];
  /** Fixed invoice-level SAR discount entered by the user. */
  discount: string;
  /** Controls whether 15% VAT is added. */
  applyVat: boolean;
}

export interface CalculatedInvoiceRow {
  id: string;
  kind: EntryMode;
  descriptionEn: string;
  descriptionAr: string;
  billingBasis: BillingBasis;
  quantity: string;
  unitRate: string;
  /** Sum of rounded source-row charges, before discount and VAT. */
  grossAmount: string;
  allocatedDiscount: string;
  taxableAmount: string;
  taxRate: '15%' | '0%';
  vatAmount: string;
  totalAmount: string;
  /** Alias convenient for invoice renderers. */
  totalIncludingVat: string;
  sourceRowIds: string[];
  grouped: boolean;
}

export interface CalculatedEmployeeRow {
  id: string;
  employeeName: string;
  designationEn: string;
  designationAr: string;
  invoiceDescriptionEn: string;
  invoiceDescriptionAr: string;
  billingBasis: BillingBasis;
  quantity: string;
  unitRate: string;
  /** Employee charge before invoice-level discount and VAT. */
  grossAmount: string;
  /** Backwards-friendly alias for table renderers. */
  amount: string;
}

export interface InvoiceTotals {
  subtotal: string;
  discount: string;
  taxableTotal: string;
  vatAmount: string;
  grandTotal: string;
}

export interface CalculatedInvoice {
  serviceSubtotal: string;
  employeeSubtotal: string;
  rows: CalculatedInvoiceRow[];
  breakdownRows: CalculatedEmployeeRow[];
  totals: InvoiceTotals;
  billingMonthNote: string;
  billingMonthShort: string;
  issueTimestamp: string;
}

export type InvoiceFieldErrors = Record<string, string>;

export interface InvoiceValidationResult {
  valid: boolean;
  errors: InvoiceFieldErrors;
  firstErrorPath?: string;
}

export interface InvoiceValidationOptions {
  /** Defaults to true for final PDF generation and printing. */
  requireVatConfirmation?: boolean;
}

export interface SaudiDateTimeDefaults {
  issueDate: string;
  issueTime: string;
  billingMonth: string;
}
