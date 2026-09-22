import Decimal from 'decimal.js';

import { calculateInvoice } from './invoice';
import type { CalculatedInvoice, InvoiceData } from '../types';

/**
 * The five Phase 1 ZATCA invoice QR tags.  Values are UTF-8 encoded and each
 * tag is represented by one tag byte, one length byte, and the value bytes.
 */
export const ZATCA_QR_TAGS = {
  sellerName: 1,
  sellerVatNumber: 2,
  timestamp: 3,
  invoiceTotal: 4,
  vatTotal: 5,
} as const;

export interface ZatcaQrTotals {
  grandTotal?: string | number | null;
  vatAmount?: string | number | null;
}

/**
 * This deliberately accepts the small subset needed by the QR.  Full
 * InvoiceData is assignable, while the small shape is convenient for preview
 * and test callers that already have calculated totals.
 */
export interface ZatcaQrInput {
  sellerNameEn?: string | null;
  sellerVatNumber?: string | null;
  issueDate?: string | null;
  issueTime?: string | null;
  grandTotal?: string | number | null;
  vatAmount?: string | number | null;
  totals?: ZatcaQrTotals | null;
  calculated?: Pick<CalculatedInvoice, 'totals'> | null;
  entryMode?: InvoiceData['entryMode'];
  serviceRows?: InvoiceData['serviceRows'];
  employeeRows?: InvoiceData['employeeRows'];
  discount?: string;
  applyVat?: boolean;
}

const SAUDI_OFFSET = '+03:00';

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function utf8(value: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value);

  // TextEncoder is available in supported browsers and modern Node.  This
  // fallback keeps the encoder usable in older test/SSR runtimes as well.
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const low = value.charCodeAt(++index);
      const point = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
      bytes.push(
        0xf0 | (point >> 18),
        0x80 | ((point >> 12) & 0x3f),
        0x80 | ((point >> 6) & 0x3f),
        0x80 | (point & 0x3f),
      );
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return Uint8Array.from(bytes);
}

function asTextBytes(value: string): number[] {
  return Array.from(utf8(value));
}

function base64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  }

  const maybeBuffer = (globalThis as typeof globalThis & {
    Buffer?: { from(value: Uint8Array): { toString(encoding: string): string } };
  }).Buffer;
  if (maybeBuffer) return maybeBuffer.from(bytes).toString('base64');
  throw new Error('No Base64 encoder is available in this runtime.');
}

function money(value: unknown): string {
  const text = clean(value);
  if (!text) return '0.00';
  try {
    const decimal = new Decimal(text);
    return decimal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    return '0.00';
  }
}

function calculatedTotals(data: ZatcaQrInput): ZatcaQrTotals {
  const direct = data.totals ?? data.calculated?.totals;
  if (direct && (direct.grandTotal != null || direct.vatAmount != null)) return direct;
  if (data.grandTotal != null || data.vatAmount != null) {
    return { grandTotal: data.grandTotal, vatAmount: data.vatAmount };
  }

  // Calling calculateInvoice here makes InvoiceData the shared source of
  // truth.  The shape guard keeps this helper safe for incomplete drafts.
  if (
    (data.entryMode === 'service' || data.entryMode === 'employee' || data.entryMode === 'combined') &&
    Array.isArray(data.serviceRows) &&
    Array.isArray(data.employeeRows)
  ) {
    try {
      const calculated = calculateInvoice(data as unknown as InvoiceData);
      return calculated.totals;
    } catch {
      // A draft is allowed to be incomplete; zero values keep its payload
      // deterministic until final validation is performed by the exporter.
    }
  }

  return {};
}

function timestamp(data: ZatcaQrInput): string {
  const date = clean(data.issueDate);
  const rawTime = clean(data.issueTime);
  // Form state uses HH:mm:ss.  Appending :00 for an older/incomplete caller
  // makes the fallback deterministic without changing valid seconds.
  const time = /^\d{2}:\d{2}$/.test(rawTime) ? `${rawTime}:00` : rawTime;
  return `${date}T${time}${SAUDI_OFFSET}`;
}

function tlv(tag: number, value: string): Uint8Array {
  const bytes = utf8(value);
  if (bytes.length > 255) {
    throw new RangeError(`ZATCA QR tag ${tag} exceeds the one-byte length limit.`);
  }
  return Uint8Array.from([tag, bytes.length, ...bytes]);
}

/**
 * Build the raw Phase 1 ZATCA TLV bytes.  This function intentionally remains
 * total for incomplete drafts: missing values become empty text or 0.00, so
 * callers can render a stable preview while final validation blocks export.
 */
export function buildZatcaQrPayload(data: ZatcaQrInput): Uint8Array {
  const totals = calculatedTotals(data);
  const values = [
    clean(data.sellerNameEn),
    clean(data.sellerVatNumber),
    timestamp(data),
    money(totals.grandTotal),
    money(totals.vatAmount),
  ];

  const fields = values.map((value, index) => tlv(index + 1, value));
  const length = fields.reduce((sum, field) => sum + field.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  fields.forEach((field) => {
    result.set(field, offset);
    offset += field.length;
  });
  return result;
}

/** Build the Base64 representation that is encoded into the QR symbol. */
export function buildZatcaQrBase64(data: ZatcaQrInput): string {
  return base64(buildZatcaQrPayload(data));
}

function isFiniteMoney(value: unknown): boolean {
  const text = clean(value);
  if (!text) return false;
  try {
    return new Decimal(text).isFinite() && new Decimal(text).greaterThanOrEqualTo(0);
  } catch {
    return false;
  }
}

/** Whether a draft has the required values for a usable ZATCA QR. */
export function isZatcaQrComplete(data: ZatcaQrInput): boolean {
  const totals = calculatedTotals(data);
  return Boolean(
    clean(data.sellerNameEn) &&
      /^\d{15}$/.test(clean(data.sellerVatNumber)) &&
      /^\d{4}-\d{2}-\d{2}$/.test(clean(data.issueDate)) &&
      /^\d{2}:\d{2}:\d{2}$/.test(clean(data.issueTime)) &&
      isFiniteMoney(totals.grandTotal) &&
      isFiniteMoney(totals.vatAmount),
  );
}

/*
 * Minimal, self-contained QR encoder.
 *
 * This is a compact TypeScript port of Project Nayuki's qrcodegen algorithm
 * (MIT licensed).  It emits byte-mode QR symbols with medium error correction,
 * which is sufficient for the short Base64 Phase 1 payload and avoids making
 * the invoice depend on a network-loaded QR library.  The full version/ECC
 * tables are retained so unusually long seller names can still choose a
 * larger QR version automatically.
 */

type QrEcc = { ordinal: number; formatBits: number };
const QR_ECC_M: QrEcc = { ordinal: 1, formatBits: 0 };

const ECC_CODEWORDS_PER_BLOCK: readonly (readonly number[])[] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 18, 22, 20, 24, 28, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 22, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

const NUM_ERROR_CORRECTION_BLOCKS: readonly (readonly number[])[] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

function qrBit(value: number, index: number): boolean {
  return ((value >>> index) & 1) !== 0;
}

function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function dataCodewords(version: number): number {
  return Math.floor(rawDataModules(version) / 8) - ECC_CODEWORDS_PER_BLOCK[QR_ECC_M.ordinal][version] * NUM_ERROR_CORRECTION_BLOCKS[QR_ECC_M.ordinal][version];
}

function rsMultiply(x: number, y: number): number {
  let result = 0;
  for (let bit = 7; bit >= 0; bit -= 1) {
    result = (result << 1) ^ ((result >>> 7) * 285);
    result ^= ((y >>> bit) & 1) * x;
  }
  return result;
}

function rsDivisor(degree: number): number[] {
  const result = Array.from({ length: degree - 1 }, () => 0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = rsMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = rsMultiply(root, 2);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0);
  data.forEach((byte) => {
    const factor = byte ^ (result.shift() ?? 0);
    result.push(0);
    divisor.forEach((coefficient, index) => {
      result[index] ^= rsMultiply(coefficient, factor);
    });
  });
  return result;
}

function qrByteCodewords(bytes: number[]): { version: number; data: number[] } {
  let version = 1;
  for (; version <= 40; version += 1) {
    const capacity = dataCodewords(version) * 8;
    const countBits = version <= 9 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= capacity) break;
  }
  if (version > 40) throw new RangeError('Invoice QR data is too long.');

  const bits: number[] = [];
  const append = (value: number, length: number) => {
    for (let bit = length - 1; bit >= 0; bit -= 1) bits.push((value >>> bit) & 1);
  };
  append(4, 4); // byte mode
  append(bytes.length, version <= 9 ? 8 : 16);
  bytes.forEach((byte) => append(byte, 8));

  const capacity = dataCodewords(version) * 8;
  append(0, Math.min(4, capacity - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) append(pad, 8);

  const result: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) byte = (byte << 1) | bits[index + bit];
    result.push(byte);
  }
  return { version, data: result };
}

function addEccAndInterleave(version: number, data: number[]): number[] {
  const blocks = NUM_ERROR_CORRECTION_BLOCKS[QR_ECC_M.ordinal][version];
  const eccLength = ECC_CODEWORDS_PER_BLOCK[QR_ECC_M.ordinal][version];
  const rawCodewords = Math.floor(rawDataModules(version) / 8);
  const shortBlocks = blocks - (rawCodewords % blocks);
  const shortBlockLength = Math.floor(rawCodewords / blocks);
  const divisor = rsDivisor(eccLength);
  const blockData: number[][] = [];
  const blockEcc: number[][] = [];
  let offset = 0;
  for (let block = 0; block < blocks; block += 1) {
    const length = shortBlockLength - eccLength + (block < shortBlocks ? 0 : 1);
    const values = data.slice(offset, offset + length);
    offset += length;
    blockData.push(values);
    blockEcc.push(rsRemainder(values, divisor));
  }

  const result: number[] = [];
  const maxDataLength = Math.max(...blockData.map((block) => block.length));
  for (let index = 0; index < maxDataLength; index += 1) {
    blockData.forEach((block) => {
      if (index < block.length) result.push(block[index]);
    });
  }
  for (let index = 0; index < eccLength; index += 1) blockEcc.forEach((block) => result.push(block[index]));
  return result;
}

class QrMatrix {
  readonly size: number;
  private readonly modules: boolean[][];
  private readonly functionModules: boolean[][];

  constructor(private readonly version: number, codewords: number[]) {
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => Array(this.size).fill(false));
    this.functionModules = Array.from({ length: this.size }, () => Array(this.size).fill(false));
    this.drawFunctionPatterns();
    this.drawCodewords(codewords);
    this.applyMask(0);
    this.drawFormatBits(0);
  }

  getModules(): boolean[][] {
    return this.modules.map((row) => row.slice());
  }

  private setFunction(x: number, y: number, dark: boolean): void {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    this.modules[y][x] = dark;
    this.functionModules[y][x] = true;
  }

  private drawFunctionPatterns(): void {
    for (let index = 0; index < this.size; index += 1) {
      this.setFunction(6, index, index % 2 === 0);
      this.setFunction(index, 6, index % 2 === 0);
    }
    this.drawFinder(3, 3);
    this.drawFinder(this.size - 4, 3);
    this.drawFinder(3, this.size - 4);
    const positions = this.alignmentPositions();
    for (let row = 0; row < positions.length; row += 1) {
      for (let column = 0; column < positions.length; column += 1) {
        if (!((row === 0 && column === 0) || (row === 0 && column === positions.length - 1) || (row === positions.length - 1 && column === 0))) {
          this.drawAlignment(positions[row], positions[column]);
        }
      }
    }
    this.drawFormatBits(0);
    this.drawVersionBits();
  }

  private drawFinder(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        this.setFunction(x + dx, y + dy, distance !== 2 && distance !== 4);
      }
    }
  }

  private drawAlignment(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) this.setFunction(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  private alignmentPositions(): number[] {
    if (this.version === 1) return [];
    const count = Math.floor(this.version / 7) + 2;
    const step = this.version === 32 ? 26 : Math.ceil((this.version * 4 + 4) / (count * 2 - 2)) * 2;
    const result = [6];
    for (let position = this.size - 7; result.length < count; position -= step) result.splice(1, 0, position);
    return result;
  }

  private drawFormatBits(mask: number): void {
    const data = QR_ECC_M.formatBits << 3 | mask;
    let remainder = data;
    for (let index = 0; index < 10; index += 1) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
    const bits = ((data << 10) | remainder) ^ 0x5412;
    for (let index = 0; index <= 5; index += 1) this.setFunction(8, index, qrBit(bits, index));
    this.setFunction(8, 7, qrBit(bits, 6));
    this.setFunction(8, 8, qrBit(bits, 7));
    this.setFunction(7, 8, qrBit(bits, 8));
    for (let index = 9; index < 15; index += 1) this.setFunction(14 - index, 8, qrBit(bits, index));
    for (let index = 0; index < 8; index += 1) this.setFunction(this.size - 1 - index, 8, qrBit(bits, index));
    for (let index = 8; index < 15; index += 1) this.setFunction(8, this.size - 15 + index, qrBit(bits, index));
    this.setFunction(8, this.size - 8, true);
  }

  private drawVersionBits(): void {
    if (this.version < 7) return;
    let remainder = this.version;
    for (let index = 0; index < 12; index += 1) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
    const bits = (this.version << 12) | remainder;
    for (let index = 0; index < 18; index += 1) {
      const dark = qrBit(bits, index);
      const a = this.size - 11 + (index % 3);
      const b = Math.floor(index / 3);
      this.setFunction(a, b, dark);
      this.setFunction(b, a, dark);
    }
  }

  private drawCodewords(codewords: number[]): void {
    let bitIndex = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vertical = 0; vertical < this.size; vertical += 1) {
        for (let side = 0; side < 2; side += 1) {
          const x = right - side;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vertical : vertical;
          if (!this.functionModules[y][x] && bitIndex < codewords.length * 8) {
            this.modules[y][x] = qrBit(codewords[bitIndex >>> 3], 7 - (bitIndex & 7));
            bitIndex += 1;
          }
        }
      }
    }
  }

  private applyMask(mask: number): void {
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        if (this.functionModules[y][x]) continue;
        const invert = (x + y) % 2 === 0;
        if (invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }
}

function matrixForText(text: string): boolean[][] {
  const encoded = qrByteCodewords(asTextBytes(text));
  const interleaved = addEccAndInterleave(encoded.version, encoded.data);
  return new QrMatrix(encoded.version, interleaved).getModules();
}

function svgForModules(modules: boolean[][]): string {
  const border = 4;
  const size = modules.length + border * 2;
  let path = '';
  modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x + border},${y + border}h1v1h-1z`;
    });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

/** Return QR modules for callers that need to paint with @react-pdf Svg/Path. */
export function buildZatcaQrModules(data: ZatcaQrInput): boolean[][] | null {
  if (!isZatcaQrComplete(data)) return null;
  try {
    return matrixForText(buildZatcaQrBase64(data));
  } catch {
    return null;
  }
}

/** Return the QR symbol as an SVG string, without a data-url wrapper. */
export function buildZatcaQrSvg(data: ZatcaQrInput): string | null {
  const modules = buildZatcaQrModules(data);
  return modules ? svgForModules(modules) : null;
}

/** Return the generated QR SVG as a self-contained image data URL. */
export function buildZatcaQrSvgDataUrl(data: ZatcaQrInput): string | null {
  const svg = buildZatcaQrSvg(data);
  return svg ? `data:image/svg+xml;base64,${base64(utf8(svg))}` : null;
}

function svgDataUrl(text: string): string {
  const modules = matrixForText(text);
  const svg = svgForModules(modules);
  return `data:image/svg+xml;base64,${base64(utf8(svg))}`;
}

/**
 * Create a QR image data URL.  A null result means the draft is not complete
 * enough for a ZATCA QR yet; callers can keep editing without an error state.
 */
export async function createZatcaQrDataUrl(data: ZatcaQrInput): Promise<string | null> {
  if (!isZatcaQrComplete(data)) return null;
  try {
    return svgDataUrl(buildZatcaQrBase64(data));
  } catch {
    return null;
  }
}
