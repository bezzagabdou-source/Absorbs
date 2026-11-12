"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Mic, MicOff, Phone, PhoneOff, RefreshCcw, Video, VideoOff, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { useToast } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatCallDuration } from "@/lib/message-format";
import type { Profile } from "@/lib/types";

type CallKind = "audio" | "video";
type Status = "idle" | "outgoing" | "incoming" | "connecting" | "active";

interface PeerInfo {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface CallContextValue {
  status: Status;
  startCall: (peer: Profile, kind: CallKind, threadId?: string) => Promise<void>;
}

const CallContext = createContext<CallContextValue>({ status: "idle", startCall: async () => {} });
export const useCall = () => useContext(CallContext);

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ],
};

const peerOf = (p: Profile): PeerInfo => ({ id: p.id, username: p.username, display_name: p.display_name, avatar_url: p.avatar_url });

/**
 * 1-to-1 voice & video calls over WebRTC.
 * Signaling rides on Supabase Realtime broadcast:
 *  - `call-inbox-{userId}` receives invitations
 *  - `dz-call-{callId}` carries answer / ICE / hangup for one call
 * No extra tables needed; finished calls are logged into the DM thread
 * as `[call|kind|seconds|outcome]` system messages.
 */
export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user, profile: me } = useAuth();
  const { toast } = useToast();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [status, setStatus] = useState<Status>("idle");
  const [peer, setPeer] = useState<PeerInfo | null>(null);
  const [kind, setKind] = useState<CallKind>("audio");
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);

  const statusRef = useRef<Status>("idle");
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const callChannelRef = useRef<RealtimeChannel | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const callIdRef = useRef<string | null>(null);
  const threadIdRef = useRef<string | null>(null);
  const isCallerRef = useRef(false);
  const connectedRef = useRef(false);
  const peerJoinedRef = useRef(false);
  const bufferedCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const secondsRef = useRef(0);
  const localVideoElRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoElRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioElRef = useRef<HTMLAudioElement | null>(null);
  const facingRef = useRef<"user" | "environment">("user");

  const setStatusBoth = (s: Status) => {
    statusRef.current = s;
    setStatus(s);
  };

  const attachStreams = useCallback(() => {
    if (localVideoElRef.current && localStreamRef.current) localVideoElRef.current.srcObject = localStreamRef.current;
    if (remoteVideoElRef.current && remoteStreamRef.current) remoteVideoElRef.current.srcObject = remoteStreamRef.current;
    if (remoteAudioElRef.current && remoteStreamRef.current) remoteAudioElRef.current.srcObject = remoteStreamRef.current;
  }, []);

  const registerLocalVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      localVideoElRef.current = el;
      attachStreams();
    },
    [attachStreams],
  );
  const registerRemoteVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      remoteVideoElRef.current = el;
      attachStreams();
    },
    [attachStreams],
  );
  const registerRemoteAudio = useCallback(
    (el: HTMLAudioElement | null) => {
      remoteAudioElRef.current = el;
      attachStreams();
    },
    [attachStreams],
  );

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    ringTimeoutRef.current = null;
  };

  const cleanup = useCallback(
    (opts?: { keepState?: boolean }) => {
      stopTimer();
      pcRef.current?.getSenders().forEach((s) => s.track?.stop());
      pcRef.current?.close();
      pcRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      remoteStreamRef.current = null;
      if (callChannelRef.current) {
        supabase.removeChannel(callChannelRef.current);
        callChannelRef.current = null;
      }
      pendingOfferRef.current = null;
      callIdRef.current = null;
      connectedRef.current = false;
      peerJoinedRef.current = false;
      bufferedCandidatesRef.current = [];
      remoteCandidatesRef.current = [];
      secondsRef.current = 0;
      setSeconds(0);
      setMuted(false);
      setVideoOff(false);
      if (!opts?.keepState) {
        setStatusBoth("idle");
        setPeer(null);
      }
    },
    [supabase],
  );

  const insertCallLog = useCallback(
    async (outcome: "ok" | "missed" | "declined", duration: number) => {
      if (!user || !threadIdRef.current) return;
      const content = `[call|${kind}|${duration}|${outcome === "ok" ? "ok" : outcome}]`;
      await supabase
        .from("messages")
        .insert({ thread_id: threadIdRef.current, sender_id: user.id, content })
        .then(() => {}, () => {});
    },
    [supabase, user, kind],
  );

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    remoteStreamRef.current = new MediaStream();
    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((t) => remoteStreamRef.current?.addTrack(t));
      if (remoteStreamRef.current && event.track) {
        // ensure the track is present even without an associated stream
        if (!remoteStreamRef.current.getTracks().includes(event.track)) remoteStreamRef.current.addTrack(event.track);
      }
      attachStreams();
    };
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const candidate = event.candidate.toJSON();
      if (isCallerRef.current && !peerJoinedRef.current) {
        bufferedCandidatesRef.current.push(candidate);
        return;
      }
      callChannelRef.current?.send({ type: "broadcast", event: "signal", payload: { type: "candidate", candidate } });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected" && !connectedRef.current) {
        connectedRef.current = true;
        setStatusBoth("active");
        if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
        timerRef.current = setInterval(() => {
          secondsRef.current += 1;
          setSeconds(secondsRef.current);
        }, 1000);
      }
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        if (statusRef.current === "active" || statusRef.current === "connecting") {
          toast("انقطع الاتصال", "error");
          void endCallRef.current?.(true);
        }
      }
    };
    return pc;
  }, [attachStreams, toast]);

  const endCallRef = useRef<((remote?: boolean) => Promise<void>) | null>(null);

  const flushCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc?.remoteDescription) return;
    const queued = remoteCandidatesRef.current.splice(0);
    for (const c of queued) {
      await pc.addIceCandidate(c).catch(() => {});
    }
  }, []);

  const handleSignal = useCallback(
    async (payload: { type: string; answer?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) => {
      const pc = pcRef.current;
      if (payload.type === "joined") {
        peerJoinedRef.current = true;
        const buffered = bufferedCandidatesRef.current.splice(0);
        for (const candidate of buffered) {
          callChannelRef.current?.send({ type: "broadcast", event: "signal", payload: { type: "candidate", candidate } });
        }
        return;
      }
      if (payload.type === "answer" && payload.answer && pc && !pc.remoteDescription) {
        await pc.setRemoteDescription(payload.answer).catch(() => {});
        await flushCandidates();
        return;
      }
      if (payload.type === "candidate" && payload.candidate) {
        if (pc?.remoteDescription) await pc.addIceCandidate(payload.candidate).catch(() => {});
        else remoteCandidatesRef.current.push(payload.candidate);
        return;
      }
      if (payload.type === "declined") {
        toast("تم رفض المكالمة", "error");
        if (isCallerRef.current) void insertCallLog("declined", 0);
        cleanup();
        return;
      }
      if (payload.type === "busy") {
        toast("المستخدم مشغول في مكالمة أخرى", "error");
        cleanup();
        return;
      }
      if (payload.type === "hangup") {
        const wasActive = connectedRef.current;
        cleanup();
        toast(wasActive ? "انتهت المكالمة" : "أنهى الطرف الآخر المكالمة");
      }
    },
    [cleanup, flushCandidates, insertCallLog, toast],
  );

  const subscribeCallChannel = useCallback(
    (callId: string) => {
      const channel = supabase.channel(`dz-call-${callId}`, { config: { broadcast: { self: false } } });
      channel.on("broadcast", { event: "signal" }, ({ payload }: { payload: unknown }) => {
        void handleSignal(payload as { type: string; answer?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit });
      });
      callChannelRef.current = channel;
      return channel;
    },
    [supabase, handleSignal],
  );

  const getMedia = async (callKind: CallKind) => {
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: callKind === "video" ? { facingMode: facingRef.current, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    });
  };

  /* ── outgoing call ── */
  const startCall = useCallback(
    async (target: Profile, callKind: CallKind, threadId?: string) => {
      if (!user || !me || statusRef.current !== "idle") return;
      if (!navigator.mediaDevices?.getUserMedia) {
        toast("المكالمات تحتاج متصفحًا حديثًا أو تطبيق DZ CONNECT", "error");
        return;
      }
      setPeer(peerOf(target));
      setKind(callKind);
      threadIdRef.current = threadId ?? null;
      isCallerRef.current = true;
      setStatusBoth("outgoing");
      try {
        const stream = await getMedia(callKind);
        localStreamRef.current = stream;
        attachStreams();
        const pc = createPeerConnection();
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        const callId = crypto.randomUUID();
        callIdRef.current = callId;
        const channel = subscribeCallChannel(callId);
        await new Promise<void>((resolve) => {
          channel.subscribe((s: string) => {
            if (s === "SUBSCRIBED") resolve();
          });
          setTimeout(resolve, 2500);
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const inbox = supabase.channel(`call-inbox-${target.id}`);
        await new Promise<void>((resolve) => {
          inbox.subscribe((s: string) => {
            if (s === "SUBSCRIBED") resolve();
          });
          setTimeout(resolve, 2500);
        });
        await inbox.send({
          type: "broadcast",
          event: "call-invite",
          payload: {
            callId,
            kind: callKind,
            threadId: threadId ?? null,
            offer,
            from: { id: me.id, username: me.username, display_name: me.display_name, avatar_url: me.avatar_url },
          },
        });
        setTimeout(() => supabase.removeChannel(inbox), 800);

        ringTimeoutRef.current = setTimeout(() => {
          if (!connectedRef.current && statusRef.current === "outgoing") {
            toast("لم يردّ الطرف الآخر", "error");
            void insertCallLog("missed", 0);
            // notify the ringing side to stop
            const cancelInbox = supabase.channel(`call-inbox-${target.id}`);
            cancelInbox.subscribe((s: string) => {
              if (s === "SUBSCRIBED") {
                void cancelInbox.send({ type: "broadcast", event: "call-cancel", payload: { callId } });
                setTimeout(() => supabase.removeChannel(cancelInbox), 600);
              }
            });
            cleanup();
          }
        }, 35000);
      } catch {
        toast("اسمح بالوصول إلى الميكروفون/الكاميرا لبدء المكالمة", "error");
        cleanup();
      }
    },
    [user, me, supabase, attachStreams, createPeerConnection, subscribeCallChannel, insertCallLog, cleanup, toast],
  );

  /* ── incoming invitations ── */
  useEffect(() => {
    if (!user) return;
    const inbox = supabase
      .channel(`call-inbox-${user.id}`)
      .on(
        "broadcast",
        { event: "call-invite" },
        ({ payload }: { payload: { callId: string; kind: CallKind; threadId: string | null; offer: RTCSessionDescriptionInit; from: PeerInfo } }) => {
          if (statusRef.current !== "idle") {
            const busyChannel = supabase.channel(`dz-call-${payload.callId}`, { config: { broadcast: { self: false } } });
            busyChannel.subscribe((s: string) => {
              if (s === "SUBSCRIBED") {
                void busyChannel.send({ type: "broadcast", event: "signal", payload: { type: "busy" } });
                setTimeout(() => supabase.removeChannel(busyChannel), 800);
              }
            });
            return;
          }
          callIdRef.current = payload.callId;
          threadIdRef.current = payload.threadId;
          pendingOfferRef.current = payload.offer;
          isCallerRef.current = false;
          setPeer(payload.from);
          setKind(payload.kind);
          setStatusBoth("incoming");
          try {
            navigator.vibrate?.([220, 120, 220, 120, 220]);
          } catch {}
          ringTimeoutRef.current = setTimeout(() => {
            if (statusRef.current === "incoming") {
              cleanup();
              toast("مكالمة فائتة");
            }
          }, 40000);
        },
      )
      .on("broadcast", { event: "call-cancel" }, ({ payload }: { payload: { callId: string } }) => {
        if (statusRef.current === "incoming" && callIdRef.current === payload.callId) {
          cleanup();
          toast("مكالمة فائتة 📵");
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(inbox);
    };
  }, [supabase, user, cleanup, toast]);

  const accept = useCallback(async () => {
    const offer = pendingOfferRef.current;
    const callId = callIdRef.current;
    if (!offer || !callId || statusRef.current !== "incoming") return;
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    setStatusBoth("connecting");
    try {
      const stream = await getMedia(kind);
      localStreamRef.current = stream;
      attachStreams();
      const pc = createPeerConnection();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const channel = subscribeCallChannel(callId);
      await new Promise<void>((resolve) => {
        channel.subscribe((s: string) => {
          if (s === "SUBSCRIBED") resolve();
        });
        setTimeout(resolve, 2500);
      });
      await channel.send({ type: "broadcast", event: "signal", payload: { type: "joined" } });
      await pc.setRemoteDescription(offer);
      await flushCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await channel.send({ type: "broadcast", event: "signal", payload: { type: "answer", answer } });
    } catch {
      toast("اسمح بالوصول إلى الميكروفون/الكاميرا للرد", "error");
      cleanup();
    }
  }, [kind, attachStreams, createPeerConnection, subscribeCallChannel, flushCandidates, cleanup, toast]);

  const decline = useCallback(async () => {
    const callId = callIdRef.current;
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    if (callId) {
      const channel = supabase.channel(`dz-call-${callId}`, { config: { broadcast: { self: false } } });
      channel.subscribe((s: string) => {
        if (s === "SUBSCRIBED") {
          void channel.send({ type: "broadcast", event: "signal", payload: { type: "declined" } });
          setTimeout(() => supabase.removeChannel(channel), 700);
        }
      });
    }
    cleanup();
  }, [supabase, cleanup]);

  const hangup = useCallback(
    async (remoteEnded = false) => {
      const wasConnected = connectedRef.current;
      const duration = secondsRef.current;
      if (!remoteEnded) {
        callChannelRef.current?.send({ type: "broadcast", event: "signal", payload: { type: "hangup" } });
      }
      if (isCallerRef.current && statusRef.current !== "idle") {
        if (wasConnected) void insertCallLog("ok", duration);
        else if (statusRef.current === "outgoing") void insertCallLog("missed", 0);
      }
      cleanup();
      if (wasConnected) toast(`انتهت المكالمة · ${formatCallDuration(duration)}`);
    },
    [cleanup, insertCallLog, toast],
  );
  endCallRef.current = hangup;

  const toggleMute = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  };

  const toggleVideo = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setVideoOff(!track.enabled);
  };

  const switchCamera = async () => {
    const pc = pcRef.current;
    if (!pc || kind !== "video") return;
    facingRef.current = facingRef.current === "user" ? "environment" : "user";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facingRef.current }, audio: false });
      const newTrack = stream.getVideoTracks()[0];
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender && newTrack) {
        await sender.replaceTrack(newTrack);
        localStreamRef.current?.getVideoTracks().forEach((t) => t.stop());
        localStreamRef.current?.removeTrack(localStreamRef.current.getVideoTracks()[0]);
        localStreamRef.current?.addTrack(newTrack);
        attachStreams();
      }
    } catch {
      toast("تعذّر تبديل الكاميرا", "error");
    }
  };

  const inCall = status !== "idle" && peer;

  return (
    <CallContext.Provider value={{ status, startCall }}>
      {children}
      {inCall && (
        <CallOverlay
          status={status}
          peer={peer}
          kind={kind}
          seconds={seconds}
          muted={muted}
          videoOff={videoOff}
          onAccept={() => void accept()}
          onDecline={() => void decline()}
          onHangup={() => void hangup()}
          onToggleMute={toggleMute}
          onToggleVideo={toggleVideo}
          onSwitchCamera={() => void switchCamera()}
          registerLocalVideo={registerLocalVideo}
          registerRemoteVideo={registerRemoteVideo}
          registerRemoteAudio={registerRemoteAudio}
          myProfile={me}
        />
      )}
    </CallContext.Provider>
  );
}

/* ─────────────────────────── overlay UI ─────────────────────────── */

function CallOverlay(props: {
  status: Status;
  peer: PeerInfo;
  kind: CallKind;
  seconds: number;
  muted: boolean;
  videoOff: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onSwitchCamera: () => void;
  registerLocalVideo: (el: HTMLVideoElement | null) => void;
  registerRemoteVideo: (el: HTMLVideoElement | null) => void;
  registerRemoteAudio: (el: HTMLAudioElement | null) => void;
  myProfile: Profile | null;
}) {
  const { status, peer, kind, seconds } = props;
  const isVideo = kind === "video";
  const showVideos = isVideo && (status === "connecting" || status === "active" || status === "outgoing");

  const statusText =
    status === "incoming"
      ? isVideo
        ? "مكالمة فيديو واردة…"
        : "مكالمة صوتية واردة…"
      : status === "outgoing"
        ? "جارٍ الاتصال…"
        : status === "connecting"
          ? "جارٍ التوصيل…"
          : formatCallDuration(seconds);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-[#020806]" role="dialog" aria-label="مكالمة">
      {/* remote video / avatar backdrop */}
      {showVideos ? (
        <video ref={props.registerRemoteVideo} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-950 via-[#04120d] to-black" />
          <div className="absolute -top-24 start-1/4 h-72 w-72 rounded-full bg-emerald-500/20 blur-[100px]" />
          <div className="absolute bottom-0 end-0 h-64 w-64 rounded-full bg-cyan-500/15 blur-[90px]" />
        </div>
      )}
      {!isVideo && <audio ref={props.registerRemoteAudio} autoPlay />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />

      {/* local preview */}
      {showVideos && (
        <video
          ref={props.registerLocalVideo}
          autoPlay
          playsInline
          muted
          className="absolute end-4 top-[max(4.5rem,env(safe-area-inset-top))] z-20 h-44 w-32 rounded-[22px] object-cover shadow-2xl ring-1 ring-white/25"
        />
      )}

      {/* identity */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        {!showVideos && (
          <span className="relative">
            {(status === "incoming" || status === "outgoing") && (
              <>
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/25" />
                <span className="absolute -inset-4 animate-pulse rounded-full bg-emerald-400/10" />
              </>
            )}
            <Avatar profile={peer} size="2xl" ring className="relative" />
          </span>
        )}
        <h2 className={cn("font-black text-white drop-shadow", showVideos ? "mt-2 text-xl" : "mt-5 text-[26px]")}>{peer.display_name}</h2>
        <p className="mt-1 text-sm font-semibold text-emerald-200/90" dir="ltr">
          @{peer.username}
        </p>
        <p className={cn("mt-2 font-bold tabular-nums", status === "active" ? "text-emerald-300" : "animate-pulse text-white/70")}>{statusText}</p>
        {status === "active" && <p className="mt-1 text-[11px] text-white/45">مكالمة مشفرة عبر الإنترنت · DZ CONNECT</p>}
      </div>

      {/* controls */}
      <div className="relative z-10 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {status === "incoming" ? (
          <div className="flex items-center justify-center gap-14">
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={props.onDecline}
                aria-label="رفض المكالمة"
                className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-red-500 text-white shadow-[0_14px_36px_rgba(239,68,68,0.5)] transition active:scale-90"
              >
                <PhoneOff className="h-7 w-7" />
              </button>
              <span className="text-xs font-bold text-white/70">رفض</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={props.onAccept}
                aria-label="قبول المكالمة"
                className="flex h-[76px] w-[76px] animate-bounce items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_14px_36px_rgba(16,185,129,0.55)] transition active:scale-90"
              >
                {isVideo ? <Video className="h-8 w-8" /> : <Phone className="h-8 w-8" />}
              </button>
              <span className="text-xs font-bold text-white/70">قبول</span>
            </div>
          </div>
        ) : (
          <div className="flex items-end justify-center gap-4">
            <ControlButton onClick={props.onToggleMute} active={props.muted} label={props.muted ? "مكتوم" : "الصوت"}>
              {props.muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </ControlButton>
            {isVideo && (
              <ControlButton onClick={props.onToggleVideo} active={props.videoOff} label={props.videoOff ? "كاميرا مقفلة" : "الكاميرا"}>
                {props.videoOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
              </ControlButton>
            )}
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={props.onHangup}
                aria-label="إنهاء المكالمة"
                className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-red-500 text-white shadow-[0_14px_36px_rgba(239,68,68,0.5)] transition active:scale-90"
              >
                <PhoneOff className="h-7 w-7" />
              </button>
              <span className="text-xs font-bold text-white/70">إنهاء</span>
            </div>
            {isVideo && (
              <ControlButton onClick={props.onSwitchCamera} label="تبديل">
                <RefreshCcw className="h-6 w-6" />
              </ControlButton>
            )}
            {!isVideo && <span className="w-[60px]" />}
          </div>
        )}
        {status === "incoming" && (
          <button onClick={props.onDecline} aria-label="إغلاق" className="absolute end-5 top-0 hidden text-white/50">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}

function ControlButton({
  children,
  onClick,
  active = false,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onClick}
        aria-label={label}
        className={cn(
          "flex h-[60px] w-[60px] items-center justify-center rounded-full text-white shadow-xl ring-1 ring-white/20 backdrop-blur transition active:scale-90",
          active ? "bg-white text-slate-900" : "bg-white/15",
        )}
      >
        {children}
      </button>
      <span className="text-[11px] font-bold text-white/70">{label}</span>
    </div>
  );
}
