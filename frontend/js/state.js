/* ============================================================
   OCEANX — state.js
   Central application state. Every UI component reacts to
   changes here via a minimal pub-sub, rather than reading/writing
   the DOM directly from other modules.
   ============================================================ */

const appState = {
  dataset: "hycom",
  variable: "temperature",
  visualizationMode: "depth-slice",
  depthIndex: 1,          // index into model.depths
  timeIndex: 0,           // index into model.times
  verticalExaggeration: 2.0,
  colorScale: "linear",   // "linear" | "log"

  layers: {
    model: true,
    argo: true,
    gliders: true,
    bathymetry: false,
    coastline: true
  },
  layerOpacity: 0.85,

  metadata: null,          // result of getModelMetadata()
  observations: [],        // array of Argo/glider records
  selectedObservation: null,

  dataMode: "connecting",  // "connecting" | "live" | "demo" | "error"
  isPlaying: false,

  gridVisible: true
};

const StateBus = (() => {
  const listeners = {};

  function on(event, fn) {
    (listeners[event] = listeners[event] || []).push(fn);
    return () => off(event, fn);
  }

  function off(event, fn) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter((f) => f !== fn);
  }

  function emit(event, payload) {
    (listeners[event] || []).forEach((fn) => {
      try { fn(payload); } catch (err) { console.error(`[StateBus:${event}]`, err); }
    });
  }

  return { on, off, emit };
})();
