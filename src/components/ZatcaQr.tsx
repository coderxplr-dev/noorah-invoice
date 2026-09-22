import { useEffect, useState } from 'react';

import {
  createZatcaQrDataUrl,
  isZatcaQrComplete,
  type ZatcaQrInput,
} from '../lib/zatcaQr';

export interface ZatcaQrProps {
  data: ZatcaQrInput;
  /** Rendered CSS pixel size. */
  size?: number;
  className?: string;
  alt?: string;
}

/**
 * Small presentational QR component.  It intentionally renders no QR image
 * until the required invoice values are complete, so draft typing never leaves
 * behind a stale code.  The generated SVG data URL is also accepted by
 * @react-pdf/renderer when the same helper is used from a PDF component.
 */
export function ZatcaQr({
  data,
  size = 132,
  className,
  alt = 'ZATCA invoice QR code',
}: ZatcaQrProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);

    if (!isZatcaQrComplete(data)) return undefined;

    void createZatcaQrDataUrl(data).then((nextUrl) => {
      if (!cancelled) setDataUrl(nextUrl);
    });

    return () => {
      cancelled = true;
    };
  }, [data]);

  if (!dataUrl) {
    return (
      <span
        className={className}
        aria-label="ZATCA QR code will appear after the required invoice fields are complete"
        role="img"
        style={{
          display: 'inline-flex',
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px dashed #c7d2cc',
          color: '#64736c',
          fontSize: 10,
          textAlign: 'center',
          padding: 8,
        }}
      >
        QR available after required fields are complete
      </span>
    );
  }

  return (
    <img
      className={className}
      src={dataUrl}
      width={size}
      height={size}
      alt={alt}
      decoding="async"
      style={{ display: 'block', width: size, height: size, imageRendering: 'pixelated' }}
    />
  );
}

export default ZatcaQr;

