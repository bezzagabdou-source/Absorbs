"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Brain, 
  Zap, 
  Code2, 
  Image as ImageIcon, 
  Globe, 
  Cpu, 
  GitBranch,
  CheckCircle2,
  Loader2,
  Sparkles,
  ArrowRight,
  Network
} from "lucide-react";
import { cn } from "@/lib/utils";

type TaskType = "chat" | "code" | "image" | "web" | "analysis" | "translation";

interface SubTask {
  id: string;
  type: TaskType;
  label: string;
  model: string;
  provider: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  result?: string;
}

interface OrchestratorProps {
  isVisible: boolean;
  onClose: () => void;
  userPrompt: string;
  onTaskComplete: (results: any[]) => void;
}

const MODEL_POOL = [
  { id: "gemini-pro", name: "Gemini 2.5 Pro", provider: "Google", icon: Brain, color: "text-blue-400", bg: "bg-blue-500/10" },
  { id: "gemini-flash", name: "Gemini 2.5 Flash", provider: "Google", icon: Zap, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { id: "claude", name: "Claude 3.5 Sonnet", provider: "Anthropic", icon: Brain, color: "text-orange-400", bg: "bg-orange-500/10" },
  { id: "gpt4", name: "GPT-4 Turbo", provider: "OpenAI", icon: Cpu, color: "text-teal-400", bg: "bg-teal-500/10" },
  { id: "grok", name: "Grok-2", provider: "xAI", icon: Sparkles, color: "text-purple-400", bg: "bg-purple-500/10" },
  { id: "deepseek", name: "DeepSeek V3", provider: "DeepSeek", icon: Code2, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { id: "llama", name: "Llama 3.3 70B", provider: "Meta", icon: Network, color: "text-indigo-400", bg: "bg-indigo-500/10" },
];

export function AIOrchestrator({ isVisible, onClose, userPrompt, onTaskComplete }: OrchestratorProps) {
  const [tasks, setTasks] = useState<SubTask[]>([]);
  const [phase, setPhase] = useState<"analyzing" | "distributing" | "executing" | "merging" | "done">("analyzing");
  const [mergeProgress, setMergeProgress] = useState(0);

  // تحليل الطلب وتوزيع المهام
  useEffect(() => {
    if (!isVisible || !userPrompt) return;

    const analyzeAndDistribute = async () => {
      setPhase("analyzing");
      await new Promise(r => setTimeout(r, 1200));

      // تحليل ذكي للطلب
      const prompt = userPrompt.toLowerCase();
      const detectedTasks: SubTask[] = [];

      // تحديد نوع المهام المطلوبة
      if (prompt.includes("صورة") || prompt.includes("image") || prompt.includes("رسم")) {
        detectedTasks.push({
          id: "img-1",
          type: "image",
          label: "توليد الصور",
          model: "DALL-E 3 + Stable Diffusion XL",
          provider: "OpenAI + Stability",
          status: "pending",
          progress: 0,
        });
      }

      if (prompt.includes("كود") || prompt.includes("code") || prompt.includes("برمجة") || prompt.includes("react")) {
        detectedTasks.push({
          id: "code-1",
          type: "code",
          label: "كتابة الكود",
          model: "Claude 3.5 Sonnet",
          provider: "Anthropic",
          status: "pending",
          progress: 0,
        });
        detectedTasks.push({
          id: "code-2",
          type: "code",
          label: "مراجعة وتحسين",
          model: "DeepSeek Coder",
          provider: "DeepSeek",
          status: "pending",
          progress: 0,
        });
      }

      if (prompt.includes("موقع") || prompt.includes("web") || prompt.includes("صفحة")) {
        detectedTasks.push({
          id: "web-1",
          type: "web",
          label: "بناء معاينة الموقع",
          model: "Gemini 2.5 Pro",
          provider: "Google",
          status: "pending",
          progress: 0,
        });
      }

      if (prompt.includes("ترجم") || prompt.includes("translate")) {
        detectedTasks.push({
          id: "trans-1",
          type: "translation",
          label: "الترجمة المتخصصة",
          model: "GPT-4 Turbo",
          provider: "OpenAI",
          status: "pending",
          progress: 0,
        });
      }

      // مهمة رئيسية للتحليل والإجابة
      detectedTasks.unshift({
        id: "main-1",
        type: "analysis",
        label: "التحليل العميق",
        model: "Gemini 2.5 Pro + Grok-2",
        provider: "Google + xAI",
        status: "pending",
        progress: 0,
      });

      setTasks(detectedTasks);
      setPhase("distributing");
      await new Promise(r => setTimeout(r, 800));

      // تنفيذ المهام بالتوازي
      setPhase("executing");
      const results: any[] = [];

      await Promise.all(
        detectedTasks.map(async (task, idx) => {
          // تحديث الحالة إلى running
          setTasks(prev => prev.map(t => 
            t.id === task.id ? { ...t, status: "running" as const } : t
          ));

          // محاكاة التقدم
          for (let p = 0; p <= 100; p += 10 + Math.random() * 20) {
            await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
            setTasks(prev => prev.map(t => 
              t.id === task.id ? { ...t, progress: Math.min(100, Math.floor(p)) } : t
            ));
          }

          // اكتمال
          setTasks(prev => prev.map(t => 
            t.id === task.id ? { ...t, status: "completed" as const, progress: 100 } : t
          ));

          results.push({ taskId: task.id, type: task.type, success: true });
        })
      );

      // دمج النتائج
      setPhase("merging");
      for (let p = 0; p <= 100; p += 5) {
        await new Promise(r => setTimeout(r, 100));
        setMergeProgress(p);
      }

      setPhase("done");
      await new Promise(r => setTimeout(r, 500));
      onTaskComplete(results);
    };

    analyzeAndDistribute();
  }, [isVisible, userPrompt]);

  const getTaskIcon = (type: TaskType) => {
    switch (type) {
      case "image": return ImageIcon;
      case "code": return Code2;
      case "web": return Globe;
      case "translation": return Languages;
      default: return Brain;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running": return "text-blue-400";
      case "completed": return "text-emerald-400";
      case "failed": return "text-red-400";
      default: return "text-(--ink-3)";
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xl"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="relative w-full max-w-2xl mx-4 overflow-hidden rounded-3xl border border-(--line) bg-(--panel-solid) shadow-2xl"
          >
            {/* Header */}
            <div className="relative border-b border-(--line) bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-transparent p-6">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30">
                    <Network className="size-6 text-white" />
                  </div>
                  {phase !== "done" && (
                    <div className="absolute -inset-1 rounded-2xl bg-indigo-500/30 animate-ping" />
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-(--ink)">موزع المهام الذكي</h2>
                  <p className="text-sm text-(--ink-2)">
                    {phase === "analyzing" && "🔍 جاري تحليل الطلب..."}
                    {phase === "distributing" && "⚡ توزيع المهام على النماذج..."}
                    {phase === "executing" && "🚀 تنفيذ المهام بالتوازي..."}
                    {phase === "merging" && "🔄 دمج النتائج..."}
                    {phase === "done" && "✅ اكتمل التنفيذ!"}
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {/* عرض المهام */}
              <div className="space-y-3">
                {tasks.map((task, idx) => {
                  const Icon = getTaskIcon(task.type);
                  return (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className={cn(
                        "relative overflow-hidden rounded-2xl border p-4 transition-all",
                        task.status === "running" 
                          ? "border-indigo-500/30 bg-indigo-500/5" 
                          : task.status === "completed"
                          ? "border-emerald-500/20 bg-emerald-500/5"
                          : "border-(--line) bg-(--glass-hi)"
                      )}
                    >
                      {/* شريط التقدم */}
                      {task.status === "running" && (
                        <motion.div
                          className="absolute inset-y-0 start-0 bg-indigo-500/10"
                          animate={{ width: `${task.progress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      )}

                      <div className="relative flex items-center gap-4">
                        <div className={cn(
                          "grid size-10 shrink-0 place-items-center rounded-xl",
                          task.status === "completed" ? "bg-emerald-500/20" : "bg-(--accent)/10"
                        )}>
                          {task.status === "running" ? (
                            <Loader2 className="size-5 animate-spin text-indigo-400" />
                          ) : task.status === "completed" ? (
                            <CheckCircle2 className="size-5 text-emerald-400" />
                          ) : (
                            <Icon className="size-5 text-(--accent)" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-(--ink)">{task.label}</h4>
                            <span className={cn("text-xs", getStatusColor(task.status))}>
                              {task.status === "running" && `${task.progress}%`}
                              {task.status === "completed" && "✓"}
                            </span>
                          </div>
                          <p className="text-xs text-(--ink-3) truncate">{task.model}</p>
                        </div>

                        {/* شريط التقدم المصغر */}
                        <div className="w-24 h-1.5 rounded-full bg-(--glass-hi) overflow-hidden">
                          <motion.div
                            className={cn(
                              "h-full rounded-full",
                              task.status === "completed" ? "bg-emerald-400" : "bg-indigo-400"
                            )}
                            animate={{ width: `${task.progress}%` }}
                          />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* شريط الدمج */}
              {phase === "merging" && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4"
                >
                  <div className="flex items-center gap-3">
                    <GitBranch className="size-5 text-purple-400 animate-pulse" />
                    <span className="text-sm font-medium text-(--ink)">دمج نتائج النماذج المختلفة...</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-(--glass-hi) overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"
                      animate={{ width: `${mergeProgress}%` }}
                    />
                  </div>
                </motion.div>
              )}

              {/* النماذج المستخدمة */}
              <div className="mt-6">
                <h4 className="text-xs font-semibold text-(--ink-3) uppercase tracking-wider mb-3">
                  النماذج المتاحة في المجموعة
                </h4>
                <div className="flex flex-wrap gap-2">
                  {MODEL_POOL.map((model) => (
                    <div
                      key={model.id}
                      className={cn(
                        "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium",
                        model.bg, model.color
                      )}
                    >
                      <model.icon className="size-3.5" />
                      <span>{model.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-(--line) p-4 flex justify-end">
              <button
                onClick={onClose}
                disabled={phase !== "done"}
                className={cn(
                  "rounded-xl px-6 py-2.5 font-semibold transition",
                  phase === "done"
                    ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/30"
                    : "bg-(--glass-hi) text-(--ink-3) cursor-not-allowed"
                )}
              >
                {phase === "done" ? "عرض النتائج" : "جاري المعالجة..."}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Languages(props: any) {
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
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </svg>
  );
}
