"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileUp } from "lucide-react";

/**
 * Drag & drop for the whole chat area.
 *   const drop = useFileDrop(files => addFiles(files));
 *   <div {...drop.bind}> … <DropOverlay show={drop.dragging} /> </div>
 */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

  const onDragEnter = useCallback((e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth.current += 1;
    setDragging(true);
  }, []);
  const onDragOver = useCallback((e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);
  const onDragLeave = useCallback((e: DragEvent) => {
    if (!hasFiles(e)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  }, []);
  const onDrop = useCallback(
    (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      const list = Array.from(e.dataTransfer.files);
      if (list.length) onFiles(list);
    },
    [onFiles]
  );

  return { dragging, bind: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}

export function DropOverlay({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none absolute inset-0 z-[60] grid place-items-center bg-ink-950/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.92 }}
            animate={{ scale: 1 }}
            className="mx-4 flex w-full max-w-sm flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-brand-400/70 bg-white/10 px-6 py-10 text-center text-white shadow-[0_0_60px_-10px_rgba(47,123,255,0.6)]"
          >
            <FileUp className="size-10 text-brand-300" />
            <p className="text-base font-black">أفلت الملفات هنا</p>
            <p className="text-xs font-bold text-slate-300">صور · PDF · أكواد · ZIP</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
