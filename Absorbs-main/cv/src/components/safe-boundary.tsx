"use client";

import { Component, type ReactNode } from "react";

/**
 * Catches render crashes in one part of the UI so the whole screen never goes blank.
 * `resetKey` changing (new chat, route change) clears the error automatically.
 */
export class SafeBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; resetKey?: unknown; label?: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("[SafeBoundary]", error);
  }

  componentDidUpdate(prev: { resetKey?: unknown }): void {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <div className="m-3 rounded-2xl border border-amber-400/40 bg-amber-50/70 p-4 text-center text-sm font-bold text-slate-700">
        <p>{this.props.label ?? "تعذّر عرض هذا الجزء"}</p>
        <button
          type="button"
          onClick={() => this.setState({ failed: false })}
          className="btn-primary mt-3 px-5 py-2 text-xs"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }
}
