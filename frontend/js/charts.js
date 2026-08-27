/* ============================================================
   OCEANX — charts.js
   Vertical profile chart (Chart.js): depth on the y-axis (inverted,
   surface at top), variable value on the x-axis, MODEL vs OBSERVED.
   Also drives the small Analysis-panel chart.
   ============================================================ */

const Charts = (() => {

  let profileChart = null;
  let analysisChart = null;

  function baseOptions(xLabel) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0b1826",
          borderColor: "#12344d",
          borderWidth: 1,
          titleColor: "#d8edf7",
          bodyColor: "#d8edf7",
          padding: 10
        }
      },
      scales: {
        x: {
          title: { display: true, text: xLabel, color: "#7895a8", font: { size: 10.5 } },
          ticks: { color: "#7895a8", font: { size: 10 } },
          grid: { color: "#0d2436" }
        },
        y: {
          reverse: true,
          title: { display: true, text: "Depth (m)", color: "#7895a8", font: { size: 10.5 } },
          ticks: { color: "#7895a8", font: { size: 10 } },
          grid: { color: "#0d2436" }
        }
      }
    };
  }

  function initProfileChart(canvas) {
    profileChart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "MODEL",
            data: [],
            borderColor: "#19d8ff",
            backgroundColor: "rgba(25,216,255,0.08)",
            pointRadius: 3,
            pointBackgroundColor: "#19d8ff",
            tension: 0.25,
            parsing: false
          },
          {
            label: "OBSERVED",
            data: [],
            borderColor: "#14d9a2",
            backgroundColor: "rgba(20,217,162,0.08)",
            pointRadius: 3,
            pointBackgroundColor: "#14d9a2",
            borderDash: [4, 3],
            tension: 0.25,
            parsing: false
          }
        ]
      },
      options: baseOptions("Value")
    });
    return profileChart;
  }

  function updateProfileChart(profile, variable) {
    if (!profileChart) return;
    const def = Model.VARIABLES[variable];
    profileChart.data.datasets[0].data = profile.model.map(p => ({ x: p.value, y: p.depth }));
    profileChart.data.datasets[1].data = profile.observed.map(p => ({ x: p.value, y: p.depth }));
    profileChart.options.scales.x.title.text = def ? `${def.label} (${def.units})` : "Value";
    profileChart.update();
  }

  function clearProfileChart() {
    if (!profileChart) return;
    profileChart.data.datasets[0].data = [];
    profileChart.data.datasets[1].data = [];
    profileChart.update();
  }

  function initAnalysisChart(canvas) {
    analysisChart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: { labels: [], datasets: [{
          label: "Value",
          data: [],
          borderColor: "#19d8ff",
          backgroundColor: "rgba(25,216,255,0.08)",
          pointRadius: 3,
          pointBackgroundColor: "#19d8ff",
          tension: 0.25,
          parsing: false
        }] },
      options: baseOptions("Value")
    });
    return analysisChart;
  }

  function updateAnalysisChart(points, variable) {
    if (!analysisChart) return;
    const def = Model.VARIABLES[variable];
    analysisChart.data.datasets[0].data = points.map(p => ({ x: p.value, y: p.depth }));
    analysisChart.options.scales.x.title.text = def ? `${def.label} (${def.units})` : "Value";
    analysisChart.update();
  }

  return { initProfileChart, updateProfileChart, clearProfileChart, initAnalysisChart, updateAnalysisChart };
})();
