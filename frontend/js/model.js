/* ============================================================
   OCEANX — model.js
   Variable registry + ocean model field access (live API first,
   deterministic demo fallback second). Mirrors the dimensions the
   real HYCOMModel exposes: 6 depth levels, 28 six-hourly timesteps,
   lat -10..25, lon 40..100 (the Indian Ocean box used in the
   repository's own test_model.py).
   ============================================================ */

const Model = (() => {

  // ---- variables actually backed by the HYCOM NetCDF file ----------
  // temperature -> TEMP, salinity -> SALN, currents -> UVEL/VVEL.
  // chlorophyll & pressure are not present in the current dataset —
  // they stay in the UI as generic-system placeholders, clearly
  // tagged DEMO, per the "do not claim backend functionality the
  // repository does not support" requirement.
  const VARIABLES = {
    temperature: {
      id: "temperature", label: "Temperature", units: "\u00B0C",
      min: 15, max: 32, backendKey: "TEMP", supportedByBackend: true,
      allowLog: false
    },
    salinity: {
      id: "salinity", label: "Salinity", units: "PSU",
      min: 32, max: 37, backendKey: "SALN", supportedByBackend: true,
      allowLog: false
    },
    currents: {
      id: "currents", label: "Currents", units: "m/s",
      min: 0, max: 1.5, backendKey: "UVEL/VVEL", supportedByBackend: true,
      allowLog: false
    },
    chlorophyll: {
      id: "chlorophyll", label: "Chlorophyll", units: "mg/m\u00B3",
      min: 0.02, max: 8, backendKey: null, supportedByBackend: false,
      allowLog: true
    },
    pressure: {
      id: "pressure", label: "Pressure", units: "dbar",
      min: 0, max: 1000, backendKey: null, supportedByBackend: false,
      allowLog: false
    }
  };

  const VISUALIZATION_MODES = [
    { id: "depth-slice", label: "Depth Slice", implemented: true },
    { id: "volume", label: "3D Volume", implemented: false },
    { id: "isosurface", label: "Isosurface", implemented: false },
    { id: "vectors", label: "Current Vectors", implemented: true }
  ];

  // ---- demo dataset geometry (matches repo's own test region) ------
  const DEMO_BOUNDS = { latMin: -10, latMax: 25, lonMin: 40, lonMax: 100 };
  const DEMO_DEPTHS = [0, 50, 100, 200, 500, 1000]; // 6 levels
  const DEMO_GRID = { nLat: 36, nLon: 61 };
  const DEMO_TIME_START = Date.UTC(2026, 7, 24, 0, 0, 0); // 24 Aug 2026
  const DEMO_TIME_STEPS = 28;
  const DEMO_TIME_STEP_MS = 6 * 60 * 60 * 1000;

  function demoTimes() {
    return Array.from({ length: DEMO_TIME_STEPS }, (_, i) => new Date(DEMO_TIME_START + i * DEMO_TIME_STEP_MS));
  }

  function demoMetadata() {
    return {
      source: "demo",
      variables: Object.keys(VARIABLES).filter(k => VARIABLES[k].supportedByBackend),
      depths: DEMO_DEPTHS.slice(),
      times: demoTimes().map(d => d.toISOString()),
      latitude_range: [DEMO_BOUNDS.latMin, DEMO_BOUNDS.latMax],
      longitude_range: [DEMO_BOUNDS.lonMin, DEMO_BOUNDS.lonMax],
      resolution: "~1\u00B0 (demo downsample)"
    };
  }

  function demoLatLon() {
    const lats = Array.from({ length: DEMO_GRID.nLat }, (_, i) =>
        DEMO_BOUNDS.latMin + (i / (DEMO_GRID.nLat - 1)) * (DEMO_BOUNDS.latMax - DEMO_BOUNDS.latMin));
    const lons = Array.from({ length: DEMO_GRID.nLon }, (_, i) =>
        DEMO_BOUNDS.lonMin + (i / (DEMO_GRID.nLon - 1)) * (DEMO_BOUNDS.lonMax - DEMO_BOUNDS.lonMin));
    return { lats, lons };
  }

  // deterministic synthetic field: gyres + depth attenuation + slow time drift
  function demoValueAt(variable, lat, lon, depth, timeIndex) {
    const x = (lon - 70) / 12;
    const y = (lat - 7) / 10;
    const t = timeIndex / DEMO_TIME_STEPS;
    const n = Utils.smoothNoise2D(x + t * 1.4, y - t * 0.8, variableSeed(variable));
    const depthFactor = 1 - Utils.clamp(depth / 1200, 0, 1);

    switch (variable) {
      case "temperature": {
        const surface = Utils.lerp(24, 30.5, n);
        return Utils.lerp(15.5, surface, Math.pow(depthFactor, 0.8));
      }
      case "salinity": {
        const base = Utils.lerp(33.2, 36.6, n);
        return base + (1 - depthFactor) * 0.6;
      }
      case "chlorophyll": {
        const coastal = Utils.clamp(1 - Math.abs(lon - 72) / 25, 0, 1); // brighter near west coast
        const v = Utils.lerp(0.05, 3.2, n) + coastal * 1.8;
        return Utils.clamp(v * depthFactor, 0.02, 8);
      }
      case "pressure": {
        return depth * 1.0197; // dbar ~ depth(m) for seawater, illustrative only
      }
      default:
        return n;
    }
  }

  function demoCurrentAt(lat, lon, depth, timeIndex) {
    const x = (lon - 70) / 12;
    const y = (lat - 7) / 10;
    const t = timeIndex / DEMO_TIME_STEPS;
    const swirl = Utils.smoothNoise2D(x + t, y - t, 7);
    const depthFactor = 1 - Utils.clamp(depth / 800, 0, 1);
    const speed = (0.25 + swirl * 1.1) * depthFactor;
    const angle = swirl * Math.PI * 2 + x * 0.6 - y * 0.4;
    return { u: Math.cos(angle) * speed, v: Math.sin(angle) * speed, speed };
  }

  function variableSeed(variable) {
    const seeds = { temperature: 1.3, salinity: 3.7, chlorophyll: 5.1, pressure: 2.2 };
    return seeds[variable] || 1;
  }

  /**
   * Build a full field grid for the given variable/depth/time, in the
   * same shape HYCOMModel.*_to_dict() returns: { variable, time,
   * depth, latitude[], longitude[], values[][] } (or u/v for currents).
   */
  function demoField(variable, depthValue, timeIndex) {
    const { lats, lons } = demoLatLon();
    const times = demoTimes();
    const time = times[Utils.clamp(timeIndex, 0, times.length - 1)];

    if (variable === "currents") {
      const u = [], v = [];
      lats.forEach((lat) => {
        const uRow = [], vRow = [];
        lons.forEach((lon) => {
          const c = demoCurrentAt(lat, lon, depthValue, timeIndex);
          uRow.push(c.u);
          vRow.push(c.v);
        });
        u.push(uRow); v.push(vRow);
      });
      return { variable: "currents", time: time.toISOString(), depth: depthValue, latitude: lats, longitude: lons, u, v, source: "demo" };
    }

    const values = lats.map((lat) =>
        lons.map((lon) => demoValueAt(variable, lat, lon, depthValue, timeIndex))
    );
    return { variable, time: time.toISOString(), depth: depthValue, latitude: lats, longitude: lons, values, source: "demo" };
  }

  /**
   * Public entry point used by the rest of the app: try the live
   * backend, fall back to the demo generator, and always tag the
   * result with `source: "live" | "demo"` so the UI can be honest
   * about where the numbers came from.
   */
  async function getField(variable, depthValue, timeIndex) {
    const def = VARIABLES[variable];
    if (def && def.supportedByBackend) {
      try {
        const times = appState.metadata ? appState.metadata.times : demoTimes().map(d => d.toISOString());
        const data = await Api.getModelData(variable, {
          time_index: timeIndex,
          depth: depthValue,
          lat_min: DEMO_BOUNDS.latMin, lat_max: DEMO_BOUNDS.latMax,
          lon_min: DEMO_BOUNDS.lonMin, lon_max: DEMO_BOUNDS.lonMax,
          stride: 2
        });
        return { ...data, source: "live" };
      } catch (err) {
        // expected while no backend is deployed — fall through to demo
      }
    }
    return demoField(variable, depthValue, timeIndex);
  }

  async function getMetadata() {
    try {
      const meta = await Api.getModelMetadata();
      return { ...meta, source: "live" };
    } catch (err) {
      return demoMetadata();
    }
  }

  function colorFor(variable, value) {
    const def = VARIABLES[variable];
    if (!def || value === null || value === undefined || Number.isNaN(value)) return "rgba(0,0,0,0)";
    let t;
    if (appState.colorScale === "log" && def.allowLog) {
      const lo = Math.log(Math.max(def.min, 0.001));
      const hi = Math.log(Math.max(def.max, def.min + 0.001));
      t = Utils.invLerp(lo, hi, Math.log(Math.max(value, 0.001)));
    } else {
      t = Utils.invLerp(def.min, def.max, value);
    }
    return Utils.colormap(t);
  }

  function colorRGBFor(variable, value) {
    const def = VARIABLES[variable];
    if (!def || value === null || value === undefined || Number.isNaN(value)) return [0, 0, 0];
    let t;
    if (appState.colorScale === "log" && def.allowLog) {
      const lo = Math.log(Math.max(def.min, 0.001));
      const hi = Math.log(Math.max(def.max, def.min + 0.001));
      t = Utils.invLerp(lo, hi, Math.log(Math.max(value, 0.001)));
    } else {
      t = Utils.invLerp(def.min, def.max, value);
    }
    return Utils.colormapRGB(t);
  }

  return {
    VARIABLES, VISUALIZATION_MODES, DEMO_BOUNDS, DEMO_DEPTHS, DEMO_GRID,
    demoTimes, demoMetadata, demoLatLon, demoField, demoValueAt, demoCurrentAt,
    getField, getMetadata, colorFor, colorRGBFor
  };
})();
