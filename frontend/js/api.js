/* ============================================================
   OCEANX — api.js
   Single source of truth for backend communication.

   IMPORTANT — backend status:
   The MoES/SIH26067 repository (backend/model_processor.py) currently
   ships a Python class, HYCOMModel, that reads a local HYCOM NetCDF
   file (RSMC_hycom_20260824.nc: variables TEMP, SALN, UVEL, VVEL over
   6 depth levels and 28 six-hourly timesteps) and exposes methods
   such as metadata(), temperature_to_dict(), salinity_to_dict() and
   currents_to_dict(). There is currently no HTTP/REST server wrapping
   that class, so no live endpoint exists to call from a browser.

   This module still defines the REST surface that a thin server
   around HYCOMModel would expose, in the exact response shape that
   HYCOMModel already produces. Every call attempts the real endpoint
   first; if it is unreachable (which it always is today), the caller
   is responsible for falling back to the deterministic demo layer in
   model.js / observations.js — never invented "real" numbers.
   ============================================================ */

const Api = (() => {

  // Change this in Settings to point at a deployed instance of the
  // MoES/SIH26067 backend once one exists.
  let API_BASE_URL = "http://localhost:8000/api";

  function setBaseUrl(url) {
    API_BASE_URL = url.replace(/\/+$/, "");
  }

  function getBaseUrl() {
    return API_BASE_URL;
  }

  async function fetchJSON(path, { params = {}, timeoutMs = 4000 } = {}) {
    const url = new URL(`${API_BASE_URL}${path}`, window.location.href.startsWith("file:") ? "http://placeholder" : undefined);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url.toString(), { signal: controller.signal });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${path}`);
      }

      const data = await response.json();
      if (!data || typeof data !== "object") {
        throw new Error(`Malformed response from ${path}`);
      }
      return data;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  /** GET /api/health — lightweight reachability probe. */
  async function checkBackendHealth() {
    return fetchJSON("/health", { timeoutMs: 2500 });
  }

  /** GET /api/metadata — maps to HYCOMModel.metadata() */
  async function getModelMetadata() {
    return fetchJSON("/metadata");
  }

  /** GET /api/depths — the DEPTH coordinate array from the dataset. */
  async function getDepthLevels() {
    return fetchJSON("/depths");
  }

  /**
   * GET /api/model/{variable} — maps to HYCOMModel.*_to_dict()
   * variable: "temperature" | "salinity" | "currents"
   */
  async function getModelData(variable, params = {}) {
    const supported = { temperature: "temperature", salinity: "salinity", currents: "currents" };
    const endpointVar = supported[variable];
    if (!endpointVar) {
      throw new Error(`Backend does not currently expose "${variable}"`);
    }
    return fetchJSON(`/model/${endpointVar}`, { params });
  }

  /** GET /api/variables — list of variables exposed by the current model file. */
  async function getAvailableVariables() {
    return fetchJSON("/variables");
  }

  /** GET /api/observations — Argo float + glider records. Not yet implemented server-side. */
  async function getObservationData(params = {}) {
    return fetchJSON("/observations", { params });
  }

  /** GET /api/observations/{id}/profile — depth profile for one instrument. */
  async function getProfileData(observationId, variable) {
    return fetchJSON(`/observations/${observationId}/profile`, { params: { variable } });
  }

  return {
    setBaseUrl, getBaseUrl,
    checkBackendHealth,
    getModelMetadata,
    getDepthLevels,
    getModelData,
    getAvailableVariables,
    getObservationData,
    getProfileData
  };
})();
