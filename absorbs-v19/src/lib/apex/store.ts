import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChatMessage,
  DeliveryState,
  GenerationState,
  ModelId,
  Project,
  QaReport,
  Settings,
  ToastMsg,
} from '@/lib/apex/types';
import { MODEL_BY_ID } from '@/lib/apex/models';
import { PROMPT_BY_ID } from '@/lib/apex/prompts';
import { NOVA_DASH } from '@/lib/apex/templates';
import { buildRepairPrompt, buildReviewPrompt, buildSystemPrompt, callModel, newMessage } from '@/lib/apex/api';
import { analyze, applyAutoFixes } from '@/lib/apex/qa';
import { blip, loadLocal, saveLocal, secureDigits, storageUsage, titleFromPrompt, uid } from '@/lib/apex/utils';
import { makeT } from '@/lib/apex/i18n';

const K_SETTINGS = 'nova.settings.v3';
const K_PROJECTS = 'nova.projects.v3';
const K_CHATS = 'nova.chats.v3';

export const DEFAULT_SETTINGS: Settings = {
  lang: 'ar',
  theme: 'dark',
  accent: 'forge',
  density: 'comfortable',
  animations: true,
  sound: false,
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  demoMode: true,
  temperature: 0.6,
  topP: 0.95,
  maxTokens: 8192,
  stream: true,
  autoQa: true,
  autoRepair: true,
  repairPasses: 2,
  strictGate: true,
  requireDeliveryCode: true,
  showDemoCode: false,
  autoFixSafe: false,
  persona: '',
  modelOverrides: {},
  defaultModel: 'gpt-astra',
  fontScale: 1,
  reducedMotion: false,
};

export interface DeliveryStateFull extends DeliveryState {
  code: string;
  destination: string;
  expiresAt: number;
  attempts: number;
}

export interface NovaState {
  settings: Settings;
  projects: Project[];
  activeId: string | null;
  chats: Record<string, ChatMessage[]>;
  reports: Record<string, QaReport>;
  generation: GenerationState;
  toasts: ToastMsg[];
  delivery: DeliveryStateFull | null;
  promptDraft: string;
  activeModel: ModelId;
  sidebarOpen: boolean;
  paletteOpen: boolean;
  settingsOpen: boolean;
  view: 'studio' | 'models' | 'prompts' | 'qa' | 'projects' | 'guide';
  tab: 'code' | 'preview' | 'qa' | 'chat';
  storageBytes: number;
}

export function useNova() {
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    ...loadLocal<Partial<Settings>>(K_SETTINGS, {}),
  }));
  const [projects, setProjects] = useState<Project[]>(() => loadLocal<Project[]>(K_PROJECTS, []));
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>(() => loadLocal<Record<string, ChatMessage[]>>(K_CHATS, {}));
  const [activeId, setActiveId] = useState<string | null>(() => loadLocal<Project[]>(K_PROJECTS, [])[0]?.id ?? null);
  const [reports, setReports] = useState<Record<string, QaReport>>({});
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [delivery, setDelivery] = useState<DeliveryStateFull | null>(null);
  const [generation, setGeneration] = useState<GenerationState>({ running: false, modelId: null, startedAt: 0, chars: 0, phase: 'جاهز' });
  const [promptDraft, setPromptDraft] = useState('');
  const [activeModel, setActiveModel] = useState<ModelId>(DEFAULT_SETTINGS.defaultModel);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<NovaState['view']>('studio');
  const [tab, setTab] = useState<NovaState['tab']>('code');
  const [storageBytes, setStorageBytes] = useState(0);
  const [liveProviders, setLiveProviders] = useState<string[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const streamBuf = useRef<string>('');
  const t = useMemo(() => makeT(settings.lang), [settings.lang]);

  /* ===== فحص مزوّدات السيرفر: إن وُجدت مفاتيح نُطفئ الوضع التجريبي تلقائياً ===== */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/apex/status', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as { live?: string[] };
        if (!alive) return;
        const live = Array.isArray(json.live) ? json.live : [];
        setLiveProviders(live);
        if (live.length > 0) {
          setSettings((s) => (s.demoMode && !s.apiKey ? { ...s, demoMode: false } : s));
        }
      } catch {
        /* بلا شبكة أو في بناء ثابت — يبقى الوضع التجريبي */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ===== تهيئة أول تشغيل: مشروع تجريبي جاهز بدل شاشة فارغة ===== */
  useEffect(() => {
    if (projects.length > 0) return;
    if (loadLocal<boolean>('nova.seeded.v3', false)) return;
    saveLocal('nova.seeded.v3', true);
    const seeded: Project = {
      id: uid('prj'),
      title: 'NOVA DASH — لعبة عرض تجريبي',
      kind: 'game',
      code: NOVA_DASH,
      language: 'html',
      modelId: 'gpt-astra',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      qaScore: null,
      deliveryCode: null,
      delivered: false,
      pinned: true,
      history: [{ at: Date.now(), code: NOVA_DASH, label: 'نسخة العرض التجريبي' }],
    };
    setProjects([seeded]);
    setActiveId(seeded.id);
    setReports((prev) => ({ ...prev, [seeded.id]: analyze(NOVA_DASH, 'game') }));
    setChats((prev) => ({
      ...prev,
      [seeded.id]: [
        {
          id: uid('msg'),
          role: 'assistant',
          content:
            'أهلاً بك في ABSORBS · Nexus AI v19 APEX.\n\nهذه لعبة عرض تجريبي جاهزة (NOVA DASH) ولّدها GPT Astra واجتازت بوابة الفحص بنتيجة ممتازة.\n\nجرّب: ▶ المعاينة للعب · 🛡 الفحص لتقرير مفصّل · أو اكتب طلبك بالعربية (مثال: «اصنع لي لعبة دفاع أبراج بموجات وزعماء») ثم اضغط توليد.',
          at: Date.now(),
          modelId: 'gpt-astra',
          tokens: 60,
        },
      ],
    }));
    // يُنفَّذ مرة واحدة فقط عند أول إقلاع
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ===== الحفظ التلقائي ===== */
  useEffect(() => {
    saveLocal(K_SETTINGS, settings);
  }, [settings]);

  useEffect(() => {
    saveLocal(K_PROJECTS, projects);
    setStorageBytes(storageUsage());
  }, [projects]);

  useEffect(() => {
    saveLocal(K_CHATS, chats);
  }, [chats]);

  useEffect(() => {
    if (!settings.sound) return;
    blip('tick', true);
  }, [settings.sound]);

  /* ===== أدوات مساعدة ===== */
  const toast = useCallback((kind: ToastMsg['kind'], title: string, body?: string) => {
    const id = uid('toast');
    setToasts((prev) => [...prev.slice(-4), { id, kind, title, body }]);
    if (settings.sound) blip(kind === 'ok' ? 'ok' : kind === 'err' ? 'err' : 'warn', true);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5200);
  }, [settings.sound]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const activeProject = useMemo(() => projects.find((p) => p.id === activeId) ?? null, [projects, activeId]);

  const patchProject = useCallback((id: string, patch: Partial<Project> | ((p: Project) => Partial<Project>)) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const next = typeof patch === 'function' ? patch(p) : patch;
        return { ...p, ...next, updatedAt: Date.now() };
      }),
    );
  }, []);

  const createProject = useCallback(
    (code: string, kind: Project['kind'], title: string, modelId: ModelId, promptId?: string): Project => {
      const project: Project = {
        id: uid('prj'),
        title,
        kind,
        code,
        language: 'html',
        modelId,
        promptId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        qaScore: null,
        deliveryCode: null,
        delivered: false,
        pinned: false,
        history: [{ at: Date.now(), code, label: 'الإصدار الأول', score: undefined }],
      };
      setProjects((prev) => [project, ...prev]);
      setActiveId(project.id);
      setDelivery(null);
      return project;
    },
    [],
  );

  /* ===== الفحص ===== */
  const runQa = useCallback(
    (projectId?: string, silent = false): QaReport | null => {
      const project = projects.find((p) => p.id === (projectId ?? activeId));
      if (!project) {
        if (!silent) toast('warn', 'لا يوجد مشروع', 'ولّد مشروعاً أولاً ثم شغّل الفحص.');
        return null;
      }
      const report = analyze(project.code, project.kind);
      setReports((prev) => ({ ...prev, [project.id]: report }));
      patchProject(project.id, { qaScore: report.score });
      if (!silent) {
        if (report.passed) toast('ok', `اجتاز الفحص — ${report.score}/100`, `الدرجة ${report.grade} · ${report.issues.length} ملاحظة`);
        else
          toast(
            'warn',
            `لم يجتز — ${report.score}/100`,
            `${report.counts.critical} حرج · ${report.counts.high} عالٍ · ${report.issues.length} إجمالاً`,
          );
      }
      return report;
    },
    [projects, activeId, patchProject, toast],
  );

  const applyFix = useCallback(
    (issueId: string) => {
      const project = activeProject;
      if (!project) return;
      const { code, applied } = applyAutoFixes(project.code, project.kind);
      if (!applied.length) {
        toast('info', 'لا إصلاح آلي متاح', 'هذه الملاحظة تحتاج تعديلاً يدوياً أو مراجعة AI.');
        return;
      }
      patchProject(project.id, {
        code,
        history: [...project.history, { at: Date.now(), code, label: `إصلاح آلي: ${applied.join(', ')}` }].slice(-24),
      });
      const projectId = project.id;
      window.setTimeout(() => runQa(projectId, true), 60);
      toast('ok', 'طُبّق الإصلاح', applied.join(' · '));
      void issueId;
    },
    [activeProject, patchProject, runQa, toast],
  );

  /* ===== التوليد ===== */
  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setGeneration({ running: false, modelId: null, startedAt: 0, chars: 0, phase: 'أُوقف' });
    toast('warn', 'أُوقف التوليد', 'يمكنك إعادة المحاولة أو تعديل الطلب.');
  }, [toast]);

  const updateActiveCode = useCallback(
    (code: string, label = 'تعديل يدوي') => {
      const project = activeProject;
      if (!project) return;
      patchProject(project.id, {
        code,
        history: [...project.history, { at: Date.now(), code, label }].slice(-24),
      });
    },
    [activeProject, patchProject],
  );

  /* ===== الإصلاح الذكي: فحص ← إصلاح بالـAI ← إعادة فحص (ويبقى الأفضل دائماً) ===== */
  const repairLoop = useCallback(
    async (
      projectId: string,
      startCode: string,
      kind: Project['kind'],
      maxPasses: number,
    ): Promise<{ code: string; report: QaReport; passes: number; improved: boolean }> => {
      let bestCode = startCode;
      let bestReport = analyze(startCode, kind);
      let passes = 0;
      const cap = Math.max(1, Math.min(3, Math.round(maxPasses) || 1));
      const judgeModel: ModelId = 'nova-coder-x';

      // في الوضع التجريبي لا نستبدل كود المستخدم بقالب — نكتفي بالإرشاد
      if (settings.demoMode && !settings.apiKey.trim()) {
        toast('info', t('repairNeedsProvider'), t('repairNeedsProviderBody'));
        return { code: bestCode, report: bestReport, passes, improved: false };
      }

      const controller = new AbortController();
      abortRef.current = controller;

      while (passes < cap && !bestReport.passed) {
        passes += 1;
        const blocking = bestReport.issues
          .filter((i) => i.severity === 'critical' || i.severity === 'high' || i.severity === 'medium')
          .slice(0, 14)
          .map((i) => ({
            rule: i.rule,
            severity: i.severity,
            line: i.line,
            title: settings.lang === 'ar' ? i.title.ar : i.title.en,
            detail: settings.lang === 'ar' ? i.detail.ar : i.detail.en,
            fix: settings.lang === 'ar' ? i.fix.ar : i.fix.en,
            evidence: i.evidence,
          }));
        if (!blocking.length) break;

        setGeneration({ running: true, modelId: judgeModel, startedAt: Date.now(), chars: 0, phase: `${t('repairing')} (${passes}/${cap})` });

        const res = await callModel(
          [
            { role: 'system', content: buildSystemPrompt(judgeModel, settings) },
            { role: 'user', content: buildRepairPrompt(bestCode, blocking, settings.lang) },
          ],
          {
            settings,
            modelId: judgeModel,
            signal: controller.signal,
            onDelta: (chunk) => setGeneration((g) => ({ ...g, chars: g.chars + chunk.length })),
          },
        );

        if (!res.ok) {
          toast('err', 'تعذّر الإصلاح الذكي', res.error ?? 'خطأ غير معروف');
          break;
        }

        const candidate = extractCode(res.text);
        if (!candidate || candidate === bestCode || candidate.length < 300) {
          toast('warn', t('repairNoGain'));
          break;
        }

        const candidateReport = analyze(candidate, kind);
        const better =
          candidateReport.score > bestReport.score ||
          candidateReport.counts.critical < bestReport.counts.critical ||
          (candidateReport.counts.critical === bestReport.counts.critical &&
            candidateReport.counts.high < bestReport.counts.high);

        if (!better) {
          toast('warn', t('repairNoGain'));
          break;
        }

        bestCode = candidate;
        bestReport = candidateReport;
        patchProject(projectId, (p) => ({
          code: bestCode,
          qaScore: bestReport.score,
          history: [
            ...p.history,
            { at: Date.now(), code: bestCode, label: `${t('aiRepair')} #${passes} · ${bestReport.score}/100` },
          ].slice(-24),
        }));
        setReports((prev) => ({ ...prev, [projectId]: bestReport }));
        setChats((prev) => ({
          ...prev,
          [projectId]: [
            ...(prev[projectId] ?? []),
            newMessage(
              'assistant',
              settings.lang === 'ar'
                ? `🛠 إصلاح ذكي — تمريرة ${passes}: النتيجة الآن ${bestReport.score}/100 (${bestReport.grade}) مع ${bestReport.issues.length} ملاحظة متبقية.`
                : `🛠 AI repair — pass ${passes}: score is now ${bestReport.score}/100 (${bestReport.grade}) with ${bestReport.issues.length} remaining note(s).`,
              judgeModel,
            ),
          ],
        }));
      }

      abortRef.current = null;
      setGeneration({ running: false, modelId: null, startedAt: 0, chars: 0, phase: 'جاهز' });
      return { code: bestCode, report: bestReport, passes, improved: bestCode !== startCode };
    },
    [patchProject, settings, t, toast],
  );

  const generate = useCallback(
    async (request: string, modelId?: ModelId, promptId?: string) => {
      const text = request.trim();
      if (!text) {
        toast('warn', 'اكتب طلبك أولاً', 'صف اللعبة أو الموقع الذي تريده بالتفصيل.');
        return;
      }
      const model = modelId ?? activeModel;
      const controller = new AbortController();
      abortRef.current = controller;
      streamBuf.current = '';
      setGeneration({ running: true, modelId: model, startedAt: Date.now(), chars: 0, phase: 'تجهيز البرومبت' });
      setTab('code');

      const projectId = activeId ?? uid('prj');
      const existing = projects.find((p) => p.id === projectId);
      const targetId = existing ? existing.id : createProject('', 'other', titleFromPrompt(text), model, promptId).id;

      const history = chats[targetId] ?? [];
      const userMsg = newMessage('user', text);
      const userWithId = promptId ? { ...userMsg, content: `${text}\nPROMPT_ID:${promptId}` } : userMsg;
      const assistantMsg: ChatMessage = { ...newMessage('assistant', '', model), pending: true };
      setChats((prev) => ({ ...prev, [targetId]: [...(prev[targetId] ?? history), userWithId, assistantMsg] }));
      const messagesForApi = [...history, userMsg].filter((m) => m.content.trim().length > 0);

      const sys = buildSystemPrompt(model, settings);
      const apiMsgs: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: sys },
        ...messagesForApi.map((m) => ({ role: m.role, content: m.content })),
      ];

      setGeneration((g) => ({ ...g, phase: 'توليد الكود' }));

      const result = await callModel(apiMsgs, {
        settings,
        modelId: model,
        signal: controller.signal,
        onDelta: (chunk) => {
          streamBuf.current += chunk;
          setGeneration((g) => ({ ...g, chars: streamBuf.current.length }));
          setChats((prev) => ({
            ...prev,
            [targetId]: (prev[targetId] ?? []).map((m) =>
              m.id === assistantMsg.id ? { ...m, content: streamBuf.current } : m,
            ),
          }));
        },
      });

      abortRef.current = null;

      if (!result.ok) {
        setChats((prev) => ({
          ...prev,
          [targetId]: (prev[targetId] ?? []).map((m) =>
            m.id === assistantMsg.id ? { ...m, pending: false, error: result.error } : m,
          ),
        }));
        setGeneration({ running: false, modelId: null, startedAt: 0, chars: 0, phase: 'فشل' });
        toast('err', 'فشل التوليد', result.error ?? 'خطأ غير معروف');
        return;
      }

      const code = extractCode(result.text);
      setChats((prev) => ({
        ...prev,
        [targetId]: (prev[targetId] ?? []).map((m) =>
          m.id === assistantMsg.id ? { ...m, pending: false, content: result.text } : m,
        ),
      }));

      setGeneration({
        running: false,
        modelId: null,
        startedAt: 0,
        chars: result.text.length,
        phase: result.simulated ? 'انتهى (وضع تجريبي)' : 'انتهى',
      });

      const kind: Project['kind'] = /game|لعبة/.test(text) ? 'game' : /موقع|website|صفحة/.test(text) ? 'website' : 'app';
      const prevCode = existing?.code ?? '';
      setProjects((prev) => {
        const found = prev.find((p) => p.id === targetId);
        if (!found) return prev;
        return prev.map((p) =>
          p.id === targetId
            ? {
                ...p,
                code: code || p.code,
                kind: p.code ? p.kind : kind,
                modelId: model,
                promptId,
                history: [...p.history, { at: Date.now(), code: code || p.code, label: `توليد · ${MODEL_BY_ID[model]?.name ?? model}` }].slice(-24),
                updatedAt: Date.now(),
              }
            : p,
        );
      });

      // الفحص الفوري + الإصلاح الذكي قبل أن يصل الكود لأي مستخدم
      const finalCode = code || prevCode;
      const finalKind = (existing?.code ? existing.kind : kind) as Project['kind'];
      let report: QaReport | null = finalCode.trim() ? analyze(finalCode, finalKind) : null;

      if (report) {
        const fresh: QaReport = report;
        setReports((prev) => ({ ...prev, [targetId]: fresh }));
        patchProject(targetId, { qaScore: fresh.score });
      }

      toast(
        'ok',
        `تم التوليد: ${code ? `${Math.round(code.length / 1024)}KB` : 'نص فقط'}`,
        `${MODEL_BY_ID[model]?.name ?? model}${prevCode === code ? ' · بلا تغيير' : ''}${
          report ? ` · الفحص ${report.score}/100` : ''
        }`,
      );

      if (settings.autoQa && settings.autoRepair && Boolean(code) && report && !report.passed) {
        const outcome = await repairLoop(targetId, finalCode, finalKind, settings.repairPasses);
        report = outcome.report;
        if (outcome.improved) {
          toast(
            'ok',
            `${t('repairDone')} — ${outcome.report.score}/100`,
            `${outcome.passes} تمريرة · ${outcome.report.issues.length} ملاحظة متبقية · ${outcome.report.passed ? 'جاهز للتسليم' : 'راجع البوابة'}`,
          );
        }
      }
    },
    [activeModel, activeId, chats, createProject, patchProject, projects, repairLoop, settings, t, toast],
  );

  /* ===== مراجعة AI ===== */
  const aiReview = useCallback(
    async (modelId?: ModelId) => {
      const project = activeProject;
      if (!project || !project.code.trim()) {
        toast('warn', 'لا كود للمراجعة', 'ولّد مشروعاً أولاً.');
        return;
      }
      const report = reports[project.id] ?? analyze(project.code, project.kind);
      const model = modelId ?? 'nova-coder-x';
      const controller = new AbortController();
      abortRef.current = controller;
      setGeneration({ running: true, modelId: model, startedAt: Date.now(), chars: 0, phase: 'مراجعة AI' });
      const summary = `${report.score}/100 · حرج:${report.counts.critical} عالٍ:${report.counts.high} متوسط:${report.counts.medium}`;
      const prompt = buildReviewPrompt(project.code, summary, settings.lang);
      const msg = newMessage('user', `مراجعة بالذكاء الاصطناعي — ${project.title}`);
      const assistant: ChatMessage = { ...newMessage('assistant', '', model), pending: true };
      setChats((prev) => ({ ...prev, [project.id]: [...(prev[project.id] ?? []), msg, assistant] }));
      setTab('chat');
      streamBuf.current = '';
      const res = await callModel(
        [
          { role: 'system', content: buildSystemPrompt(model, settings) },
          { role: 'user', content: prompt },
        ],
        {
          settings,
          modelId: model,
          signal: controller.signal,
          onDelta: (chunk) => {
            streamBuf.current += chunk;
            setChats((prev) => ({
              ...prev,
              [project.id]: (prev[project.id] ?? []).map((m) => (m.id === assistant.id ? { ...m, content: streamBuf.current } : m)),
            }));
          },
        },
      );
      abortRef.current = null;
      setChats((prev) => ({
        ...prev,
        [project.id]: (prev[project.id] ?? []).map((m) =>
          m.id === assistant.id ? { ...m, pending: false, content: res.ok ? res.text : `تعذّرت المراجعة: ${res.error ?? 'خطأ'}`, error: res.ok ? undefined : res.error } : m,
        ),
      }));
      setGeneration({ running: false, modelId: null, startedAt: 0, chars: 0, phase: 'جاهز' });
    },
    [activeProject, reports, settings, toast],
  );

  /* ===== بوابة التسليم بالرمز ===== */
  const sendCode = useCallback(
    (destination: string) => {
      const project = activeProject;
      if (!project || !project.code.trim()) {
        toast('warn', 'لا يوجد كود للتسليم', 'ولّد مشروعاً أولاً.');
        return null;
      }
      const report = reports[project.id] ?? analyze(project.code, project.kind);
      if (settings.strictGate && (report.counts.critical > 0 || report.counts.high > 0)) {
        toast('err', 'التسليم ممنوع', `توجد ${report.counts.critical} أخطاء حرجة و${report.counts.high} عالية — أصلحها أولاً.`);
        setTab('qa');
        return null;
      }
      const code = secureDigits(6);
      const state: DeliveryStateFull = {
        code,
        destination,
        expiresAt: Date.now() + 5 * 60 * 1000,
        attempts: 5,
        sent: true,
        verified: false,
        error: null,
      };
      setDelivery(state);
      toast('info', `أُرسل الرمز إلى ${destination}`, settings.showDemoCode ? 'وضع العرض: الرمز كُشف في اللوحة للاختبار.' : 'أدخل الرمز في الخانات الست للتحقق. الرمز غير معروض على الشاشة.');
      if (settings.showDemoCode) {
        window.setTimeout(() => {
          setToasts((prev) => [
            ...prev,
            { id: uid('code'), kind: 'info', title: `(وضع العرض) الرمز: ${code}`, body: `${destination} · صالح 5 دقائق` },
          ]);
        }, 700);
      }
      return code;
    },
    [activeProject, reports, settings.strictGate, toast],
  );

  const verifyCode = useCallback(
    (input: string) => {
      const project = activeProject;
      if (!delivery) {
        toast('warn', 'يجب إرسال رمز أولاً', 'اضغط «إرسال رمز» لاختيار وجهة الإرسال.');
        return false;
      }
      if (!project) return false;
      if (Date.now() > delivery.expiresAt) {
        setDelivery({ ...delivery, error: 'انتهت صلاحية الرمز — أرسل رمزاً جديداً.' });
        toast('err', 'انتهى الرمز', 'اضغط «إعادة الإرسال».');
        return false;
      }
      if (input.replace(/\D/g, '') !== delivery.code) {
        const attempts = delivery.attempts - 1;
        setDelivery({ ...delivery, attempts, error: 'رمز غير صحيح' });
        toast('err', 'رمز غير صحيح', `${attempts} محاولات متبقية`);
        return false;
      }
      const report = reports[project.id];
      patchProject(project.id, { delivered: true, deliveryCode: delivery.code, qaScore: report?.score ?? project.qaScore });
      setDelivery({ ...delivery, verified: true, error: null });
      toast('ok', 'تم التسليم', `رمز التحقق ${delivery.code} · درجة الجودة ${report?.score ?? '—'}/100`);
      return true;
    },
    [delivery, activeProject, patchProject, reports, toast],
  );

  /* ===== الإصلاح الذكي من الواجهة ===== */
  const repairWithAi = useCallback(
    async (passes?: number) => {
      const project = activeProject;
      if (!project || !project.code.trim()) {
        toast('warn', 'لا كود للإصلاح', 'ولّد مشروعاً أولاً.');
        return null;
      }
      setTab('qa');
      const outcome = await repairLoop(project.id, project.code, project.kind, passes ?? settings.repairPasses);
      if (outcome.improved) {
        toast(
          'ok',
          `${t('aiRepair')}: ${outcome.report.score}/100`,
          `${outcome.passes} تمريرة · ${outcome.report.issues.length} ملاحظة متبقية`,
        );
      }
      return outcome.report;
    },
    [activeProject, repairLoop, settings.repairPasses, t, toast],
  );

  /* ===== اختصارات لوحة المفاتيح ===== */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (mod && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        runQa();
      } else if (mod && e.key.toLowerCase() === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      } else if (mod && e.key === 'Enter') {
        e.preventDefault();
        if (promptDraft.trim()) void generate(promptDraft);
      } else if (e.key === 'Escape') {
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [generate, promptDraft, runQa]);

  /* ===== تصدير/استيراد ===== */
  const exportAll = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 3,
      settings,
      projects,
      chats,
    };
    return JSON.stringify(payload, null, 2);
  }, [chats, projects, settings]);

  const importAll = useCallback(
    (json: string) => {
      try {
        const parsed = JSON.parse(json) as { settings?: Settings; projects?: Project[]; chats?: Record<string, ChatMessage[]> };
        if (parsed.settings) setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings, demoMode: parsed.settings.demoMode ?? true });
        if (Array.isArray(parsed.projects)) setProjects(parsed.projects);
        if (parsed.chats) setChats(parsed.chats);
        toast('ok', 'تم الاستيراد', 'أُعيدت المشاريع والإعدادات.');
      } catch {
        toast('err', 'ملف غير صالح', 'تأكد أن الملف JSON ناتج عن تصدير نوفا فورج.');
      }
    },
    [toast],
  );

  const resetAll = useCallback(() => {
    setProjects([]);
    setChats({});
    setReports({});
    setActiveId(null);
    setSettings(DEFAULT_SETTINGS);
    setDelivery(null);
    toast('warn', 'تم تصفير التطبيق', 'حُذفت كل المشاريع والإعدادات.');
  }, [toast]);

  const setActiveModelSafe = useCallback(
    (m: ModelId) => {
      setActiveModel(m);
      setSettings((s) => ({ ...s, defaultModel: m }));
      toast('info', `النموذج النشِط: ${MODEL_BY_ID[m]?.name ?? m}`, MODEL_BY_ID[m]?.tagline?.ar ?? '');
    },
    [toast],
  );

  const openPrompt = useCallback(
    (promptId: string) => {
      const item = PROMPT_BY_ID[promptId];
      if (!item) return;
      setPromptDraft(item.body.ar);
      setView('studio');
      setTab('code');
      if (item.bestModels[0]) setActiveModel(item.bestModels[0]);
      toast('ok', 'حُمّل البرومبت في الاستوديو', item.title.ar);
    },
    [toast],
  );

  const removeProject = useCallback(
    (id: string) => {
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setChats((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      setReports((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      setActiveId((cur) => (cur === id ? null : cur));
    },
    [],
  );

  const restoreSnapshot = useCallback(
    (snapshotCode: string, label: string) => {
      const project = activeProject;
      if (!project) return;
      patchProject(project.id, {
        code: snapshotCode,
        history: [...project.history, { at: Date.now(), code: snapshotCode, label: `استرجاع: ${label}` }].slice(-24),
      });
      toast('ok', 'أُعيد الإصدار', label);
    },
    [activeProject, patchProject, toast],
  );

  /* ===== المظهر: يُطبَّق على جذر /apex فقط (لا يمسّ بقية صفحات الموقع) ===== */
  useEffect(() => {
    const root = document.querySelector('.apex-root');
    if (!root) return;
    root.setAttribute('dir', settings.lang === 'ar' ? 'rtl' : 'ltr');
    root.setAttribute('lang', settings.lang);
    root.classList.toggle('apex-dark', settings.theme === 'dark');
    root.classList.toggle('apex-light', settings.theme === 'light');
    root.classList.toggle('apex-compact', settings.density === 'compact');
    root.classList.toggle('no-anim', !settings.animations || settings.reducedMotion);
    (root as HTMLElement).dataset.accent = settings.accent;
    (root as HTMLElement).style.fontSize = `${Math.round(16 * settings.fontScale)}px`;
  }, [settings.lang, settings.theme, settings.accent, settings.density, settings.animations, settings.reducedMotion, settings.fontScale]);

  return {
    // الحالة
    settings,
    projects,
    activeId,
    activeProject,
    chats,
    reports,
    generation,
    toasts,
    delivery,
    promptDraft,
    activeModel,
    sidebarOpen,
    paletteOpen,
    settingsOpen,
    view,
    tab,
    storageBytes,
    liveProviders,
    // الأدوات
    setSettings,
    setActiveId,
    setPromptDraft,
    setSidebarOpen,
    setPaletteOpen,
    setSettingsOpen,
    setView,
    setTab,
    toast,
    dismissToast,
    generate,
    stopGeneration,
    createProject,
    patchProject,
    updateActiveCode,
    removeProject,
    runQa,
    applyFix,
    repairWithAi,
    aiReview,
    sendCode,
    verifyCode,
    exportAll,
    importAll,
    resetAll,
    setActiveModelSafe,
    openPrompt,
    restoreSnapshot,
  };
}

export type Nova = ReturnType<typeof useNova>;

/** استخراج أول كود بلوك من رد النموذج، أو الرد كاملاً إن كان ملفاً */
export function extractCode(text: string): string {
  const fence = /```(?:html|tsx|jsx|js|css|json|python|py)?\s*\n([\s\S]*?)```/i.exec(text);
  if (fence?.[1] && fence[1].trim().length > 24) return fence[1].trim();
  if (/<!doctype html|<html|<canvas|<script/i.test(text) && text.trim().length > 80) return text.trim();
  return '';
}
