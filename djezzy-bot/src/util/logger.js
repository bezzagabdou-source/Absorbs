/** سجل بسيط ومناسب لبيئة Serverless (كل شيء على stdout) */
const ts = () => new Date().toISOString();
const DEBUG = /^(1|true|yes|on)$/i.test(String(process.env.DEBUG || ''));

function emit(level, scope, message, extra) {
  const line = `[${ts()}] [${level}] [${scope}] ${message}`;
  const sink = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
  if (extra !== undefined && DEBUG) sink(line, sanitize(extra));
  else sink(line);
}

/** إخفاء أي توكن/رمز قبل الطباعة */
export function sanitize(value) {
  if (value === null || value === undefined) return value;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]{10,}/gi, '$1***')
    .replace(/("?(?:access_?token|refresh_?token|token|otp|code)"?\s*[:=]\s*"?)[^",}\s]{4,}/gi, '$1***')
    .slice(0, 800);
}

export function createLogger(scope = 'app') {
  return {
    info: (message, extra) => emit('INFO', scope, message, extra),
    warn: (message, extra) => emit('WARN', scope, message, extra),
    error: (message, extra) => emit('ERROR', scope, message, extra),
    debug: (message, extra) => {
      if (DEBUG) emit('DEBUG', scope, message, extra);
    },
  };
}

export const logger = createLogger('djezzy-bot');
