/* ============================================================
   OCEANX — map3d.js
   Three.js scene: a rotatable 3D globe. The Indian Ocean field
   (temperature/salinity/currents/etc.) is wrapped onto the sphere's
   surface as a curved patch, geo-referenced by real lat/lon, along
   with a schematic coastline, graticule, and Argo/Glider markers.
   Geometry/material are updated in place when variable/depth/time
   change rather than rebuilding the scene.
   ============================================================ */

const Map3D = (() => {

  let scene, camera, renderer, controls, canvas;
  let fieldMesh, fieldGeometry, baseGlobe, atmosphere;
  let coastlineGroup, gridGroup, globeGraticuleGroup, depthGaugeGroup, vectorGroup;
  let markerGroup;
  let raycaster, pointerVec;
  let markerMeshes = []; // { mesh, observation }
  let currentField = null;
  let onMarkerClick = null;
  let onSurfaceClick = null;

  const DEG2RAD = Math.PI / 180;
  const GLOBE_RADIUS = 18;
  const FIELD_SURFACE_OFFSET = 0.08; // sits just above the base globe
  const RELIEF_BASE = 1.9;           // relief bump scale (world units) at exaggeration 1x

  // ---- lat/lon <-> 3D sphere (Y-up) ------------------------------
  function latLonToVector3(lat, lon, radius = GLOBE_RADIUS) {
    const latR = lat * DEG2RAD, lonR = lon * DEG2RAD;
    return new THREE.Vector3(
        radius * Math.cos(latR) * Math.cos(lonR),
        radius * Math.sin(latR),
        radius * Math.cos(latR) * Math.sin(lonR)
    );
  }

  function vector3ToLatLon(v) {
    const r = v.length() || 1;
    const lat = Math.asin(Utils.clamp(v.y / r, -1, 1)) / DEG2RAD;
    const lon = Math.atan2(v.z, v.x) / DEG2RAD;
    return { lat, lon };
  }

  // local east/north tangent directions at a lat/lon, via numeric
  // differencing — simple and robust regardless of the exact
  // parametrization above.
  function localTangents(lat, lon) {
    const d = 0.5; // degrees
    const east = latLonToVector3(lat, lon + d, 1).sub(latLonToVector3(lat, lon - d, 1)).normalize();
    const north = latLonToVector3(Utils.clamp(lat + d, -89, 89), lon, 1)
        .sub(latLonToVector3(Utils.clamp(lat - d, -89, 89), lon, 1)).normalize();
    return { east, north };
  }

  function init(canvasEl) {
    canvas = canvasEl;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020608);
    scene.fog = new THREE.Fog(0x020608, GLOBE_RADIUS * 2.2, GLOBE_RADIUS * 7.5);

    const wrap = canvas.parentElement;
    camera = new THREE.PerspectiveCamera(45, wrap.clientWidth / wrap.clientHeight, 0.1, 1000);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(wrap.clientWidth, wrap.clientHeight);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = GLOBE_RADIUS * 1.15;
    controls.maxDistance = GLOBE_RADIUS * 6;
    controls.rotateSpeed = 0.55;

    setDefaultCamera();

    scene.add(new THREE.AmbientLight(0x88aabb, 1.0));
    const dir = new THREE.DirectionalLight(0x9fdcff, 0.7);
    dir.position.set(30, 40, 20);
    scene.add(dir);

    buildBaseGlobe();
    buildGlobeGraticule();
    buildField();
    buildGrid();
    buildCoastline();
    buildDepthGauge();
    markerGroup = new THREE.Group();
    scene.add(markerGroup);
    vectorGroup = new THREE.Group();
    scene.add(vectorGroup);

    raycaster = new THREE.Raycaster();
    pointerVec = new THREE.Vector2();

    renderer.domElement.addEventListener("click", handleClick);
    window.addEventListener("resize", handleResize);

    animate();
  }

  function setDefaultCamera() {
    // Frame the Indian Ocean region by default, while still allowing
    // free orbit around the whole planet.
    const dir = latLonToVector3(7, 70, 1);
    camera.position.copy(dir.multiplyScalar(GLOBE_RADIUS * 2.5));
    camera.up.set(0, 1, 0);
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
  // BASE GLOBE + ATMOSPHERE
  // ---------------------------------------------------------------
  function buildBaseGlobe() {
    const geo = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 48);
    const mat = new THREE.MeshLambertMaterial({ color: 0x041018 });
    baseGlobe = new THREE.Mesh(geo, mat);
    baseGlobe.name = "baseGlobe";
    scene.add(baseGlobe);

    const atmosGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.035, 48, 32);
    const atmosMat = new THREE.MeshBasicMaterial({
      color: 0x19d8ff, transparent: true, opacity: 0.07, side: THREE.BackSide
    });
    atmosphere = new THREE.Mesh(atmosGeo, atmosMat);
    scene.add(atmosphere);
  }

  function buildGlobeGraticule() {
    globeGraticuleGroup = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: 0x0c2333, transparent: true, opacity: 0.5 });
    const r = GLOBE_RADIUS * 1.001;

    for (let lat = -60; lat <= 60; lat += 30) {
      const pts = [];
      for (let lon = -180; lon <= 180; lon += 5) pts.push(latLonToVector3(lat, lon, r));
      globeGraticuleGroup.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }
    for (let lon = -180; lon < 180; lon += 30) {
      const pts = [];
      for (let lat = -90; lat <= 90; lat += 5) pts.push(latLonToVector3(lat, lon, r));
      globeGraticuleGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }
    scene.add(globeGraticuleGroup);
  }

  // ---------------------------------------------------------------
  // FIELD PATCH (wrapped onto the sphere over the modeled region)
  // ---------------------------------------------------------------
  function buildField() {
    const { lats, lons } = Model.demoLatLon();
    const nLat = lats.length, nLon = lons.length;

    const positions = [];
    lats.forEach((lat) => lons.forEach((lon) => {
      const v = latLonToVector3(lat, lon, GLOBE_RADIUS + FIELD_SURFACE_OFFSET);
      positions.push(v.x, v.y, v.z);
    }));

    const indices = [];
    for (let iy = 0; iy < nLat - 1; iy++) {
      for (let ix = 0; ix < nLon - 1; ix++) {
        const a = iy * nLon + ix, b = iy * nLon + ix + 1;
        const c = (iy + 1) * nLon + ix, d = (iy + 1) * nLon + ix + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    fieldGeometry = new THREE.BufferGeometry();
    fieldGeometry.setIndex(indices);
    fieldGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    fieldGeometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(positions.length), 3));
    fieldGeometry.computeVertexNormals();

    const material = new THREE.MeshLambertMaterial({
      vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: appState.layerOpacity
    });
    fieldMesh = new THREE.Mesh(fieldGeometry, material);
    fieldMesh.name = "oceanField";
    scene.add(fieldMesh);

    const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(fieldGeometry),
        new THREE.LineBasicMaterial({ color: 0x0c3a52, transparent: true, opacity: 0.22 })
    );
    wire.name = "fieldWire";
    scene.add(wire);
  }

  function updateField(fieldData) {
    if (!fieldData || !fieldMesh) return;
    currentField = fieldData;
    const { lats, lons } = Model.demoLatLon();
    const pos = fieldGeometry.attributes.position;
    const col = fieldGeometry.attributes.color;
    const variable = appState.variable;
    const exag = appState.verticalExaggeration;
    const def = Model.VARIABLES[variable];

    let idx = 0;
    for (let iy = 0; iy < lats.length; iy++) {
      for (let ix = 0; ix < lons.length; ix++) {
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

        const normalized = def ? Utils.invLerp(def.min, def.max, value) : 0.5;
        const relief = (normalized - 0.4) * RELIEF_BASE * exag * 0.5;
        const dir = latLonToVector3(lats[iy], lons[ix], 1);
        const radius = GLOBE_RADIUS + FIELD_SURFACE_OFFSET + relief;
        pos.setXYZ(idx, dir.x * radius, dir.y * radius, dir.z * radius);
        col.setXYZ(idx, rgb[0], rgb[1], rgb[2]);
        idx++;
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    fieldGeometry.computeVertexNormals();

    const wire = scene.getObjectByName("fieldWire");
    if (wire) { wire.geometry.dispose(); wire.geometry = new THREE.WireframeGeometry(fieldGeometry); }

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

    for (let iy = 0; iy < lats.length; iy += step) {
      for (let ix = 0; ix < lons.length; ix += step) {
        const u = fieldData.u[iy][ix], v = fieldData.v[iy][ix];
        const speed = Math.sqrt(u * u + v * v);
        if (speed < 0.02) continue;
        const lat = lats[iy], lon = lons[ix];
        const { east, north } = localTangents(lat, lon);
        const tangentDir = east.clone().multiplyScalar(u).add(north.clone().multiplyScalar(v)).normalize();
        const origin = latLonToVector3(lat, lon, GLOBE_RADIUS + FIELD_SURFACE_OFFSET + 0.05);
        const len = Utils.clamp(speed * 1.6, 0.2, 1.2);
        const arrow = new THREE.ArrowHelper(tangentDir, origin, len, 0x19d8ff, len * 0.35, len * 0.18);
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
  // REGIONAL GRID (lat/lon graticule over the modeled domain only)
  // ---------------------------------------------------------------
  function buildGrid() {
    gridGroup = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: 0x123449, transparent: true, opacity: 0.65 });
    const { latMin, latMax, lonMin, lonMax } = Model.DEMO_BOUNDS;
    const r = GLOBE_RADIUS + FIELD_SURFACE_OFFSET + 0.03;

    for (let lat = Math.ceil(latMin / 5) * 5; lat <= latMax; lat += 5) {
      const pts = [];
      for (let lon = lonMin; lon <= lonMax; lon += 2) pts.push(latLonToVector3(lat, lon, r));
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }
    for (let lon = Math.ceil(lonMin / 5) * 5; lon <= lonMax; lon += 5) {
      const pts = [];
      for (let lat = latMin; lat <= latMax; lat += 2) pts.push(latLonToVector3(lat, lon, r));
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }
    scene.add(gridGroup);
  }

  function setGridVisible(v) { if (gridGroup) gridGroup.visible = v; }

  // ---------------------------------------------------------------
  // SCHEMATIC COASTLINES (illustrative, not survey-accurate) wrapped
  // onto the sphere. India/Sri Lanka sit right against the modeled
  // field and render always-on-top so exaggerated ocean relief never
  // buries them; the rest of the world's continents are proper
  // depth-tested geometry so the far side of the globe is correctly
  // hidden behind the near side as you rotate it.
  // ---------------------------------------------------------------
  const INDIA_COAST = [
    [23.5, 68.4], [21.6, 69.6], [20.0, 70.8], [18.9, 72.8], [15.5, 73.8],
    [12.9, 74.8], [10.0, 76.2], [8.1, 77.5], [8.9, 78.2], [10.3, 79.8],
    [13.1, 80.3], [16.5, 82.2], [19.0, 84.8], [20.3, 86.7], [21.6, 88.0]
  ];
  const SRI_LANKA = [
    [9.8, 80.1], [8.5, 81.0], [6.9, 81.5], [6.0, 80.4], [7.2, 79.7], [9.0, 79.8], [9.8, 80.1]
  ];

  const NORTH_AMERICA = [
    [70, -165], [60, -165], [55, -160], [48, -125], [32, -117], [23, -110], [20, -105],
    [16, -95], [9, -83], [8, -77], [10, -75], [18, -88], [21, -97], [29, -95], [30, -89],
    [25, -80], [30, -81], [35, -76], [40, -74], [44, -68], [47, -60], [50, -56], [55, -60],
    [60, -65], [65, -70], [70, -95], [72, -110], [70, -140], [70, -165]
  ];
  const GREENLAND = [
    [83, -35], [82, -20], [76, -20], [70, -22], [66, -38], [70, -55], [76, -60], [82, -50], [83, -35]
  ];
  const SOUTH_AMERICA = [
    [8, -77], [4, -80], [-5, -81], [-14, -76], [-18, -70], [-23, -70], [-33, -72], [-42, -74],
    [-52, -74], [-55, -68], [-52, -64], [-45, -65], [-38, -62], [-34, -57], [-25, -48],
    [-15, -39], [-8, -35], [-3, -40], [0, -50], [5, -55], [8, -60], [11, -68], [9, -75], [8, -77]
  ];
  const AFRICA = [
    [36, -6], [30, -10], [21, -17], [14, -17], [5, -10], [4, 2], [4, 9], [-5, 12], [-15, 12],
    [-22, 14], [-29, 17], [-34, 18], [-34, 25], [-29, 32], [-20, 35], [-11, 40], [-4, 39],
    [2, 45], [10, 51], [12, 43], [15, 39], [22, 37], [28, 33], [31, 32], [32, 25], [33, 11],
    [37, 10], [36, -6]
  ];
  const MADAGASCAR = [
    [-12, 49], [-16, 50], [-20, 47], [-25, 46], [-25, 44], [-20, 44], [-15, 45], [-12, 49]
  ];
  const EUROPE = [
    [37, -9], [43, -9], [46, -1], [49, -5], [51, 3], [55, 8], [58, 11], [63, 10], [69, 18],
    [70, 30], [66, 40], [60, 60], [50, 60], [46, 48], [42, 42], [41, 29], [40, 20], [37, 15],
    [41, 9], [43, 4], [37, -9]
  ];
  const UK_IRELAND = [
    [58, -5], [57, -2], [54, 0], [51, 2], [50, -5], [51, -6], [55, -8], [58, -5]
  ];
  const ARABIA = [
    [30, 35], [29, 48], [24, 51], [17, 54], [12, 45], [15, 42], [20, 39], [28, 35], [30, 35]
  ];
  const ASIA_MAINLAND = [
    [40, 44], [38, 48], [37, 54], [35, 61], [37, 67], [45, 60], [55, 60], [60, 70], [66, 90],
    [70, 130], [68, 160], [60, 165], [52, 158], [55, 140], [48, 140], [43, 132], [39, 124],
    [35, 126], [31, 121], [23, 113], [21, 108], [16, 108], [10, 104], [7, 100], [13, 100],
    [16, 98], [20, 93], [27, 89], [30, 80], [35, 75], [33, 60], [40, 44]
  ];
  const JAPAN = [
    [45, 142], [43, 145], [38, 141], [34, 135], [31, 130], [33, 129], [36, 133], [40, 140], [45, 142]
  ];
  const SUMATRA_JAVA = [
    [5, 95], [3, 99], [-2, 101], [-6, 106], [-8, 112], [-8, 115], [-5, 110], [-2, 104], [2, 98], [5, 95]
  ];
  const PHILIPPINES = [
    [19, 121], [14, 120], [10, 122], [6, 121], [8, 125], [13, 124], [18, 122], [19, 121]
  ];
  const AUSTRALIA = [
    [-11, 130], [-12, 137], [-17, 140], [-27, 153], [-34, 151], [-38, 147], [-38, 140],
    [-35, 136], [-32, 115], [-22, 114], [-16, 123], [-11, 130]
  ];
  const NEW_ZEALAND = [
    [-34, 173], [-37, 178], [-41, 175], [-46, 168], [-44, 171], [-40, 174], [-34, 173]
  ];

  const NEAR_LAND = [INDIA_COAST, SRI_LANKA];
  const WORLD_LAND = [
    NORTH_AMERICA, GREENLAND, SOUTH_AMERICA, AFRICA, MADAGASCAR, EUROPE, UK_IRELAND,
    ARABIA, ASIA_MAINLAND, JAPAN, SUMATRA_JAVA, PHILIPPINES, AUSTRALIA, NEW_ZEALAND
  ];

  function polylineFromCoords(coords, color, radius) {
    const points = coords.map(([lat, lon]) => latLonToVector3(lat, lon, radius));
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.85 }));
  }

  // Inserts intermediate points along each polygon edge so consecutive
  // vertices are never more than ~maxStepDeg apart. Without this, large
  // continents (few hand-authored points, wide gaps) would have their
  // straight 3D edges cut noticeably inside the sphere's curvature.
  function densifyPolygon(coords, maxStepDeg = 6) {
    const out = [];
    for (let i = 0; i < coords.length; i++) {
      const [lat1, lon1] = coords[i];
      out.push([lat1, lon1]);
      const [lat2, lon2] = coords[(i + 1) % coords.length];
      const dist = Math.max(Math.abs(lat2 - lat1), Math.abs(lon2 - lon1));
      const steps = Math.ceil(dist / maxStepDeg);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        out.push([lat1 + (lat2 - lat1) * t, lon1 + (lon2 - lon1) * t]);
      }
    }
    return out;
  }

  function sphericalLandGeometry(coordsLatLon, radius) {
    const shapePoints = coordsLatLon.map(([lat, lon]) => new THREE.Vector2(lon, lat));
    const shape = new THREE.Shape(shapePoints);
    const geo = new THREE.ShapeGeometry(shape);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const lon = pos.getX(i), lat = pos.getY(i);
      const v = latLonToVector3(lat, lon, radius);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  // Triangle-fan polar ice cap (Antarctica / Arctic) — built directly
  // in 3D rather than via the flat-shape-then-wrap trick, since lon
  // is degenerate exactly at the poles.
  function buildPolarCap(poleLat, ringLat, radius, color) {
    const segments = 48;
    const pole = latLonToVector3(poleLat, 0, radius);
    const positions = [pole.x, pole.y, pole.z];
    for (let i = 0; i <= segments; i++) {
      const lon = -180 + (360 * i) / segments;
      const v = latLonToVector3(ringLat, lon, radius);
      positions.push(v.x, v.y, v.z);
    }
    const indices = [];
    for (let i = 1; i <= segments; i++) indices.push(0, i, i + 1);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  }

  function buildCoastline() {
    coastlineGroup = new THREE.Group();

    // India + Sri Lanka: always-on-top decals so they never disappear
    // under exaggerated ocean relief right next to them.
    const nearRadius = GLOBE_RADIUS + FIELD_SURFACE_OFFSET + 0.12;
    const nearMat = new THREE.MeshBasicMaterial({
      color: 0x1a2a22, transparent: true, opacity: 0.94, depthTest: false, side: THREE.DoubleSide
    });
    NEAR_LAND.forEach((coords) => {
      const mesh = new THREE.Mesh(sphericalLandGeometry(densifyPolygon(coords), nearRadius), nearMat.clone());
      mesh.renderOrder = 5;
      coastlineGroup.add(mesh);
      const edge = polylineFromCoords(coords, 0x9fd6e8, nearRadius + 0.01);
      edge.renderOrder = 6;
      coastlineGroup.add(edge);
    });

    // Rest of the world: normal depth-tested geometry, lit like the
    // base globe, so the far side of the planet is correctly hidden
    // behind the near side as it rotates.
    const worldRadius = GLOBE_RADIUS + 0.06;
    const worldMat = new THREE.MeshLambertMaterial({ color: 0x18271f, side: THREE.DoubleSide });
    WORLD_LAND.forEach((coords) => {
      const mesh = new THREE.Mesh(sphericalLandGeometry(densifyPolygon(coords), worldRadius), worldMat.clone());
      mesh.renderOrder = 1;
      coastlineGroup.add(mesh);
      const edge = polylineFromCoords(coords, 0x3f5c50, worldRadius + 0.01);
      edge.renderOrder = 2;
      coastlineGroup.add(edge);
    });

    coastlineGroup.add(buildPolarCap(-90, -62, worldRadius, 0x1c2a26)); // Antarctica
    coastlineGroup.add(buildPolarCap(90, 82, worldRadius, 0x16232a));   // Arctic ice cap

    scene.add(coastlineGroup);
  }

  // ---------------------------------------------------------------
  // DEPTH GAUGE (small side gizmo showing the selected depth level)
  // ---------------------------------------------------------------
  function depthGaugeAnchor() {
    const anchorDir = latLonToVector3(Model.DEMO_BOUNDS.latMin - 6, Model.DEMO_BOUNDS.lonMin - 6, 1);
    return anchorDir.multiplyScalar(GLOBE_RADIUS + 1.5);
  }

  function buildDepthGauge() {
    depthGaugeGroup = new THREE.Group();
    depthGaugeGroup.visible = false; // tied to "bathymetry" layer toggle
    const base = depthGaugeAnchor();
    const maxDepth = Model.DEMO_DEPTHS[Model.DEMO_DEPTHS.length - 1];

    Model.DEMO_DEPTHS.forEach((d) => {
      const y = base.y - Utils.invLerp(0, maxDepth, d) * 5;
      const geo = new THREE.RingGeometry(0.16, 0.22, 16);
      geo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x3a6f85 }));
      ring.position.set(base.x, y, base.z);
      depthGaugeGroup.add(ring);
    });
    scene.add(depthGaugeGroup);
  }

  function updateDepthGaugeMarker(depthValue) {
    if (!depthGaugeGroup) return;
    let marker = depthGaugeGroup.getObjectByName("marker");
    if (!marker) {
      marker = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), new THREE.MeshBasicMaterial({ color: 0x19d8ff }));
      marker.name = "marker";
      depthGaugeGroup.add(marker);
    }
    const base = depthGaugeAnchor();
    const maxDepth = Model.DEMO_DEPTHS[Model.DEMO_DEPTHS.length - 1];
    const y = base.y - Utils.invLerp(0, maxDepth, depthValue) * 5;
    marker.position.set(base.x, y, base.z);
  }

  // ---------------------------------------------------------------
  // OBSERVATION MARKERS
  // ---------------------------------------------------------------
  function setMarkers(observations) {
    markerGroup.clear();
    markerMeshes = [];

    observations.forEach((obs) => {
      const dir = latLonToVector3(obs.lat, obs.lon, 1);
      const surfacePoint = dir.clone().multiplyScalar(GLOBE_RADIUS + FIELD_SURFACE_OFFSET + 0.45);

      let mesh;
      if (obs.type === "argo") {
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 16), new THREE.MeshBasicMaterial({ color: 0x19d8ff }));
      } else {
        mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshBasicMaterial({ color: 0x14d9a2 }));
      }
      mesh.position.copy(surfacePoint);
      mesh.userData.observation = obs;
      markerGroup.add(mesh);

      // small "stalk" connecting the marker to the surface, oriented
      // radially outward at this lat/lon.
      const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6),
          new THREE.MeshBasicMaterial({ color: obs.type === "argo" ? 0x19d8ff : 0x14d9a2, transparent: true, opacity: 0.5 })
      );
      const beamBase = dir.clone().multiplyScalar(GLOBE_RADIUS + FIELD_SURFACE_OFFSET);
      beam.position.copy(beamBase.clone().lerp(surfacePoint, 0.5));
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
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
      const dir = latLonToVector3(observation.lat, observation.lon, 1);
      animateCameraToDirection(dir);
    }
  }

  // Orbit the camera to look at a given direction on the globe, keeping
  // the pivot at the globe center so the user can keep freely rotating.
  function animateCameraToDirection(dir) {
    const camStart = camera.position.clone();
    const distance = Math.max(camera.position.length(), GLOBE_RADIUS * 1.8);
    const camTarget = dir.clone().multiplyScalar(distance);
    const targetStart = controls.target.clone();
    const targetEnd = new THREE.Vector3(0, 0, 0);
    const duration = 700;
    const t0 = performance.now();
    function step(now) {
      const t = Utils.clamp((now - t0) / duration, 0, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(camStart, camTarget, ease);
      controls.target.lerpVectors(targetStart, targetEnd, ease);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------
  // POINT SAMPLING (used by the click-to-inspect popup)
  // ---------------------------------------------------------------
  function sampleFieldAt(lat, lon) {
    if (!currentField || !currentField.latitude || !currentField.longitude) return null;
    const { latMin, latMax, lonMin, lonMax } = Model.DEMO_BOUNDS;
    if (lat < latMin - 3 || lat > latMax + 3 || lon < lonMin - 3 || lon > lonMax + 3) return null;

    const lats = currentField.latitude, lons = currentField.longitude;
    let iy = 0, bestLat = Infinity;
    for (let i = 0; i < lats.length; i++) {
      const d = Math.abs(lats[i] - lat);
      if (d < bestLat) { bestLat = d; iy = i; }
    }
    let ix = 0, bestLon = Infinity;
    for (let i = 0; i < lons.length; i++) {
      const d = Math.abs(lons[i] - lon);
      if (d < bestLon) { bestLon = d; ix = i; }
    }

    if (appState.variable === "currents" && currentField.u) {
      const u = currentField.u[iy][ix], v = currentField.v[iy][ix];
      return { value: Math.sqrt(u * u + v * v), lat: lats[iy], lon: lons[ix], source: currentField.source };
    }
    if (currentField.values) {
      return { value: currentField.values[iy][ix], lat: lats[iy], lon: lons[ix], source: currentField.source };
    }
    return null;
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
        const { lat, lon } = vector3ToLatLon(hits[0].point);
        onSurfaceClick({ lat, lon, sample: sampleFieldAt(lat, lon), clientX: evt.clientX, clientY: evt.clientY });
        return;
      }
    }

    if (baseGlobe) {
      const hits = raycaster.intersectObject(baseGlobe);
      if (hits.length && onSurfaceClick) {
        const { lat, lon } = vector3ToLatLon(hits[0].point);
        onSurfaceClick({ lat, lon, sample: sampleFieldAt(lat, lon), clientX: evt.clientX, clientY: evt.clientY });
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
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  return {
    init, updateField, setOpacity, setLayerVisible, setMarkers, highlightObservation,
    setOnMarkerClick, setOnSurfaceClick, zoomIn, zoomOut, resetCamera, toggleGrid,
    requestFullscreen, updateDepthGaugeMarker, handleResize, sampleFieldAt,
    latLonToVector3, vector3ToLatLon
  };
})();