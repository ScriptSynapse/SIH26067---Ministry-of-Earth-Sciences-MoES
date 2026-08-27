/* ============================================================
   OCEANX — utils.js
   Small, dependency-free helper functions shared across modules.
   ============================================================ */

const Utils = (() => {

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function invLerp(a, b, v) {
    if (a === b) return 0;
    return clamp((v - a) / (b - a), 0, 1);
  }

  // "turbo"-ish scientific colormap, hand-authored stops (r,g,b 0-255)
  const TURBO_STOPS = [
    [10, 20, 80],    // deep navy (cold)
    [12, 90, 190],
    [10, 170, 200],
    [25, 216, 255],  // cyan
    [110, 230, 140],
    [235, 220, 60],
    [250, 140, 40],
    [230, 45, 45]    // hot red
  ];

  function colormap(t, stops = TURBO_STOPS) {
    t = clamp(t, 0, 1);
    const n = stops.length - 1;
    const scaled = t * n;
    const i = Math.min(n - 1, Math.floor(scaled));
    const frac = scaled - i;
    const a = stops[i], b = stops[i + 1];
    const r = Math.round(lerp(a[0], b[0], frac));
    const g = Math.round(lerp(a[1], b[1], frac));
    const bl = Math.round(lerp(a[2], b[2], frac));
    return `rgb(${r},${g},${bl})`;
  }

  function colormapRGB(t, stops = TURBO_STOPS) {
    t = clamp(t, 0, 1);
    const n = stops.length - 1;
    const scaled = t * n;
    const i = Math.min(n - 1, Math.floor(scaled));
    const frac = scaled - i;
    const a = stops[i], b = stops[i + 1];
    return [
      lerp(a[0], b[0], frac) / 255,
      lerp(a[1], b[1], frac) / 255,
      lerp(a[2], b[2], frac) / 255
    ];
  }

  function gradientCSS(stops = TURBO_STOPS) {
    // top = hot/high value, bottom = cold/low value (colorbar reads top-down)
    const n = stops.length - 1;
    const parts = stops.map((s, i) => {
      const pct = (1 - i / n) * 100;
      return `rgb(${s[0]},${s[1]},${s[2]}) ${pct.toFixed(1)}%`;
    });
    return `linear-gradient(to top, ${parts.slice().reverse().join(", ")})`;
  }

  function formatDate(d) {
    const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = months[d.getUTCMonth()];
    const yyyy = d.getUTCFullYear();
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mi = String(d.getUTCMinutes()).padStart(2, "0");
    return `${dd} ${mm} ${yyyy} ${hh}:${mi}Z`;
  }

  function formatDateShort(d) {
    const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    return `${String(d.getUTCDate()).padStart(2,"0")} ${months[d.getUTCMonth()]}`;
  }

  function formatClock(d) {
    return d.toTimeString().slice(0, 8);
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // deterministic pseudo-random noise, seeded by coordinates — used so
  // demo fields are stable across renders / reloads rather than random.
  function seededNoise(x, y, z = 0, seed = 1) {
    const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.71) * 43758.5453;
    return v - Math.floor(v); // 0..1
  }

  function smoothNoise2D(x, y, seed = 1) {
    // sum a few octaves of sine waves for organic-looking gyres/eddies
    let v = 0;
    v += Math.sin(x * 0.9 + seed) * Math.cos(y * 0.7 - seed);
    v += 0.5 * Math.sin(x * 2.1 - y * 1.3 + seed * 2);
    v += 0.25 * Math.sin(x * 4.4 + y * 3.1 - seed);
    return (v + 1.75) / 3.5; // normalize roughly 0..1
  }

  function uid(prefix = "id") {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
  }

  return {
    clamp, lerp, invLerp, colormap, colormapRGB, gradientCSS,
    formatDate, formatDateShort, formatClock, debounce,
    seededNoise, smoothNoise2D, uid, TURBO_STOPS
  };
})();
