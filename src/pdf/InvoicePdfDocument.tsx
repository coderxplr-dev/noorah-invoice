import React from 'react';
import { assetUrl } from '../lib/assets';
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';

import { calculateInvoice, formatMoney, formatQuantity, formatRate } from '../lib/invoice';
import type {
  BillingBasis,
  CalculatedEmployeeRow,
  CalculatedInvoice,
  CalculatedInvoiceRow,
  InvoiceData,
  InvoiceTotals,
} from '../types';
import { buildZatcaQrSvgDataUrl } from '../lib/zatcaQr';

const COLORS = {
  ink: '#20262d',
  muted: '#5d6873',
  rule: '#aeb7bf',
  strongRule: '#6e7882',
  section: '#e8ecef',
  header: '#dfe4e8',
  light: '#f5f7f8',
  white: '#ffffff',
  accent: '#123c58',
};

const FONT_FILES = {
  latinRegular: 'NotoSans-Regular.ttf',
  latinSemiBold: 'NotoSans-SemiBold.ttf',
  arabicRegular: 'NotoSansArabic-Regular.ttf',
  arabicSemiBold: 'NotoSansArabic-SemiBold.ttf',
} as const;

export interface InvoicePdfFontSources {
  latinRegular: string;
  latinSemiBold: string;
  arabicRegular: string;
  arabicSemiBold: string;
}

const registeredFontKeys = new Set<string>();
let hyphenationConfigured = false;

function fontSourcesFromBase(basePath: string): InvoicePdfFontSources {
  const normalized = basePath.replace(/\/$/, '');
  return {
    latinRegular: `${normalized}/${FONT_FILES.latinRegular}`,
    latinSemiBold: `${normalized}/${FONT_FILES.latinSemiBold}`,
    arabicRegular: `${normalized}/${FONT_FILES.arabicRegular}`,
    arabicSemiBold: `${normalized}/${FONT_FILES.arabicSemiBold}`,
  };
}

/**
 * Registers the bundled Latin and Arabic fonts used by the document.
 * Browser callers can omit the argument. Node renderers should pass absolute
 * paths (the sample renderer demonstrates this) so no URL resolution is left
 * to the PDF renderer.
 */
export function configureInvoicePdfFonts(
  source: string | InvoicePdfFontSources = assetUrl('fonts'),
): void {
  const fonts = typeof source === 'string' ? fontSourcesFromBase(source) : source;
  const key = JSON.stringify(fonts);

  if (!registeredFontKeys.has(key)) {
    Font.register({
      family: 'InvoiceLatin',
      fonts: [
        { src: fonts.latinRegular, fontWeight: 400 },
        { src: fonts.latinSemiBold, fontWeight: 600 },
      ],
    });
    Font.register({
      family: 'InvoiceArabic',
      fonts: [
        { src: fonts.arabicRegular, fontWeight: 400 },
        { src: fonts.arabicSemiBold, fontWeight: 600 },
      ],
    });
    registeredFontKeys.add(key);
  }

  if (!hyphenationConfigured) {
    // Invoice identifiers and bilingual names should wrap only at natural
    // boundaries; automatic hyphenation is particularly harmful to Arabic.
    Font.registerHyphenationCallback((word) => [word]);
    hyphenationConfigured = true;
  }
}

if (typeof window !== 'undefined') {
  configureInvoicePdfFonts();
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.white,
    color: COLORS.ink,
    fontFamily: 'InvoiceLatin',
    fontSize: 7.3,
    lineHeight: 1.3,
    paddingTop: 23,
    paddingRight: 29,
    paddingBottom: 34,
    paddingLeft: 29,
  },
  arabic: {
    fontFamily: 'InvoiceArabic',
    direction: 'rtl',
    textAlign: 'right',
  },
  ltr: {
    direction: 'ltr',
  },
  semibold: {
    fontWeight: 600,
  },
  documentHeader: {
    borderBottomWidth: 0.8,
    borderBottomColor: COLORS.strongRule,
    paddingBottom: 8,
    marginBottom: 8,
  },
  companyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  companyHeaderSide: {
    width: '41%',
  },
  companyHeaderCenter: {
    width: '18%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyName: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1.2,
  },
  companyIdentifier: {
    color: COLORS.muted,
    fontSize: 6.4,
    marginTop: 2,
  },
  logo: {
    width: 44,
    height: 34,
    objectFit: 'contain',
  },
  headerQr: {
    width: 52,
    height: 52,
    objectFit: 'contain',
  },
  titleBox: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    alignItems: 'center',
    marginTop: 5,
  },
  titleEn: {
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 0.7,
  },
  titleAr: {
    fontFamily: 'InvoiceArabic',
    fontSize: 11,
    fontWeight: 600,
    marginTop: 1,
  },
  continuationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 0.8,
    borderBottomColor: COLORS.strongRule,
    paddingBottom: 6,
    marginBottom: 8,
  },
  continuationCompany: {
    width: '35%',
    color: COLORS.accent,
    fontSize: 8.2,
    fontWeight: 600,
  },
  continuationTitle: {
    width: '30%',
    textAlign: 'center',
    fontSize: 9,
    fontWeight: 600,
  },
  continuationInvoice: {
    width: '35%',
    textAlign: 'right',
    color: COLORS.muted,
    fontSize: 7,
  },
  metaTable: {
    flexDirection: 'row',
    borderLeftWidth: 0.55,
    borderTopWidth: 0.55,
    borderColor: COLORS.rule,
    marginBottom: 8,
  },
  metaCell: {
    width: '50%',
    flexDirection: 'row',
    borderRightWidth: 0.55,
    borderBottomWidth: 0.55,
    borderColor: COLORS.rule,
    minHeight: 28,
  },
  metaLabel: {
    width: '38%',
    backgroundColor: COLORS.light,
    borderRightWidth: 0.55,
    borderColor: COLORS.rule,
    padding: 4,
    justifyContent: 'center',
  },
  metaValue: {
    width: '62%',
    padding: 4,
    justifyContent: 'center',
    fontSize: 8,
    fontWeight: 600,
  },
  microArabic: {
    fontFamily: 'InvoiceArabic',
    direction: 'rtl',
    textAlign: 'left',
    color: COLORS.muted,
    fontSize: 6,
    marginTop: 1,
  },
  section: {
    marginBottom: 6,
  },
  sectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.section,
    borderWidth: 0.55,
    borderColor: COLORS.rule,
    paddingVertical: 3.5,
    paddingHorizontal: 5,
  },
  sectionTitle: {
    fontSize: 8.2,
    fontWeight: 600,
  },
  chargesHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 26,
    paddingTop: 5,
    paddingBottom: 7,
    gap: 4,
  },
  chargesSubtotal: {
    paddingTop: 7,
    paddingBottom: 9,
    textAlign: 'right',
    fontWeight: 600,
    fontSize: 7.5,
  },
  sectionTitleAr: {
    fontFamily: 'InvoiceArabic',
    direction: 'rtl',
    fontSize: 7.8,
    fontWeight: 600,
  },
  partyTable: {
    borderLeftWidth: 0.55,
    borderColor: COLORS.rule,
  },
  partyRow: {
    flexDirection: 'row',
  },
  partyLabelEn: {
    width: '18%',
    backgroundColor: COLORS.light,
    borderRightWidth: 0.55,
    borderBottomWidth: 0.55,
    borderColor: COLORS.rule,
    padding: 3,
    justifyContent: 'center',
    fontWeight: 600,
  },
  partyValueEn: {
    width: '32%',
    borderRightWidth: 0.55,
    borderBottomWidth: 0.55,
    borderColor: COLORS.rule,
    padding: 3,
    justifyContent: 'center',
  },
  partyValueAr: {
    width: '32%',
    borderRightWidth: 0.55,
    borderBottomWidth: 0.55,
    borderColor: COLORS.rule,
    padding: 3,
    justifyContent: 'center',
    fontFamily: 'InvoiceArabic',
    direction: 'rtl',
    textAlign: 'right',
  },
  partyLabelAr: {
    width: '18%',
    backgroundColor: COLORS.light,
    borderRightWidth: 0.55,
    borderBottomWidth: 0.55,
    borderColor: COLORS.rule,
    padding: 3,
    justifyContent: 'center',
    fontFamily: 'InvoiceArabic',
    direction: 'rtl',
    textAlign: 'right',
    fontWeight: 600,
  },
  lineTable: {
    borderLeftWidth: 0.55,
    borderTopWidth: 0.55,
    borderColor: COLORS.strongRule,
  },
  lineHeaderRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.header,
  },
  lineRow: {
    flexDirection: 'row',
  },
  lineCell: {
    borderRightWidth: 0.55,
    borderBottomWidth: 0.55,
    borderColor: COLORS.rule,
    paddingVertical: 2.5,
    paddingHorizontal: 2.5,
    justifyContent: 'center',
  },
  lineHeaderCell: {
    minHeight: 38,
    paddingVertical: 3,
    paddingHorizontal: 2,
    alignItems: 'center',
    textAlign: 'center',
  },
  lineHeaderEn: {
    fontSize: 5.6,
    fontWeight: 600,
    lineHeight: 1.2,
    textAlign: 'center',
  },
  lineHeaderAr: {
    fontFamily: 'InvoiceArabic',
    direction: 'rtl',
    fontSize: 5.3,
    fontWeight: 600,
    lineHeight: 1.25,
    textAlign: 'center',
    marginTop: 2,
  },
  descriptionCell: {
    width: '29%',
  },
  rateCell: {
    width: '12%',
    textAlign: 'right',
  },
  quantityCell: {
    width: '10%',
    textAlign: 'center',
  },
  taxableCell: {
    width: '14%',
    textAlign: 'right',
  },
  ratePercentCell: {
    width: '9%',
    textAlign: 'center',
  },
  taxCell: {
    width: '12%',
    textAlign: 'right',
  },
  totalCell: {
    width: '14%',
    textAlign: 'right',
  },
  descriptionEn: {
    fontWeight: 600,
    fontSize: 6.8,
    lineHeight: 1.15,
  },
  descriptionAr: {
    fontFamily: 'InvoiceArabic',
    direction: 'rtl',
    textAlign: 'right',
    color: COLORS.muted,
    fontSize: 6.1,
    lineHeight: 1.1,
    marginTop: 1,
  },
  cellNumber: {
    direction: 'ltr',
    fontSize: 6.8,
  },
  totalsWrap: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  totalsTable: {
    width: '62%',
    borderLeftWidth: 0.55,
    borderTopWidth: 0.55,
    borderColor: COLORS.strongRule,
  },
  totalRow: {
    flexDirection: 'row',
    minHeight: 19,
  },
  totalLabel: {
    width: '67%',
    borderRightWidth: 0.55,
    borderBottomWidth: 0.55,
    borderColor: COLORS.rule,
    backgroundColor: COLORS.light,
    paddingVertical: 2,
    paddingHorizontal: 5,
    justifyContent: 'center',
  },
  totalLabelLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabelAr: {
    fontFamily: 'InvoiceArabic',
    direction: 'rtl',
    textAlign: 'right',
    color: COLORS.muted,
    fontSize: 6.2,
  },
  totalValue: {
    width: '33%',
    borderRightWidth: 0.55,
    borderBottomWidth: 0.55,
    borderColor: COLORS.rule,
    paddingVertical: 2,
    paddingHorizontal: 5,
    justifyContent: 'center',
    textAlign: 'right',
    direction: 'ltr',
    fontSize: 7.2,
  },
  grandTotalLabel: {
    backgroundColor: COLORS.header,
    fontWeight: 600,
  },
  grandTotalValue: {
    backgroundColor: COLORS.header,
    fontWeight: 600,
    fontSize: 8,
  },
  notes: {
    borderTopWidth: 0.55,
    borderTopColor: COLORS.rule,
    marginTop: 7,
    paddingTop: 5,
  },
  billingNote: {
    fontWeight: 600,
    fontSize: 7.2,
  },
  userNote: {
    color: COLORS.muted,
    marginTop: 3,
    fontSize: 6.8,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 19,
    left: 29,
    right: 29,
    borderTopWidth: 0.4,
    borderTopColor: COLORS.rule,
    paddingTop: 4,
    color: COLORS.muted,
    fontSize: 6.2,
    textAlign: 'center',
  },
  breakdownHeader: {
    marginBottom: 12,
    alignItems: 'center',
  },
  breakdownBuyer: {
    alignSelf: 'stretch',
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: 600,
    textAlign: 'center',
    marginBottom: 5,
  },
  breakdownTitle: {
    fontSize: 12,
    fontWeight: 600,
    textAlign: 'center',
  },
  breakdownMonth: {
    color: COLORS.muted,
    fontSize: 8,
    marginTop: 4,
  },
  breakdownTable: {
    borderLeftWidth: 0.55,
    borderTopWidth: 0.55,
    borderColor: COLORS.strongRule,
  },
  breakdownHeaderRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.header,
    minHeight: 28,
  },
  breakdownRow: {
    flexDirection: 'row',
  },
  breakdownCell: {
    borderRightWidth: 0.55,
    borderBottomWidth: 0.55,
    borderColor: COLORS.rule,
    paddingVertical: 4,
    paddingHorizontal: 3,
    justifyContent: 'center',
  },
  breakdownHeaderCell: {
    fontSize: 6.2,
    fontWeight: 600,
    textAlign: 'center',
  },
  breakdownIndex: {
    width: '7%',
    textAlign: 'center',
  },
  breakdownNameHourly: {
    width: '28%',
  },
  breakdownDesignationHourly: {
    width: '29%',
  },
  breakdownQuantityHourly: {
    width: '12%',
    textAlign: 'right',
  },
  breakdownRateHourly: {
    width: '11%',
    textAlign: 'right',
  },
  breakdownTotalHourly: {
    width: '13%',
    textAlign: 'right',
  },
  breakdownNameMixed: {
    width: '23%',
  },
  breakdownDesignationMixed: {
    width: '24%',
  },
  breakdownBasisMixed: {
    width: '12%',
    textAlign: 'center',
  },
  breakdownQuantityMixed: {
    width: '10%',
    textAlign: 'right',
  },
  breakdownRateMixed: {
    width: '11%',
    textAlign: 'right',
  },
  breakdownTotalMixed: {
    width: '13%',
    textAlign: 'right',
  },
  breakdownTotals: {
    width: '48%',
  },
  disclaimer: {
    color: COLORS.muted,
    fontSize: 6.2,
    marginTop: 8,
    textAlign: 'center',
  },
  qrSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
    paddingTop: 5,
    borderTopWidth: 0.55,
    borderTopColor: COLORS.rule,
    minHeight: 64,
  },
  qrImage: {
    width: 58,
    height: 58,
    objectFit: 'contain',
  },
  qrCopy: {
    marginLeft: 8,
    maxWidth: '65%',
  },
  qrCopyTitle: {
    fontSize: 7.3,
    fontWeight: 600,
    color: COLORS.accent,
  },
  qrCopyArabic: {
    fontFamily: 'InvoiceArabic',
    direction: 'rtl',
    textAlign: 'left',
    fontSize: 6.5,
    marginTop: 1,
  },
  qrCopyNote: {
    color: COLORS.muted,
    fontSize: 5.8,
    lineHeight: 1.25,
    marginTop: 3,
  },
});

interface PartyRow {
  labelEn: string;
  labelAr: string;
  valueEn: string;
  valueAr: string;
  identifier?: boolean;
}

interface WeightedChunk<T> {
  rows: T[];
  offset: number;
}

const nonEmpty = (value: string | null | undefined): string => value?.trim() || '-';

function formatSar(value: string): string {
  return `SAR ${formatMoney(value)}`;
}

function quantityUnit(basis: BillingBasis, quantity: string): string {
  const label =
    basis === 'Hour' ? 'hrs' : basis === 'Day' ? 'days' : Number(quantity) === 1 ? 'month' : 'months';
  return `${formatQuantity(quantity)} ${label}`;
}

function rowWeight(descriptionEn: string, descriptionAr: string): number {
  const englishLines = Math.ceil(Math.max(descriptionEn.length, 1) / 48);
  const arabicLines = Math.ceil(Math.max(descriptionAr.length, 1) / 31);
  return Math.max(1, englishLines + Math.max(0, arabicLines - 1));
}

function takeByWeight<T>(
  items: T[],
  capacity: number,
  weight: (item: T) => number,
): number {
  let used = 0;
  let count = 0;
  for (const item of items) {
    const nextWeight = Math.max(1, weight(item));
    if (count > 0 && used + nextWeight > capacity) break;
    used += nextWeight;
    count += 1;
  }
  return Math.max(1, count);
}

/**
 * Manual page chunking gives every generated page a real repeated table
 * header. React-PDF still receives wrap={false} on individual rows as a final
 * guard against a row being torn at a page boundary.
 */
function paginateWeighted<T>(
  rows: T[],
  weight: (item: T) => number,
  capacities: {
    firstWithTotals: number;
    firstWithoutTotals: number;
    continuationWithTotals: number;
    continuationWithoutTotals: number;
  },
): WeightedChunk<T>[] {
  if (rows.length === 0) return [{ rows: [], offset: 0 }];

  const totalWeight = rows.reduce((sum, row) => sum + Math.max(1, weight(row)), 0);
  if (totalWeight <= capacities.firstWithTotals) return [{ rows, offset: 0 }];

  const chunks: WeightedChunk<T>[] = [];
  let offset = 0;
  let remaining = rows;
  let count = takeByWeight(remaining, capacities.firstWithoutTotals, weight);
  chunks.push({ rows: remaining.slice(0, count), offset });
  remaining = remaining.slice(count);
  offset += count;

  while (remaining.length > 0) {
    const remainingWeight = remaining.reduce(
      (sum, row) => sum + Math.max(1, weight(row)),
      0,
    );
    if (remainingWeight <= capacities.continuationWithTotals) {
      chunks.push({ rows: remaining, offset });
      break;
    }

    const desiredWeight = Math.min(
      capacities.continuationWithoutTotals,
      Math.max(1, remainingWeight - capacities.continuationWithTotals),
    );
    count = takeByWeight(remaining, desiredWeight, weight);
    chunks.push({ rows: remaining.slice(0, count), offset });
    remaining = remaining.slice(count);
    offset += count;
  }

  return chunks;
}

function PageNumber(): React.ReactElement {
  return (
    <View style={styles.pageNumber}>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function CompanyHeader({ data }: { data: InvoiceData }): React.ReactElement {
  return (
    <View style={styles.documentHeader} wrap={false}>
      <View style={styles.companyHeaderRow}>
        <View style={styles.companyHeaderSide}>
          <Text style={styles.companyName}>{nonEmpty(data.sellerNameEn)}</Text>
          <Text style={[styles.companyIdentifier, styles.ltr]}>
            CR: {nonEmpty(data.sellerCrNumber)}
          </Text>
          <Text style={[styles.companyIdentifier, styles.ltr]}>
            VAT: {nonEmpty(data.sellerVatNumber)}
          </Text>
        </View>
        <View style={styles.companyHeaderCenter}>
          <HeaderMark data={data} />
        </View>
        <View style={styles.companyHeaderSide}>
          <Text style={[styles.companyName, styles.arabic]}>{nonEmpty(data.sellerNameAr)}</Text>
          <Text style={[styles.companyIdentifier, styles.arabic]}>
            رقم السجل التجاري: <Text style={styles.ltr}>{nonEmpty(data.sellerCrNumber)}</Text>
          </Text>
          <Text style={[styles.companyIdentifier, styles.arabic]}>
            الرقم الضريبي: <Text style={styles.ltr}>{nonEmpty(data.sellerVatNumber)}</Text>
          </Text>
        </View>
      </View>
      <View style={styles.titleBox}>
        <Text style={styles.titleEn}>TAX INVOICE /</Text>
        <Text style={styles.titleAr}>فاتورة ضريبية</Text>
      </View>
    </View>
  );
}

function HeaderMark({ data }: { data: InvoiceData }): React.ReactElement | null {
  const qrDataUrl = buildZatcaQrSvgDataUrl(data);
  if (qrDataUrl) return <Image src={qrDataUrl} style={styles.headerQr} />;
  return data.sellerLogo ? <Image src={data.sellerLogo} style={styles.logo} /> : null;
}

function ContinuationHeader({ data }: { data: InvoiceData }): React.ReactElement {
  return (
    <View style={styles.continuationHeader} wrap={false}>
      <Text style={styles.continuationCompany}>{nonEmpty(data.sellerNameEn)}</Text>
      <View style={styles.continuationTitle}>
        <Text>TAX INVOICE</Text>
        <Text style={styles.titleAr}>فاتورة ضريبية</Text>
      </View>
      <Text style={[styles.continuationInvoice, styles.ltr]}>
        Invoice / الفاتورة: {nonEmpty(data.invoiceNumber)}
      </Text>
    </View>
  );
}

function InvoiceMeta({
  data,
  calculated,
}: {
  data: InvoiceData;
  calculated: CalculatedInvoice;
}): React.ReactElement {
  return (
    <View style={styles.metaTable} wrap={false}>
      <View style={styles.metaCell}>
        <View style={styles.metaLabel}>
          <Text style={styles.semibold}>Invoice Number</Text>
          <Text style={styles.microArabic}>رقم الفاتورة</Text>
        </View>
        <View style={styles.metaValue}>
          <Text style={styles.ltr}>{nonEmpty(data.invoiceNumber)}</Text>
        </View>
      </View>
      <View style={styles.metaCell}>
        <View style={styles.metaLabel}>
          <Text style={styles.semibold}>Issue Date / Time</Text>
          <Text style={styles.microArabic}>تاريخ / وقت الإصدار</Text>
        </View>
        <View style={styles.metaValue}>
          <Text style={styles.ltr}>{calculated.issueTimestamp}</Text>
        </View>
      </View>
    </View>
  );
}

function PartyTable({
  titleEn,
  titleAr,
  rows,
}: {
  titleEn: string;
  titleAr: string;
  rows: PartyRow[];
}): React.ReactElement {
  return (
    <View style={styles.section} wrap={false}>
      <View style={styles.sectionBar}>
        <Text style={styles.sectionTitle}>{titleEn}</Text>
        <Text style={styles.sectionTitleAr}>{titleAr}</Text>
      </View>
      <View style={styles.partyTable}>
        {rows.map((row) => (
          <View style={styles.partyRow} wrap={false} key={`${titleEn}-${row.labelEn}`}>
            <Text style={styles.partyLabelEn}>{row.labelEn}</Text>
            <Text style={[styles.partyValueEn, row.identifier ? styles.ltr : {}]}>
              {nonEmpty(row.valueEn)}
            </Text>
            <Text
              style={[
                styles.partyValueAr,
                row.identifier ? styles.ltr : styles.arabic,
              ]}
            >
              {nonEmpty(row.valueAr)}
            </Text>
            <Text style={styles.partyLabelAr}>{row.labelAr}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SellerAndBuyer({ data }: { data: InvoiceData }): React.ReactElement {
  const sellerRows: PartyRow[] = [
    {
      labelEn: 'Name',
      labelAr: 'الاسم',
      valueEn: data.sellerNameEn,
      valueAr: data.sellerNameAr,
    },
    {
      labelEn: 'Full Address',
      labelAr: 'العنوان الكامل',
      valueEn: data.sellerAddressEn,
      valueAr: data.sellerAddressAr,
    },
    {
      labelEn: 'VAT Number',
      labelAr: 'الرقم الضريبي',
      valueEn: data.sellerVatNumber,
      valueAr: data.sellerVatNumber,
      identifier: true,
    },
    {
      labelEn: 'CR Number',
      labelAr: 'رقم السجل التجاري',
      valueEn: data.sellerCrNumber,
      valueAr: data.sellerCrNumber,
      identifier: true,
    },
  ];

  const buyerRows: PartyRow[] = [
    {
      labelEn: 'Name',
      labelAr: 'الاسم',
      valueEn: data.buyerNameEn,
      valueAr: data.buyerNameAr,
    },
    {
      labelEn: 'Full Address',
      labelAr: 'العنوان الكامل',
      valueEn: data.buyerAddressEn,
      valueAr: data.buyerAddressAr,
    },
    {
      labelEn: 'CR Number',
      labelAr: 'رقم السجل التجاري',
      valueEn: data.buyerCrNumber,
      valueAr: data.buyerCrNumber,
      identifier: true,
    },
    {
      labelEn: 'City',
      labelAr: 'المدينة',
      valueEn: data.buyerCityEn,
      valueAr: data.buyerCityAr,
    },
    {
      labelEn: 'VAT Number',
      labelAr: 'الرقم الضريبي',
      valueEn: data.buyerVatNumber,
      valueAr: data.buyerVatNumber,
      identifier: true,
    },
  ];

  return (
    <>
      <PartyTable titleEn="Seller" titleAr="البائع" rows={sellerRows} />
      <PartyTable titleEn="Buyer" titleAr="المشتري" rows={buyerRows} />
    </>
  );
}

const invoiceColumns = [
  {
    key: 'description',
    en: 'Nature of Goods or Services',
    ar: 'طبيعة السلع أو الخدمات',
    style: styles.descriptionCell,
  },
  { key: 'rate', en: 'Unit Price', ar: 'سعر الوحدة', style: styles.rateCell },
  { key: 'quantity', en: 'Quantity', ar: 'الكمية', style: styles.quantityCell },
  {
    key: 'taxable',
    en: 'Taxable Amount',
    ar: 'المبلغ الخاضع للضريبة',
    style: styles.taxableCell,
  },
  { key: 'taxRate', en: 'Tax Rate', ar: 'معدل الضريبة', style: styles.ratePercentCell },
  { key: 'tax', en: 'Tax Amount', ar: 'مبلغ الضريبة', style: styles.taxCell },
  {
    key: 'total',
    en: 'Item Subtotal Including VAT',
    ar: 'الإجمالي شامل الضريبة',
    style: styles.totalCell,
  },
] as const;

function InvoiceTableHeader({ fixed = false }: { fixed?: boolean }): React.ReactElement {
  return (
    <View style={[styles.lineHeaderRow]} wrap={false} fixed={fixed}>
      {invoiceColumns.map((column) => (
        <View
          key={column.key}
          style={[styles.lineCell, styles.lineHeaderCell, column.style]}
        >
          <Text style={styles.lineHeaderEn}>{column.en}</Text>
          <Text style={styles.lineHeaderAr}>{column.ar}</Text>
        </View>
      ))}
    </View>
  );
}

function InvoiceRow({ row }: { row: CalculatedInvoiceRow }): React.ReactElement {
  return (
    <View style={styles.lineRow} wrap={false}>
      <View style={[styles.lineCell, styles.descriptionCell]}>
        <Text style={styles.descriptionEn}>{nonEmpty(row.descriptionEn)}</Text>
        {row.descriptionAr.trim() ? (
          <Text style={styles.descriptionAr}>{row.descriptionAr.trim()}</Text>
        ) : null}
      </View>
      <Text style={[styles.lineCell, styles.rateCell, styles.cellNumber]}>
        {formatRate(row.unitRate)}
      </Text>
      <Text style={[styles.lineCell, styles.quantityCell, styles.cellNumber]}>
        {quantityUnit(row.billingBasis, row.quantity)}
      </Text>
      <Text style={[styles.lineCell, styles.taxableCell, styles.cellNumber]}>
        {formatMoney(row.taxableAmount)}
      </Text>
      <Text style={[styles.lineCell, styles.ratePercentCell, styles.cellNumber]}>
        {row.taxRate}
      </Text>
      <Text style={[styles.lineCell, styles.taxCell, styles.cellNumber]}>
        {formatMoney(row.vatAmount)}
      </Text>
      <Text style={[styles.lineCell, styles.totalCell, styles.cellNumber]}>
        {formatMoney(row.totalIncludingVat)}
      </Text>
    </View>
  );
}

function InvoiceTable({
  rows,
  repeatHeader = false,
}: {
  rows: CalculatedInvoiceRow[];
  repeatHeader?: boolean;
}): React.ReactElement {
  return (
    <View style={styles.lineTable}>
      <InvoiceTableHeader fixed={repeatHeader} />
      {rows.map((row) => (
        <InvoiceRow key={row.id} row={row} />
      ))}
    </View>
  );
}

interface TotalDefinition {
  key: keyof InvoiceTotals;
  labelEn: string;
  labelAr: string;
  grand?: boolean;
}

const mainTotalDefinitions: TotalDefinition[] = [
  {
    key: 'subtotal',
    labelEn: 'Total Excluding VAT',
    labelAr: 'الإجمالي غير شامل الضريبة',
  },
  { key: 'discount', labelEn: 'Discount', labelAr: 'الخصم' },
  {
    key: 'taxableTotal',
    labelEn: 'Total Taxable Amount Excluding VAT',
    labelAr: 'إجمالي المبلغ الخاضع للضريبة',
  },
  { key: 'vatAmount', labelEn: 'Total VAT', labelAr: 'إجمالي ضريبة القيمة المضافة' },
  { key: 'grandTotal', labelEn: 'Grand Total', labelAr: 'الإجمالي شامل الضريبة', grand: true },
];

function TotalsTable({
  totals,
  definitions = mainTotalDefinitions,
  compact = false,
}: {
  totals: InvoiceTotals;
  definitions?: TotalDefinition[];
  compact?: boolean;
}): React.ReactElement {
  return (
    <View style={styles.totalsWrap} wrap={false}>
      <View style={[styles.totalsTable, compact ? styles.breakdownTotals : {}]}>
        {definitions.map((definition) => (
          <View style={styles.totalRow} key={definition.key}>
            <View
              style={[
                styles.totalLabel,
                definition.grand ? styles.grandTotalLabel : {},
              ]}
            >
              <View style={styles.totalLabelLine}>
                <Text style={definition.grand ? styles.semibold : {}}>{definition.labelEn}</Text>
                <Text style={styles.totalLabelAr}>{definition.labelAr}</Text>
              </View>
            </View>
            <Text
              style={[
                styles.totalValue,
                definition.grand ? styles.grandTotalValue : {},
              ]}
            >
              {formatSar(totals[definition.key])}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function InvoiceNotes({
  calculated,
  note,
}: {
  calculated: CalculatedInvoice;
  note: string;
}): React.ReactElement {
  return (
    <View style={styles.notes} wrap={false}>
      <Text style={styles.billingNote}>{calculated.billingMonthNote}</Text>
      {note.trim() ? <Text style={styles.userNote}>{note.trim()}</Text> : null}
    </View>
  );
}

function MainInvoicePages({
  data,
  calculated,
}: {
  data: InvoiceData;
  calculated: CalculatedInvoice;
}): React.ReactElement {
  return (
    <Page size="A4" orientation="portrait" style={styles.page}>
      <CompanyHeader data={data} />
      <InvoiceMeta data={data} calculated={calculated} />
      <SellerAndBuyer data={data} />
      <View style={styles.chargesHeading} wrap={false} minPresenceAhead={65}>
        <Text style={[styles.sectionTitle, { width: 52 }]}>Services /</Text>
        <Text style={[styles.sectionTitleAr, { width: 60, textAlign: 'left' }]}>الخدمات</Text>
      </View>
      <InvoiceTable rows={calculated.rows.filter(row => row.kind === 'service')} repeatHeader />
      <Text style={styles.chargesSubtotal} wrap={false}>Services charges: {formatSar(calculated.serviceSubtotal)}</Text>
      {data.entryMode !== 'service' && <>
        <View style={styles.chargesHeading} wrap={false} minPresenceAhead={65}>
          <Text style={[styles.sectionTitle, { width: 60 }]}>Employees /</Text>
          <Text style={[styles.sectionTitleAr, { width: 60, textAlign: 'left' }]}>الموظفون</Text>
        </View>
        <BreakdownTable rows={calculated.breakdownRows} offset={0} hourlyOnly={calculated.breakdownRows.every(row => row.billingBasis === 'Hour')} repeatHeader />
        <Text style={styles.chargesSubtotal} wrap={false}>Employees charges: {formatSar(calculated.employeeSubtotal)}</Text>
      </>}
      <TotalsTable totals={calculated.totals} />
      <InvoiceNotes calculated={calculated} note={data.footerNote} />
      <PageNumber />
    </Page>
  );
}

function BreakdownHeader({
  data,
  calculated,
  continuation,
}: {
  data: InvoiceData;
  calculated: CalculatedInvoice;
  continuation: boolean;
}): React.ReactElement {
  return (
    <View style={styles.breakdownHeader} wrap={false}>
      <Text style={styles.breakdownBuyer}>{nonEmpty(data.buyerNameEn)}</Text>
      <Text style={styles.breakdownTitle}>Detailed Description List of Manpower With Timesheet</Text>
      <Text style={styles.breakdownMonth}>
        {calculated.billingMonthShort}
        {continuation ? ' - Continued' : ''}
      </Text>
    </View>
  );
}

function BreakdownTableHeader({
  hourlyOnly,
  fixed = false,
}: {
  hourlyOnly: boolean;
  fixed?: boolean;
}): React.ReactElement {
  if (hourlyOnly) {
    return (
      <View style={styles.breakdownHeaderRow} wrap={false} fixed={fixed}>
        <Text style={[styles.breakdownCell, styles.breakdownHeaderCell, styles.breakdownIndex]}>
          Sr. No.
        </Text>
        <Text
          style={[styles.breakdownCell, styles.breakdownHeaderCell, styles.breakdownNameHourly]}
        >
          Employee Name
        </Text>
        <Text
          style={[
            styles.breakdownCell,
            styles.breakdownHeaderCell,
            styles.breakdownDesignationHourly,
          ]}
        >
          Designation
        </Text>
        <Text
          style={[
            styles.breakdownCell,
            styles.breakdownHeaderCell,
            styles.breakdownQuantityHourly,
          ]}
        >
          Hrs. Worked
        </Text>
        <Text
          style={[
            styles.breakdownCell,
            styles.breakdownHeaderCell,
            styles.breakdownRateHourly,
          ]}
        >
          P/H Rate
        </Text>
        <Text
          style={[
            styles.breakdownCell,
            styles.breakdownHeaderCell,
            styles.breakdownTotalHourly,
          ]}
        >
          Total
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.breakdownHeaderRow} wrap={false} fixed={fixed}>
      <Text style={[styles.breakdownCell, styles.breakdownHeaderCell, styles.breakdownIndex]}>
        Sr. No.
      </Text>
      <Text style={[styles.breakdownCell, styles.breakdownHeaderCell, styles.breakdownNameMixed]}>
        Employee Name
      </Text>
      <Text
        style={[styles.breakdownCell, styles.breakdownHeaderCell, styles.breakdownDesignationMixed]}
      >
        Designation
      </Text>
      <Text style={[styles.breakdownCell, styles.breakdownHeaderCell, styles.breakdownBasisMixed]}>
        Billing Basis
      </Text>
      <Text
        style={[styles.breakdownCell, styles.breakdownHeaderCell, styles.breakdownQuantityMixed]}
      >
        Quantity
      </Text>
      <Text style={[styles.breakdownCell, styles.breakdownHeaderCell, styles.breakdownRateMixed]}>
        Unit Rate
      </Text>
      <Text style={[styles.breakdownCell, styles.breakdownHeaderCell, styles.breakdownTotalMixed]}>
        Total
      </Text>
    </View>
  );
}

function EmployeeDesignation({ row }: { row: CalculatedEmployeeRow }): React.ReactElement {
  return (
    <View>
      <Text style={styles.descriptionEn}>{nonEmpty(row.designationEn)}</Text>
      {row.designationAr.trim() ? (
        <Text style={styles.descriptionAr}>{row.designationAr.trim()}</Text>
      ) : null}
    </View>
  );
}

function BreakdownRow({
  row,
  serial,
  hourlyOnly,
}: {
  row: CalculatedEmployeeRow;
  serial: number;
  hourlyOnly: boolean;
}): React.ReactElement {
  if (hourlyOnly) {
    return (
      <View style={styles.breakdownRow} wrap={false}>
        <Text style={[styles.breakdownCell, styles.breakdownIndex]}>{serial}</Text>
        <Text style={[styles.breakdownCell, styles.breakdownNameHourly]}>
          {nonEmpty(row.employeeName)}
        </Text>
        <View style={[styles.breakdownCell, styles.breakdownDesignationHourly]}>
          <EmployeeDesignation row={row} />
        </View>
        <Text
          style={[styles.breakdownCell, styles.breakdownQuantityHourly, styles.cellNumber]}
        >
          {formatQuantity(row.quantity)}
        </Text>
        <Text style={[styles.breakdownCell, styles.breakdownRateHourly, styles.cellNumber]}>
          {formatRate(row.unitRate)}
        </Text>
        <Text style={[styles.breakdownCell, styles.breakdownTotalHourly, styles.cellNumber]}>
          {formatMoney(row.grossAmount)}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.breakdownRow} wrap={false}>
      <Text style={[styles.breakdownCell, styles.breakdownIndex]}>{serial}</Text>
      <Text style={[styles.breakdownCell, styles.breakdownNameMixed]}>
        {nonEmpty(row.employeeName)}
      </Text>
      <View style={[styles.breakdownCell, styles.breakdownDesignationMixed]}>
        <EmployeeDesignation row={row} />
      </View>
      <Text style={[styles.breakdownCell, styles.breakdownBasisMixed]}>{row.billingBasis}</Text>
      <Text style={[styles.breakdownCell, styles.breakdownQuantityMixed, styles.cellNumber]}>
        {formatQuantity(row.quantity)}
      </Text>
      <Text style={[styles.breakdownCell, styles.breakdownRateMixed, styles.cellNumber]}>
        {formatRate(row.unitRate)}
      </Text>
      <Text style={[styles.breakdownCell, styles.breakdownTotalMixed, styles.cellNumber]}>
        {formatMoney(row.grossAmount)}
      </Text>
    </View>
  );
}

function BreakdownTable({
  rows,
  offset,
  hourlyOnly,
  repeatHeader = false,
}: {
  rows: CalculatedEmployeeRow[];
  offset: number;
  hourlyOnly: boolean;
  repeatHeader?: boolean;
}): React.ReactElement {
  return (
    <View style={styles.breakdownTable}>
      <BreakdownTableHeader hourlyOnly={hourlyOnly} fixed={repeatHeader} />
      {rows.map((row, index) => (
        <BreakdownRow
          key={row.id}
          row={row}
          serial={offset + index + 1}
          hourlyOnly={hourlyOnly}
        />
      ))}
    </View>
  );
}

const breakdownTotalDefinitions: TotalDefinition[] = [
  { key: 'subtotal', labelEn: 'Subtotal', labelAr: 'المجموع الفرعي' },
  { key: 'discount', labelEn: 'Discount', labelAr: 'الخصم' },
  { key: 'taxableTotal', labelEn: 'Taxable Total', labelAr: 'الإجمالي الخاضع للضريبة' },
  { key: 'vatAmount', labelEn: 'VAT', labelAr: 'ضريبة القيمة المضافة' },
  { key: 'grandTotal', labelEn: 'Grand Total', labelAr: 'الإجمالي شامل الضريبة', grand: true },
];

function EmployeeBreakdownPages({
  data,
  calculated,
}: {
  data: InvoiceData;
  calculated: CalculatedInvoice;
}): React.ReactElement | null {
  if (data.entryMode === 'service' || !data.includeBreakdown) return null;

  const hourlyOnly =
    calculated.breakdownRows.length > 0 &&
    calculated.breakdownRows.every((row) => row.billingBasis === 'Hour');
  const definitions =
    Number(calculated.totals.discount) === 0
      ? breakdownTotalDefinitions.filter((definition) => definition.key !== 'discount')
      : breakdownTotalDefinitions;

  return (
    <Page size="A4" orientation="portrait" style={styles.page}>
      <BreakdownHeader data={data} calculated={calculated} continuation={false} />
      <BreakdownTable
        rows={calculated.breakdownRows}
        offset={0}
        hourlyOnly={hourlyOnly}
        repeatHeader
      />
      {data.entryMode === 'combined' && <Text style={styles.disclaimer}>Invoice totals below include additional service rows on the main invoice.</Text>}
      <TotalsTable totals={calculated.totals} definitions={definitions} compact />
      <Text style={styles.disclaimer}>
        Manually entered billing breakdown. No supporting timesheets were uploaded or verified by
        this application.
      </Text>
      <PageNumber />
    </Page>
  );
}

export interface InvoicePdfDocumentProps {
  data: InvoiceData;
}

export function InvoicePdfDocument({
  data,
}: InvoicePdfDocumentProps): React.ReactElement<DocumentProps> {
  const calculated = calculateInvoice(data);

  return (
    <Document
      title={`Tax Invoice ${data.invoiceNumber.trim()}`}
      author={data.sellerNameEn.trim()}
      subject="Bilingual manpower tax invoice"
      creator="Manpower Invoice Generator"
      producer="Manpower Invoice Generator"
      language="en-SA"
    >
      <MainInvoicePages data={data} calculated={calculated} />
    </Document>
  );
}

export default InvoicePdfDocument;
