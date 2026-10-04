"use client";

/** Last line of defence: even a crash of the root layout never shows a white page. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl" style={{ background: "#050505", colorScheme: "dark" }}>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "radial-gradient(60% 45% at 50% 0%, rgba(255,255,255,.28), transparent 70%), #050505",
          color: "#e4e4e7",
          fontFamily: "system-ui, Tahoma, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 360 }}>
          <div style={{ fontSize: 48 }}>⚡</div>
          <h1 style={{ fontSize: 22, margin: "14px 0 8px", color: "#fafafa" }}>برق يحتاج إعادة تشغيل</h1>
          <p style={{ color: "#a1a1aa", lineHeight: 1.9, margin: "0 0 22px" }}>صار خلل غير متوقع. اضغط الزر وكمّل.</p>
          <button
            onClick={reset}
            style={{ border: 0, borderRadius: 12, padding: "12px 28px", fontWeight: 700, fontSize: 15, color: "#050505", background: "#ffffff" }}
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
