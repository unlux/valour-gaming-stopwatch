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
const RESET_CONFIRM_MS = 2000; // Time window for second tap to confirm reset

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

// Track which timers are awaiting reset confirmation and their timeout IDs.
const resetPending = new Array(TIMER_COUNT).fill(false);
const resetTimeouts = new Array(TIMER_COUNT).fill(null);

function handleReset(index) {
  if (resetPending[index]) {
    // Second tap — confirm the reset.
    clearTimeout(resetTimeouts[index]);
    resetPending[index] = false;
    resetTimeouts[index] = null;
    resetTimer(index);
  } else {
    // First tap — enter confirmation state.
    resetPending[index] = true;
    renderAll();
    resetTimeouts[index] = setTimeout(() => {
      // Revert if no second tap within the window.
      resetPending[index] = false;
      renderAll();
    }, RESET_CONFIRM_MS);
  }
}

function resetTimer(index) {
  const t = timers[index];
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
      "flex flex-col items-center justify-center bg-neutral-900 px-3 py-3";

    // Label
    const label = document.createElement("span");
    label.className =
      "text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-1";
    label.textContent = `PS ${i + 1}`;
    card.appendChild(label);

    // Time display — big and central
    const timeEl = document.createElement("div");
    timeEl.className =
      "font-mono text-3xl font-bold tabular-nums leading-none text-neutral-400 mb-3";
    timeEl.textContent = "00:00:00";
    card.appendChild(timeEl);

    // Buttons stacked vertically
    const btnCol = document.createElement("div");
    btnCol.className = "flex flex-col gap-1.5 w-full max-w-[10rem]";

    const makeBtn = (text, colorClasses, handler) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = text;
      btn.className =
        "py-2 rounded-md text-xs font-medium border transition-none " +
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

    // Single toggle: Start → Pause → Resume → Pause …
    const toggleBtn = makeBtn(
      "Start",
      "border-emerald-800 text-emerald-400 bg-emerald-950/40",
      () => {
        const state = timerState(timers[i]);
        if (state === "idle") startTimer(i);
        else if (state === "running") pauseTimer(i);
        else if (state === "paused") resumeTimer(i);
      }
    );
    const resetBtn = makeBtn(
      "Reset",
      "border-red-800 text-red-400 bg-red-950/40",
      () => handleReset(i)
    );

    btnCol.appendChild(toggleBtn);
    resetBtn.classList.add("mt-3");
    btnCol.appendChild(resetBtn);
    card.appendChild(btnCol);

    grid.appendChild(card);

    displayRefs.push({ timeEl, toggleBtn, resetBtn, card });
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
      "font-mono text-3xl font-bold tabular-nums leading-none mb-3 " +
      (state === "running"
        ? "text-emerald-400"
        : state === "paused"
          ? "text-amber-400"
          : "text-neutral-400");

    // Toggle button: label and colour swap per state.
    if (state === "running") {
      ref.toggleBtn.textContent = "Pause";
      ref.toggleBtn.className =
        "py-2 rounded-md text-xs font-medium border transition-none " +
        "border-amber-800 text-amber-400 bg-amber-950/40";
    } else if (state === "paused") {
      ref.toggleBtn.textContent = "Resume";
      ref.toggleBtn.className =
        "py-2 rounded-md text-xs font-medium border transition-none " +
        "border-emerald-800 text-emerald-400 bg-emerald-950/40";
    } else {
      ref.toggleBtn.textContent = "Start";
      ref.toggleBtn.className =
        "py-2 rounded-md text-xs font-medium border transition-none " +
        "border-emerald-800 text-emerald-400 bg-emerald-950/40";
    }
    ref.resetBtn.disabled = state === "idle";

    // Reset button confirmation state — swap label and style on first tap.
    if (resetPending[i]) {
      ref.resetBtn.textContent = "Sure?";
      ref.resetBtn.className =
        "py-2 rounded-md text-xs font-medium border transition-none " +
        "border-red-600 text-red-300 bg-red-900/60";
    } else {
      ref.resetBtn.textContent = "Reset";
      ref.resetBtn.className =
        "py-2 rounded-md text-xs font-medium border transition-none " +
        "disabled:opacity-30 disabled:cursor-not-allowed " +
        "border-red-800 text-red-400 bg-red-950/40";
    }
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
