/* ============================================================
   OCEANX — app.js
   Boots the application: connects to (or falls back from) the
   backend, initializes the 3D scene and charts, wires state
   changes to re-renders, and populates the initial screen.
   ============================================================ */

(function bootstrap() {
  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    const stageLoading = document.getElementById("stageLoading");
    const stageError = document.getElementById("stageError");
    const stageLoadingText = document.getElementById("stageLoadingText");
    const statusBadge = document.getElementById("statusBadge");
    const statusLabel = document.getElementById("statusLabel");
    const lastUpdated = document.getElementById("lastUpdated");
    const modeTag = document.getElementById("dataModeTag");
    const axisReadout = document.getElementById("axisReadout");

    // 1) Three.js scene — isolated in its own try/catch so a rendering
    // failure (e.g. a WebGL or CDN issue) can never take the rest of
    // the UI (sidebar, controls, panels) down with it.
    let scene3DAvailable = true;
    try {
      Map3D.init(document.getElementById("oceanCanvas"));
      Map3D.setOnMarkerClick((obs) => selectObservation(obs));
      Map3D.setOnSurfaceClick(({ lat, lon }) => {
        axisReadout.textContent = `LAT ${lat.toFixed(2)}\u00B0 \u2022 LON ${lon.toFixed(2)}\u00B0`;
      });
    } catch (err) {
      console.error("[OCEANX] 3D scene failed to initialize:", err);
      scene3DAvailable = false;
      stageLoading.hidden = true;
      stageError.hidden = false;
      document.querySelector(".stage__error-title").textContent = "3D VISUALIZATION UNAVAILABLE";
      document.querySelector(".stage__error-sub").textContent =
          "The WebGL scene failed to load (see browser console for details). The rest of the dashboard still works.";
    }

    try {
      Charts.initProfileChart(document.getElementById("profileChart"));
      Charts.initAnalysisChart(document.getElementById("analysisChart"));
    } catch (err) {
      console.error("[OCEANX] Chart.js failed to initialize:", err);
    }

    // 2) connect to backend (or fall back) — never allowed to hang the
    // rest of boot: if it throws for any reason, force demo mode.
    try {
      await connect();
    } catch (err) {
      console.error("[OCEANX] connect() failed unexpectedly, forcing demo mode:", err);
      appState.dataMode = "demo";
      appState.metadata = appState.metadata || Model.demoMetadata();
      appState.observations = appState.observations && appState.observations.length
          ? appState.observations
          : Observations.buildDemoObservations();
      modeTag.textContent = "DEMO";
      setStatus("demo");
      if (scene3DAvailable) stageLoading.hidden = true;
    }

    // 3) wire controls
    try {
      Controls.init({
        getObservations: () => appState.observations,
        getSelected: () => appState.selectedObservation,
        onSelectObservation: (obs) => selectObservation(obs),
        onReconnect: () => connect(),
        onRetry: () => connect()
      });
    } catch (err) {
      console.error("[OCEANX] Controls.init() failed:", err);
    }

    // 4) reactive updates
    StateBus.on("variable-changed", () => refreshField());
    StateBus.on("mode-changed", () => refreshField());
    StateBus.on("depth-changed", () => refreshField());
    StateBus.on("time-changed", () => { refreshField(); refreshSelectedProfile(); });
    StateBus.on("exaggeration-changed", () => refreshField());
    StateBus.on("colorscale-changed", () => refreshField());

    // 5) initial screen population — each piece is independent, so one
    // failing doesn't block the rest.
    await refreshField();
    try { Controls.renderDatasetsPanel(); } catch (err) { console.error("[OCEANX] renderDatasetsPanel failed:", err); }
    try { Controls.populateAnalysisSelectors(); } catch (err) { console.error("[OCEANX] populateAnalysisSelectors failed:", err); }
    try { Controls.renderAlertsPanel(); } catch (err) { console.error("[OCEANX] renderAlertsPanel failed:", err); }

    try {
      const defaultArgo = (appState.observations || []).find(o => o.type === "argo");
      if (defaultArgo) selectObservation(defaultArgo);
    } catch (err) {
      console.error("[OCEANX] Failed to select default observation:", err);
    }

    tickClock();
    setInterval(tickClock, 1000);

    // ---------------------------------------------------------------
    async function connect() {
      if (scene3DAvailable) {
        stageLoading.hidden = false;
        stageError.hidden = true;
        stageLoadingText.textContent = "CONNECTING TO OCEAN DATA STREAM\u2026";
      }
      setStatus("connecting");

      // Run all backend probes in parallel (rather than one after another)
      // so a slow/unreachable host can't stack up multiple timeouts before
      // the UI falls back to demo mode.
      const [healthResult, metadataResult, observationsResult] = await Promise.allSettled([
        Api.checkBackendHealth(),
        Model.getMetadata(),
        Observations.loadObservations()
      ]);

      appState.dataMode = healthResult.status === "fulfilled" ? "live" : "demo";
      appState.metadata = metadataResult.status === "fulfilled" ? metadataResult.value : Model.demoMetadata();
      if (metadataResult.status !== "fulfilled") appState.dataMode = "demo";
      appState.observations = observationsResult.status === "fulfilled"
          ? observationsResult.value
          : Observations.buildDemoObservations();

      try {
        Controls.configureDepthSlider();
        Controls.configureTimeline();
      } catch (err) {
        console.error("[OCEANX] Failed to configure depth/timeline controls:", err);
      }

      if (scene3DAvailable) {
        try { Map3D.setMarkers(appState.observations); }
        catch (err) { console.error("[OCEANX] Failed to place observation markers:", err); }
      }

      modeTag.textContent = appState.dataMode === "live" ? "LIVE" : "DEMO";
      modeTag.classList.toggle("is-live", appState.dataMode === "live");
      setStatus(appState.dataMode === "live" ? "live" : "demo");

      document.getElementById("datasetMeta").textContent =
          `Indian Ocean \u2022 ${appState.metadata.resolution || "resolution unavailable"} \u2022 ${appState.dataMode === "live" ? "LIVE" : "DEMO DATA"}`;

      if (scene3DAvailable) stageLoading.hidden = true;
    }

    function setStatus(mode) {
      statusBadge.classList.remove("is-live", "is-error");
      if (mode === "live") { statusBadge.classList.add("is-live"); statusLabel.textContent = "DATA STREAM \u2014 LIVE"; }
      else if (mode === "demo") { statusLabel.textContent = "DATA STREAM \u2014 DEMO"; }
      else if (mode === "error") { statusBadge.classList.add("is-error"); statusLabel.textContent = "DISCONNECTED"; }
      else { statusLabel.textContent = "CONNECTING\u2026"; }
    }

    function tickClock() {
      lastUpdated.textContent = Utils.formatClock(new Date());
    }

    async function refreshField() {
      try {
        const depths = appState.metadata.depths || Model.DEMO_DEPTHS;
        const depthValue = depths[Utils.clamp(appState.depthIndex, 0, depths.length - 1)];
        const field = await Model.getField(appState.variable, depthValue, appState.timeIndex);
        if (scene3DAvailable) {
          Map3D.updateField(field);
          Map3D.updateDepthGaugeMarker(depthValue);
        }
      } catch (err) {
        console.error("Failed to refresh field", err);
        if (scene3DAvailable) {
          stageError.hidden = false;
          stageLoadingText.textContent = "BACKEND CONNECTION UNAVAILABLE";
        }
        setStatus("error");
      }
    }

    function selectObservation(obs) {
      appState.selectedObservation = obs;
      if (scene3DAvailable) Map3D.highlightObservation(obs);
      Controls.renderObservationPanel(obs, appState.timeIndex);
      refreshSelectedProfile();
    }

    function refreshSelectedProfile() {
      if (!appState.selectedObservation) { Charts.clearProfileChart(); return; }
      const variable = appState.selectedObservation.variables.includes(appState.variable)
          ? appState.variable
          : appState.selectedObservation.variables[0];
      const profile = Observations.profileFor(appState.selectedObservation, variable, appState.timeIndex);
      Charts.updateProfileChart(profile, variable);
    }
  }
})();
