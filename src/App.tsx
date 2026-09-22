import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  Download,
  Eye,
  FilePlus2,
  FileText,
  ImagePlus,
  LoaderCircle,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { EmployeeRow, InvoiceData, ServiceRow } from './types';
import {
  blankInvoiceData,
  calculateInvoice,
  createEmployeeRow,
  createServiceRow,
  formatMoney,
  sampleInvoiceData,
  validateInvoice,
} from './lib/invoice';
import { createInvoiceBlob, createInvoicePreviewBlob, getInvoiceFilename } from './pdf/pdf';
import { InvoicePreview } from './components/InvoicePreview';
import { PreviewModal } from './components/PreviewModal';
import { APP_NAME } from './lib/brand';
import { BrandMark } from './components/BrandMark';

const SELLER_STORAGE_KEY = 'manpower-invoice-seller-v1';

function getInitialData(): InvoiceData {
  return blankInvoiceData();
}

function hasEnteredRows(data: InvoiceData) {
  if (data.entryMode === 'service') {
    return data.serviceRows.some((row) =>
      [row.descriptionEn, row.descriptionAr, row.quantity, row.unitRate].some((value) => value.trim()),
    );
  }
  return data.employeeRows.some((row) =>
    [
      row.employeeName,
      row.designationEn,
      row.designationAr,
      row.invoiceDescriptionEn,
      row.invoiceDescriptionAr,
      row.quantity,
      row.unitRate,
    ].some((value) => value.trim()),
  );
}

function Field({
  label,
  arabic,
  htmlFor,
  required,
  error,
  hint,
  wide,
  children,
}: {
  label: string;
  arabic?: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`field ${wide ? 'field--wide' : ''} ${error ? 'field--error' : ''}`}>
      <label htmlFor={htmlFor}>
        <span>{label}</span>
        {arabic && <span className="field__arabic" lang="ar" dir="rtl">{arabic}</span>}
        {required && <span className="required-mark" aria-label="required">*</span>}
      </label>
      {children}
      {hint && !error && <p className="field__hint">{hint}</p>}
      {error && <p className="field__error" id={`${htmlFor}-error`}><AlertCircle size={13} />{error}</p>}
    </div>
  );
}

function Section({
  icon,
  title,
  subtitle,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details className="form-section" open>
      <summary>
        <span className="section-icon">{icon}</span>
        <span className="section-heading"><strong>{title}</strong><small>{subtitle}</small></span>
        {badge && <span className="section-badge">{badge}</span>}
        <ChevronDown className="section-chevron" size={18} aria-hidden="true" />
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

function InlineError({ message }: { message?: string }) {
  return message ? <p className="field__error row-error"><AlertCircle size={13} />{message}</p> : null;
}

export default function App() {
  const [data, setData] = useState<InvoiceData>(getInitialData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeMobileTab, setActiveMobileTab] = useState<'form' | 'preview'>('form');
  const [generating, setGenerating] = useState<'preview' | 'download' | 'print' | null>(null);
  const [generationError, setGenerationError] = useState('');
  const [notice, setNotice] = useState('');
  const [logoError, setLogoError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const rowListRef = useRef<HTMLDivElement>(null);

  const calculated = useMemo(() => calculateInvoice(data), [data]);

  useEffect(() => {
    if (data.footerNote.trim() === 'This is fictional sample data for demonstration only.') {
      setData(current => ({ ...current, footerNote: '' }));
    }
  }, [data.footerNote]);

  useEffect(() => {
    try { localStorage.removeItem(SELLER_STORAGE_KEY); } catch { /* Storage may be disabled. */ }
  }, []);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const errorFor = (path: string) => errors[path];

  const clearError = (path: string) => {
    setErrors((current) => {
      if (!current[path]) return current;
      const next = { ...current };
      delete next[path];
      return next;
    });
    setGenerationError('');
  };

  const updateField = <K extends keyof InvoiceData>(key: K, value: InvoiceData[K]) => {
    setData((current) => ({ ...current, [key]: value }));
    clearError(String(key));
  };

  const trimField = <K extends keyof InvoiceData>(key: K) => {
    if (typeof data[key] === 'string') updateField(key, (data[key] as string).trim() as InvoiceData[K]);
  };

  const updateServiceRow = (index: number, key: keyof ServiceRow, value: string) => {
    setData((current) => ({
      ...current,
      serviceRows: current.serviceRows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row,
      ),
    }));
    clearError(`serviceRows.${index}.${key}`);
  };

  const updateEmployeeRow = (index: number, key: keyof EmployeeRow, value: string) => {
    setData((current) => ({
      ...current,
      employeeRows: current.employeeRows.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        if (key === 'designationEn' && (!row.invoiceDescriptionEn || row.invoiceDescriptionEn === row.designationEn)) {
          return { ...row, designationEn: value, invoiceDescriptionEn: value };
        }
        if (key === 'designationAr' && (!row.invoiceDescriptionAr || row.invoiceDescriptionAr === row.designationAr)) {
          return { ...row, designationAr: value, invoiceDescriptionAr: value };
        }
        return { ...row, [key]: value };
      }),
    }));
    clearError(`employeeRows.${index}.${key}`);
  };

  const switchMode = (mode: InvoiceData['entryMode']) => {
    if (mode === data.entryMode) return;
    if (mode !== 'combined' && hasEnteredRows(data) && !window.confirm('Switching entry modes will clear the billing rows already entered. Continue?')) return;
    setData((current) => ({
      ...current,
      entryMode: mode,
      serviceRows: mode === 'combined' ? current.serviceRows : mode === 'service' ? [createServiceRow()] : [],
      employeeRows: mode === 'combined' ? (current.employeeRows.length ? current.employeeRows : [createEmployeeRow()]) : mode === 'employee' ? [createEmployeeRow()] : [],
      includeBreakdown: mode !== 'service',
    }));
    setErrors({});
  };

  const addRow = () => {
    setData((current) => current.entryMode === 'service'
      ? { ...current, serviceRows: [...current.serviceRows, createServiceRow()] }
      : { ...current, employeeRows: [...current.employeeRows, createEmployeeRow()] });
    window.requestAnimationFrame(() => rowListRef.current?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };

  const removeServiceRow = (index: number) => {
    setData((current) => ({
      ...current,
      serviceRows: current.serviceRows.length === 1
        ? [createServiceRow()]
        : current.serviceRows.filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  const removeEmployeeRow = (index: number) => {
    setData((current) => ({
      ...current,
      employeeRows: current.employeeRows.length === 1
        ? [createEmployeeRow()]
        : current.employeeRows.filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  const focusFirstError = (path?: string) => {
    if (!path) return;
    window.requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(`[data-field-path="${path}"]`);
      const details = element?.closest('details');
      if (details) details.open = true;
      element?.focus();
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const validateForPdf = (requireVatConfirmation: boolean) => {
    const result = validateInvoice(data, { requireVatConfirmation });
    setErrors(result.errors);
    if (!result.valid) {
      setActiveMobileTab('form');
      setGenerationError('Please correct the highlighted fields. Your entries have been preserved.');
      focusFirstError(result.firstErrorPath);
      return false;
    }
    return true;
  };

  const makeBlobUrl = async () => {
    const blob = await createInvoicePreviewBlob(data);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const nextUrl = URL.createObjectURL(blob);
    setPreviewUrl(nextUrl);
    return { blob, url: nextUrl };
  };

  const handlePreviewPdf = async () => {
    if (!validateForPdf(false)) return;
    setGenerating('preview');
    setGenerationError('');
    setPreviewOpen(true);
    try {
      await makeBlobUrl();
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'The PDF preview could not be generated. Please try again.');
    } finally {
      setGenerating(null);
    }
  };

  const handleDownload = async () => {
    if (!validateForPdf(true)) return;
    setGenerating('download');
    setGenerationError('');
    try {
      const blob = await createInvoiceBlob(data);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = getInvoiceFilename(data);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setNotice('PDF downloaded successfully.');
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'The PDF could not be downloaded. Please try again.');
    } finally {
      setGenerating(null);
    }
  };

  const handlePrint = async () => {
    if (!validateForPdf(true)) return;
    setGenerating('print');
    setGenerationError('');
    try {
      const blob = await createInvoiceBlob(data);
      const url = URL.createObjectURL(blob);
      const frame = document.createElement('iframe');
      frame.className = 'print-frame';
      frame.src = url;
      frame.title = 'Printable invoice';
      document.body.appendChild(frame);
      frame.onload = () => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        window.setTimeout(() => {
          frame.remove();
          URL.revokeObjectURL(url);
        }, 30_000);
      };
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'The printable PDF could not be generated. Please try again.');
    } finally {
      setGenerating(null);
    }
  };

  const handleLogo = (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setLogoError('Choose a PNG or JPG image.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError('Choose a logo smaller than 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateField('sellerLogo', String(reader.result));
      setLogoError('');
    };
    reader.onerror = () => setLogoError('The logo could not be read. Please choose another image.');
    reader.readAsDataURL(file);
  };

  const handleReset = () => {
    if (!window.confirm('Reset the invoice? This clears all entered seller, buyer, invoice and billing data.')) return;
    setData(blankInvoiceData());
    setErrors({});
    setGenerationError('');
    setNotice('Invoice reset.');
    setActiveMobileTab('form');
  };

  const handleLoadSample = () => {
    const hasDetails =
      data.sellerNameEn ||
      data.sellerNameAr ||
      data.buyerNameEn ||
      data.invoiceNumber ||
      hasEnteredRows(data);
    if (hasDetails && !window.confirm('Load fictional sample data and replace the current invoice?')) return;
    setData(sampleInvoiceData());
    setErrors({});
    setGenerationError('');
    setNotice('Fictional demonstration data loaded.');
  };

  const busy = generating !== null;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <BrandMark />
          <div><strong>{APP_NAME}</strong><span>Bilingual tax invoice builder</span></div>
        </div>
        <div className="header-actions">
          <button className="button button--ghost" type="button" onClick={handleLoadSample} disabled={busy}>
            <FilePlus2 size={16} />Load Sample Data
          </button>
          <span className="status-pill"><span />Draft saved only in this tab</span>
        </div>
      </header>

      <main>
        <section className="hero-strip" aria-labelledby="page-title">
          <div>
            <span className="eyebrow"><ReceiptText size={14} /> Invoice workspace</span>
            <h1 id="page-title">Create a clear, bilingual invoice.</h1>
            <p>Enter the billing details once. Review the exact totals, then export a polished English and Arabic PDF.</p>
          </div>
          <div className="hero-total" aria-label="Current grand total">
            <span>Grand total</span>
            <strong>SAR {formatMoney(calculated.totals.grandTotal)}</strong>
            <small>{data.invoiceNumber.trim() || 'Invoice number not set'}</small>
          </div>
        </section>

        <nav className="mobile-tabs" aria-label="Invoice workspace views">
          <button className={activeMobileTab === 'form' ? 'active' : ''} onClick={() => setActiveMobileTab('form')} type="button"><FileText size={16} />Form</button>
          <button className={activeMobileTab === 'preview' ? 'active' : ''} onClick={() => setActiveMobileTab('preview')} type="button"><Eye size={16} />Preview</button>
        </nav>

        <div className="workspace-grid">
          <div className={`form-pane ${activeMobileTab === 'form' ? 'mobile-active' : ''}`}>
            {generationError && <div className="alert alert--error" role="alert"><AlertCircle size={18} /><span>{generationError}</span><button onClick={() => setGenerationError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
            {notice && <div className="alert alert--success" role="status"><Check size={18} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={16} /></button></div>}

            <Section icon={<Building2 size={18} />} title="Seller details" subtitle="بيانات البائع">
              <div className="field-grid">
                <Field label="Company Name in English" arabic="اسم الشركة بالإنجليزية" htmlFor="sellerNameEn" required error={errorFor('sellerNameEn')}>
                  <input id="sellerNameEn" data-field-path="sellerNameEn" value={data.sellerNameEn} onChange={(event) => updateField('sellerNameEn', event.target.value)} onBlur={() => trimField('sellerNameEn')} aria-invalid={!!errorFor('sellerNameEn')} />
                </Field>
                <Field label="Company Name in Arabic" arabic="اسم الشركة بالعربية" htmlFor="sellerNameAr" required error={errorFor('sellerNameAr')}>
                  <input id="sellerNameAr" data-field-path="sellerNameAr" dir="rtl" lang="ar" value={data.sellerNameAr} onChange={(event) => updateField('sellerNameAr', event.target.value)} onBlur={() => trimField('sellerNameAr')} aria-invalid={!!errorFor('sellerNameAr')} />
                </Field>
                <Field label="Full Address in English" arabic="العنوان الكامل بالإنجليزية" htmlFor="sellerAddressEn" required error={errorFor('sellerAddressEn')}>
                  <textarea id="sellerAddressEn" data-field-path="sellerAddressEn" rows={3} value={data.sellerAddressEn} onChange={(event) => updateField('sellerAddressEn', event.target.value)} onBlur={() => trimField('sellerAddressEn')} aria-invalid={!!errorFor('sellerAddressEn')} />
                </Field>
                <Field label="Full Address in Arabic" arabic="العنوان الكامل بالعربية" htmlFor="sellerAddressAr" required error={errorFor('sellerAddressAr')}>
                  <textarea id="sellerAddressAr" data-field-path="sellerAddressAr" dir="rtl" lang="ar" rows={3} value={data.sellerAddressAr} onChange={(event) => updateField('sellerAddressAr', event.target.value)} onBlur={() => trimField('sellerAddressAr')} aria-invalid={!!errorFor('sellerAddressAr')} />
                </Field>
                <Field label="VAT Number" arabic="الرقم الضريبي" htmlFor="sellerVatNumber" required error={errorFor('sellerVatNumber')} hint="Exactly 15 digits; leading zeros are preserved.">
                  <input id="sellerVatNumber" data-field-path="sellerVatNumber" inputMode="numeric" maxLength={15} value={data.sellerVatNumber} onChange={(event) => updateField('sellerVatNumber', event.target.value)} onBlur={() => trimField('sellerVatNumber')} aria-invalid={!!errorFor('sellerVatNumber')} />
                </Field>
                <Field label="CR Number" arabic="رقم السجل التجاري" htmlFor="sellerCrNumber" required error={errorFor('sellerCrNumber')}>
                  <input id="sellerCrNumber" data-field-path="sellerCrNumber" value={data.sellerCrNumber} onChange={(event) => updateField('sellerCrNumber', event.target.value)} onBlur={() => trimField('sellerCrNumber')} aria-invalid={!!errorFor('sellerCrNumber')} />
                </Field>
                <Field label="Company Logo" arabic="شعار الشركة" htmlFor="sellerLogo" wide error={logoError} hint="PNG or JPG, up to 2 MB. The supplied logo is included by default.">
                  <div className="logo-control">
                    <div className="logo-thumbnail">{data.sellerLogo ? <img src={data.sellerLogo} alt="Seller logo preview" /> : <ImagePlus size={24} />}</div>
                    <div className="logo-buttons">
                      <label className="button button--secondary button--small" htmlFor="sellerLogo"><ImagePlus size={15} />Choose image</label>
                      <input id="sellerLogo" className="visually-hidden" type="file" accept="image/png,image/jpeg" onChange={(event) => handleLogo(event.target.files?.[0])} />
                      {data.sellerLogo && <button type="button" className="text-button text-button--danger" onClick={() => updateField('sellerLogo', null)}>Remove logo</button>}
                    </div>
                  </div>
                </Field>
              </div>
            </Section>

            <Section icon={<Users size={18} />} title="Buyer details" subtitle="بيانات المشتري">
              <div className="field-grid">
                <Field label="Client Company Name in English" arabic="اسم العميل بالإنجليزية" htmlFor="buyerNameEn" required error={errorFor('buyerNameEn')}>
                  <input id="buyerNameEn" data-field-path="buyerNameEn" value={data.buyerNameEn} onChange={(event) => updateField('buyerNameEn', event.target.value)} onBlur={() => trimField('buyerNameEn')} aria-invalid={!!errorFor('buyerNameEn')} />
                </Field>
                <Field label="Client Company Name in Arabic" arabic="اسم العميل بالعربية" htmlFor="buyerNameAr" required error={errorFor('buyerNameAr')}>
                  <input id="buyerNameAr" data-field-path="buyerNameAr" dir="rtl" lang="ar" value={data.buyerNameAr} onChange={(event) => updateField('buyerNameAr', event.target.value)} onBlur={() => trimField('buyerNameAr')} aria-invalid={!!errorFor('buyerNameAr')} />
                </Field>
                <Field label="Full Address in English" arabic="العنوان الكامل بالإنجليزية" htmlFor="buyerAddressEn" required error={errorFor('buyerAddressEn')}>
                  <textarea id="buyerAddressEn" data-field-path="buyerAddressEn" rows={3} value={data.buyerAddressEn} onChange={(event) => updateField('buyerAddressEn', event.target.value)} onBlur={() => trimField('buyerAddressEn')} aria-invalid={!!errorFor('buyerAddressEn')} />
                </Field>
                <Field label="Full Address in Arabic" arabic="العنوان الكامل بالعربية" htmlFor="buyerAddressAr" required error={errorFor('buyerAddressAr')}>
                  <textarea id="buyerAddressAr" data-field-path="buyerAddressAr" dir="rtl" lang="ar" rows={3} value={data.buyerAddressAr} onChange={(event) => updateField('buyerAddressAr', event.target.value)} onBlur={() => trimField('buyerAddressAr')} aria-invalid={!!errorFor('buyerAddressAr')} />
                </Field>
                <Field label="City in English" arabic="المدينة بالإنجليزية" htmlFor="buyerCityEn" required error={errorFor('buyerCityEn')}>
                  <input id="buyerCityEn" data-field-path="buyerCityEn" value={data.buyerCityEn} onChange={(event) => updateField('buyerCityEn', event.target.value)} onBlur={() => trimField('buyerCityEn')} aria-invalid={!!errorFor('buyerCityEn')} />
                </Field>
                <Field label="City in Arabic" arabic="المدينة بالعربية" htmlFor="buyerCityAr" error={errorFor('buyerCityAr')}>
                  <input id="buyerCityAr" data-field-path="buyerCityAr" dir="rtl" lang="ar" value={data.buyerCityAr} onChange={(event) => updateField('buyerCityAr', event.target.value)} onBlur={() => trimField('buyerCityAr')} />
                </Field>
                <Field label="Client VAT Number" arabic="الرقم الضريبي للعميل" htmlFor="buyerVatNumber" error={errorFor('buyerVatNumber')} hint="Optional. When supplied, enter exactly 15 digits.">
                  <input id="buyerVatNumber" data-field-path="buyerVatNumber" inputMode="numeric" maxLength={15} value={data.buyerVatNumber} onChange={(event) => updateField('buyerVatNumber', event.target.value)} onBlur={() => trimField('buyerVatNumber')} aria-invalid={!!errorFor('buyerVatNumber')} />
                </Field>
                <Field label="Client CR Number" arabic="سجل العميل التجاري" htmlFor="buyerCrNumber" error={errorFor('buyerCrNumber')}>
                  <input id="buyerCrNumber" data-field-path="buyerCrNumber" value={data.buyerCrNumber} onChange={(event) => updateField('buyerCrNumber', event.target.value)} onBlur={() => trimField('buyerCrNumber')} />
                </Field>
              </div>
            </Section>

            <Section icon={<CalendarDays size={18} />} title="Invoice details" subtitle="تفاصيل الفاتورة">
              <div className="field-grid">
                <Field label="Invoice Number" arabic="رقم الفاتورة" htmlFor="invoiceNumber" required error={errorFor('invoiceNumber')} hint="Entered manually; no cross-device uniqueness is implied.">
                  <input id="invoiceNumber" data-field-path="invoiceNumber" value={data.invoiceNumber} onChange={(event) => updateField('invoiceNumber', event.target.value)} onBlur={() => trimField('invoiceNumber')} aria-invalid={!!errorFor('invoiceNumber')} />
                  <button type="button" className="text-button" onClick={() => {
                    if (data.invoiceNumber.trim() && !window.confirm('Replace the current invoice number with a random number?')) return;
                    updateField('invoiceNumber', `INV-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`);
                  }}>Auto-generate random number</button>
                </Field>
                <Field label="Currency" arabic="العملة" htmlFor="currency" required>
                  <div className="readonly-input" id="currency"><span>SAR</span><small>Saudi Riyal</small></div>
                </Field>
                <Field label="Issue Date" arabic="تاريخ الإصدار" htmlFor="issueDate" required error={errorFor('issueDate')}>
                  <input id="issueDate" data-field-path="issueDate" type="date" value={data.issueDate} onChange={(event) => updateField('issueDate', event.target.value)} aria-invalid={!!errorFor('issueDate')} />
                </Field>
                <Field label="Issue Time" arabic="وقت الإصدار" htmlFor="issueTime" required error={errorFor('issueTime')} hint="Saudi local time; seconds remain editable.">
                  <input id="issueTime" data-field-path="issueTime" type="time" step="1" value={data.issueTime} onChange={(event) => updateField('issueTime', event.target.value)} aria-invalid={!!errorFor('issueTime')} />
                </Field>
                <Field label="Billing Month" arabic="شهر الفوترة" htmlFor="billingMonth" required error={errorFor('billingMonth')} hint="Independent from the issue date.">
                  <input id="billingMonth" data-field-path="billingMonth" type="month" value={data.billingMonth} onChange={(event) => updateField('billingMonth', event.target.value)} aria-invalid={!!errorFor('billingMonth')} />
                </Field>
                <Field label="Additional Note" arabic="ملاحظة إضافية" htmlFor="footerNote" wide>
                  <textarea id="footerNote" data-field-path="footerNote" rows={3} value={data.footerNote} onChange={(event) => updateField('footerNote', event.target.value)} placeholder="Optional note printed in the invoice footer" />
                </Field>
              </div>
            </Section>

            <Section
              icon={<ReceiptText size={18} />}
              title="Billing rows"
              subtitle="بنود الفاتورة"
              badge={`${data.entryMode === 'service' ? data.serviceRows.length : data.employeeRows.length} ${data.entryMode === 'service' ? 'service' : 'employee'} row${(data.entryMode === 'service' ? data.serviceRows.length : data.employeeRows.length) === 1 ? '' : 's'}`}
            >
              <fieldset className="mode-switcher">
                <legend>Entry mode</legend>
                <button type="button" className={data.entryMode === 'combined' ? 'active' : ''} onClick={() => switchMode('combined')}>
                  <Users size={18} /><span><strong>Services + Employees</strong><small>Both on one invoice, with employee list</small></span>
                </button>
                <button type="button" className={data.entryMode === 'service' ? 'active' : ''} onClick={() => switchMode('service')}>
                  <ReceiptText size={18} /><span><strong>Service rows</strong><small>Main invoice only</small></span>
                </button>
                <button type="button" className={data.entryMode === 'employee' ? 'active' : ''} onClick={() => switchMode('employee')}>
                  <Users size={18} /><span><strong>Employee rows</strong><small>Employees and their charges</small></span>
                </button>
              </fieldset>

              <div className="mode-note">
                <ShieldCheck size={17} />
                <span>{data.entryMode === 'service'
                  ? 'Enter services and their charges.'
                  : 'Services and employees appear in separate tables, each with its own charges. Their subtotals are combined once, followed by discount and VAT.'}</span>
              </div>

              <div className="billing-rows" ref={rowListRef}>
                {data.entryMode !== 'employee' && data.serviceRows.map((row, index) => {
                  const amount = calculated.rows.find((item) => item.sourceRowIds.includes(row.id))?.grossAmount ?? '0.00';
                  return (
                    <article className="billing-card" key={row.id}>
                      <div className="billing-card__header"><span>Service {String(index + 1).padStart(2, '0')}</span><strong>SAR {formatMoney(amount)}</strong><button type="button" onClick={() => removeServiceRow(index)} aria-label={`Remove service row ${index + 1}`}><Trash2 size={16} /></button></div>
                      <div className="row-fields row-fields--service">
                        <Field label="Description in English" htmlFor={`service-${index}-descriptionEn`} required error={errorFor(`serviceRows.${index}.descriptionEn`)}>
                          <input id={`service-${index}-descriptionEn`} data-field-path={`serviceRows.${index}.descriptionEn`} value={row.descriptionEn} onChange={(event) => updateServiceRow(index, 'descriptionEn', event.target.value)} aria-invalid={!!errorFor(`serviceRows.${index}.descriptionEn`)} />
                        </Field>
                        <Field label="Description in Arabic" htmlFor={`service-${index}-descriptionAr`}>
                          <input id={`service-${index}-descriptionAr`} data-field-path={`serviceRows.${index}.descriptionAr`} dir="rtl" lang="ar" value={row.descriptionAr} onChange={(event) => updateServiceRow(index, 'descriptionAr', event.target.value)} />
                        </Field>
                        <Field label="Billing Basis" htmlFor={`service-${index}-billingBasis`} required error={errorFor(`serviceRows.${index}.billingBasis`)}>
                          <select id={`service-${index}-billingBasis`} data-field-path={`serviceRows.${index}.billingBasis`} value={row.billingBasis} onChange={(event) => updateServiceRow(index, 'billingBasis', event.target.value)}>
                            <option value="Hour">Hour</option><option value="Day">Day</option><option value="Month">Month</option>
                          </select>
                        </Field>
                        <Field label="Quantity" htmlFor={`service-${index}-quantity`} required error={errorFor(`serviceRows.${index}.quantity`)} hint={row.billingBasis === 'Month' ? '1 = full month; enter an agreed fraction for partial months.' : 'Up to 4 decimal places.'}>
                          <input id={`service-${index}-quantity`} data-field-path={`serviceRows.${index}.quantity`} type="number" inputMode="decimal" min="0" step="0.0001" value={row.quantity} onChange={(event) => updateServiceRow(index, 'quantity', event.target.value)} aria-invalid={!!errorFor(`serviceRows.${index}.quantity`)} />
                        </Field>
                        <Field label="Unit Rate (SAR)" htmlFor={`service-${index}-unitRate`} required error={errorFor(`serviceRows.${index}.unitRate`)}>
                          <input id={`service-${index}-unitRate`} data-field-path={`serviceRows.${index}.unitRate`} type="number" inputMode="decimal" min="0" step="0.0001" value={row.unitRate} onChange={(event) => updateServiceRow(index, 'unitRate', event.target.value)} aria-invalid={!!errorFor(`serviceRows.${index}.unitRate`)} />
                        </Field>
                        <Field label="Amount" htmlFor={`service-${index}-amount`}>
                          <div className="readonly-input money-input" id={`service-${index}-amount`}><span>SAR</span><strong>{formatMoney(amount)}</strong></div>
                        </Field>
                      </div>
                      <InlineError message={errorFor(`serviceRows.${index}`)} />
                    </article>
                  );
                })}
                {data.entryMode !== 'service' && data.employeeRows.map((row, index) => {
                  const amount = calculated.breakdownRows.find((item) => item.id === row.id)?.grossAmount ?? '0.00';
                  return (
                    <article className="billing-card" key={row.id}>
                      <div className="billing-card__header"><span>Employee {String(index + 1).padStart(2, '0')}</span><strong>SAR {formatMoney(amount)}</strong><button type="button" onClick={() => removeEmployeeRow(index)} aria-label={`Remove employee row ${index + 1}`}><Trash2 size={16} /></button></div>
                      <div className="row-fields row-fields--employee">
                        <Field label="Employee Full Name" htmlFor={`employee-${index}-employeeName`} required error={errorFor(`employeeRows.${index}.employeeName`)}>
                          <input id={`employee-${index}-employeeName`} data-field-path={`employeeRows.${index}.employeeName`} value={row.employeeName} onChange={(event) => updateEmployeeRow(index, 'employeeName', event.target.value)} aria-invalid={!!errorFor(`employeeRows.${index}.employeeName`)} />
                        </Field>
                        <Field label="Designation in English" htmlFor={`employee-${index}-designationEn`} required error={errorFor(`employeeRows.${index}.designationEn`)}>
                          <input id={`employee-${index}-designationEn`} data-field-path={`employeeRows.${index}.designationEn`} value={row.designationEn} onChange={(event) => updateEmployeeRow(index, 'designationEn', event.target.value)} aria-invalid={!!errorFor(`employeeRows.${index}.designationEn`)} />
                        </Field>
                        <Field label="Designation in Arabic" htmlFor={`employee-${index}-designationAr`}>
                          <input id={`employee-${index}-designationAr`} data-field-path={`employeeRows.${index}.designationAr`} dir="rtl" lang="ar" value={row.designationAr} onChange={(event) => updateEmployeeRow(index, 'designationAr', event.target.value)} />
                        </Field>
                        <Field label="Invoice Description in English" htmlFor={`employee-${index}-invoiceDescriptionEn`} required error={errorFor(`employeeRows.${index}.invoiceDescriptionEn`)} hint="Defaults to the designation; edit it to control grouping.">
                          <input id={`employee-${index}-invoiceDescriptionEn`} data-field-path={`employeeRows.${index}.invoiceDescriptionEn`} value={row.invoiceDescriptionEn} onChange={(event) => updateEmployeeRow(index, 'invoiceDescriptionEn', event.target.value)} aria-invalid={!!errorFor(`employeeRows.${index}.invoiceDescriptionEn`)} />
                        </Field>
                        <Field label="Invoice Description in Arabic" htmlFor={`employee-${index}-invoiceDescriptionAr`}>
                          <input id={`employee-${index}-invoiceDescriptionAr`} data-field-path={`employeeRows.${index}.invoiceDescriptionAr`} dir="rtl" lang="ar" value={row.invoiceDescriptionAr} onChange={(event) => updateEmployeeRow(index, 'invoiceDescriptionAr', event.target.value)} />
                        </Field>
                        <Field label="Billing Basis" htmlFor={`employee-${index}-billingBasis`} required error={errorFor(`employeeRows.${index}.billingBasis`)}>
                          <select id={`employee-${index}-billingBasis`} data-field-path={`employeeRows.${index}.billingBasis`} value={row.billingBasis} onChange={(event) => updateEmployeeRow(index, 'billingBasis', event.target.value)}><option value="Hour">Hour</option><option value="Day">Day</option><option value="Month">Month</option></select>
                        </Field>
                        <Field label="Quantity" htmlFor={`employee-${index}-quantity`} required error={errorFor(`employeeRows.${index}.quantity`)} hint={row.billingBasis === 'Month' ? '1 = full month; user-entered fractions are not inferred.' : 'Up to 4 decimal places.'}>
                          <input id={`employee-${index}-quantity`} data-field-path={`employeeRows.${index}.quantity`} type="number" inputMode="decimal" min="0" step="0.0001" value={row.quantity} onChange={(event) => updateEmployeeRow(index, 'quantity', event.target.value)} aria-invalid={!!errorFor(`employeeRows.${index}.quantity`)} />
                        </Field>
                        <Field label="Unit Rate (SAR)" htmlFor={`employee-${index}-unitRate`} required error={errorFor(`employeeRows.${index}.unitRate`)}>
                          <input id={`employee-${index}-unitRate`} data-field-path={`employeeRows.${index}.unitRate`} type="number" inputMode="decimal" min="0" step="0.0001" value={row.unitRate} onChange={(event) => updateEmployeeRow(index, 'unitRate', event.target.value)} aria-invalid={!!errorFor(`employeeRows.${index}.unitRate`)} />
                        </Field>
                        <Field label="Amount" htmlFor={`employee-${index}-amount`}>
                          <div className="readonly-input money-input" id={`employee-${index}-amount`}><span>SAR</span><strong>{formatMoney(amount)}</strong></div>
                        </Field>
                      </div>
                    </article>
                  );
                })}
              </div>
              <button className="add-row-button" type="button" onClick={addRow}><Plus size={17} />Add {data.entryMode === 'service' ? 'Service' : 'Employee'} Row</button>
              {data.entryMode === 'combined' && <button className="add-row-button" type="button" onClick={() => setData(current => ({ ...current, serviceRows: [...current.serviceRows, createServiceRow()] }))}><Plus size={17} />Add Service Row</button>}
              <InlineError message={errorFor(data.entryMode === 'service' ? 'serviceRows' : 'employeeRows')} />
            </Section>

            <Section icon={<ShieldCheck size={18} />} title="Totals & final review" subtitle="الإجماليات والمراجعة النهائية" badge={data.applyVat ? "15% VAT" : "VAT off"}>
              <div className="totals-editor">
                <div className="discount-field">
                  <Field label="Fixed Discount (SAR)" arabic="الخصم" htmlFor="discount" error={errorFor('discount')} hint="Allocated proportionally across invoice rows.">
                    <input id="discount" data-field-path="discount" type="number" inputMode="decimal" min="0" step="0.01" value={data.discount} onChange={(event) => updateField('discount', event.target.value)} aria-invalid={!!errorFor('discount')} />
                  </Field>
                </div>
                <dl className="totals-card">
                  <div><dt>Services charges</dt><dd>SAR {formatMoney(calculated.serviceSubtotal)}</dd></div>
                  <div><dt>Employees charges</dt><dd>SAR {formatMoney(calculated.employeeSubtotal)}</dd></div>
                  <div><dt>Total Excluding VAT</dt><dd>SAR {formatMoney(calculated.totals.subtotal)}</dd></div>
                  <div><dt>Discount</dt><dd>- SAR {formatMoney(calculated.totals.discount)}</dd></div>
                  <div><dt>Taxable Total</dt><dd>SAR {formatMoney(calculated.totals.taxableTotal)}</dd></div>
                  <div><dt>{data.applyVat ? "VAT 15%" : "VAT (not applied)"}</dt><dd>SAR {formatMoney(calculated.totals.vatAmount)}</dd></div>
                  <div className="totals-card__grand"><dt>Grand Total</dt><dd>SAR {formatMoney(calculated.totals.grandTotal)}</dd></div>
                </dl>
              </div>
              <label className={`vat-confirmation ${errorFor('applyVat') ? 'vat-confirmation--error' : ''}`}>
                <input data-field-path="applyVat" type="checkbox" checked={data.applyVat} onChange={(event) => updateField('applyVat', event.target.checked)} />
                <span className="checkbox-ui"><Check size={14} /></span>
                <span><strong>Apply 15% VAT</strong><small>Turn off to remove VAT from the invoice, PDF and QR totals.</small></span>
              </label>
              <InlineError message={errorFor('applyVat')} />
            </Section>
          </div>

          <aside className={`preview-pane ${activeMobileTab === 'preview' ? 'mobile-active' : ''}`} aria-label="Live invoice preview">
            <div className="preview-toolbar"><div><Eye size={16} /><span>Live document preview</span></div><span>Values update instantly</span></div>
            <div className="preview-scroll"><InvoicePreview data={data} compact /></div>
          </aside>
        </div>
      </main>

      <footer className="action-bar">
        <div className="action-bar__summary"><span>Ready to export</span><strong>SAR {formatMoney(calculated.totals.grandTotal)}</strong></div>
        <div className="action-bar__buttons">
          <button className="button button--ghost reset-button" type="button" onClick={handleReset} disabled={busy}><RotateCcw size={16} />Reset</button>
          <button className="button button--secondary" type="button" onClick={addRow} disabled={busy}><Plus size={16} />Add Row</button>
          <button className="button button--secondary" type="button" onClick={handlePreviewPdf} disabled={busy}>{generating === 'preview' ? <LoaderCircle className="spin" size={16} /> : <Eye size={16} />}Preview PDF</button>
          <button className="button button--secondary" type="button" onClick={handlePrint} disabled={busy}>{generating === 'print' ? <LoaderCircle className="spin" size={16} /> : <Printer size={16} />}Print</button>
          <button className="button button--primary" type="button" onClick={handleDownload} disabled={busy}>{generating === 'download' ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}Download PDF</button>
        </div>
      </footer>

      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        blobUrl={previewUrl}
        loading={generating === 'preview'}
        error={previewOpen ? generationError : ''}
      />
    </div>
  );
}
