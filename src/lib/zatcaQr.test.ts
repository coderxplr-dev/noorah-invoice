import { describe, expect, it } from 'vitest';

import {
  buildZatcaQrBase64,
  buildZatcaQrPayload,
  createZatcaQrDataUrl,
  isZatcaQrComplete,
} from './zatcaQr';

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeTlv(payload: Uint8Array): Map<number, string> {
  const fields = new Map<number, string>();
  let offset = 0;
  while (offset < payload.length) {
    const tag = payload[offset++];
    const length = payload[offset++];
    fields.set(tag, bytesToText(payload.slice(offset, offset + length)));
    offset += length;
  }
  return fields;
}

const fixture = {
  sellerNameEn: 'Noorah Zaid AlQarni Company',
  sellerVatNumber: '314287301300003',
  issueDate: '2026-07-09',
  issueTime: '10:23:54',
  totals: { grandTotal: '48723.20', vatAmount: '6355.20' },
};

describe('ZATCA Phase 1 QR payload', () => {
  it('encodes seller, VAT, Saudi timestamp and totals as UTF-8 TLV fields', () => {
    const payload = buildZatcaQrPayload(fixture);
    const decoded = decodeTlv(payload);

    expect([...decoded.keys()]).toEqual([1, 2, 3, 4, 5]);
    expect(decoded.get(1)).toBe('Noorah Zaid AlQarni Company');
    expect(decoded.get(2)).toBe('314287301300003');
    expect(decoded.get(3)).toBe('2026-07-09T10:23:54+03:00');
    expect(decoded.get(4)).toBe('48723.20');
    expect(decoded.get(5)).toBe('6355.20');
  });

  it('produces deterministic Base64 for the same input', () => {
    expect(buildZatcaQrBase64(fixture)).toBe(buildZatcaQrBase64({ ...fixture }));
    expect(decodeTlv(decodeBase64(buildZatcaQrBase64(fixture))).get(4)).toBe('48723.20');
  });

  it('uses calculated invoice totals when passed the shared InvoiceData model', () => {
    const data = {
      sellerNameEn: fixture.sellerNameEn,
      sellerVatNumber: fixture.sellerVatNumber,
      issueDate: fixture.issueDate,
      issueTime: fixture.issueTime,
      entryMode: 'service' as const,
      serviceRows: [
        {
          id: 'service-1',
          descriptionEn: 'Labour',
          descriptionAr: '',
          billingBasis: 'Hour' as const,
          quantity: '2',
          unitRate: '100',
        },
      ],
      employeeRows: [],
      discount: '0',
      applyVat: true,
    };
    const values = decodeTlv(decodeBase64(buildZatcaQrBase64(data)));
    expect(values.get(4)).toBe('230.00');
    expect(values.get(5)).toBe('30.00');
    data.applyVat = false;
    const withoutVat = decodeTlv(buildZatcaQrPayload(data));
    expect(withoutVat.get(4)).toBe('200.00');
    expect(withoutVat.get(5)).toBe('0.00');
  });

  it('keeps draft payload construction stable but omits the QR data URL', async () => {
    const draft = { sellerNameEn: 'Draft seller' };
    expect(buildZatcaQrPayload(draft)).toEqual(buildZatcaQrPayload({ ...draft }));
    expect(isZatcaQrComplete(draft)).toBe(false);
    expect(await createZatcaQrDataUrl(draft)).toBeNull();
  });

  it('creates a scannable SVG data URL after required fields are complete', async () => {
    expect(isZatcaQrComplete(fixture)).toBe(true);
    const dataUrl = await createZatcaQrDataUrl(fixture);
    expect(dataUrl?.startsWith('data:image/svg+xml;base64,')).toBe(true);
    const svg = bytesToText(decodeBase64(dataUrl!.split(',')[1]));
    expect(svg).toContain('<svg');
    expect(svg).toContain('shape-rendering="crispEdges"');
  });
});
