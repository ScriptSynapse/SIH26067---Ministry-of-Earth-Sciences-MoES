/* ============================================================
   OCEANX — observations.js
   In-situ observation records (Argo floats, gliders). The current
   MoES/SIH26067 backend does not yet ingest Argo/Glider/CTD/BGC
   data (that ingestion is listed only as a planned "expected
   solution" in the repo README), so this module always produces
   clearly-labelled DEMO records shaped like the fields the backend
   README says it intends to expose: id, lat, lon, timestamp,
   max depth, temperature, salinity, pressure, chlorophyll.
   ============================================================ */

const Observations = (() => {

  const ARGO_COUNT = 14;
  const GLIDER_COUNT = 5;

  function seededFloat(seed, min, max) {
    return min + Utils.seededNoise(seed, seed * 3.1, seed * 0.7) * (max - min);
  }

  function buildDemoObservations() {
    const { latMin, latMax, lonMin, lonMax } = Model.DEMO_BOUNDS;
    const now = Model.demoTimes()[Model.demoTimes().length - 1];
    const records = [];

    for (let i = 0; i < ARGO_COUNT; i++) {
      const seed = i * 11.7 + 3;
      const lat = seededFloat(seed, latMin + 1, latMax - 1);
      const lon = seededFloat(seed + 1, lonMin + 1, lonMax - 1);
      const maxDepth = Math.round(seededFloat(seed + 2, 1200, 2000));
      const hoursAgo = Math.round(seededFloat(seed + 3, 1, 72));
      records.push({
        id: `59${(10000 + i * 137).toString().slice(0, 5)}`,
        type: "argo",
        label: "ARGO FLOAT",
        status: hoursAgo < 48 ? "ACTIVE" : "INACTIVE",
        lat, lon,
        lastObservation: new Date(now.getTime() - hoursAgo * 3600 * 1000),
        maxDepth,
        variables: ["temperature", "salinity", "pressure"],
        source: "demo"
      });
    }

    for (let i = 0; i < GLIDER_COUNT; i++) {
      const seed = i * 19.3 + 101;
      const lat = seededFloat(seed, latMin + 2, latMax - 2);
      const lon = seededFloat(seed + 1, lonMin + 2, lonMax - 2);
      const maxDepth = Math.round(seededFloat(seed + 2, 300, 1000));
      const hoursAgo = Math.round(seededFloat(seed + 3, 1, 30));
      records.push({
        id: `SG-${(200 + i * 17)}`,
        type: "glider",
        label: "GLIDER",
        status: "ACTIVE",
        lat, lon,
        lastObservation: new Date(now.getTime() - hoursAgo * 3600 * 1000),
        maxDepth,
        variables: ["temperature", "salinity", "chlorophyll"],
        source: "demo"
      });
    }

    return records;
  }

  /** Depth profile for one observation & variable — MODEL vs OBSERVED. */
  function profileFor(observation, variable, timeIndex) {
    const depths = Model.DEMO_DEPTHS.filter(d => d <= observation.maxDepth);
    const finalDepths = depths.length ? depths : Model.DEMO_DEPTHS.slice(0, 3);

    const model = finalDepths.map((d) => ({
      depth: d,
      value: Model.demoValueAt(variable, observation.lat, observation.lon, d, timeIndex)
    }));

    // "observed" = model curve perturbed with a small, deterministic
    // per-instrument offset/noise so MODEL vs OBSERVED are visibly
    // distinct but not arbitrary between reloads.
    const bias = (Utils.seededNoise(observation.lat, observation.lon, 0, 9) - 0.5) * 2;
    const observed = finalDepths.map((d, i) => {
      const noise = (Utils.seededNoise(observation.lat, d, i, 4.2) - 0.5) * 0.9;
      return { depth: d, value: model[i].value + bias + noise };
    });

    return { depths: finalDepths, model, observed, source: "demo" };
  }

  function compareWithModel(observation, variable, timeIndex) {
    if (!observation.variables.includes(variable)) {
      return { available: false, note: "Comparison unavailable \u2014 this instrument does not report this variable." };
    }
    const { model, observed } = profileFor(observation, variable, timeIndex);
    if (!model.length) {
      return { available: false, note: "Comparison unavailable \u2014 insufficient depth overlap." };
    }
    let sumDiff = 0, sumSq = 0;
    model.forEach((m, i) => {
      const d = m.value - observed[i].value;
      sumDiff += d;
      sumSq += d * d;
    });
    const meanDiff = sumDiff / model.length;
    const rmse = Math.sqrt(sumSq / model.length);
    const def = Model.VARIABLES[variable];
    return {
      available: true,
      diff: meanDiff,
      rmse,
      units: def ? def.units : "",
      note: "DEMO comparison \u2014 backend does not yet expose live Argo/Glider observations."
    };
  }

  async function loadObservations() {
    try {
      const data = await Api.getObservationData();
      if (Array.isArray(data.observations) && data.observations.length) {
        return data.observations.map(o => ({ ...o, source: "live" }));
      }
      throw new Error("empty observation payload");
    } catch (err) {
      return buildDemoObservations();
    }
  }

  return { buildDemoObservations, profileFor, compareWithModel, loadObservations };
})();
