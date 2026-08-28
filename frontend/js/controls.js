/* ============================================================
   OCEANX — controls.js
   Wires DOM controls to appState / Map3D / Charts / Api. Every
   interactive element here does something real — no decorative
   buttons.
   ============================================================ */

const Controls = (() => {

  let els = {};
  let refreshVisualization = null; // injected by app.js
  let onSelectObservation = null;  // injected by app.js

  function cacheEls() {
    const ids = [
      "variableList", "modeList", "layerList", "layerOpacity", "layerOpacityValue",
      "depthSlider", "depthValue", "exagSlider", "exagValue",
      "scaleLinear", "scaleLog", "cbMin", "cbMax", "cbUnits", "cbGradient",
      "zoomIn", "zoomOut", "resetCam", "toggleGrid", "fullscreenBtn", "canvasWrap", "pointPopup",
      "timePrev", "timePlay", "timeNext", "timeSlider", "timeCurrentDate", "timeRange",
      "searchInput", "searchResults", "settingsBtn", "settingsDrawer", "closeSettings",
      "apiBaseInput", "applyApiBase", "datasetMeta",
      "compareBtn", "compareResult", "compareDiff", "compareRmse", "compareNote",
      "retryBtn", "axisReadout"
    ];
    ids.forEach((id) => { els[id] = document.getElementById(id); });
  }

  // ---------------------------------------------------------------
  // VARIABLE + MODE SELECTORS
  // ---------------------------------------------------------------
  function renderVariableList() {
    els.variableList.innerHTML = "";
    Object.values(Model.VARIABLES).forEach((v) => {
      const btn = document.createElement("button");
      btn.className = "option-btn" + (appState.variable === v.id ? " is-active" : "");
      btn.setAttribute("role", "option");
      btn.innerHTML = `<span>${v.label}</span>` + (!v.supportedByBackend ? `<span class="option-btn__tag">DEMO</span>` : "");
      btn.addEventListener("click", () => selectVariable(v.id));
      els.variableList.appendChild(btn);
    });
  }

  function selectVariable(id) {
    appState.variable = id;
    renderVariableList();
    updateColorbar();
    StateBus.emit("variable-changed", id);
  }

  function renderModeList() {
    els.modeList.innerHTML = "";
    Model.VISUALIZATION_MODES.forEach((m) => {
      const btn = document.createElement("button");
      const isActive = appState.visualizationMode === m.id;
      btn.className = "option-btn" + (isActive ? " is-active" : "") + (!m.implemented ? " is-disabled" : "");
      btn.innerHTML = `<span>${m.label}</span>` + (!m.implemented ? `<span class="option-btn__tag">SOON</span>` : "");
      if (m.implemented) btn.addEventListener("click", () => selectMode(m.id));
      els.modeList.appendChild(btn);
    });
  }

  function selectMode(id) {
    appState.visualizationMode = id;
    renderModeList();
    StateBus.emit("mode-changed", id);
  }

  // ---------------------------------------------------------------
  // LAYERS
  // ---------------------------------------------------------------
  function renderLayerList() {
    const labels = { model: "Ocean Model", argo: "Argo Floats", gliders: "Gliders", bathymetry: "Bathymetry", coastline: "Coastline" };
    els.layerList.innerHTML = "";
    Object.keys(appState.layers).forEach((key) => {
      const row = document.createElement("div");
      row.className = "layer-row";
      const on = appState.layers[key];
      row.innerHTML = `<span>${labels[key]}</span><div class="switch ${on ? "is-on" : ""}" data-layer="${key}" role="switch" aria-checked="${on}" tabindex="0"></div>`;
      els.layerList.appendChild(row);
    });
    els.layerList.querySelectorAll(".switch").forEach((sw) => {
      const toggle = () => toggleLayer(sw.dataset.layer, sw);
      sw.addEventListener("click", toggle);
      sw.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    });
  }

  function toggleLayer(key, el) {
    appState.layers[key] = !appState.layers[key];
    el.classList.toggle("is-on", appState.layers[key]);
    el.setAttribute("aria-checked", appState.layers[key]);
    Map3D.setLayerVisible(key, appState.layers[key]);
  }

  function bindLayerOpacity() {
    els.layerOpacity.addEventListener("input", () => {
      const val = Number(els.layerOpacity.value) / 100;
      appState.layerOpacity = val;
      els.layerOpacityValue.textContent = `${els.layerOpacity.value}%`;
      Map3D.setOpacity(val);
    });
  }

  // ---------------------------------------------------------------
  // DEPTH + VERTICAL EXAGGERATION
  // ---------------------------------------------------------------
  function bindDepthControls() {
    els.depthSlider.addEventListener("input", () => {
      appState.depthIndex = Number(els.depthSlider.value);
      updateDepthLabel();
      Map3D.updateDepthGaugeMarker(currentDepthValue());
      StateBus.emit("depth-changed", appState.depthIndex);
    });

    els.exagSlider.addEventListener("input", () => {
      appState.verticalExaggeration = Number(els.exagSlider.value);
      els.exagValue.textContent = `${appState.verticalExaggeration.toFixed(1)}\u00D7`;
      StateBus.emit("exaggeration-changed", appState.verticalExaggeration);
    });
  }

  function currentDepthValue() {
    const depths = (appState.metadata && appState.metadata.depths) || Model.DEMO_DEPTHS;
    return depths[Utils.clamp(appState.depthIndex, 0, depths.length - 1)];
  }

  function updateDepthLabel() {
    els.depthValue.textContent = `${currentDepthValue()} m`;
  }

  function configureDepthSlider() {
    const depths = (appState.metadata && appState.metadata.depths) || Model.DEMO_DEPTHS;
    els.depthSlider.min = 0;
    els.depthSlider.max = depths.length - 1;
    els.depthSlider.value = appState.depthIndex;
    updateDepthLabel();
  }

  // ---------------------------------------------------------------
  // COLOR SCALE / COLORBAR
  // ---------------------------------------------------------------
  function updateColorbar() {
    const def = Model.VARIABLES[appState.variable];
    if (!def) return;
    els.cbMin.textContent = def.min;
    els.cbMax.textContent = def.max;
    els.cbUnits.textContent = def.units;
    els.cbGradient.style.background = Utils.gradientCSS();
    els.scaleLog.disabled = !def.allowLog;
    els.scaleLog.style.opacity = def.allowLog ? 1 : 0.4;
  }

  function bindColorScaleToggle() {
    els.scaleLinear.addEventListener("click", () => setColorScale("linear"));
    els.scaleLog.addEventListener("click", () => {
      if (Model.VARIABLES[appState.variable].allowLog) setColorScale("log");
    });
  }

  function setColorScale(scale) {
    appState.colorScale = scale;
    els.scaleLinear.classList.toggle("is-active", scale === "linear");
    els.scaleLog.classList.toggle("is-active", scale === "log");
    StateBus.emit("colorscale-changed", scale);
  }

  // ---------------------------------------------------------------
  // CAMERA / VIEW CONTROLS
  // ---------------------------------------------------------------
  function bindViewControls() {
    els.zoomIn.addEventListener("click", () => Map3D.zoomIn());
    els.zoomOut.addEventListener("click", () => Map3D.zoomOut());
    els.resetCam.addEventListener("click", () => Map3D.resetCamera());
    els.toggleGrid.addEventListener("click", () => {
      const visible = Map3D.toggleGrid();
      els.toggleGrid.classList.toggle("is-active", visible);
    });
    els.fullscreenBtn.addEventListener("click", () => Map3D.requestFullscreen(els.canvasWrap));
  }

  // ---------------------------------------------------------------
  // TIMELINE
  // ---------------------------------------------------------------
  let playTimer = null;

  function configureTimeline() {
    const times = (appState.metadata && appState.metadata.times) || Model.demoTimes().map(d => d.toISOString());
    els.timeSlider.min = 0;
    els.timeSlider.max = times.length - 1;
    els.timeSlider.value = appState.timeIndex;
    els.timeRange.textContent = `${Utils.formatDateShort(new Date(times[0]))} \u2013 ${Utils.formatDateShort(new Date(times[times.length - 1]))} ${new Date(times[times.length-1]).getUTCFullYear()}`;
    updateTimeLabel();
  }

  function updateTimeLabel() {
    const times = (appState.metadata && appState.metadata.times) || Model.demoTimes().map(d => d.toISOString());
    const t = new Date(times[Utils.clamp(appState.timeIndex, 0, times.length - 1)]);
    els.timeCurrentDate.textContent = Utils.formatDate(t);
  }

  function bindTimeline() {
    els.timeSlider.addEventListener("input", () => {
      appState.timeIndex = Number(els.timeSlider.value);
      updateTimeLabel();
      StateBus.emit("time-changed", appState.timeIndex);
    });
    els.timePrev.addEventListener("click", () => stepTime(-1));
    els.timeNext.addEventListener("click", () => stepTime(1));
    els.timePlay.addEventListener("click", togglePlay);
  }

  function stepTime(delta) {
    const max = Number(els.timeSlider.max);
    appState.timeIndex = ((appState.timeIndex + delta) % (max + 1) + (max + 1)) % (max + 1);
    els.timeSlider.value = appState.timeIndex;
    updateTimeLabel();
    StateBus.emit("time-changed", appState.timeIndex);
  }

  function togglePlay() {
    appState.isPlaying = !appState.isPlaying;
    els.timePlay.innerHTML = appState.isPlaying ? "&#10074;&#10074;" : "&#9654;";
    if (appState.isPlaying) {
      playTimer = setInterval(() => stepTime(1), 900);
    } else {
      clearInterval(playTimer);
    }
  }

  // ---------------------------------------------------------------
  // SEARCH
  // ---------------------------------------------------------------
  function bindSearch(getObservations) {
    const doSearch = Utils.debounce((query) => {
      const q = query.trim().toLowerCase();
      if (!q) { els.searchResults.hidden = true; return; }

      const observations = getObservations();
      const results = [];

      observations.forEach((obs) => {
        const hay = `${obs.id} ${obs.type} ${obs.lat.toFixed(2)} ${obs.lon.toFixed(2)}`.toLowerCase();
        if (hay.includes(q)) results.push({ kind: "observation", obs });
      });

      Object.values(Model.VARIABLES).forEach((v) => {
        if (v.label.toLowerCase().includes(q) || v.id.includes(q)) results.push({ kind: "variable", v });
      });

      if (`incois ocean model hycom dataset`.includes(q)) results.push({ kind: "dataset" });

      renderSearchResults(results.slice(0, 8));
    }, 180);

    els.searchInput.addEventListener("input", (e) => doSearch(e.target.value));
    els.searchInput.addEventListener("focus", () => { if (els.searchResults.innerHTML) els.searchResults.hidden = false; });
    document.addEventListener("click", (e) => {
      if (!els.searchResults.contains(e.target) && e.target !== els.searchInput) els.searchResults.hidden = true;
    });
  }

  function renderSearchResults(results) {
    if (!results.length) {
      els.searchResults.innerHTML = `<div class="search-result__empty">No matches</div>`;
      els.searchResults.hidden = false;
      return;
    }
    els.searchResults.innerHTML = "";
    results.forEach((r) => {
      const row = document.createElement("div");
      row.className = "search-result";
      if (r.kind === "observation") {
        row.innerHTML = `<span class="search-result__name">${r.obs.label} ${r.obs.id}</span><span class="search-result__meta">${r.obs.lat.toFixed(1)}, ${r.obs.lon.toFixed(1)}</span>`;
        row.addEventListener("click", () => { onSelectObservation?.(r.obs); els.searchResults.hidden = true; els.searchInput.value = ""; });
      } else if (r.kind === "variable") {
        row.innerHTML = `<span class="search-result__name">${r.v.label}</span><span class="search-result__meta">variable</span>`;
        row.addEventListener("click", () => { selectVariable(r.v.id); els.searchResults.hidden = true; els.searchInput.value = ""; });
      } else {
        row.innerHTML = `<span class="search-result__name">INCOIS Ocean Model</span><span class="search-result__meta">dataset</span>`;
        row.addEventListener("click", () => { els.searchResults.hidden = true; els.searchInput.value = ""; });
      }
      els.searchResults.appendChild(row);
    });
    els.searchResults.hidden = false;
  }

  // ---------------------------------------------------------------
  // SETTINGS DRAWER
  // ---------------------------------------------------------------
  function bindSettings(onReconnect) {
    els.settingsBtn.addEventListener("click", () => {
      els.apiBaseInput.value = Api.getBaseUrl();
      els.settingsDrawer.hidden = false;
    });
    els.closeSettings.addEventListener("click", () => { els.settingsDrawer.hidden = true; });
    els.applyApiBase.addEventListener("click", () => {
      Api.setBaseUrl(els.apiBaseInput.value.trim() || Api.getBaseUrl());
      els.settingsDrawer.hidden = true;
      onReconnect?.();
    });
  }

  // ---------------------------------------------------------------
  // TOP NAV PANELS (Observations / Analysis / Datasets / Alerts)
  // ---------------------------------------------------------------
  function bindTopNav() {
    document.querySelectorAll(".topnav__item").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".topnav__item").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        const panel = btn.dataset.panel;
        if (panel === "observations") {
          closeOverlayPanels();
        } else {
          openOverlayPanel(`panel-${panel}`);
        }
      });
    });
    document.querySelectorAll(".panel-close").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById(btn.dataset.close).hidden = true;
        document.querySelector('.topnav__item[data-panel="observations"]').classList.add("is-active");
        document.querySelectorAll(".topnav__item").forEach(b => {
          if (b.dataset.panel !== "observations") b.classList.remove("is-active");
        });
      });
    });
  }

  function openOverlayPanel(id) {
    closeOverlayPanels();
    document.getElementById(id).hidden = false;
  }
  function closeOverlayPanels() {
    ["panel-datasets", "panel-analysis", "panel-alerts"].forEach(id => { document.getElementById(id).hidden = true; });
  }

  // ---------------------------------------------------------------
  // OBSERVATION PANEL RENDER
  // ---------------------------------------------------------------
  function renderObservationPanel(observation, timeIndex) {
    const noSel = document.getElementById("noSelection");
    const detail = document.getElementById("obsDetail");
    if (!observation) {
      noSel.hidden = false;
      detail.hidden = true;
      return;
    }
    noSel.hidden = true;
    detail.hidden = false;

    document.getElementById("obsType").textContent = observation.label;
    document.getElementById("obsId").textContent = observation.id;
    const statusEl = document.getElementById("obsStatus");
    statusEl.textContent = observation.status;
    statusEl.className = "badge " + (observation.status === "ACTIVE" ? "badge--active" : "badge--inactive");

    document.getElementById("obsLat").textContent = `${observation.lat.toFixed(2)}\u00B0`;
    document.getElementById("obsLon").textContent = `${observation.lon.toFixed(2)}\u00B0`;
    document.getElementById("obsTime").textContent = Utils.formatDateShort(observation.lastObservation) + " " + observation.lastObservation.toISOString().slice(11,16) + "Z";
    document.getElementById("obsMaxDepth").textContent = `${observation.maxDepth} m`;

    const varsWrap = document.getElementById("obsVariables");
    varsWrap.innerHTML = "";
    observation.variables.forEach((v) => {
      const def = Model.VARIABLES[v];
      const chip = document.createElement("span");
      chip.className = "chip" + (def && !def.supportedByBackend ? " chip--demo" : "");
      chip.textContent = def ? def.label : v;
      varsWrap.appendChild(chip);
    });

    els.compareResult.hidden = true;
    document.getElementById("profileTitle").textContent =
        `VERTICAL ${(Model.VARIABLES[appState.variable]?.label || "").toUpperCase()} PROFILE`;
  }

  function bindCompareButton(getSelected) {
    els.compareBtn.addEventListener("click", () => {
      const obs = getSelected();
      if (!obs) return;
      const result = Observations.compareWithModel(obs, appState.variable, appState.timeIndex);
      els.compareResult.hidden = false;
      if (result.available) {
        const sign = result.diff >= 0 ? "+" : "";
        els.compareDiff.textContent = `${sign}${result.diff.toFixed(2)} ${result.units}`;
        els.compareRmse.textContent = `${result.rmse.toFixed(2)} ${result.units}`;
      } else {
        els.compareDiff.textContent = "Comparison unavailable";
        els.compareRmse.textContent = "\u2014";
      }
      els.compareNote.textContent = result.note || "";
    });
  }

  // ---------------------------------------------------------------
  // DATASET / ANALYSIS / ALERTS PANEL CONTENT
  // ---------------------------------------------------------------
  function renderDatasetsPanel() {
    const meta = appState.metadata || Model.demoMetadata();
    const depths = meta.depths || Model.DEMO_DEPTHS;
    const times = meta.times || Model.demoTimes().map(d => d.toISOString());
    const rows = [
      ["Dataset name", "INCOIS Ocean Model (HYCOM)"],
      ["Description", "Regional HYCOM ocean forecast fields (temperature, salinity, currents) for the Indian Ocean, processed by the MoES/SIH26067 backend."],
      ["Source", "Ministry of Earth Sciences &mdash; INCOIS / SIH26067 HYCOM processing pipeline"],
      ["Variables", Object.values(Model.VARIABLES).map(v => v.label + (v.supportedByBackend ? "" : " (demo)")).join(", ")],
      ["Spatial resolution", meta.resolution || "\u2014"],
      ["Temporal resolution", "6-hourly"],
      ["Date range", `${Utils.formatDateShort(new Date(times[0]))} \u2013 ${Utils.formatDateShort(new Date(times[times.length-1]))} ${new Date(times[times.length-1]).getUTCFullYear()}`],
      ["Depth range", `${depths[0]} \u2013 ${depths[depths.length-1]} m (${depths.length} levels)`],
      ["Format", "NetCDF (source) &middot; JSON (API)"],
      ["Last updated", new Date().toUTCString()],
      ["Data mode", appState.dataMode === "live" ? "LIVE" : "DEMO &mdash; no deployed backend endpoint yet"]
    ];
    const table = document.createElement("table");
    table.className = "dataset-table";
    table.innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("");
    const body = document.getElementById("datasetsBody");
    body.innerHTML = "";
    body.appendChild(table);
  }

  function populateAnalysisSelectors() {
    const varSel = document.getElementById("analysisVariable");
    varSel.innerHTML = Object.values(Model.VARIABLES).map(v => `<option value="${v.id}">${v.label}${v.supportedByBackend ? "" : " (demo)"}</option>`).join("");

    const depthSel = document.getElementById("analysisDepth");
    const depths = (appState.metadata && appState.metadata.depths) || Model.DEMO_DEPTHS;
    depthSel.innerHTML = depths.map((d, i) => `<option value="${i}">${d} m</option>`).join("");

    const timeSel = document.getElementById("analysisTime");
    const times = (appState.metadata && appState.metadata.times) || Model.demoTimes().map(d => d.toISOString());
    timeSel.innerHTML = times.map((t, i) => `<option value="${i}">${Utils.formatDate(new Date(t))}</option>`).join("");

    document.getElementById("analysisLocation").value = "12.0, 70.0";
  }

  function bindAnalysisRun() {
    document.getElementById("runAnalysis").addEventListener("click", async () => {
      const variable = document.getElementById("analysisVariable").value;
      const depthIdx = Number(document.getElementById("analysisDepth").value);
      const timeIdx = Number(document.getElementById("analysisTime").value);
      const depths = (appState.metadata && appState.metadata.depths) || Model.DEMO_DEPTHS;
      const depth = depths[depthIdx];
      const [latStr, lonStr] = document.getElementById("analysisLocation").value.split(",").map(s => s.trim());
      const lat = Number(latStr), lon = Number(lonStr);

      const field = await Model.getField(variable, depth, timeIdx);
      let values = [];
      if (variable === "currents" && field.u) {
        field.u.forEach((row, iy) => row.forEach((u, ix) => values.push(Math.sqrt(u * u + field.v[iy][ix] ** 2))));
      } else if (field.values) {
        field.values.forEach(row => row.forEach(v => values.push(v)));
      }
      const n = values.length;
      const mean = values.reduce((a, b) => a + b, 0) / n;
      const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
      const min = Math.min(...values), max = Math.max(...values);

      let diffText = "\u2014";
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
        const localVal = variable === "currents"
            ? Model.demoCurrentAt(lat, lon, depth, timeIdx).speed
            : Model.demoValueAt(variable, lat, lon, depth, timeIdx);
        diffText = `${localVal.toFixed(2)} ${Model.VARIABLES[variable].units}`;
      }

      const def = Model.VARIABLES[variable];
      document.getElementById("analysisResults").innerHTML = `
        <div class="stat-card"><span>Min</span><strong>${min.toFixed(2)} ${def.units}</strong></div>
        <div class="stat-card"><span>Max</span><strong>${max.toFixed(2)} ${def.units}</strong></div>
        <div class="stat-card"><span>Mean</span><strong>${mean.toFixed(2)} ${def.units}</strong></div>
        <div class="stat-card"><span>Std deviation</span><strong>${std.toFixed(2)} ${def.units}</strong></div>
        <div class="stat-card"><span>Sample count</span><strong>${n}</strong></div>
        <div class="stat-card"><span>Value at location</span><strong>${diffText}</strong></div>`;

      const profilePoints = depths.map((d) => ({
        depth: d,
        value: variable === "currents"
            ? Model.demoCurrentAt(lat || 12, lon || 70, d, timeIdx).speed
            : Model.demoValueAt(variable, lat || 12, lon || 70, d, timeIdx)
      }));
      Charts.updateAnalysisChart(profilePoints, variable);
    });
  }

  function renderAlertsPanel() {
    const body = document.getElementById("alertsBody");
    const demoAlerts = [
      { sev: "WARNING", title: "Temperature anomaly detected", desc: "Model surface temperature exceeds the 7-day mean by 1.4\u00B0C near 14\u00B0N, 72\u00B0E.", meta: "Arabian Sea \u00B7 depth 0 m" },
      { sev: "CRITICAL", title: "Model-observation discrepancy", desc: "Argo float 59012 reports salinity 0.8 PSU below model estimate at 100 m.", meta: "Float 59012 \u00B7 100 m" },
      { sev: "INFO", title: "Missing observation window", desc: "No glider report received for SG-217 in the last 24 hours.", meta: "Glider SG-217" },
      { sev: "WARNING", title: "Strong current identified", desc: "Surface current speed above 1.2 m/s along the west coast boundary current.", meta: "10\u00B0N, 75\u00B0E \u00B7 surface" },
      { sev: "INFO", title: "Salinity anomaly", desc: "Localized freshening detected near the Bay of Bengal river outflow region.", meta: "18\u00B0N, 88\u00B0E \u00B7 50 m" }
    ];
    body.innerHTML = `<div class="alerts-banner">These alerts are illustrative DEMO DATA \u2014 the current backend does not yet compute live anomaly detection.</div>`;
    demoAlerts.forEach((a) => {
      const row = document.createElement("div");
      row.className = "alert-row";
      row.innerHTML = `
        <div class="alert-sev alert-sev--${a.sev}">${a.sev}</div>
        <div>
          <div class="alert-body__title">${a.title}</div>
          <div class="alert-body__desc">${a.desc}</div>
          <div class="alert-body__meta">${a.meta}</div>
        </div>`;
      body.appendChild(row);
    });
  }

  // ---------------------------------------------------------------
  // POINT INSPECTOR (click anywhere on the ocean surface)
  // ---------------------------------------------------------------
  let lastPoint = null;

  function renderPointPopupContent() {
    if (!lastPoint) return;
    const sample = Map3D.sampleFieldAt(lastPoint.lat, lastPoint.lon);
    const def = Model.VARIABLES[appState.variable];

    document.getElementById("ppLat").textContent = `${lastPoint.lat.toFixed(2)}\u00B0`;
    document.getElementById("ppLon").textContent = `${lastPoint.lon.toFixed(2)}\u00B0`;
    document.getElementById("ppVarLabel").textContent = def ? def.label : appState.variable;
    document.getElementById("ppValue").textContent = (sample && sample.value !== null && sample.value !== undefined)
        ? `${sample.value.toFixed(2)} ${def ? def.units : ""}`
        : "No data at this depth/time";

    const depths = (appState.metadata && appState.metadata.depths) || Model.DEMO_DEPTHS;
    const depthValue = depths[Utils.clamp(appState.depthIndex, 0, depths.length - 1)];
    document.getElementById("ppDepth").textContent = `${depthValue} m`;

    const times = (appState.metadata && appState.metadata.times) || Model.demoTimes().map(d => d.toISOString());
    const t = new Date(times[Utils.clamp(appState.timeIndex, 0, times.length - 1)]);
    document.getElementById("ppTime").textContent = Utils.formatDate(t);

    const noteEl = document.getElementById("ppNote");
    if (def && !def.supportedByBackend) {
      noteEl.textContent = "DEMO DATA \u2014 this variable is not present in the current backend dataset.";
    } else if (appState.dataMode !== "live") {
      noteEl.textContent = "DEMO DATA \u2014 no live backend connected.";
    } else {
      noteEl.textContent = "";
    }
  }

  function positionPointPopup(clientX, clientY) {
    const wrap = els.canvasWrap;
    const popup = els.pointPopup;
    const rect = wrap.getBoundingClientRect();
    let x = clientX - rect.left + 14;
    let y = clientY - rect.top + 14;
    const maxX = rect.width - popup.offsetWidth - 8;
    const maxY = rect.height - popup.offsetHeight - 8;
    x = Utils.clamp(x, 8, Math.max(8, maxX));
    y = Utils.clamp(y, 8, Math.max(8, maxY));
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
  }

  function showPointPopup({ lat, lon, clientX, clientY }) {
    lastPoint = { lat, lon };
    els.pointPopup.hidden = false;
    renderPointPopupContent();
    positionPointPopup(clientX, clientY);
  }

  function hidePointPopup() {
    if (els.pointPopup) els.pointPopup.hidden = true;
  }

  function refreshPointPopupIfOpen() {
    if (!els.pointPopup || els.pointPopup.hidden || !lastPoint) return;
    renderPointPopupContent();
  }

  function bindPointPopup() {
    document.getElementById("closePointPopup").addEventListener("click", hidePointPopup);
  }

  // ---------------------------------------------------------------
  // BOOTSTRAP
  // ---------------------------------------------------------------
  function init(hooks) {
    cacheEls();
    onSelectObservation = hooks.onSelectObservation;

    renderVariableList();
    renderModeList();
    renderLayerList();
    bindLayerOpacity();
    bindDepthControls();
    updateColorbar();
    bindColorScaleToggle();
    bindViewControls();
    bindTimeline();
    bindSearch(hooks.getObservations);
    bindSettings(hooks.onReconnect);
    bindTopNav();
    bindCompareButton(hooks.getSelected);
    bindAnalysisRun();
    bindPointPopup();

    els.retryBtn.addEventListener("click", () => hooks.onRetry?.());
  }

  return {
    init, configureDepthSlider, configureTimeline, renderObservationPanel,
    renderDatasetsPanel, populateAnalysisSelectors, renderAlertsPanel,
    updateColorbar, showPointPopup, hidePointPopup, refreshPointPopupIfOpen,
    els: () => els
  };
})();
