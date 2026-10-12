/**
 * GAME BUG KNOWLEDGE BASE — the recurring ways a generated game dies, with the exact rule that prevents each one.
 *  - kbGenerationBlock(): the rulebook appended to the game-building prompt (prevention).
 *  - kbRepairHints(issues): targeted fix advice for the errors the verifier / smoke run found (cure).
 * Add a new entry here whenever a new failure pattern shows up; it is picked up by both paths automatically.
 */

export type KbEntry = {
  id: string;
  /** matches the verifier's error message (cure path) */
  match?: RegExp;
  /** the rule given to the model BEFORE it writes (prevention path) */
  rule: string;
  /** the fix advice given to the repair engine when `match` hits */
  fix?: string;
};

export const GAME_KB: KbEntry[] = [
  {
    id: "dead-start-button",
    match: /dead button|handler calls|is not defined.*(?:boot|handler)|boot.*not defined/i,
    rule: "START BUTTON: define `function startGame(){...}` with a FUNCTION DECLARATION (hoisted) and bind it with addEventListener('click', startGame) AND ('touchend', e=>{e.preventDefault();startGame();}) on the real button id. Never rely on onclick=\"...\" strings. After the click the title overlay MUST be hidden and the loop MUST be running.",
    fix: "Define the missing function with a function declaration (hoisted) or fix the name so it matches the handler; bind the start button with addEventListener on click and touchend.",
  },
  {
    id: "tdz",
    match: /before initialization/i,
    rule: "ORDER: declare every const/let BEFORE any code that can run earlier (handlers, init(), the loop). Put ALL state (`const state={...}`, arrays, player, canvas, ctx) at the very top of the script, then functions, then the boot call LAST.",
    fix: "Move the const/let declaration above its first use (state at the top of the script), or turn it into a var / function declaration.",
  },
  {
    id: "reference",
    match: /ReferenceError|is not defined/i,
    rule: "NAMES: every identifier you call must be declared in the file. Before answering, scan for functions you call but never wrote (drawX, spawnY, playSound). Write them or delete the call. No placeholders, no 'rest of code'.",
    fix: "Write the missing function/variable (a small, correct implementation) or remove the call; keep the name EXACTLY as used elsewhere.",
  },
  {
    id: "null-dom",
    match: /getElementById|null crash|no element with id/i,
    rule: "DOM IDS: every getElementById / querySelector id used in JS must exist in the HTML you wrote. Create the elements in HTML (title overlay, play button, HUD, game-over panel) BEFORE the script, and keep one list of ids in your head while writing both.",
    fix: "Add the missing element with that exact id to the HTML (or correct the id in JS), and null-check lookups used for optional UI.",
  },
  {
    id: "loop-crash",
    match: /in the game loop|in a timer/i,
    rule: "LOOP: requestAnimationFrame(loop) is called FIRST inside loop(), update+draw sit in try/catch, dt is clamped (Math.min(0.033,dt)), arrays are iterated backwards when splicing, no object is read before it is created.",
    fix: "Guard the failing access (create the object first / check for undefined), keep the loop alive with try/catch around update+draw.",
  },
  {
    id: "endless-loop",
    match: /never finishes|endless loop|hang/i,
    rule: "NO BLOCKING LOOPS: never use while(true) or a loop that waits for a flag. All repetition goes through requestAnimationFrame / setInterval. Procedural generation loops have a hard iteration cap.",
    fix: "Replace the blocking loop with a bounded for-loop (hard cap) or move it into the animation frame.",
  },
  {
    id: "three-r128",
    match: /THREE|r128|CapsuleGeometry|colorSpace/i,
    rule: "THREE: only the plain r128 <script> from cdnjs; no import/module/importmap; no CapsuleGeometry, no THREE.Geometry, no colorSpace, no OrbitControls/GLTFLoader (write tiny controls yourself, build models from primitives). Start the loop only after the scene, camera and renderer exist; check `typeof THREE` and WebGL first and show a readable error card if missing.",
    fix: "Use r128-compatible API only (BufferGeometry, renderer.outputEncoding = THREE.sRGBEncoding, build capsules from cylinder+spheres) and load the single r128 script tag in <head>.",
  },
  {
    id: "audio",
    rule: "AUDIO: create/resume the AudioContext ONLY inside the first user tap (the play button handler); wrap every sound call in try/catch; a mute button; never block gameplay on audio.",
  },
  {
    id: "mobile-input",
    rule: "INPUT: pointer/touch events on the canvas with preventDefault and {passive:false}; no hover, no right-click, no keyboard-only controls (add on-screen buttons/joystick); never require pointer-lock; touch-action:none; 100dvh shell.",
  },
  {
    id: "state-reset",
    rule: "RESTART: one resetGame() that rebuilds ALL state (arrays emptied, timers cleared, positions/score reset); RETRY and PLAY both call it. Game over never leaves old enemies or listeners behind (add listeners ONCE at boot, not per round).",
  },
  {
    id: "storage",
    rule: "STORAGE: localStorage/NexusDB only inside try/catch (private mode throws); the game must run if storage fails.",
  },
  {
    id: "size-vs-finish",
    rule: "FINISH FIRST: a complete, running game of the requested size beats a half-written bigger one. Write in this order: HTML+CSS shell -> state -> input -> update -> draw -> screens -> boot. The last line of the file is </html>.",
  },
];

/** Rulebook appended to every game-building prompt. */
export function kbGenerationBlock(): string {
  return (
    "\n===== KNOWN GAME BUGS — every rule below exists because games really crashed that way; obey all of them =====\n" +
    GAME_KB.map((e, i) => `${i + 1}. ${e.rule}`).join("\n") +
    "\n===== END KNOWN GAME BUGS =====\n"
  );
}

/** Extra fix advice for the repair engine, matched to the errors that were actually found. */
export function kbRepairHints(messages: string[]): string {
  const hits = GAME_KB.filter((e) => e.fix && e.match && messages.some((m) => e.match!.test(m)));
  if (hits.length === 0) return "";
  return "\n\nKNOWN FIXES FOR THESE ERRORS:\n" + hits.map((e) => `- ${e.fix}`).join("\n");
}
