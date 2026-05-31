import * as THREE from "three";

const stage = document.getElementById("stage");
const canvas = document.getElementById("globe");
const loadingEl = document.getElementById("loading");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
// Orthographic camera for flat 2D world map
const MAP_W = 2.0;  // equirectangular: 2:1 ratio
const MAP_H = 1.0;
// Center longitude (Japan ~140°E)
const MAP_CENTER_LON = 140;

// Convert a real longitude (-180..180) into display lon centered on MAP_CENTER_LON,
// returning a value in (-180, 180]
function wrapDisplayLon(lonDeg) {
  let d = lonDeg - MAP_CENTER_LON;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.set(0, 0, 5);
camera.lookAt(0, 0, 0);

function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setSize(w, h, false);
  // Frame the world map (2:1) centered. Use width or height-driven so map fits.
  const viewAspect = w / h;
  const mapAspect = MAP_W / MAP_H;
  let halfW, halfH;
  if (viewAspect > mapAspect) {
    halfH = MAP_H / 2;
    halfW = halfH * viewAspect;
  } else {
    halfW = MAP_W / 2;
    halfH = halfW / viewAspect;
  }
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener("resize", resize);

// ===== World map (2D equirectangular) =====
const mapGroup = new THREE.Group();
// Push the map upward in the viewport so HUD has more bottom room
mapGroup.position.y = 0.70;
scene.add(mapGroup);

const textureLoader = new THREE.TextureLoader();
textureLoader.crossOrigin = "anonymous";

const earthMatUniforms = {
  uMap: { value: null },
  uSunLonLat: { value: new THREE.Vector2(0, 23.44) }, // (lon deg, lat deg)
  uLandNight: { value: new THREE.Color(0x1d465c) },
  uLandDay: { value: new THREE.Color(0x5e90ad) },
  uOceanNight: { value: new THREE.Color(0x030a1c) },
  uOceanDay: { value: new THREE.Color(0x062338) },
  uTerminator: { value: new THREE.Color(0xff6a14) },
  uCenterLon: { value: MAP_CENTER_LON },
};

const mapVS = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const mapFS = `
uniform sampler2D uMap;
uniform vec2 uSunLonLat;
uniform vec3 uLandNight;
uniform vec3 uLandDay;
uniform vec3 uOceanNight;
uniform vec3 uOceanDay;
uniform vec3 uTerminator;
uniform float uCenterLon;
varying vec2 vUv;

const float PI = 3.14159265358979;

vec3 lonLatToVec(float lonDeg, float latDeg) {
  float lon = radians(lonDeg);
  float lat = radians(latDeg);
  return vec3(cos(lat)*cos(lon), sin(lat), cos(lat)*sin(lon));
}

void main() {
  float texU = fract(vUv.x + uCenterLon / 360.0);
  vec4 tex = texture2D(uMap, vec2(texU, vUv.y));
  // Land detector: warm-tone signal (catches green/brown) OR bright signal (catches snow/desert)
  float warmSignal = (tex.r + tex.g) * 0.5 - tex.b * 0.88;
  float lum = (tex.r + tex.g + tex.b) * 0.3333;
  float warmLand = smoothstep(-0.03, 0.08, warmSignal);
  float brightLand = smoothstep(0.45, 0.65, lum) * step(0.7, tex.r + tex.g - tex.b * 0.4);
  float land = clamp(max(warmLand, brightLand), 0.0, 1.0);

  // Convert this fragment's UV to lon/lat
  // uv.x in [0,1] → lon in [-180, 180]
  // uv.y in [0,1] → lat in [-90, 90] (note: equirectangular jpg usually y=0 at top = lat +90)
  float lonDeg = (vUv.x - 0.5) * 360.0 + uCenterLon;
  float latDeg = (vUv.y - 0.5) * 180.0;

  vec3 pointVec = lonLatToVec(lonDeg, latDeg);
  vec3 sunVec = lonLatToVec(uSunLonLat.x, uSunLonLat.y);
  float cosA = dot(pointVec, sunVec);
  // soft day/night via smoothstep
  float day = smoothstep(-0.15, 0.25, cosA);

  // Subdued land base so dots pop, with stronger day contrast
  vec3 landBase = uLandNight * 1.5 + uLandDay * day * 1.4;
  vec3 oceanCol = mix(uOceanNight, uOceanDay, day);
  vec3 base = mix(oceanCol, landBase, land);
  base += uOceanDay * (1.0 - land) * day * 0.35;

  // Narrow terminator line (red/orange)
  float term = exp(-pow(cosA * 30.0, 2.0));
  base += uTerminator * term * 0.55;

  // Subtle graticule (every 30 deg)
  float gridLon = 1.0 - smoothstep(0.0, 0.004, abs(fract(vUv.x * 12.0 + 0.5) - 0.5));
  float gridLat = 1.0 - smoothstep(0.0, 0.004, abs(fract(vUv.y * 6.0 + 0.5) - 0.5));
  base += vec3(0.05, 0.15, 0.22) * max(gridLon, gridLat) * 0.3;

  gl_FragColor = vec4(base, 1.0);
}
`;

const earthMat = new THREE.ShaderMaterial({
  uniforms: earthMatUniforms,
  vertexShader: mapVS,
  fragmentShader: mapFS,
});

const mapGeo = new THREE.PlaneGeometry(MAP_W, MAP_H);
const earthMesh = new THREE.Mesh(mapGeo, earthMat);
mapGroup.add(earthMesh);

// Outline / frame around map
const frameGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(MAP_W * 1.005, MAP_H * 1.005));
const frameLine = new THREE.LineSegments(frameGeo, new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.5 }));
mapGroup.add(frameLine);

// ===== Event points =====
// We render all unique (lat,lon) bins as Points, with intensity driven from current frame
let pointsMesh = null;
let pointPositions = null; // Float32Array
let pointIndexByCoord = null; // (lat,lon) string -> index
let pointIntensity = null; // per-point current intensity 0..1
let pointBaseSize = null;

function lonLatToMapXY(lat, lon) {
  // Equirectangular projection with center at MAP_CENTER_LON
  const dLon = wrapDisplayLon(lon);
  const x = (dLon / 360) * MAP_W;
  const y = (lat / 180) * MAP_H;
  return new THREE.Vector3(x, y, 0.001);
}

function buildPoints(allCoords) {
  // allCoords: [{lat, lon, baseCount}]
  const N = allCoords.length;
  const positions = new Float32Array(N * 3);
  const sizes = new Float32Array(N);
  const colors = new Float32Array(N * 3);
  pointBaseSize = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const { lat, lon, baseCount } = allCoords[i];
    const v = lonLatToMapXY(lat, lon);
    positions[i*3] = v.x; positions[i*3+1] = v.y; positions[i*3+2] = v.z;
    sizes[i] = 0;
    colors[i*3] = 1.0; colors[i*3+1] = 0.35; colors[i*3+2] = 0.4;
    // Sqrt-based scaling for stronger contrast between small and large hotspots
    pointBaseSize[i] = Math.min(0.14, 0.006 + Math.sqrt(baseCount) * 0.0018);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uCanvasH: { value: renderer.domElement.height },
      uSunLonLat: { value: new THREE.Vector2(0, 23.44) },
      uCenterLon: { value: MAP_CENTER_LON },
    },
    vertexShader: `
      attribute float aSize;
      attribute vec3 aColor;
      varying vec3 vColor;
      varying float vSize;
      varying float vDay;
      uniform float uCanvasH;
      uniform vec2 uSunLonLat;
      uniform float uCenterLon;
      void main(){
        // recover real lon/lat from this point's plane coords
        float displayLonDeg = (position.x / 2.0) * 360.0;
        float realLon = mod(displayLonDeg + uCenterLon + 540.0, 360.0) - 180.0;
        float realLat = position.y * 180.0;
        float lon = radians(realLon);
        float lat = radians(realLat);
        vec3 pVec = vec3(cos(lat)*cos(lon), sin(lat), cos(lat)*sin(lon));
        float sLon = radians(uSunLonLat.x);
        float sLat = radians(uSunLonLat.y);
        vec3 sVec = vec3(cos(sLat)*cos(sLon), sin(sLat), cos(sLat)*sin(sLon));
        float cosA = dot(pVec, sVec);
        vDay = smoothstep(-0.1, 0.25, cosA);

        // Warm amber — visible against darkened map but not blowing out
        vColor = vec3(0.65, 0.30, 0.05);

        vSize = aSize;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        float camH = 2.0 / projectionMatrix[1][1];
        gl_PointSize = vSize * uCanvasH / camH;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vSize;
      varying float vDay;
      void main(){
        if (vSize < 0.0001) discard;
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float core = exp(-d * 7.0);
        float halo = exp(-d * 3.0) * 0.2;
        float a = (core + halo) * 0.75;
        gl_FragColor = vec4(vColor, a);
      }
    `,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  mapGroup.add(pts);
  pointsMesh = pts;
  pointPositions = positions;
}

// ===== Sun / time =====
// Subsolar longitude: at UTC 12, sun over lon=0. Earth rotates so subsolar lon
// decreases (moves west) as UTC advances.
function sunLonLatFor(hourFraction) {
  const lonDeg = ((12 - hourFraction) * 15 + 540) % 360 - 180;
  const latDeg = 23.44; // summer solstice declination
  return { lonDeg, latDeg };
}

// ===== Load data =====
async function loadData() {
  const [tex, activity, topCities] = await Promise.all([
    new Promise(res => {
      // Higher-contrast equirectangular Earth (Blue Marble-style)
      const urls = [
        "https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg",
        "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg",
      ];
      let i = 0;
      const tryNext = () => {
        if (i >= urls.length) return res(null);
        textureLoader.load(urls[i++], t => { t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, tryNext);
      };
      tryNext();
    }),
    fetch("./data/activity-24h.json").then(r => r.json()).catch(() => null),
    fetch("./data/top-cities.json").then(r => r.json()).catch(() => []),
  ]);

  if (tex) {
    earthMatUniforms.uMap.value = tex;
  } else {
    // procedural fallback: simple noise texture
    const c = document.createElement("canvas");
    c.width = 1024; c.height = 512;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#000"; ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle = "#888";
    for (let i = 0; i < 4000; i++) {
      ctx.fillRect(Math.random()*c.width, Math.random()*c.height, 1, 1);
    }
    earthMatUniforms.uMap.value = new THREE.CanvasTexture(c);
  }

  if (!activity || !activity.frames) {
    showError("活動データが読み込めませんでした。<br>scripts/aggregate.py を先に実行してください。");
    return null;
  }
  return { activity, topCities };
}

function showError(html) {
  loadingEl.innerHTML = html;
  loadingEl.style.color = "#ff3860";
}

// ===== Animation =====
let activity = null;
let topCities = [];
let coordIndex = new Map(); // "lat,lon" -> point index
let bandLats = [], bandLons = []; // cached

const counterEl = document.getElementById("cnt");
const cumEl = document.getElementById("cum-val");
const finaleEl = document.getElementById("finale");
const finaleTotalEl = document.getElementById("finale-total");
const tUtc = document.getElementById("t-utc");
const tTokyo = document.getElementById("t-tokyo");
const tNy = document.getElementById("t-ny");
const tLondon = document.getElementById("t-london");
const tSun = document.getElementById("t-sun");
const citiesList = document.getElementById("cities-list");

function formatHM(totalMin) {
  let m = ((totalMin % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = Math.floor(m % 60);
  return String(h).padStart(2,"0") + ":" + String(mm).padStart(2,"0");
}

// Longitude bins (10° each = 36 bins). Per frame: total commits in each band.
const LON_BINS = 36;
let lonHist = null; // Float32Array[binsPerDay][LON_BINS]
let lonBinMax = null; // Float32Array[LON_BINS] — peak value across all frames for normalization

function precomputeLonHistogram() {
  const binsPerDay = activity.bins_per_day;
  const hist = new Array(binsPerDay);
  for (let t = 0; t < binsPerDay; t++) {
    const arr = new Float32Array(LON_BINS);
    const frame = activity.frames[t] || [];
    for (const [lat, lon, c] of frame) {
      let idx = Math.floor((lon + 180) / 360 * LON_BINS);
      if (idx < 0) idx = 0; if (idx >= LON_BINS) idx = LON_BINS - 1;
      arr[idx] += c;
    }
    hist[t] = arr;
  }
  // Per-bin peak for normalization (use slight smoothing over 3 frames for stability)
  const peak = new Float32Array(LON_BINS);
  for (let i = 0; i < LON_BINS; i++) {
    for (let t = 0; t < binsPerDay; t++) {
      const prev = hist[(t-1+binsPerDay) % binsPerDay][i];
      const next = hist[(t+1) % binsPerDay][i];
      const sm = (prev + hist[t][i] + next) / 3;
      if (sm > peak[i]) peak[i] = sm;
    }
    if (peak[i] < 1) peak[i] = 1; // avoid div by zero
  }
  lonBinMax = peak;
  return hist;
}

const histoCanvas = document.getElementById("histo-canvas");
const histoCtx = histoCanvas.getContext("2d");
const ratioEl = document.getElementById("ratio");

// Track a smoothed maximum value across frames so bar scale is stable
let histMaxSmoothed = 1;
let histTotalDay = 0, histTotalNight = 0;

function drawHistogram(tBin, sunLonDeg) {
  const cv = histoCanvas;
  const cssW = cv.clientWidth || 540;
  const cssH = cv.clientHeight || 110;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cv.width !== cssW * dpr) { cv.width = cssW * dpr; cv.height = cssH * dpr; }
  const ctx = histoCtx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  // padLR=0 so histogram x range exactly matches the world map's x extent
  const padTop = 2, padBot = 4, padLR = 0;
  const w = cssW - padLR * 2;
  const h = cssH - padTop - padBot;
  const bw = w / LON_BINS;

  const bins = lonHist[tBin] || new Float32Array(LON_BINS);
  // Smoothed global max across all frames (stable scale)
  let curMax = 1;
  for (let i = 0; i < LON_BINS; i++) if (bins[i] > curMax) curMax = bins[i];
  histMaxSmoothed = histMaxSmoothed * 0.92 + curMax * 0.08;
  const maxV = Math.max(histMaxSmoothed, curMax);

  // Iterate display position (left to right), but data is by real longitude bin.
  // For each display column, we resolve which real-lon bin it corresponds to.
  for (let col = 0; col < LON_BINS; col++) {
    const displayLonCenter = -180 + (col + 0.5) * (360 / LON_BINS);
    // real lon = displayLon + MAP_CENTER_LON
    let realLon = displayLonCenter + MAP_CENTER_LON;
    while (realLon > 180) realLon -= 360;
    while (realLon < -180) realLon += 360;
    let binIdx = Math.floor((realLon + 180) / 360 * LON_BINS);
    if (binIdx < 0) binIdx = 0; if (binIdx >= LON_BINS) binIdx = LON_BINS - 1;

    // Day intensity for this display column based on sun
    let dLonToSun = realLon - sunLonDeg;
    while (dLonToSun > 180) dLonToSun -= 360;
    while (dLonToSun < -180) dLonToSun += 360;
    const cosA = Math.cos(dLonToSun * Math.PI / 180);
    const dayI = Math.max(0, Math.min(1, (cosA + 0.15) * 1.2));

    const x = padLR + col * bw;
    const yBase = padTop + h;

    // Background band (day = warm, night = cool)
    const bgR = Math.round(15 + dayI * 60);
    const bgG = Math.round(20 + dayI * 50);
    const bgB = Math.round(40 + dayI * 30);
    ctx.fillStyle = `rgba(${bgR},${bgG},${bgB},0.55)`;
    ctx.fillRect(x, padTop, bw, h);

    const v = bins[binIdx];
    const barH = (v / maxV) * h;
    const r = Math.round(80 + dayI * 175);
    const g = Math.round(120 + dayI * 90);
    const b = Math.round(180 - dayI * 130);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x + 0.6, yBase - barH, bw - 1.2, barH);
  }

  // Sun position marker (in display coords)
  const sunDisplayLon = wrapDisplayLon(sunLonDeg);
  const sunX = padLR + ((sunDisplayLon + 180) / 360) * w;
  ctx.strokeStyle = "rgba(255,106,20,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sunX, padTop);
  ctx.lineTo(sunX, padTop + h);
  ctx.stroke();
  // sun icon
  ctx.fillStyle = "#ff6a14";
  ctx.beginPath();
  ctx.arc(sunX, padTop + 8, 4, 0, Math.PI * 2);
  ctx.fill();

  // Accumulate global day/night totals for current frame (use real lon bins)
  let curDay = 0, curNight = 0;
  for (let i = 0; i < LON_BINS; i++) {
    const lonCenter = -180 + (i + 0.5) * (360 / LON_BINS);
    let dLon = lonCenter - sunLonDeg;
    while (dLon > 180) dLon -= 360;
    while (dLon < -180) dLon += 360;
    if (Math.abs(dLon) < 90) curDay += bins[i];
    else curNight += bins[i];
  }
  const total = curDay + curNight;
  const pctDay = Math.round(100 * curDay / Math.max(total, 1));
  ratioEl.textContent = `昼側 ${pctDay}% : ${100 - pctDay}% 夜側`;
}

function init(data) {
  activity = data.activity;
  topCities = data.topCities || [];

  // Build coordinate list
  const coordTotals = new Map();
  for (const frame of activity.frames) {
    for (const [lat, lon, c] of frame) {
      const k = lat + "," + lon;
      coordTotals.set(k, (coordTotals.get(k) || 0) + c);
    }
  }
  const coords = [];
  let i = 0;
  for (const [k, total] of coordTotals.entries()) {
    const [lat, lon] = k.split(",").map(Number);
    coords.push({ lat, lon, baseCount: total });
    coordIndex.set(k, i++);
  }
  buildPoints(coords);
  pointIntensity = new Float32Array(coords.length);

  lonHist = precomputeLonHistogram();
  drawHistogram(0, 180);
  precomputeCumulative();
}

let startTime = null;
const LOOP_SECONDS = 30; // 1 day = 30 seconds
const TRAIL_BINS = 6; // 60min residual glow

// Precompute cumulative totals per time bin (for the running counter)
let cumByBin = null;
let dayTotalEvents = 0;
function precomputeCumulative() {
  const binsPerDay = activity.bins_per_day;
  cumByBin = new Float64Array(binsPerDay + 1);
  let sum = 0;
  for (let t = 0; t < binsPerDay; t++) {
    const frame = activity.frames[t] || [];
    for (const [, , c] of frame) sum += c;
    cumByBin[t + 1] = sum;
  }
  dayTotalEvents = sum;
}

let prevDayFraction = 0;
let finaleActive = false;
let pausedElapsed = null; // when non-null, animation time is frozen at this elapsed value
const FINALE_VISIBLE_MS = 2200;
const FINALE_FADE_MS = 600;

function triggerFinale() {
  if (finaleActive) return;
  finaleActive = true;
  finaleTotalEl.textContent = Math.round(dayTotalEvents).toLocaleString("en-US");
  finaleEl.classList.add("show");
  finaleEl.classList.remove("fade");
  // Freeze animation at end-of-day state so HUD/map/histogram stop moving
  pausedElapsed = LOOP_SECONDS - 0.001;
  setTimeout(() => {
    finaleEl.classList.add("fade");
  }, FINALE_VISIBLE_MS);
  setTimeout(() => {
    finaleEl.classList.remove("show", "fade");
    finaleActive = false;
    // Resume: reset start so next frame begins a fresh 24h loop
    startTime = performance.now();
    pausedElapsed = null;
    prevDayFraction = 0;
  }, FINALE_VISIBLE_MS + FINALE_FADE_MS);
}

function tick(t) {
  if (startTime === null) startTime = t;
  const rawElapsed = (t - startTime) / 1000;
  const elapsed = pausedElapsed !== null ? pausedElapsed : rawElapsed;
  const dayFraction = (elapsed / LOOP_SECONDS) % 1; // 0..1
  const hourFraction = dayFraction * 24;
  const utcMin = dayFraction * 1440;

  // Loop boundary detection -> finale flash (only when not paused)
  if (pausedElapsed === null && dayFraction < prevDayFraction && prevDayFraction > 0.9) {
    triggerFinale();
  }
  prevDayFraction = dayFraction;

  // Sun position
  const sun = sunLonLatFor(hourFraction);
  earthMatUniforms.uSunLonLat.value.set(sun.lonDeg, sun.latDeg);
  if (pointsMesh) pointsMesh.material.uniforms.uSunLonLat.value.set(sun.lonDeg, sun.latDeg);

  // Update points: current bin = floor(utcMin / minPerBin)
  if (activity) {
    const binsPerDay = activity.bins_per_day;
    const minPerBin = activity.min_per_bin;
    const currentBin = Math.floor(utcMin / minPerBin) % binsPerDay;

    // Decay all
    if (pointIntensity) {
      for (let i = 0; i < pointIntensity.length; i++) {
        pointIntensity[i] *= 0.9;
      }
    }

    // Apply trail of recent bins (current and previous TRAIL_BINS)
    let activeCounter = 0;
    for (let dt = 0; dt <= TRAIL_BINS; dt++) {
      const bIdx = ((currentBin - dt) % binsPerDay + binsPerDay) % binsPerDay;
      const frame = activity.frames[bIdx];
      const weight = Math.exp(-dt * 0.35);
      for (const [lat, lon, c] of frame) {
        const k = lat + "," + lon;
        const idx = coordIndex.get(k);
        if (idx === undefined) continue;
        const v = Math.min(1.0, Math.log10(1 + c) * 0.5) * weight;
        if (v > pointIntensity[idx]) pointIntensity[idx] = v;
        if (dt === 0) activeCounter += c;
      }
    }

    // Write sizes attr
    if (pointsMesh) {
      const sizes = pointsMesh.geometry.attributes.aSize.array;
      for (let i = 0; i < sizes.length; i++) {
        sizes[i] = pointBaseSize[i] * pointIntensity[i];
      }
      pointsMesh.geometry.attributes.aSize.needsUpdate = true;
    }

    counterEl.textContent = activeCounter.toLocaleString("en-US");
    drawHistogram(currentBin, sun.lonDeg);

    // Cumulative counter (interpolated within bin)
    if (cumByBin) {
      const binProgress = (utcMin % activity.min_per_bin) / activity.min_per_bin;
      const cumNow = cumByBin[currentBin] + (cumByBin[currentBin+1] - cumByBin[currentBin]) * binProgress;
      cumEl.textContent = Math.round(cumNow).toLocaleString("en-US");
    }

    // Top active cities for this bin
    const frame = activity.frames[currentBin] || [];
    const labeled = [];
    for (const [lat, lon, c] of frame) {
      const k = lat + "," + lon;
      labeled.push({ lat, lon, c });
    }
    labeled.sort((a,b) => b.c - a.c);
    const labelLookup = new Map(topCities.map(x => [x.lat + "," + x.lon, x.label]));
    const top5 = labeled.slice(0, 5).map(x => {
      const lbl = labelLookup.get(x.lat + "," + x.lon) || `${x.lat.toFixed(0)}°, ${x.lon.toFixed(0)}°`;
      return `<div class="item"><span>${lbl}</span><span class="n">${x.c}</span></div>`;
    }).join("");
    citiesList.innerHTML = top5 || '<div class="item"><span>—</span></div>';
  }

  // Clocks
  tUtc.textContent = formatHM(utcMin);
  tTokyo.textContent = formatHM(utcMin + 9*60);
  tNy.textContent = formatHM(utcMin - 4*60); // EDT in June
  tLondon.textContent = formatHM(utcMin + 1*60); // BST in June
  const sunLon = ((12 - hourFraction) * 15 + 540) % 360 - 180;
  tSun.textContent = (sunLon >= 0 ? sunLon.toFixed(0) + "°E" : (-sunLon).toFixed(0) + "°W");

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// When the intro view finishes, restart the timelapse from a fresh 00:00 UTC
// so the reveal lines up with the start of the 24h loop.
window.addEventListener("intro:complete", () => {
  startTime = null;
  pausedElapsed = null;
  prevDayFraction = 0;
  finaleActive = false;
  finaleEl.classList.remove("show", "fade");
});

(async function start() {
  const data = await loadData();
  if (!data) return;
  init(data);
  // Expose the real aggregated daily total so the intro counter uses real data.
  window.__dayTotal = dayTotalEvents;
  loadingEl.style.display = "none";
  // Start the globe immediately; it animates faintly behind the intro overlay
  // (0秒目から動きを発生させる), then intro:complete restarts it fresh on reveal.
  requestAnimationFrame(tick);
})();
