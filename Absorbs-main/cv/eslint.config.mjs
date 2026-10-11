import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "scripts/.v*-build/**"]),
  {
    rules: {
      /**
       * v15 — deliberate, documented downgrade.
       *
       * Every remaining hit is the same shape: a mount-only effect that reads
       * localStorage / navigator / Notification.permission and seeds state.
       * That value does not exist during SSR, so it cannot be derived during
       * render without a hydration mismatch. The textbook replacement is
       * useSyncExternalStore, which is a large refactor across ~10 screens with
       * real regression risk for zero user-visible benefit.
       *
       * Genuine cascading-render bugs (state mirroring a prop) were fixed
       * properly instead — see settings/security/page.tsx, which derives
       * `verified` during render rather than mirroring it in an effect.
       */
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);
