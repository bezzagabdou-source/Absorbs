"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Globe, 
  Monitor, 
  Smartphone, 
  Tablet,
  Code2,
  Eye,
  RefreshCw,
  ExternalLink,
  Loader2,
  X,
  Copy,
  Check,
  Palette,
  Layout,
  Type,
  Image as ImageIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

type DeviceType = "desktop" | "tablet" | "mobile";

interface WebPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  initialCode?: string;
}

const TEMPLATES = [
  { id: "landing", name: "صفحة هبوط", desc: "Landing Page احترافية" },
  { id: "dashboard", name: "لوحة تحكم", desc: "Dashboard تفاعلية" },
  { id: "portfolio", name: "معرض أعمال", desc: "Portfolio شخصي" },
  { id: "ecommerce", name: "متجر إلكتروني", desc: "واجهة متجر حديث" },
  { id: "blog", name: "مدونة", desc: "تصميم مقالات" },
  { id: "app", name: "تطبيق", desc: "واجهة تطبيق جوال" },
];

export function WebPreview({ isOpen, onClose, initialCode }: WebPreviewProps) {
  const [device, setDevice] = useState<DeviceType>("desktop");
  const [code, setCode] = useState(initialCode || "");
  const [previewKey, setPreviewKey] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);
  const [prompt, setPrompt] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const deviceSizes = {
    desktop: { width: "100%", height: "600px" },
    tablet: { width: "768px", height: "1024px" },
    mobile: { width: "375px", height: "812px" },
  };

  const generateWebsite = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);

    // محاكاة توليد الكود
    await new Promise(r => setTimeout(r, 2000));

    const generatedCode = generateHTMLFromPrompt(prompt);
    setCode(generatedCode);
    setPreviewKey(k => k + 1);
    setIsGenerating(false);
  };

  const generateHTMLFromPrompt = (userPrompt: string): string => {
    // قالب HTML احترافي
    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${userPrompt}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'IBM Plex Sans Arabic', sans-serif; }
        .gradient-bg { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        .glass { background: rgba(255,255,255,0.1); backdrop-filter: blur(10px); }
    </style>
</head>
<body class="bg-gray-900 text-white">
    <!-- Hero Section -->
    <section class="min-h-screen flex items-center justify-center gradient-bg relative overflow-hidden">
        <div class="absolute inset-0 bg-black/20"></div>
        <div class="relative z-10 text-center px-4 max-w-4xl mx-auto">
            <h1 class="text-5xl md:text-7xl font-bold mb-6 animate-fade-in">
                ${userPrompt}
            </h1>
            <p class="text-xl md:text-2xl text-gray-200 mb-8">
                تجربة رقمية استثنائية بتصميم عصري
            </p>
            <div class="flex gap-4 justify-center">
                <button class="bg-white text-purple-600 px-8 py-4 rounded-full font-bold text-lg hover:scale-105 transition shadow-lg">
                    ابدأ الآن
                </button>
                <button class="border-2 border-white px-8 py-4 rounded-full font-bold text-lg hover:bg-white/10 transition">
                    اعرف المزيد
                </button>
            </div>
        </div>
        <!-- Animated shapes -->
        <div class="absolute top-20 right-20 w-72 h-72 bg-purple-500/30 rounded-full blur-3xl animate-pulse"></div>
        <div class="absolute bottom-20 left-20 w-96 h-96 bg-blue-500/30 rounded-full blur-3xl animate-pulse"></div>
    </section>

    <!-- Features -->
    <section class="py-20 px-4">
        <div class="max-w-6xl mx-auto">
            <h2 class="text-4xl font-bold text-center mb-16">المميزات الرئيسية</h2>
            <div class="grid md:grid-cols-3 gap-8">
                <div class="bg-gray-800 p-8 rounded-2xl hover:transform hover:scale-105 transition">
                    <div class="w-16 h-16 bg-purple-500 rounded-2xl flex items-center justify-center mb-4 text-3xl">🚀</div>
                    <h3 class="text-2xl font-bold mb-4">سرعة فائقة</h3>
                    <p class="text-gray-400">أداء استثنائي مع أحدث التقنيات</p>
                </div>
                <div class="bg-gray-800 p-8 rounded-2xl hover:transform hover:scale-105 transition">
                    <div class="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mb-4 text-3xl">🎨</div>
                    <h3 class="text-2xl font-bold mb-4">تصميم عصري</h3>
                    <p class="text-gray-400">واجهات جذابة وسهلة الاستخدام</p>
                </div>
                <div class="bg-gray-800 p-8 rounded-2xl hover:transform hover:scale-105 transition">
                    <div class="w-16 h-16 bg-green-500 rounded-2xl flex items-center justify-center mb-4 text-3xl">⚡</div>
                    <h3 class="text-2xl font-bold mb-4">قوة الذكاء</h3>
                    <p class="text-gray-400">مدعوم بأحدث نماذج الذكاء الاصطناعي</p>
                </div>
            </div>
        </div>
    </section>

    <!-- CTA -->
    <section class="py-20 px-4 bg-gradient-to-r from-purple-600 to-blue-600">
        <div class="max-w-4xl mx-auto text-center">
            <h2 class="text-4xl font-bold mb-6">جاهز للبدء؟</h2>
            <p class="text-xl mb-8 text-purple-100">انضم إلى آلاف المستخدمين السعداء</p>
            <button class="bg-white text-purple-600 px-12 py-4 rounded-full font-bold text-xl hover:scale-105 transition shadow-xl">
                جرب مجاناً
            </button>
        </div>
    </section>

    <!-- Footer -->
    <footer class="py-12 px-4 border-t border-gray-800">
        <div class="max-w-6xl mx-auto text-center text-gray-400">
            <p>© 2024 جميع الحقوق محفوظة</p>
        </div>
    </footer>
</body>
</html>`;
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="relative w-full max-w-7xl mx-4 overflow-hidden rounded-3xl border border-(--line) bg-(--panel-solid) shadow-2xl max-h-[95vh] flex flex-col"
          >
            {/* Header */}
            <div className="relative border-b border-(--line) bg-gradient-to-r from-blue-500/10 via-cyan-500/10 to-transparent p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/30">
                    <Globe className="size-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-(--ink)">معاينة المواقع والتطبيقات</h2>
                    <p className="text-xs text-(--ink-2)">تصميم ومعاينة فورية بـ AI</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* أجهزة المعاينة */}
                  <div className="flex items-center gap-1 bg-(--glass-hi) rounded-xl p-1">
                    {(["desktop", "tablet", "mobile"] as DeviceType[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => setDevice(d)}
                        className={cn(
                          "grid size-8 place-items-center rounded-lg transition",
                          device === d ? "bg-blue-500 text-white" : "text-(--ink-3) hover:text-(--ink)"
                        )}
                      >
                        {d === "desktop" ? <Monitor className="size-4" /> : d === "tablet" ? <Tablet className="size-4" /> : <Smartphone className="size-4" />}
                      </button>
                    ))}
                  </div>

                  {/* تبديل العرض */}
                  <div className="flex items-center gap-1 bg-(--glass-hi) rounded-xl p-1">
                    <button
                      onClick={() => setActiveTab("preview")}
                      className={cn(
                        "flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition",
                        activeTab === "preview" ? "bg-blue-500 text-white" : "text-(--ink-3)"
                      )}
                    >
                      <Eye className="size-4" />
                      معاينة
                    </button>
                    <button
                      onClick={() => setActiveTab("code")}
                      className={cn(
                        "flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition",
                        activeTab === "code" ? "bg-blue-500 text-white" : "text-(--ink-3)"
                      )}
                    >
                      <Code2 className="size-4" />
                      الكود
                    </button>
                  </div>

                  <button
                    onClick={onClose}
                    className="grid size-10 place-items-center rounded-xl bg-(--glass-hi) text-(--ink-2) hover:bg-(--glass-hi)/80 transition"
                  >
                    <X className="size-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Prompt Input */}
            <div className="p-4 border-b border-(--line)">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="صف الموقع أو التطبيق الذي تريده... مثال: متجر إلكتروني للأزياء"
                  className="flex-1 rounded-xl border border-(--line) bg-(--glass-hi) px-4 py-3 text-(--ink) placeholder:text-(--ink-3) focus:border-blue-500/50 focus:outline-none"
                  dir="auto"
                />
                <button
                  onClick={generateWebsite}
                  disabled={isGenerating || !prompt.trim()}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-6 py-3 font-semibold transition",
                    isGenerating || !prompt.trim()
                      ? "bg-(--glass-hi) text-(--ink-3) cursor-not-allowed"
                      : "bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg shadow-blue-500/30 hover:scale-105"
                  )}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      جاري التوليد...
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      توليد الموقع
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden bg-gray-900">
              {activeTab === "preview" ? (
                <div className="h-full flex items-center justify-center p-4">
                  <div
                    className="transition-all duration-300 rounded-xl overflow-hidden shadow-2xl"
                    style={deviceSizes[device]}
                  >
                    {code ? (
                      <iframe
                        key={previewKey}
                        ref={iframeRef}
                        srcDoc={code}
                        className="w-full h-full bg-white"
                        sandbox="allow-scripts"
                        title="Preview"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-800">
                        <Globe className="size-16 mb-4 opacity-50" />
                        <p className="text-lg">اكتب وصف الموقع واضغط "توليد الموقع"</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
                    <span className="text-sm text-gray-400">HTML + Tailwind CSS</span>
                    <button
                      onClick={copyCode}
                      className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition"
                    >
                      {copied ? <Check className="size-4 text-green-400" /> : <Copy className="size-4" />}
                      {copied ? "تم النسخ!" : "نسخ"}
                    </button>
                  </div>
                  <textarea
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="flex-1 bg-gray-900 text-gray-300 p-4 font-mono text-sm resize-none focus:outline-none"
                    spellCheck={false}
                  />
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Sparkles(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}
