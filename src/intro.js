// Intro view — runs before the main 24h timelapse (本編).
// Plays 3 beats (concept → what-to-watch → real-data), then fades out and
// dispatches "intro:complete" so main.js can restart the globe from 00:00.
//
// Loaded as a classic (non-module) script before main.js so this flag is set
// before the deferred module executes.
window.__introActive = true;

(function () {
  // Beat durations (ms). Tap anywhere to skip the rest.
  const BEATS = [2800, 3200, 2900];
  const FALLBACK_TOTAL = 3_800_000; // used only until main.js reports the real figure

  function run() {
    const intro = document.getElementById("intro");
    if (!intro) {
      window.dispatchEvent(new Event("intro:complete"));
      return;
    }

    const beats = Array.from(intro.querySelectorAll(".beat"));
    const progressEl = document.getElementById("intro-progress");
    const counterEl = document.getElementById("intro-counter");
    const totalMs = BEATS.reduce((a, b) => a + b, 0);

    let finished = false;
    const timers = [];

    function clearTimers() {
      timers.forEach((t) => clearTimeout(t));
      timers.length = 0;
    }

    function finish() {
      if (finished) return;
      finished = true;
      clearTimers();
      if (progressEl) progressEl.style.width = "100%";
      intro.classList.add("done");
      // Tell main.js to (re)start a fresh 24h loop, then remove the overlay.
      window.dispatchEvent(new Event("intro:complete"));
      setTimeout(() => { intro.style.display = "none"; }, 750);
    }

    function showBeat(idx) {
      beats.forEach((b, i) => b.classList.toggle("active", i === idx));
    }

    // ---- Counter animation (Beat A) ----
    function animateCounter() {
      const target = Math.max(1, Math.round(window.__dayTotal || FALLBACK_TOTAL));
      const dur = BEATS[0] - 300;
      const t0 = performance.now();
      function step(now) {
        if (finished) return;
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        if (counterEl) {
          counterEl.textContent = Math.round(target * eased).toLocaleString("en-US");
        }
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    // ---- Progress bar across the whole intro ----
    function animateProgress() {
      const t0 = performance.now();
      function step(now) {
        if (finished) return;
        const p = Math.min(1, (now - t0) / totalMs);
        if (progressEl) progressEl.style.width = (p * 100).toFixed(1) + "%";
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    // ---- Sequence the beats ----
    let acc = 0;
    BEATS.forEach((dur, i) => {
      timers.push(setTimeout(() => {
        showBeat(i);
        if (i === 0) animateCounter();
      }, acc));
      acc += dur;
    });
    timers.push(setTimeout(finish, acc));

    showBeat(0);
    animateProgress();

    // Tap / click anywhere to skip straight to the main show.
    intro.addEventListener("click", finish, { once: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
