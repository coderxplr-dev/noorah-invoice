import type { ReactNode } from 'react';
import type { InvoiceData } from '../types';
import {
  calculateInvoice,
  formatMoney,
  formatQuantity,
  formatQuantityWithUnit,
  formatRate,
  formatSar,
} from '../lib/invoice';
import { isZatcaQrComplete } from '../lib/zatcaQr';
import ZatcaQr from './ZatcaQr';

interface InvoicePreviewProps {
  data: InvoiceData;
  compact?: boolean;
}

interface BilingualRow {
  labelEn: string;
  labelAr: string;
  valueEn: ReactNode;
  valueAr: ReactNode;
  invariant?: boolean;
}

const DASH = '—';

function valueOrDash(value: string): string {
  return value.trim() || DASH;
}

function Identifier({ value }: { value: string }) {
  return (
    <bdi className="invoice-identifier" dir="ltr">
      {valueOrDash(value)}
    </bdi>
  );
}

function BilingualInfoTable({
  label,
  rows,
}: {
  label: string;
  rows: BilingualRow[];
}) {
  return (
    <div className="invoice-info-table-wrap">
      <table className="bilingual-table">
        <caption className="sr-only">{label}</caption>
        <colgroup>
          <col className="bilingual-table__label-column" />
          <col className="bilingual-table__value-column" />
          <col className="bilingual-table__value-column" />
          <col className="bilingual-table__label-column" />
        </colgroup>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.labelEn}-${row.labelAr}`}>
              <th scope="row" lang="en">
                {row.labelEn}
              </th>
              <td dir={row.invariant ? 'ltr' : undefined}>{row.valueEn}</td>
              <td
                className="invoice-arabic-value"
                dir={row.invariant ? 'ltr' : 'rtl'}
                lang={row.invariant ? undefined : 'ar'}
              >
                {row.valueAr}
              </td>
              <th className="invoice-arabic-label" scope="row" dir="rtl" lang="ar">
                {row.labelAr}
              </th>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="invoice-section-heading">{children}</h2>;
}

function BilingualColumnHeading({ en, ar }: { en: string; ar: string }) {
  return (
    <span className="invoice-column-heading">
      <span lang="en">{en}</span>
      <span dir="rtl" lang="ar">
        {ar}
      </span>
    </span>
  );
}

function Money({ value, withCurrency = false }: { value: string; withCurrency?: boolean }) {
  return (
    <span className="invoice-money" dir="ltr">
      {withCurrency ? formatSar(value) : formatMoney(value)}
    </span>
  );
}

function Rate({ value }: { value: string }) {
  return (
    <span className="invoice-money" dir="ltr">
      {formatRate(value)}
    </span>
  );
}

export default function InvoicePreview({ data, compact = false }: InvoicePreviewProps) {
  const calculated = calculateInvoice(data);
  const serviceRows = calculated.rows.filter(row => row.kind === 'service');
  const pageCount = 1;
  const hourlyBreakdown =
    calculated.breakdownRows.length > 0 &&
    calculated.breakdownRows.every((row) => row.billingBasis === 'Hour');

  const sellerRows: BilingualRow[] = [
    {
      labelEn: 'Name',
      labelAr: 'الاسم',
      valueEn: valueOrDash(data.sellerNameEn),
      valueAr: valueOrDash(data.sellerNameAr),
    },
    {
      labelEn: 'Full Address',
      labelAr: 'العنوان الكامل',
      valueEn: valueOrDash(data.sellerAddressEn),
      valueAr: valueOrDash(data.sellerAddressAr),
    },
    {
      labelEn: 'VAT Number',
      labelAr: 'الرقم الضريبي',
      valueEn: <Identifier value={data.sellerVatNumber} />,
      valueAr: <Identifier value={data.sellerVatNumber} />,
      invariant: true,
    },
    {
      labelEn: 'CR Number',
      labelAr: 'رقم السجل التجاري',
      valueEn: <Identifier value={data.sellerCrNumber} />,
      valueAr: <Identifier value={data.sellerCrNumber} />,
      invariant: true,
    },
  ];

  const buyerRows: BilingualRow[] = [
    {
      labelEn: 'Name',
      labelAr: 'الاسم',
      valueEn: valueOrDash(data.buyerNameEn),
      valueAr: valueOrDash(data.buyerNameAr),
    },
    {
      labelEn: 'Full Address',
      labelAr: 'العنوان الكامل',
      valueEn: valueOrDash(data.buyerAddressEn),
      valueAr: valueOrDash(data.buyerAddressAr),
    },
    {
      labelEn: 'CR Number',
      labelAr: 'رقم السجل التجاري',
      valueEn: <Identifier value={data.buyerCrNumber} />,
      valueAr: <Identifier value={data.buyerCrNumber} />,
      invariant: true,
    },
    {
      labelEn: 'City',
      labelAr: 'المدينة',
      valueEn: valueOrDash(data.buyerCityEn),
      valueAr: valueOrDash(data.buyerCityAr),
    },
    {
      labelEn: 'VAT Number',
      labelAr: 'الرقم الضريبي',
      valueEn: <Identifier value={data.buyerVatNumber} />,
      valueAr: <Identifier value={data.buyerVatNumber} />,
      invariant: true,
    },
  ];

  const metaRows: BilingualRow[] = [
    {
      labelEn: 'Invoice Number',
      labelAr: 'رقم الفاتورة',
      valueEn: <Identifier value={data.invoiceNumber} />,
      valueAr: <Identifier value={data.invoiceNumber} />,
      invariant: true,
    },
    {
      labelEn: 'Issue Date / Time',
      labelAr: 'تاريخ / وقت الإصدار',
      valueEn: <Identifier value={calculated.issueTimestamp} />,
      valueAr: <Identifier value={calculated.issueTimestamp} />,
      invariant: true,
    },
  ];

  return (
    <div
      className={`invoice-preview${compact ? ' invoice-preview--compact' : ''}`}
      aria-label="Live invoice document preview"
    >
      <article className="invoice-sheet" aria-label="Tax invoice page">
        <header className="invoice-header">
          <div className="invoice-company invoice-company--english" lang="en">
            <h1>{valueOrDash(data.sellerNameEn)}</h1>
            <p>
              <span>CR</span> <Identifier value={data.sellerCrNumber} />
            </p>
            <p>
              <span>VAT</span> <Identifier value={data.sellerVatNumber} />
            </p>
          </div>

          <div className="invoice-logo-slot" aria-label="Invoice QR code or seller logo">
            {isZatcaQrComplete(data) ? (
              <ZatcaQr data={data} size={64} className="invoice-header-qr" />
            ) : data.sellerLogo ? (
              <img className="invoice-logo" src={data.sellerLogo} alt="Seller company logo" />
            ) : (
              <span className="invoice-logo-placeholder" aria-hidden="true" />
            )}
          </div>

          <div className="invoice-company invoice-company--arabic" dir="rtl" lang="ar">
            <h1>{valueOrDash(data.sellerNameAr)}</h1>
            <p>
              <span>السجل التجاري</span>{' '}
              <Identifier value={data.sellerCrNumber} />
            </p>
            <p>
              <span>الرقم الضريبي</span>{' '}
              <Identifier value={data.sellerVatNumber} />
            </p>
          </div>
        </header>

        <div className="invoice-title-block">
          <p lang="en">TAX INVOICE</p>
          <span aria-hidden="true">/</span>
          <p dir="rtl" lang="ar">
            فاتورة ضريبية
          </p>
        </div>

        <section className="invoice-section invoice-section--meta" aria-label="Invoice identification">
          <BilingualInfoTable label="Invoice identification" rows={metaRows} />
        </section>

        <section className="invoice-section" aria-labelledby="seller-heading">
          <SectionHeading>
            <span id="seller-heading" lang="en">
              Seller
            </span>
            <span aria-hidden="true"> / </span>
            <span dir="rtl" lang="ar">
              البائع
            </span>
          </SectionHeading>
          <BilingualInfoTable label="Seller details" rows={sellerRows} />
        </section>

        <section className="invoice-section" aria-labelledby="buyer-heading">
          <SectionHeading>
            <span id="buyer-heading" lang="en">
              Buyer
            </span>
            <span aria-hidden="true"> / </span>
            <span dir="rtl" lang="ar">
              المشتري
            </span>
          </SectionHeading>
          <BilingualInfoTable label="Buyer details" rows={buyerRows} />
        </section>

        <section className="invoice-section invoice-lines-section" aria-labelledby="lines-heading">
          <SectionHeading>
            <span id="lines-heading">Services</span>
            <span aria-hidden="true"> / </span>
            <span dir="rtl" lang="ar">
              بنود الفاتورة
            </span>
          </SectionHeading>
          <div className="invoice-table-scroll" tabIndex={0} aria-label="Scrollable invoice items">
            <table className="line-items-table">
              <caption className="sr-only">Invoice line items</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <BilingualColumnHeading
                      en="Nature of Goods or Services"
                      ar="طبيعة السلع أو الخدمات"
                    />
                  </th>
                  <th scope="col">
                    <BilingualColumnHeading en="Unit Price" ar="سعر الوحدة" />
                  </th>
                  <th scope="col">
                    <BilingualColumnHeading en="Quantity" ar="الكمية" />
                  </th>
                  <th scope="col">
                    <BilingualColumnHeading
                      en="Taxable Amount"
                      ar="المبلغ الخاضع للضريبة"
                    />
                  </th>
                  <th scope="col">
                    <BilingualColumnHeading en="Tax Rate" ar="معدل الضريبة" />
                  </th>
                  <th scope="col">
                    <BilingualColumnHeading en="Tax Amount" ar="مبلغ الضريبة" />
                  </th>
                  <th scope="col">
                    <BilingualColumnHeading
                      en="Item Subtotal Including VAT"
                      ar="الإجمالي شامل الضريبة"
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {serviceRows.length === 0 ? (
                  <tr>
                    <td className="invoice-empty-row" colSpan={7}>
                      No service charges.
                    </td>
                  </tr>
                ) : (
                  serviceRows.map((row) => (
                    <tr key={row.id}>
                      <td className="invoice-description-cell">
                        <span lang="en">{valueOrDash(row.descriptionEn)}</span>
                        {row.descriptionAr.trim() && (
                          <span dir="rtl" lang="ar">
                            {row.descriptionAr}
                          </span>
                        )}
                        {row.grouped && (
                          <small>
                            {row.sourceRowIds.length} employees /{' '}
                            <span dir="rtl" lang="ar">
                              {row.sourceRowIds.length} موظفين
                            </span>
                          </small>
                        )}
                      </td>
                      <td>
                        <Rate value={row.unitRate} />
                      </td>
                      <td className="invoice-quantity" dir="ltr">
                        {formatQuantityWithUnit(row.quantity, row.billingBasis)}
                      </td>
                      <td>
                        <Money value={row.taxableAmount} />
                      </td>
                      <td dir="ltr">{row.taxRate}</td>
                      <td>
                        <Money value={row.vatAmount} />
                      </td>
                      <td>
                        <Money value={row.totalIncludingVat} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="invoice-table-currency" aria-label="All monetary values are in Saudi riyals">
            Amounts in SAR / <span dir="rtl" lang="ar">المبالغ بالريال السعودي</span>
          </p>
        </section>

        <p className="section-charge-total">Services charges / <span lang="ar" dir="rtl">إجمالي الخدمات</span>: <Money value={calculated.serviceSubtotal} withCurrency /></p>

        {data.entryMode !== 'service' && <section className="invoice-section" aria-label="Employees and charges">
          <SectionHeading>Employees / <span lang="ar" dir="rtl">الموظفون</span></SectionHeading>
          <div className="invoice-table-scroll">
            <table className="breakdown-table">
              <thead><tr>
                <th><BilingualColumnHeading en="Sr. No." ar="م" /></th>
                <th><BilingualColumnHeading en="Employee Name" ar="اسم الموظف" /></th>
                <th><BilingualColumnHeading en="Designation" ar="المسمى الوظيفي" /></th>
                <th><BilingualColumnHeading en="Quantity / Unit" ar="الكمية / الوحدة" /></th>
                <th><BilingualColumnHeading en="Unit Rate" ar="سعر الوحدة" /></th>
                <th><BilingualColumnHeading en="Charge (excl. VAT)" ar="المبلغ قبل الضريبة" /></th>
              </tr></thead>
              <tbody>{calculated.breakdownRows.map((row, index) => <tr key={row.id}>
                <td>{index + 1}</td><td>{valueOrDash(row.employeeName)}</td>
                <td>{valueOrDash(row.designationEn)}<div dir="rtl" lang="ar">{row.designationAr}</div></td>
                <td>{formatQuantityWithUnit(row.quantity, row.billingBasis)}</td>
                <td><Rate value={row.unitRate} /></td><td><Money value={row.grossAmount} /></td>
              </tr>)}</tbody>
            </table>
          </div>
          <p className="section-charge-total">Employees charges / <span lang="ar" dir="rtl">إجمالي الموظفين</span>: <Money value={calculated.employeeSubtotal} withCurrency /></p>
        </section>}

        <section className="invoice-totals-section" aria-label="Invoice totals">
          <table className="invoice-totals">
            <caption className="sr-only">Invoice totals in Saudi riyals</caption>
            <tbody>
              <tr>
                <th scope="row">
                  <span>Total Excluding VAT</span>
                  <span dir="rtl" lang="ar">
                    الإجمالي بدون ضريبة
                  </span>
                </th>
                <td>
                  <Money value={calculated.totals.subtotal} withCurrency />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <span>Discount</span>
                  <span dir="rtl" lang="ar">
                    الخصم
                  </span>
                </th>
                <td>
                  <Money value={calculated.totals.discount} withCurrency />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <span>Total Taxable Amount Excluding VAT</span>
                  <span dir="rtl" lang="ar">
                    إجمالي المبلغ الخاضع بدون الضريبة
                  </span>
                </th>
                <td>
                  <Money value={calculated.totals.taxableTotal} withCurrency />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <span>Total VAT ({data.applyVat ? "15%" : "0%"})</span>
                  <span dir="rtl" lang="ar">
                    إجمالي ضريبة القيمة المضافة ({data.applyVat ? "15٪" : "0٪"})
                  </span>
                </th>
                <td>
                  <Money value={calculated.totals.vatAmount} withCurrency />
                </td>
              </tr>
              <tr className="invoice-totals__grand-total">
                <th scope="row">
                  <span>Grand Total</span>
                  <span dir="rtl" lang="ar">
                    الإجمالي النهائي
                  </span>
                </th>
                <td>
                  <Money value={calculated.totals.grandTotal} withCurrency />
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <footer className="invoice-footer">
          <div className="invoice-notes">
            <p>
              <strong>Billing period / <span dir="rtl" lang="ar">فترة الفاتورة</span>:</strong>{' '}
              {valueOrDash(calculated.billingMonthNote)}
            </p>
            {data.footerNote.trim() && (
              <p className="invoice-additional-note">
                <strong>Additional note / <span dir="rtl" lang="ar">ملاحظة إضافية</span>:</strong>{' '}
                {data.footerNote}
              </p>
            )}
          </div>
          <p className="invoice-page-number" aria-label={`Page 1 of ${pageCount}`}>
            Page 1 / {pageCount}
          </p>
        </footer>
      </article>

    </div>
  );
}

export { InvoicePreview };
export type { InvoicePreviewProps };
