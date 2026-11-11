"use client";
export default function GlobalError({ reset }: { error: Error; reset: () => void }) { return <html lang="fr"><body style={{ fontFamily: "system-ui", padding: 40, textAlign: "center" }}><h1>DZ Exchange</h1><p>Something went wrong / Une erreur est survenue / حدث خطأ</p><button onClick={reset}>Retry / Réessayer / إعادة المحاولة</button></body></html>; }
