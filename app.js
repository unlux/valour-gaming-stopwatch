// ---------------------------------------------------------------------------
// Valor Gaming Stopwatch — app.js
//
// Tracks playtime for 4 PlayStations using real timestamps (Date.now()).
// All state lives in localStorage so timers survive reloads, tab closes,
// phone locks, and browser restarts.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "ps-timers-v1";
const TIMER_COUNT = 4;
const RENDER_INTERVAL_MS = 500;

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

// Each timer's canonical state:
//   isRunning : boolean   — currently counting?
//   startTime : number|null — Date.now() snapshot when last started/resumed
//   elapsed   : number    — milliseconds accumulated before the current run

function createDefaultTimers() {
  return Array.from({ length: TIMER_COUNT }, () => ({
    isRunning: false,
    startTime: null,
    elapsed: 0,
  }));
}

function loadTimers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultTimers();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== TIMER_COUNT) {
      return createDefaultTimers();
    }
    return parsed;
  } catch {
    return createDefaultTimers();
  }
}

function saveTimers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
}

// Compute the total elapsed milliseconds for a timer at this instant.
function currentElapsed(timer) {
  if (timer.isRunning && timer.startTime !== null) {
    return timer.elapsed + (Date.now() - timer.startTime);
  }
  return timer.elapsed;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatTime(ms) {
  // Clamp to zero in case of clock drift edge cases.
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return (
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0") +
    ":" +
    String(s).padStart(2, "0")
  );
}

// ---------------------------------------------------------------------------
// Timer actions
// ---------------------------------------------------------------------------

// Possible states and valid transitions:
//   "idle"    → Start
//   "running" → Pause
//   "paused"  → Resume, Reset
//
// We derive the state label from the data rather than storing it separately
// to avoid impossible combinations.

function timerState(timer) {
  if (timer.isRunning) return "running";
  if (timer.elapsed > 0) return "paused";
  return "idle";
}

function startTimer(index) {
  const t = timers[index];
  if (timerState(t) !== "idle") return;
  t.isRunning = true;
  t.startTime = Date.now();
  t.elapsed = 0;
  saveTimers();
  renderAll();
}

function pauseTimer(index) {
  const t = timers[index];
  if (timerState(t) !== "running") return;
  // Freeze elapsed time and stop the clock.
  t.elapsed = currentElapsed(t);
  t.isRunning = false;
  t.startTime = null;
  saveTimers();
  renderAll();
}

function resumeTimer(index) {
  const t = timers[index];
  if (timerState(t) !== "paused") return;
  t.isRunning = true;
  t.startTime = Date.now();
  saveTimers();
  renderAll();
}

function resetTimer(index) {
  const t = timers[index];
  // Reset is allowed from paused or running (safety net).
  t.isRunning = false;
  t.startTime = null;
  t.elapsed = 0;
  saveTimers();
  renderAll();
}

// ---------------------------------------------------------------------------
// DOM construction (runs once)
// ---------------------------------------------------------------------------

// We build the DOM imperatively and keep references to the elements we need
// to update each render tick so we never query the DOM again.

const displayRefs = []; // { timeEl, startBtn, pauseBtn, resumeBtn, resetBtn, card }

function buildUI() {
  const grid = document.getElementById("grid");

  for (let i = 0; i < TIMER_COUNT; i++) {
    const card = document.createElement("div");
    card.className =
      "flex flex-col items-center justify-center bg-neutral-900 px-3 py-4 relative";

    // Label
    const label = document.createElement("span");
    label.className = "text-xs font-medium tracking-widest uppercase text-neutral-500 mb-2";
    label.textContent = `PS ${i + 1}`;
    card.appendChild(label);

    // Time display
    const timeEl = document.createElement("div");
    timeEl.className = "font-mono text-3xl sm:text-5xl font-bold tabular-nums leading-none mb-4";
    timeEl.textContent = "00:00:00";
    card.appendChild(timeEl);

    // Button row
    const btnRow = document.createElement("div");
    btnRow.className = "grid grid-cols-2 gap-2 w-full max-w-[12rem]";

    const makeBtn = (text, colorClasses, handler) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = text;
      btn.className =
        "py-2 px-3 rounded-md text-sm font-medium border transition-none " +
        "disabled:opacity-30 disabled:cursor-not-allowed " +
        colorClasses;
      btn.addEventListener("click", handler);
      // Prevent double-tap zoom on mobile.
      btn.addEventListener("touchend", (e) => {
        e.preventDefault();
        handler();
      });
      return btn;
    };

    // Colour palette (shadcn-esque muted tones):
    //   Start  → green border/text
    //   Pause  → amber border/text
    //   Resume → green border/text
    //   Reset  → red border/text

    const startBtn = makeBtn(
      "Start",
      "border-emerald-800 text-emerald-400 bg-emerald-950/40",
      () => startTimer(i)
    );
    const pauseBtn = makeBtn(
      "Pause",
      "border-amber-800 text-amber-400 bg-amber-950/40",
      () => pauseTimer(i)
    );
    const resumeBtn = makeBtn(
      "Resume",
      "border-emerald-800 text-emerald-400 bg-emerald-950/40",
      () => resumeTimer(i)
    );
    const resetBtn = makeBtn(
      "Reset",
      "border-red-800 text-red-400 bg-red-950/40",
      () => resetTimer(i)
    );

    btnRow.appendChild(startBtn);
    btnRow.appendChild(pauseBtn);
    btnRow.appendChild(resumeBtn);
    btnRow.appendChild(resetBtn);
    card.appendChild(btnRow);

    grid.appendChild(card);

    displayRefs.push({ timeEl, startBtn, pauseBtn, resumeBtn, resetBtn, card });
  }
}

// ---------------------------------------------------------------------------
// Rendering (display-only — no timekeeping logic here)
// ---------------------------------------------------------------------------

function renderAll() {
  for (let i = 0; i < TIMER_COUNT; i++) {
    const t = timers[i];
    const ref = displayRefs[i];
    const state = timerState(t);
    const ms = currentElapsed(t);

    // Update time display only when the formatted string changes to avoid
    // unnecessary text‐node mutations.
    const formatted = formatTime(ms);
    if (ref.timeEl.textContent !== formatted) {
      ref.timeEl.textContent = formatted;
    }

    // Colour the time text based on state.
    ref.timeEl.className =
      "font-mono text-3xl sm:text-5xl font-bold tabular-nums leading-none mb-4 " +
      (state === "running"
        ? "text-emerald-400"
        : state === "paused"
          ? "text-amber-400"
          : "text-neutral-400");

    // Enable/disable buttons based on valid transitions.
    ref.startBtn.disabled = state !== "idle";
    ref.pauseBtn.disabled = state !== "running";
    ref.resumeBtn.disabled = state !== "paused";
    ref.resetBtn.disabled = state === "idle";
  }
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

const timers = loadTimers();
buildUI();
renderAll();

// Global render loop — purely for display updates. Timekeeping is always
// derived from Date.now() so accuracy is unaffected by loop frequency.
setInterval(renderAll, RENDER_INTERVAL_MS);
