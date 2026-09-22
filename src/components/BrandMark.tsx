export function BrandMark({ large = false }: { large?: boolean }) {
  return (
    <svg className={`brand-mark${large ? ' brand-mark--large' : ''}`} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M24 10c-3.2 5.4-11 12.6-11 19a11 11 0 0 0 22 0c0-6.4-7.8-13.6-11-19Z" fill="#fff" />
      <path d="M18 29a6 6 0 0 0 6 6" fill="none" stroke="#147cba" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="36" cy="13" r="3" fill="#67e8f9" />
      <circle cx="11" cy="17" r="2" fill="#67e8f9" />
    </svg>
  );
}
