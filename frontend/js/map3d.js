/* ============================================================
   OCEANX — map3d.js
   Three.js scene: geo-referenced ocean field surface, schematic
   coastline, lat/lon graticule, depth gauge, and Argo/Glider
   observation markers. Geometry/material are updated in place when
   variable/depth/time change rather than rebuilding the scene.
   ============================================================ */

const Map3D = (() => {

  let scene, camera, renderer, controls, canvas;
  let fieldMesh, fieldGeometry;
  let coastlineGroup, gridGroup, depthGaugeGroup, vectorGroup;
  let markerGroup;
  let raycaster, pointerVec;
  let markerMeshes = []; // { mesh, observation }
  let animId = null;
  let currentField = null;
  let onMarkerClick = null;
  let onSurfaceClick = null;

  const SCALE = 1; // 1 degree of lat/lon == 1 world unit
  const RELIEF_BASE = 2.6; // base height (world units) for field relief

  function lonToX(lon) { return (lon - 70) * SCALE; }     // centered near 70E
  function latToZ(lat) { return -(lat - 7) * SCALE; }     // centered near 7N, +Z toward equator flipped
  function xToLon(x) { return x / SCALE + 70; }
  function zToLat(z) { return -z / SCALE + 7; }

  function init(canvasEl) {
    canvas = canvasEl;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020608);
    scene.fog = new THREE.FogExp2(0x020608, 0.011);

    const wrap = canvas.parentElement;
    camera = new THREE.PerspectiveCamera(45, wrap.clientWidth / wrap.clientHeight, 0.1, 1000);
    setDefaultCamera();

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(wrap.clientWidth, wrap.clientHeight);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 8;
    controls.maxDistance = 120;
    controls.maxPolarAngle = Math.PI * 0.49;

    scene.add(new THREE.AmbientLight(0x88aabb, 0.9));
    const dir = new THREE.DirectionalLight(0x9fdcff, 0.6);
    dir.position.set(20, 40, 10);
    scene.add(dir);

    buildField();
    buildGrid();
    buildCoastline();
    buildDepthGauge();
    markerGroup = new THREE.Group();
    scene.add(markerGroup);
    vectorGroup = new THREE.Group();
    scene.add(vectorGroup);

    raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.6 };
    pointerVec = new THREE.Vector2();

    renderer.domElement.addEventListener("click", handleClick);
    window.addEventListener("resize", handleResize);

    animate();
  }

  function setDefaultCamera() {
    camera.position.set(26, 30, 42);
    camera.lookAt(0, 0, 0);
  }

  function handleResize() {
    const wrap = canvas.parentElement;
    if (!wrap) return;
    camera.aspect = wrap.clientWidth / wrap.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  }

  // ---------------------------------------------------------------
  // FIELD SURFACE
  // ---------------------------------------------------------------
  function buildField() {
    const { nLat, nLon } = Model.DEMO_GRID;
    const width = (Model.DEMO_BOUNDS.lonMax - Model.DEMO_BOUNDS.lonMin) * SCALE;
    const depthExtent = (Model.DEMO_BOUNDS.latMax - Model.DEMO_BOUNDS.latMin) * SCALE;

    fieldGeometry = new THREE.PlaneGeometry(width, depthExtent, nLon - 1, nLat - 1);
    fieldGeometry.rotateX(-Math.PI / 2);

    const colors = new Float32Array(fieldGeometry.attributes.position.count * 3);
    fieldGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: appState.layerOpacity
    });

    fieldMesh = new THREE.Mesh(fieldGeometry, material);
    fieldMesh.name = "oceanField";
    scene.add(fieldMesh);

    const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(fieldGeometry),
        new THREE.LineBasicMaterial({ color: 0x0c3a52, transparent: true, opacity: 0.25 })
    );
    wire.name = "fieldWire";
    scene.add(wire);
  }

  function updateField(fieldData) {
    if (!fieldData || !fieldMesh) return;
    currentField = fieldData;
    const { nLat, nLon } = Model.DEMO_GRID;
    const pos = fieldGeometry.attributes.position;
    const col = fieldGeometry.attributes.color;
    const variable = appState.variable;
    const exag = appState.verticalExaggeration;

    let idx = 0;
    for (let iy = 0; iy < nLat; iy++) {
      for (let ix = 0; ix < nLon; ix++) {
        let value, rgb;
        if (variable === "currents" && fieldData.u) {
          const u = fieldData.u[iy][ix], v = fieldData.v[iy][ix];
          value = Math.sqrt(u * u + v * v);
          rgb = Model.colorRGBFor("currents", value);
        } else if (fieldData.values) {
          value = fieldData.values[iy][ix];
          rgb = Model.colorRGBFor(variable, value);
        } else {
          value = 0; rgb = [0.05, 0.1, 0.15];
        }

        const height = Utils.clamp((value === null ? 0 : value), -10, 10);
        const normalized = Model.VARIABLES[variable]
            ? Utils.invLerp(Model.VARIABLES[variable].min, Model.VARIABLES[variable].max, value)
            : 0.5;
        pos.setY(idx, (normalized - 0.4) * RELIEF_BASE * exag * 0.5);
        col.setXYZ(idx, rgb[0], rgb[1], rgb[2]);
        idx++;
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    fieldGeometry.computeVertexNormals();

    const wire = scene.getObjectByName("fieldWire");
    if (wire) wire.geometry.dispose(), wire.geometry = new THREE.WireframeGeometry(fieldGeometry);

    if (variable === "currents") {
      buildVectorField(fieldData);
      vectorGroup.visible = true;
    } else {
      vectorGroup.visible = false;
    }
  }

  function buildVectorField(fieldData) {
    vectorGroup.clear();
    if (!fieldData.u) return;
    const { lats, lons } = Model.demoLatLon();
    const step = 3; // sample sparsely for legible arrows
    const arrowMat = new THREE.LineBasicMaterial({ color: 0x19d8ff });

    for (let iy = 0; iy < lats.length; iy += step) {
      for (let ix = 0; ix < lons.length; ix += step) {
        const u = fieldData.u[iy][ix], v = fieldData.v[iy][ix];
        const speed = Math.sqrt(u * u + v * v);
        if (speed < 0.02) continue;
        const x = lonToX(lons[ix]), z = latToZ(lats[iy]);
        const y = 0.15;
        const len = Utils.clamp(speed * 1.8, 0.2, 1.4);
        const dir = new THREE.Vector3(u, 0, -v).normalize();
        const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(x, y, z), len, 0x19d8ff, len * 0.35, len * 0.18);
        vectorGroup.add(arrow);
      }
    }
  }

  function setOpacity(opacity) {
    if (fieldMesh) fieldMesh.material.opacity = opacity;
  }

  function setLayerVisible(layer, visible) {
    if (layer === "model" && fieldMesh) {
      fieldMesh.visible = visible;
      const wire = scene.getObjectByName("fieldWire");
      if (wire) wire.visible = visible;
    }
    if (layer === "coastline" && coastlineGroup) coastlineGroup.visible = visible;
    if (layer === "argo" || layer === "gliders") refreshMarkerVisibility();
    if (layer === "bathymetry" && depthGaugeGroup) depthGaugeGroup.visible = visible;
  }

  // ---------------------------------------------------------------
  // GRID (lat/lon graticule)
  // ---------------------------------------------------------------
  function buildGrid() {
    gridGroup = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: 0x123449, transparent: true, opacity: 0.6 });
    const { latMin, latMax, lonMin, lonMax } = Model.DEMO_BOUNDS;

    for (let lat = Math.ceil(latMin / 5) * 5; lat <= latMax; lat += 5) {
      const points = [
        new THREE.Vector3(lonToX(lonMin), 0.02, latToZ(lat)),
        new THREE.Vector3(lonToX(lonMax), 0.02, latToZ(lat))
      ];
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat));
    }
    for (let lon = Math.ceil(lonMin / 5) * 5; lon <= lonMax; lon += 5) {
      const points = [
        new THREE.Vector3(lonToX(lon), 0.02, latToZ(latMin)),
        new THREE.Vector3(lonToX(lon), 0.02, latToZ(latMax))
      ];
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat));
    }
    scene.add(gridGroup);
  }

  function setGridVisible(v) { if (gridGroup) gridGroup.visible = v; }

  // ---------------------------------------------------------------
  // SCHEMATIC COASTLINE (illustrative, not survey-accurate)
  // ---------------------------------------------------------------
  const INDIA_COAST = [
    [23.5, 68.4], [21.6, 69.6], [20.0, 70.8], [18.9, 72.8], [15.5, 73.8],
    [12.9, 74.8], [10.0, 76.2], [8.1, 77.5], [8.9, 78.2], [10.3, 79.8],
    [13.1, 80.3], [16.5, 82.2], [19.0, 84.8], [20.3, 86.7], [21.6, 88.0]
  ];
  const SRI_LANKA = [
    [9.8, 80.1], [8.5, 81.0], [6.9, 81.5], [6.0, 80.4], [7.2, 79.7], [9.0, 79.8], [9.8, 80.1]
  ];

  function polylineFromCoords(coords, color) {
    const points = coords.map(([lat, lon]) => new THREE.Vector3(lonToX(lon), 0.06, latToZ(lat)));
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
  }

  function buildCoastline() {
    coastlineGroup = new THREE.Group();
    coastlineGroup.add(polylineFromCoords(INDIA_COAST, 0x7fb8cc));
    coastlineGroup.add(polylineFromCoords(SRI_LANKA, 0x7fb8cc));
    scene.add(coastlineGroup);
  }

  // ---------------------------------------------------------------
  // DEPTH GAUGE (shows selected depth level in the water column)
  // ---------------------------------------------------------------
  function buildDepthGauge() {
    depthGaugeGroup = new THREE.Group();
    depthGaugeGroup.visible = false; // tied to "bathymetry" layer toggle
    const x = lonToX(Model.DEMO_BOUNDS.lonMin) - 2;
    const z = latToZ(Model.DEMO_BOUNDS.latMin) - 2;
    const maxDepth = Model.DEMO_DEPTHS[Model.DEMO_DEPTHS.length - 1];

    Model.DEMO_DEPTHS.forEach((d) => {
      const y = -Utils.invLerp(0, maxDepth, d) * 6;
      const geo = new THREE.RingGeometry(0.18, 0.24, 16);
      geo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x3a6f85 }));
      ring.position.set(x, y, z);
      depthGaugeGroup.add(ring);
    });
    scene.add(depthGaugeGroup);
  }

  function updateDepthGaugeMarker(depthValue) {
    if (!depthGaugeGroup) return;
    let marker = depthGaugeGroup.getObjectByName("marker");
    if (!marker) {
      const geo = new THREE.SphereGeometry(0.32, 12, 12);
      marker = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x19d8ff }));
      marker.name = "marker";
      depthGaugeGroup.add(marker);
    }
    const x = lonToX(Model.DEMO_BOUNDS.lonMin) - 2;
    const z = latToZ(Model.DEMO_BOUNDS.latMin) - 2;
    const maxDepth = Model.DEMO_DEPTHS[Model.DEMO_DEPTHS.length - 1];
    const y = -Utils.invLerp(0, maxDepth, depthValue) * 6;
    marker.position.set(x, y, z);
  }

  // ---------------------------------------------------------------
  // OBSERVATION MARKERS
  // ---------------------------------------------------------------
  function setMarkers(observations) {
    markerGroup.clear();
    markerMeshes = [];

    observations.forEach((obs) => {
      const x = lonToX(obs.lon), z = latToZ(obs.lat);
      let mesh;
      if (obs.type === "argo") {
        const geo = new THREE.SphereGeometry(0.28, 16, 16);
        const mat = new THREE.MeshBasicMaterial({ color: 0x19d8ff });
        mesh = new THREE.Mesh(geo, mat);
      } else {
        const geo = new THREE.OctahedronGeometry(0.34, 0);
        const mat = new THREE.MeshBasicMaterial({ color: 0x14d9a2 });
        mesh = new THREE.Mesh(geo, mat);
      }
      mesh.position.set(x, 0.4, z);
      mesh.userData.observation = obs;
      markerGroup.add(mesh);

      const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6),
          new THREE.MeshBasicMaterial({ color: obs.type === "argo" ? 0x19d8ff : 0x14d9a2, transparent: true, opacity: 0.5 })
      );
      beam.position.set(x, 0.0, z);
      markerGroup.add(beam);

      markerMeshes.push({ mesh, observation: obs });
    });
    refreshMarkerVisibility();
  }

  function refreshMarkerVisibility() {
    markerMeshes.forEach(({ mesh, observation }) => {
      const layerOn = observation.type === "argo" ? appState.layers.argo : appState.layers.gliders;
      mesh.visible = layerOn;
    });
  }

  function highlightObservation(observation) {
    markerMeshes.forEach(({ mesh, observation: o }) => {
      const isSel = observation && o.id === observation.id;
      mesh.scale.setScalar(isSel ? 1.6 : 1);
      mesh.material.color.set(isSel ? 0xffffff : (o.type === "argo" ? 0x19d8ff : 0x14d9a2));
    });
    if (observation) {
      const x = lonToX(observation.lon), z = latToZ(observation.lat);
      const targetPos = new THREE.Vector3(x, 0, z);
      animateCameraTo(targetPos);
    }
  }

  function animateCameraTo(target) {
    const start = controls.target.clone();
    const camStart = camera.position.clone();
    const camTarget = new THREE.Vector3(target.x + 10, camStart.y * 0.7 + 6, target.z + 12);
    const duration = 700;
    const t0 = performance.now();
    function step(now) {
      const t = Utils.clamp((now - t0) / duration, 0, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      controls.target.lerpVectors(start, target, ease);
      camera.position.lerpVectors(camStart, camTarget, ease);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------
  // INTERACTION
  // ---------------------------------------------------------------
  function handleClick(evt) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerVec.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    pointerVec.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerVec, camera);

    const markerHits = raycaster.intersectObjects(markerMeshes.map(m => m.mesh));
    if (markerHits.length) {
      const obs = markerHits[0].object.userData.observation;
      if (onMarkerClick) onMarkerClick(obs);
      return;
    }

    if (fieldMesh) {
      const hits = raycaster.intersectObject(fieldMesh);
      if (hits.length && onSurfaceClick) {
        const p = hits[0].point;
        onSurfaceClick({ lat: zToLat(p.z), lon: xToLon(p.x) });
      }
    }
  }

  function setOnMarkerClick(fn) { onMarkerClick = fn; }
  function setOnSurfaceClick(fn) { onSurfaceClick = fn; }

  // ---------------------------------------------------------------
  // CAMERA CONTROLS
  // ---------------------------------------------------------------
  function zoom(factor) {
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
    dir.multiplyScalar(factor);
    camera.position.copy(controls.target).add(dir);
  }
  function zoomIn() { zoom(0.85); }
  function zoomOut() { zoom(1.18); }
  function resetCamera() { controls.target.set(0, 0, 0); setDefaultCamera(); }
  function toggleGrid() { appState.gridVisible = !appState.gridVisible; setGridVisible(appState.gridVisible); return appState.gridVisible; }
  function requestFullscreen(el) {
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }

  function animate() {
    animId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  return {
    init, updateField, setOpacity, setLayerVisible, setMarkers, highlightObservation,
    setOnMarkerClick, setOnSurfaceClick, zoomIn, zoomOut, resetCamera, toggleGrid,
    requestFullscreen, updateDepthGaugeMarker, handleResize,
    lonToX, latToZ
  };
})();
