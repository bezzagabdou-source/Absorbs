"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Mic, MicOff, Volume2, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type CallState = "idle" | "connecting" | "active" | "ended";

interface VoiceCallProps {
  onClose: () => void;
  apiKey?: string;
}

export function VoiceCall({ onClose, apiKey }: VoiceCallProps) {
  const [state, setState] = useState<CallState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 24000,
    });
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = useCallback(() => {
    wsRef.current?.close();
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioContextRef.current?.close();
    sourceRef.current?.stop();
  }, []);

  const startCall = async () => {
    setState("connecting");
    setError(null);

    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      mediaStreamRef.current = stream;

      // Connect to Gemini Live API
      const ws = new WebSocket(
        `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        // Send setup message
        ws.send(JSON.stringify({
          setup: {
            model: "models/gemini-2.0-flash-exp",
            generation_config: {
              response_modalities: ["AUDIO"],
              speech_config: {
                voice_config: {
                  prebuilt_voice_config: {
                    voice_name: "Puck", // أو Charon, Kore, Fenrir, Aoede
                  },
                },
              },
            },
            system_instruction: {
              parts: [{
                text: "أنت مساعد ذكي يتحدث بالعربية. كن ودوداً ومساعداً. أجب بإيجاز ووضوح."
              }],
            },
          },
        }));
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        if (data.serverContent?.modelTurn?.parts) {
          // Handle audio response
          for (const part of data.serverContent.modelTurn.parts) {
            if (part.inlineData?.data) {
              await playAudio(part.inlineData.data);
            }
            if (part.text) {
              setAiResponse((prev) => prev + part.text);
            }
          }
        }

        if (data.serverContent?.interrupted) {
          // User interrupted
          stopAudio();
        }
      };

      ws.onerror = () => {
        setError("فشل الاتصال. تحقق من مفتاح API.");
        setState("idle");
      };

      ws.onclose = () => {
        setState("ended");
      };

      // Send audio chunks
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      source.connect(processor);
      processor.connect(audioContext.destination);

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN && !isMuted) {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
          }

          ws.send(JSON.stringify({
            realtime_input: {
              audio: {
                data: btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer))),
                mime_type: "audio/pcm;rate=16000",
              },
            },
          }));
        }
      };

      setState("active");
    } catch (err) {
      setError("لا يمكن الوصول إلى الميكروفون");
      setState("idle");
    }
  };

  const playAudio = async (base64Data: string) => {
    if (!audioContextRef.current || !isSpeakerOn) return;

    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const pcmData = new Int16Array(bytes.buffer);
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      floatData[i] = pcmData[i] / 32768;
    }

    const audioBuffer = audioContextRef.current.createBuffer(1, floatData.length, 24000);
    audioBuffer.getChannelData(0).set(floatData);

    audioQueueRef.current.push(audioBuffer);
    if (!isPlayingRef.current) {
      playNextInQueue();
    }
  };

  const playNextInQueue = () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const buffer = audioQueueRef.current.shift()!;
    const source = audioContextRef.current!.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current!.destination);
    source.onended = () => playNextInQueue();
    source.start();
    sourceRef.current = source;
  };

  const stopAudio = () => {
    audioQueueRef.current = [];
    sourceRef.current?.stop();
    isPlayingRef.current = false;
  };

  const endCall = () => {
    cleanup();
    setState("ended");
    setTimeout(() => onClose(), 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="relative w-full max-w-md mx-4 overflow-hidden rounded-3xl border border-(--line) bg-(--panel-solid) p-8 shadow-2xl"
      >
        {/* خلفية متوهجة */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent" />

        {/* حالة الاتصال */}
        <div className="relative flex flex-col items-center">
          <AnimatePresence mode="wait">
            {state === "idle" && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col items-center"
              >
                <div className="relative">
                  <div className="grid size-24 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30">
                    <Phone className="size-10 text-white" />
                  </div>
                  <div className="absolute -inset-4 rounded-full bg-indigo-500/20 animate-ping" />
                </div>
                <h3 className="mt-6 text-xl font-bold text-(--ink)">مكالمة صوتية ذكية</h3>
                <p className="mt-2 text-sm text-(--ink-2) text-center">
                  تحدث مع الذكاء الاصطناعي بصوت طبيعي<br />باستخدام Gemini Live API
                </p>
                {error && (
                  <p className="mt-3 text-sm text-red-400">{error}</p>
                )}
                <button
                  onClick={startCall}
                  className="mt-6 flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-3 font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:scale-105 active:scale-95"
                >
                  <Phone className="size-5" />
                  بدء المكالمة
                </button>
              </motion.div>
            )}

            {state === "connecting" && (
              <motion.div
                key="connecting"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col items-center py-8"
              >
                <Loader2 className="size-12 animate-spin text-indigo-400" />
                <p className="mt-4 text-(--ink-2)">جاري الاتصال...</p>
              </motion.div>
            )}

            {state === "active" && (
              <motion.div
                key="active"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center w-full"
              >
                {/* Visualizer */}
                <div className="relative">
                  <div className="grid size-20 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/30">
                    <Sparkles className="size-8 text-white animate-pulse" />
                  </div>
                  <div className="absolute -inset-3 rounded-full bg-emerald-500/20 animate-pulse" />
                  {/* موجات صوتية */}
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-end gap-1 h-6">
                    {[1,2,3,4,5,4,3,2,1].map((h, i) => (
                      <motion.div
                        key={i}
                        animate={{ height: [4, h * 4, 4] }}
                        transition={{ repeat: Infinity, duration: 1, delay: i * 0.1 }}
                        className="w-1 rounded-full bg-emerald-400"
                      />
                    ))}
                  </div>
                </div>

                <h3 className="mt-12 text-lg font-bold text-(--ink)">المكالمة نشطة</h3>
                <p className="mt-1 text-sm text-(--ink-3)">تكلم الآن... الذكاء الاصطناعي يستمع</p>

                {/* التفاعل */}
                {(transcript || aiResponse) && (
                  <div className="mt-4 w-full max-h-32 overflow-y-auto rounded-xl bg-(--glass-hi) p-3 text-sm">
                    {transcript && (
                      <p className="text-(--ink-2)"><span className="font-bold text-indigo-400">أنت:</span> {transcript}</p>
                    )}
                    {aiResponse && (
                      <p className="mt-2 text-(--ink)"><span className="font-bold text-emerald-400">AI:</span> {aiResponse}</p>
                    )}
                  </div>
                )}

                {/* أزرار التحكم */}
                <div className="mt-6 flex items-center gap-4">
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className={cn(
                      "grid size-12 place-items-center rounded-full transition",
                      isMuted ? "bg-red-500/20 text-red-400" : "bg-(--glass-hi) text-(--ink-2) hover:bg-(--glass-hi)/80"
                    )}
                  >
                    {isMuted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
                  </button>

                  <button
                    onClick={endCall}
                    className="grid size-14 place-items-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition hover:scale-105 active:scale-95"
                  >
                    <PhoneOff className="size-6" />
                  </button>

                  <button
                    onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                    className={cn(
                      "grid size-12 place-items-center rounded-full transition",
                      !isSpeakerOn ? "bg-red-500/20 text-red-400" : "bg-(--glass-hi) text-(--ink-2) hover:bg-(--glass-hi)/80"
                    )}
                  >
                    <Volume2 className="size-5" />
                  </button>
                </div>
              </motion.div>
            )}

            {state === "ended" && (
              <motion.div
                key="ended"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center py-8"
              >
                <div className="grid size-16 place-items-center rounded-full bg-(--glass-hi)">
                  <PhoneOff className="size-8 text-(--ink-3)" />
                </div>
                <p className="mt-4 text-(--ink-2)">تم إنهاء المكالمة</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
