/** شعار مسابقات MX — نقاط ذهبية متصاعدة داخل إطار (بدون أي نص أو اسم قديم). */
export default function Brand({ size = 42 }: { size?: number }) {
  return (
    <span
      className="brand-logo"
      style={{ width: size, height: size, borderRadius: size * 0.31, padding: 0, overflow: "hidden" }}
      aria-label="مسابقات MX"
    >
      <svg viewBox="0 0 48 48" width="100%" height="100%" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="mxg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff3c4" />
            <stop offset="45%" stopColor="#f7c948" />
            <stop offset="100%" stopColor="#c98a05" />
          </linearGradient>
        </defs>
        <g fill="url(#mxg)">
          <circle cx="14" cy="32" r="4.2" />
          <circle cx="24" cy="23" r="5.4" />
          <circle cx="35" cy="13" r="6.6" />
        </g>
        <path d="M9 40.5h30" stroke="url(#mxg)" strokeWidth="2.4" strokeLinecap="round" opacity=".55" />
      </svg>
    </span>
  );
}
