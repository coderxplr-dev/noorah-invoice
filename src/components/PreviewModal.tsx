import { useEffect, useRef, type MouseEvent } from 'react';
import { ExternalLink, FileText, X } from 'lucide-react';

interface PreviewModalProps {
  open: boolean;
  onClose: () => void;
  blobUrl: string | null;
  loading: boolean;
  error: string | null;
}

export default function PreviewModal({
  open,
  onClose,
  blobUrl,
  loading,
  error,
}: PreviewModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key === 'Tab') {
        const focusable = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (!first || !last) {
          event.preventDefault();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        } else if (!dialogRef.current?.contains(document.activeElement)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.currentTarget === event.target) onClose();
  };

  return (
    <div
      className="preview-modal-backdrop"
      role="presentation"
      onMouseDown={handleBackdropClick}
    >
      <section
        ref={dialogRef}
        className="preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-preview-title"
        aria-describedby={error ? 'pdf-preview-error' : undefined}
        aria-busy={loading}
      >
        <header className="preview-modal__header">
          <div className="preview-modal__title-wrap">
            <span className="preview-modal__title-icon" aria-hidden="true">
              <FileText size={20} strokeWidth={1.8} />
            </span>
            <div>
              <h2 id="pdf-preview-title">PDF Preview</h2>
              <p>Review the generated document before downloading or printing.</p>
            </div>
          </div>

          <div className="preview-modal__controls">
            {blobUrl && !loading && !error && (
              <a
                className="preview-modal__external-link"
                href={blobUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Open generated PDF in a new tab"
              >
                <ExternalLink size={16} aria-hidden="true" />
                <span>Open PDF</span>
              </a>
            )}
            <button
              ref={closeButtonRef}
              className="preview-modal__close"
              type="button"
              onClick={onClose}
              aria-label="Close PDF preview"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="preview-modal__body">
          {loading ? (
            <div className="pdf-preview-state" role="status" aria-live="polite">
              <span className="pdf-preview-spinner" aria-hidden="true" />
              <h3>Preparing your PDF</h3>
              <p>Building the bilingual invoice with selectable text…</p>
            </div>
          ) : error ? (
            <div className="pdf-preview-state pdf-preview-state--error" role="alert">
              <span className="pdf-preview-state__icon" aria-hidden="true">
                !
              </span>
              <h3>PDF preview could not be generated</h3>
              <p id="pdf-preview-error">{error}</p>
              <p>Your invoice entries are unchanged. Close this window and try again.</p>
            </div>
          ) : blobUrl ? (
            <iframe
              className="pdf-frame"
              src={blobUrl}
              title="Generated bilingual tax invoice PDF"
            />
          ) : (
            <div className="pdf-preview-state" role="status">
              <FileText size={32} aria-hidden="true" />
              <h3>No PDF is available yet</h3>
              <p>Close this window and select Preview PDF again.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export { PreviewModal };
export type { PreviewModalProps };
