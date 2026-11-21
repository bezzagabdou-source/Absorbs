/**
 * محوّل تخزين عبر مستودع GitHub — بديل دائم يعمل على Vercel بدون Upstash/KV.
 *
 * كل مفتاح يُخزَّن كملف JSON في فرع مستقل (الافتراضي: bot-state) داخل
 * المستودع المضبوط (STATE_GITHUB_REPO). الكتابة تستخدم Contents API مع
 * إعادة المحاولة عند تعارض الـ sha (409) — أي قراءة-كتابة آمنة بقدر الإمكان.
 *
 * المفاتيح:  djezzy:user:<id>  →  <dir>/user-<id>.json
 *            djezzy:meta:<n>   →  <dir>/meta-<n>.json
 */
import config from '../config.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('store/github');

const API = 'https://api.github.com';

function fileFor(key) {
  const safe = String(key)
    .replace(/^djezzy:/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .slice(0, 80);
  return `${config.storage.githubDir}/${safe}.json`;
}

function headers() {
  return {
    Authorization: `Bearer ${config.storage.githubToken}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'djezzy-telegram-bot',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

const alive = (entry) => entry && (!entry.expiresAt || entry.expiresAt > Date.now());

export function createGitHubAdapter({ token, repo, branch, dir } = {}) {
  const cfg = {
    token: token ?? config.storage.githubToken,
    repo: repo ?? config.storage.githubRepo,
    branch: branch ?? config.storage.githubBranch,
    dir: dir ?? config.storage.githubDir,
  };

  if (!cfg.token || !cfg.repo) return null;

  const contentsBase = () => `${API}/repos/${cfg.repo}/contents`;

  async function read(key) {
    const path = fileFor(key);
    const response = await fetch(`${contentsBase()}/${path}?ref=${encodeURIComponent(cfg.branch)}`, {
      headers: headers(),
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`GitHub GET ${response.status}: ${detail.slice(0, 160)}`);
    }
    const payload = await response.json();
    const content = String(payload.content || '').replace(/\n/g, '');
    const text = Buffer.from(content, 'base64').toString('utf8');
    return { sha: payload.sha, text };
  }

  async function write(key, text, { delete: remove = false } = {}) {
    const path = fileFor(key);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await read(key).catch(() => null);

      const url = `${contentsBase()}/${path}`;
      const body = {
        message: `${remove ? 'chore(bot-state): delete' : 'chore(bot-state): update'} ${path}`,
        branch: cfg.branch,
        ...(current?.sha ? { sha: current.sha } : {}),
        ...(remove ? {} : { content: Buffer.from(text, 'utf8').toString('base64') }),
      };

      const response = await fetch(url, {
        method: remove ? 'DELETE' : 'PUT',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) return true;
      if (response.status === 409 || response.status === 422) {
        // تعارض تحديث متزامن — نعيد القراءة ثم المحاولة
        await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));
        continue;
      }
      const detail = await response.text().catch(() => '');
      throw new Error(`GitHub PUT ${response.status}: ${detail.slice(0, 160)}`);
    }
    throw new Error('GitHub: تعذّر الكتابة بعد عدة محاولات (تعارض متكرر).');
  }

  return {
    name: 'github',
    repo: cfg.repo,
    branch: cfg.branch,

    async get(key) {
      const entry = await read(key);
      if (!entry) return null;
      try {
        const parsed = JSON.parse(entry.text);
        if (!alive(parsed)) return null;
        return parsed.value ?? null;
      } catch {
        return null;
      }
    },

    async set(key, value, ttlSeconds = config.storage.userTtlSeconds) {
      await write(key, JSON.stringify({ value, expiresAt: Date.now() + ttlSeconds * 1000 }));
    },

    async del(key) {
      await write(key, '', { delete: true }).catch((error) => {
        if (!/404/.test(error.message)) throw error;
      });
    },

    async ping() {
      const response = await fetch(`${API}/repos/${cfg.repo}`, {
        headers: headers(),
        signal: AbortSignal.timeout(8000),
      });
      return response.ok;
    },
  };
}

export default createGitHubAdapter;
