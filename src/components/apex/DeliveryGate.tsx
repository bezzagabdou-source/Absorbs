"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Nova } from '@/lib/apex/store';
import { makeT } from '@/lib/apex/i18n';
import { clamp } from '@/lib/apex/utils';

/**
 * بوابة التسليم بالرمز (OTP)
 * لا يُعرض الرمز على الشاشة إطلاقاً — يُرسل إلى SMS أو البريد، وتُدخل خانة بخانة.
 */
export function DeliveryGate({ nova }: { nova: Nova }) {
  const { settings, activeProject, reports, delivery, sendCode, verifyCode, runQa } = nova;
  const t = makeT(settings.lang);
  const [destination, setDestination] = useState<'sms' | 'email'>('sms');
  const [phone, setPhone] = useState('0');
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [left, setLeft] = useState(0);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const report = activeProject ? reports[activeProject.id] : undefined;
  const blocked = Boolean(settings.strictGate && report && (report.counts.critical > 0 || report.counts.high > 0));
  const target = destination === 'sms' ? `SMS · ${phone}` : `Email · ${email || '—'}`;
  const validTarget = destination === 'sms' ? /^0\d{8,9}$/.test(phone.trim()) : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  useEffect(() => {
    if (!delivery?.sent || delivery.verified) {
      setLeft(0);
      return;
    }
    const id = window.setInterval(() => {
      setLeft(Math.max(0, Math.floor((delivery.expiresAt - Date.now()) / 1000)));
    }, 500);
    setLeft(Math.max(0, Math.floor((delivery.expiresAt - Date.now()) / 1000)));
    return () => window.clearInterval(id);
  }, [delivery]);

  const mm = useMemo(() => `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`, [left]);

  function setDigit(i: number, value: string) {
    const v = value.replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
    if (v && i < 5) inputs.current[i + 1]?.focus();
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i < 5) inputs.current[i + 1]?.focus();
    if (e.key === 'ArrowRight' && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === 'Enter') submit();
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const arr = text.split('');
    setDigits([0, 1, 2, 3, 4, 5].map((i) => arr[i] ?? ''));
    inputs.current[clamp(text.length, 0, 5)]?.focus();
  }

  function submit() {
    const code = digits.join('');
    if (code.length !== 6) return;
    const ok = verifyCode(code);
    if (!ok) setDigits(['', '', '', '', '', '']);
  }

  const ready = Boolean(activeProject?.code.trim());

  return (
    <section className="nv-panel p-4" aria-labelledby="gate-title">
      <header className="flex flex-wrap items-center gap-2">
        <h2 id="gate-title" className="text-[14px] font-extrabold">
          🔐 {t('deliveryGate')}
        </h2>
        <span className="nv-chip px-2! py-0! text-[11px]">{t('modelMapped')}: {report ? `${report.score}/100` : '—'}</span>
        {activeProject?.delivered ? <span className="nv-chip nv-chip-ok px-2! py-0!">✓ {t('delivered')} {activeProject.deliveryCode}</span> : null}
      </header>

      <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-dim)' }}>
        {t('deliveryGateHint')}
      </p>

      {blocked ? (
        <p className="nv-chip nv-chip-err mt-3 w-full py-2! text-[12px]!">
          {t('gateBlocked')}
          <button type="button" className="nv-btn nv-btn-ghost px-2! py-0.5! text-[11px]" onClick={() => runQa()}>
            {t('runQa')}
          </button>
        </p>
      ) : null}

      {/* اختيار وجهة الإرسال */}
      <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <div className="flex gap-1">
          {(['sms', 'email'] as const).map((d) => (
            <button
              key={d}
              type="button"
              className="nv-tab"
              data-active={destination === d}
              onClick={() => setDestination(d)}
              aria-pressed={destination === d}
            >
              {d === 'sms' ? `📱 ${t('sms')}` : `✉ ${t('email')}`}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-bold" style={{ color: 'var(--ink-dim)' }}>
            {t('sendTo')}
          </span>
          {destination === 'sms' ? (
            <input
              className="nv-input nv-code text-[13px]!"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 10))}
              inputMode="tel"
              placeholder="O5XXXXXXXX"
              aria-label="رقم الهاتف"
            />
          ) : (
            <input
              className="nv-input nv-code text-[13px]!"
              value={email}
              onChange={(e) => setEmail(e.target.value.slice(0, 90))}
              inputMode="email"
              placeholder="you@example.com"
              aria-label="البريد الإلكتروني"
            />
          )}
        </label>
        <button
          type="button"
          className="nv-btn nv-btn-primary"
          disabled={!ready || !validTarget || (blocked && !delivery?.sent)}
          onClick={() => {
            const code = sendCode(target);
            if (code) setDigits(['', '', '', '', '', '']);
          }}
        >
          ✉ {delivery?.sent && !delivery.verified ? t('resend') : t('sendCode')}
        </button>
      </div>

      {/* إدخال الرمز بخانات منفصلة — الرمز لا يُعرض على الشاشة */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-2" dir="ltr" role="group" aria-label={t('enterCode')}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              onPaste={onPaste}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="nv-input nv-code grid h-[54px] w-[46px] place-items-center p-0! text-center text-[22px]! font-extrabold"
              style={{ borderColor: d ? 'var(--accent)' : 'var(--line-strong)' }}
              aria-label={`${t('enterCode')} ${i + 1}`}
              maxLength={1}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="nv-btn nv-btn-primary" onClick={submit} disabled={digits.join('').length !== 6 || !delivery?.sent}>
            {t('verify')}
          </button>
          {delivery?.sent && !delivery.verified ? (
            <span className="nv-chip nv-chip-warn px-2! py-0! text-[11.5px]">
              ⏱ {left > 0 ? `${t('codeExpires')} ${mm}` : t('codeExpired')}
            </span>
          ) : null}
          {delivery?.sent ? (
            <span className="nv-chip px-2! py-0! text-[11.5px]">
              {t('attemptsLeft')}: {delivery.attempts}
            </span>
          ) : null}
          {delivery?.error ? <span className="nv-chip nv-chip-err px-2! py-0! text-[11.5px]">{delivery.error}</span> : null}
        </div>
      </div>

      <p className="mt-3 text-[11.5px]" style={{ color: 'var(--ink-dim)' }}>
        {delivery?.verified
          ? `✓ ${t('codeOk')}`
          : settings.showDemoCode
            ? 'وضع العرض: الرمز يظهر في التنبيه والمربع أدناه للاختبار السريع.'
            : t('sendCodeHint')}
      </p>

      {settings.showDemoCode && delivery?.code && !delivery.verified ? (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--warn)' }}>
          (عرض المطوّر) الرمز: <strong className="nv-code">{delivery.code}</strong>
        </p>
      ) : null}
    </section>
  );
}
