// ============================================================
// OrbitIQ — Three.js Globe renderer
// Vanilla (no React) for raw point-cloud performance.
// Renders in ECI frame; Earth mesh spins under a fixed satellite frame.
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { GlobeApi } from '../../types';

const RE_SCENE = 1.0;
const DEFAULT_POINT_SIZE = 16.0;

export function createGlobe(container: HTMLElement): GlobeApi & { destroy(): void } {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
  camera.position.set(0, 1.4, 3.4);

  const renderer = new THREE.WebGLRenderer({
    antialias: true, alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x05070d, 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, container);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 1.25;
  controls.maxDistance = 14;
  controls.rotateSpeed = 0.5;
  controls.autoRotateSpeed = 0.35;

  // ECI inertial frame: Earth group spins under fixed satellite positions
  const earthGroup = new THREE.Group();
  scene.add(earthGroup);

  // ---- CSS2D Label Renderer ----
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  container.appendChild(labelRenderer.domElement);

  // ---- Lighting ----
  scene.add(new THREE.AmbientLight(0x1a2436, 0.55));
  const sun = new THREE.DirectionalLight(0xfff5e6, 2.0);
  sun.position.set(5, 0, 0);
  scene.add(sun);

  // ---- Earth ----
  const earthMat = new THREE.MeshPhongMaterial({
    color: 0x0a1830, emissive: 0x04101f, specular: 0x16243a, shininess: 18,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(RE_SCENE, 96, 96), earthMat);
  earthGroup.add(earth);

  // Textures — gracefully degrade if CDN is unreachable
  const TL = new THREE.TextureLoader();
  TL.setCrossOrigin('anonymous');
  const CDN = 'https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/';
  let pending = 2;
  let readyResolve!: () => void;
  const readyPromise = new Promise<void>((res) => { readyResolve = res; });
  const settle = () => { if (--pending <= 0) readyResolve(); };
  const textureTimeout = setTimeout(readyResolve, 4000);

  TL.load(CDN + 'earth-blue-marble.jpg', (tex) => {
    earthMat.map = tex; earthMat.color.set(0x8290ac); earthMat.needsUpdate = true; settle();
  }, undefined, () => settle());
  TL.load(CDN + 'earth-night.jpg', (tex) => {
    earthMat.emissiveMap = tex;
    earthMat.emissive.set(0xffc06a);
    earthMat.emissiveIntensity = 1.55;
    earthMat.needsUpdate = true; settle();
  }, undefined, () => settle());

  // Bump + Specular maps for relief
  TL.load(CDN + 'earth-topology.png', (tex) => {
    earthMat.bumpMap = tex; earthMat.bumpScale = 0.015; earthMat.needsUpdate = true;
  });
  TL.load(CDN + 'earth-water.png', (tex) => {
    earthMat.specularMap = tex; earthMat.needsUpdate = true;
  });

  earthGroup.add(buildGraticule(RE_SCENE * 1.0015, 0x2aa7c8, 0.14));

  // ---- Clouds ----
  const cloudsMat = new THREE.MeshPhongMaterial({
    map: TL.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png'),
    transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(RE_SCENE * 1.008, 64, 64), cloudsMat);
  earthGroup.add(clouds);

  // ---- Atmosphere (Rayleigh Scattering Approx) ----
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(RE_SCENE * 1.05, 64, 64),
    new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: { 
        uSunPos: { value: new THREE.Vector3(5, 0, 0).normalize() },
        uColor: { value: new THREE.Color(0x3a8fe6) } 
      },
      vertexShader: `
        varying vec3 vNormal; varying vec3 vPos;
        void main(){ 
          vNormal = normalize(normalMatrix * normal);
          vPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vNormal; varying vec3 vPos;
        uniform vec3 uSunPos; uniform vec3 uColor;
        void main(){
          vec3 viewDir = normalize(cameraPosition - vPos);
          float intensity = pow(0.6 - dot(vNormal, viewDir), 3.0);
          float sunDot = dot(vNormal, uSunPos);
          float dayNight = smoothstep(-0.2, 0.2, sunDot);
          vec3 finalColor = uColor * clamp(intensity, 0.0, 1.0) * dayNight;
          gl_FragColor = vec4(finalColor, 1.0);
        }`,
    })
  );
  scene.add(atmo);

  // ---- Outer glow atmosphere (fake bloom) ----
  const outerAtmo = new THREE.Mesh(
    new THREE.SphereGeometry(RE_SCENE * 1.12, 48, 48),
    new THREE.MeshBasicMaterial({
      color: 0x1a5faa, transparent: true, opacity: 0.06,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  scene.add(outerAtmo);

  // ---- Sun glow sprite ----
  const sunGlowCanvas = document.createElement('canvas');
  sunGlowCanvas.width = 128; sunGlowCanvas.height = 128;
  const sctx = sunGlowCanvas.getContext('2d');
  if (sctx) {
    const grad = sctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,240,200,0.7)');
    grad.addColorStop(0.3, 'rgba(255,200,100,0.25)');
    grad.addColorStop(0.7, 'rgba(255,150,50,0.06)');
    grad.addColorStop(1, 'rgba(255,100,20,0)');
    sctx.fillStyle = grad; sctx.fillRect(0, 0, 128, 128);
  }
  const sunGlowTex = new THREE.CanvasTexture(sunGlowCanvas);
  const sunGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: sunGlowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  sunGlow.scale.set(3, 3, 1);
  scene.add(sunGlow);

  // ---- Day/night terminator line ----
  const terminatorGeom = new THREE.BufferGeometry();
  const terminatorPositions = new Float32Array(181 * 3);
  terminatorGeom.setAttribute('position', new THREE.BufferAttribute(terminatorPositions, 3));
  const terminatorLine = new THREE.Line(
    terminatorGeom,
    new THREE.LineBasicMaterial({
      color: 0x8ef0ff,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  scene.add(terminatorLine);

  const stars = buildStars(2600, 40);
  const orbitalBandField = buildOrbitalBandField();
  scene.add(stars);
  scene.add(orbitalBandField);

  // ---- Satellite point cloud ----
  let count = 0;
  let geom = new THREE.BufferGeometry();
  let posAttr: THREE.BufferAttribute;
  let colAttr: THREE.BufferAttribute;
  let visAttr: THREE.BufferAttribute;

  const satMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uPointSize: { value: DEFAULT_POINT_SIZE * Math.min(devicePixelRatio, 2) },
      uTime: { value: 0 },
    },
    vertexShader: `
      uniform float uPointSize;
      attribute float vis;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = clamp(vis, 0.0, 1.0);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float distanceScale = clamp(3.35 / max(0.75, -mvPosition.z), 0.46, 2.05);
          gl_PointSize = uPointSize * distanceScale * mix(0.32, 1.08, smoothstep(0.08, 1.0, vAlpha));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv) * 2.0;
        if (d > 1.0 || vAlpha <= 0.01) discard;
        float core = smoothstep(0.34, 0.0, d);
        float halo = pow(max(0.0, 1.0 - d), 2.7);
        float shimmer = 0.88 + 0.12 * sin(uTime * 2.8 + gl_FragCoord.x * 0.015 + gl_FragCoord.y * 0.011);
        float alpha = (core * 0.95 + halo * 0.52) * pow(vAlpha, 1.18) * shimmer;
        vec3 color = vColor * (0.58 + core * 1.45) + vec3(0.12, 0.22, 0.36) * halo;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    vertexColors: true,
  });

  const points = new THREE.Points(geom, satMat);
  points.frustumCulled = false;
  scene.add(points);

  function allocate(n: number): void {
    count = n;
    geom.dispose();
    geom = new THREE.BufferGeometry();
    posAttr = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    colAttr = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    visAttr = new THREE.BufferAttribute(new Float32Array(n).fill(1), 1);
    posAttr.usage = THREE.DynamicDrawUsage;
    visAttr.usage = THREE.DynamicDrawUsage;
    colAttr.usage = THREE.DynamicDrawUsage;
    geom.setAttribute('position', posAttr);
    geom.setAttribute('color', colAttr);
    geom.setAttribute('vis', visAttr);
    points.geometry = geom;
  }

  function writePositions(posBuf: Float32Array): void {
    if (!posAttr) return;
    const posArr = posAttr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const j = i * 3;
      posArr[j] = posBuf[j];
      posArr[j + 1] = posBuf[j + 1];
      posArr[j + 2] = posBuf[j + 2];
    }
    posAttr.needsUpdate = true;
  }
  function setColors(c: Float32Array): void {
    if (!colAttr) return;
    (colAttr.array as Float32Array).set(c.subarray(0, count * 3)); colAttr.needsUpdate = true;
  }
  function setVisible(v: Float32Array): void {
    if (!visAttr) return;
    const visArr = visAttr.array as Float32Array;
    visArr.set(v.subarray(0, count));
    visAttr.needsUpdate = true;
  }

  function getPos(i: number, out: THREE.Vector3): void {
    if (!posAttr || i < 0 || i >= count) return;
    out.set(posAttr.array[i * 3], posAttr.array[i * 3 + 1], posAttr.array[i * 3 + 2]);
  }

  // ---- Orbit polyline + lead trail ----
  let orbitGroup: THREE.Group | null = null;
  const orbitMats: THREE.Material[] = [];
  function clearOrbit(): void {
    if (!orbitGroup) return;
    scene.remove(orbitGroup);
    orbitGroup.traverse((obj) => {
      const line = obj as THREE.Line;
      line.geometry?.dispose();
    });
    for (const mat of orbitMats.splice(0)) mat.dispose();
    orbitGroup = null;
  }

  function setOrbit(arr: Float32Array | null): void {
    clearOrbit();
    if (!arr || arr.length < 6) return;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < arr.length; i += 3) pts.push(new THREE.Vector3(arr[i], arr[i + 1], arr[i + 2]));
    orbitGroup = new THREE.Group();
    const fullMat = new THREE.LineBasicMaterial({
      color: 0x4cc9f0, transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const leadMat = new THREE.LineBasicMaterial({
      color: 0x8ef0ff, transparent: true, opacity: 1.0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    orbitMats.push(fullMat, leadMat);
    orbitGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      fullMat
    ));
    const leadCount = Math.max(8, Math.floor(pts.length * 0.22));
    orbitGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts.slice(0, leadCount)),
      leadMat
    ));
    scene.add(orbitGroup);
  }

  // ---- Selection ring ----
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.052, 0.083, 56),
    new THREE.MeshBasicMaterial({
      color: 0xffffff, side: THREE.DoubleSide, transparent: true,
      opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  ring.visible = false;
  scene.add(ring);

  const selectedGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color: 0x8ef0ff,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  selectedGlow.visible = false;
  selectedGlow.scale.set(0.34, 0.34, 1);
  scene.add(selectedGlow);

  let footprintLine: THREE.Line | null = null;
  function clearFootprint(): void {
    if (!footprintLine) return;
    scene.remove(footprintLine);
    footprintLine.geometry.dispose();
    (footprintLine.material as THREE.Material).dispose();
    footprintLine = null;
  }

  const _selPos = new THREE.Vector3();
  function setSelected(i: number): void {
    if (i < 0 || i >= count) {
      ring.visible = false;
      selectedGlow.visible = false;
      clearFootprint();
      return;
    }
    getPos(i, _selPos);
    // Don't show ring if satellite collapsed to origin (failed propagation)
    if (_selPos.lengthSq() < 0.01) {
      ring.visible = false;
      selectedGlow.visible = false;
      clearFootprint();
      return;
    }
    ring.position.copy(_selPos);
    ring.visible = true;
    selectedGlow.position.copy(_selPos);
    selectedGlow.visible = true;
  }

  // ---- CSS2D Label ----
  const labelDiv = document.createElement('div');
  labelDiv.className = 'sat-label';
  labelDiv.style.cssText = 'pointer-events:none;white-space:nowrap';
  const label2D = new CSS2DObject(labelDiv);
  label2D.visible = false;
  scene.add(label2D);

  // ---- Nadir line ----
  let nadirLine: THREE.Line | null = null;
  function updateNadir(satPos: THREE.Vector3): void {
    if (nadirLine) { scene.remove(nadirLine); nadirLine.geometry.dispose(); nadirLine = null; }
    if (satPos.lengthSq() < 0.01) return;
    const surface = satPos.clone().normalize().multiplyScalar(RE_SCENE);
    nadirLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([satPos.clone(), surface]),
      new THREE.LineBasicMaterial({
        color: 0x8ef0ff, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    scene.add(nadirLine);
  }

  const _footNormal = new THREE.Vector3();
  const _footA = new THREE.Vector3();
  const _footB = new THREE.Vector3();
  const _footRef = new THREE.Vector3(0, 1, 0);
  function updateFootprint(satPos: THREE.Vector3, alt?: number): void {
    clearFootprint();
    if (satPos.lengthSq() < 0.01) return;
    const altKm = Math.max(0, alt ?? (satPos.length() - RE_SCENE) * 6378.137);
    if (altKm < 20) return;
    const angularRadius = Math.min(1.08, Math.acos(RE_SCENE / (RE_SCENE + altKm / 6378.137)));
    _footNormal.copy(satPos).normalize();
    if (Math.abs(_footNormal.dot(_footRef)) > 0.92) _footRef.set(1, 0, 0);
    else _footRef.set(0, 1, 0);
    _footA.crossVectors(_footNormal, _footRef).normalize();
    _footB.crossVectors(_footNormal, _footA).normalize();
    const pts: THREE.Vector3[] = [];
    const r = RE_SCENE * 1.004;
    for (let k = 0; k <= 144; k++) {
      const a = (k / 144) * Math.PI * 2;
      const p = _footNormal.clone().multiplyScalar(Math.cos(angularRadius))
        .add(_footA.clone().multiplyScalar(Math.sin(angularRadius) * Math.cos(a)))
        .add(_footB.clone().multiplyScalar(Math.sin(angularRadius) * Math.sin(a)))
        .normalize()
        .multiplyScalar(r);
      pts.push(p);
    }
    footprintLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({
        color: 0x06d6a0,
        transparent: true,
        opacity: 0.48,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    scene.add(footprintLine);
  }

  function setSelectedFull(i: number, name?: string, alt?: number): void {
    setSelected(i);
    if (i < 0 || i >= count || _selPos.lengthSq() < 0.01) {
      label2D.visible = false;
      if (nadirLine) { scene.remove(nadirLine); nadirLine.geometry.dispose(); nadirLine = null; }
      clearFootprint();
      return;
    }
    label2D.position.copy(_selPos);
    label2D.visible = true;
    const altStr = alt != null ? ` ${alt.toFixed(0)} km` : '';
    labelDiv.textContent = `${name || `SAT-${i}`}${altStr}`;
    updateNadir(_selPos);
    updateFootprint(_selPos, alt);
  }

  // ---- Region marker ----
  let regionMarker: THREE.Mesh | null = null;
  function setRegionMarker(lat: number | null, lon?: number): void {
    if (regionMarker) { earthGroup.remove(regionMarker); regionMarker.geometry.dispose(); regionMarker = null; }
    if (lat == null || lon == null) return;
    const phi   = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    const r = RE_SCENE * 1.002;
    const p = new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)
    );
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.06, 0.075, 40),
      new THREE.MeshBasicMaterial({
        color: 0x06d6a0, side: THREE.DoubleSide, transparent: true,
        opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    m.position.copy(p); m.lookAt(p.clone().multiplyScalar(2));
    regionMarker = m; earthGroup.add(m);
  }

  // ---- Camera fly ----
  let flyTarget: THREE.Vector3 | null = null;
  let focusTarget: THREE.Vector3 | null = null;
  let flyT = 0;
  function flyTo(p: THREE.Vector3): void {
    if (!p || !isFinite(p.x)) return;
    const dir = p.clone().normalize();
    const dist = Math.max(p.length() * 0.95 + 1.12, 2.05);
    flyTarget = dir.multiplyScalar(dist);
    focusTarget = p.clone().multiplyScalar(0.58);
    flyT = 0;
  }
  const DEFAULT_CAM = new THREE.Vector3(0, 1.4, 3.4);
  function resetView(): void {
    controls.target.set(0, 0, 0);
    flyTarget = DEFAULT_CAM.clone();
    focusTarget = new THREE.Vector3(0, 0, 0);
    flyT = 0;
  }
  function setAutoRotate(v: boolean): void { controls.autoRotate = v; }

  // ---- Picking ----
  let pickCb: ((i: number) => void) | null = null;
  function onPick(cb: (i: number) => void): void { pickCb = cb; }

  let downX = 0, downY = 0;
  const onPointerDown = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY; };
  const onPointerUp   = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
    if (!pickCb || !count || !posAttr) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const v = new THREE.Vector3();
    let best = -1, bestD = 14 * 14;
    const arr = posAttr.array, vis = visAttr.array;
    for (let i = 0; i < count; i++) {
      if (vis[i] < 0.5) continue;
      v.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
      const world = v.clone();
      v.project(camera);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * rect.width;
      const sy = (-v.y * 0.5 + 0.5) * rect.height;
      const d = (sx - mx) ** 2 + (sy - my) ** 2;
      if (d < bestD && !occludedByEarth(camera.position, world)) { bestD = d; best = i; }
    }
    pickCb(best);
  };
  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointerup', onPointerUp);

  const _oc = new THREE.Vector3();
  function occludedByEarth(camPos: THREE.Vector3, p: THREE.Vector3): boolean {
    const dir = _oc.copy(p).sub(camPos);
    const len = dir.length();
    if (len < 0.001) return false;
    dir.divideScalar(len);
    const t = -camPos.dot(dir);
    if (t < 0 || t > len) return false;
    const closest = camPos.clone().add(dir.multiplyScalar(t));
    return closest.length() < RE_SCENE * 0.995;
  }

  // ---- Render loop ----
  let gmstRot = 0;
  function setEarthRotation(gmst: number): void { gmstRot = gmst; }

  // Simple ECI sun approximation
  function setSunTime(timestampMs: number): void {
    const d = new Date(timestampMs);
    const startOfYear = new Date(d.getUTCFullYear(), 0, 1);
    const msInYear = 365.25 * 24 * 60 * 60 * 1000;
    const progress = (d.getTime() - startOfYear.getTime()) / msInYear;
    // Sun moves ~360 deg per year in ECI. Declination goes from -23.4 to +23.4
    const angle = progress * Math.PI * 2;
    const eclipticObliquity = 23.439 * Math.PI / 180;
    const x = Math.cos(angle);
    const y = Math.sin(angle) * Math.cos(eclipticObliquity);
    const z = Math.sin(angle) * Math.sin(eclipticObliquity);
    sun.position.set(x, z, -y).multiplyScalar(5);
    sunGlow.position.copy(sun.position);
    const sunDir = sun.position.clone().normalize();
    (atmo.material as THREE.ShaderMaterial).uniforms.uSunPos.value.copy(sunDir);
    updateTerminator(sunDir);
  }

  const _termA = new THREE.Vector3();
  const _termB = new THREE.Vector3();
  const _termRef = new THREE.Vector3(0, 1, 0);
  function updateTerminator(sunDir: THREE.Vector3): void {
    if (Math.abs(sunDir.dot(_termRef)) > 0.92) _termRef.set(1, 0, 0);
    else _termRef.set(0, 1, 0);
    _termA.crossVectors(sunDir, _termRef).normalize();
    _termB.crossVectors(sunDir, _termA).normalize();
    const arr = terminatorPositions;
    const r = RE_SCENE * 1.006;
    for (let i = 0; i <= 180; i++) {
      const a = (i / 180) * Math.PI * 2;
      const p = _termA.clone().multiplyScalar(Math.cos(a)).add(_termB.clone().multiplyScalar(Math.sin(a))).multiplyScalar(r);
      const j = i * 3;
      arr[j] = p.x;
      arr[j + 1] = p.y;
      arr[j + 2] = p.z;
    }
    (terminatorGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  let rafId = 0;
  let cloudRot = 0;
  function renderOnce(): void {
    const now = performance.now();
    satMat.uniforms.uTime.value = now * 0.001;
    earthGroup.rotation.y = gmstRot + Math.PI;
    cloudRot += 0.0002;
    clouds.rotation.y = cloudRot;

    if (flyTarget) {
      flyT = Math.min(1, flyT + 0.025);
      const e = 1 - Math.pow(1 - flyT, 3);
      camera.position.lerp(flyTarget, e * 0.22);
      if (focusTarget) controls.target.lerp(focusTarget, e * 0.2);
      if (flyT >= 1) flyTarget = null;
    }
    if (ring.visible) {
      ring.lookAt(camera.position);
      ring.scale.setScalar(1 + 0.15 * Math.sin(now * 0.006));
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.5 * Math.abs(Math.sin(now * 0.003));
    }
    if (selectedGlow.visible) {
      selectedGlow.scale.setScalar(0.31 + 0.07 * Math.sin(now * 0.004));
      (selectedGlow.material as THREE.SpriteMaterial).opacity = 0.58 + 0.22 * Math.sin(now * 0.0037);
    }
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  function loop(): void {
    rafId = requestAnimationFrame(loop);
    renderOnce();
  }

  function resize(): void {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  let resizeRaf = 0;
  const onResize = () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      resize();
    });
  };
  window.addEventListener('resize', onResize);
  resize();
  loop();

  // ---- Cleanup ----
  function destroy(): void {
    cancelAnimationFrame(rafId);
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    clearTimeout(textureTimeout);
    window.removeEventListener('resize', onResize);
    container.removeEventListener('pointerdown', onPointerDown);
    container.removeEventListener('pointerup', onPointerUp);
    controls.dispose();
    clearOrbit();
    clearFootprint();
    geom.dispose();
    terminatorGeom.dispose();
    (terminatorLine.material as THREE.Material).dispose();
    stars.geometry.dispose();
    (stars.material as THREE.Material).dispose();
    orbitalBandField.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
      else mesh.material?.dispose();
    });
    ring.geometry.dispose();
    (ring.material as THREE.Material).dispose();
    selectedGlow.material.map?.dispose();
    selectedGlow.material.dispose();
    earth.geometry.dispose();
    earthMat.dispose();
    clouds.geometry.dispose();
    cloudsMat.dispose();
    outerAtmo.geometry.dispose();
    (outerAtmo.material as THREE.Material).dispose();
    atmo.geometry.dispose();
    (atmo.material as THREE.Material).dispose();
    sunGlow.material.map?.dispose();
    sunGlow.material.dispose();
    satMat.dispose();
    renderer.dispose();
    if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    if (container.contains(labelRenderer.domElement)) container.removeChild(labelRenderer.domElement);
  }

  return {
    allocate, writePositions, setColors, setVisible,
    getPos: (i, out) => getPos(i, out as THREE.Vector3),
    setOrbit, setSelected: setSelectedFull, setRegionMarker,
    flyTo: (p) => flyTo(p as THREE.Vector3),
    setAutoRotate, setEarthRotation, setSunTime, onPick, resize, renderOnce, resetView,
    ready: readyPromise,
    destroy,
  };
}

// ---- Helpers ----

function makeGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.22, 'rgba(142,240,255,0.72)');
    g.addColorStop(0.58, 'rgba(76,201,240,0.22)');
    g.addColorStop(1, 'rgba(76,201,240,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function buildOrbitalBandField(): THREE.Group {
  const group = new THREE.Group();
  const configs: Array<{ r: number; tube: number; color: number; opacity: number; incl: number; raan: number }> = [
    { r: 1.085, tube: 0.004, color: 0x4cc9f0, opacity: 0.16, incl: 53, raan: 0 },
    { r: 1.12, tube: 0.003, color: 0x7aa2ff, opacity: 0.10, incl: 97, raan: 35 },
    { r: 3.24, tube: 0.006, color: 0xb388ff, opacity: 0.10, incl: 56, raan: 18 },
    { r: 6.61, tube: 0.008, color: 0xffd166, opacity: 0.13, incl: 0, raan: 0 },
  ];

  for (const c of configs) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(c.r, c.tube, 8, 240),
      new THREE.MeshBasicMaterial({
        color: c.color,
        transparent: true,
        opacity: c.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.rotation.z = THREE.MathUtils.degToRad(c.raan);
    ring.rotation.y = THREE.MathUtils.degToRad(c.incl);
    group.add(ring);
  }

  return group;
}

function buildGraticule(r: number, color: number, opacity: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  for (let lat = -60; lat <= 60; lat += 30) {
    const pts: THREE.Vector3[] = [];
    const rr = r * Math.cos(lat * Math.PI / 180), y = r * Math.sin(lat * Math.PI / 180);
    for (let a = 0; a <= 360; a += 4)
      pts.push(new THREE.Vector3(rr * Math.cos(a * Math.PI / 180), y, rr * Math.sin(a * Math.PI / 180)));
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }
  for (let lon = 0; lon < 180; lon += 30) {
    const pts: THREE.Vector3[] = [];
    for (let a = 0; a <= 360; a += 4) {
      const ph = a * Math.PI / 180;
      pts.push(new THREE.Vector3(
        r * Math.cos(ph) * Math.cos(lon * Math.PI / 180),
        r * Math.sin(ph),
        r * Math.cos(ph) * Math.sin(lon * Math.PI / 180)
      ));
    }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }
  return g;
}

function buildStars(n: number, radius: number): THREE.Points {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random(), v = Math.random();
    const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
    const r = radius * (0.8 + Math.random() * 0.2);
    pos[i * 3]     = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph);
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    const b = 0.4 + Math.random() * 0.6;
    col[i * 3] = b * 0.8; col[i * 3 + 1] = b * 0.9; col[i * 3 + 2] = b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({
    size: 0.06, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity: 0.9, depthWrite: false,
  }));
}
