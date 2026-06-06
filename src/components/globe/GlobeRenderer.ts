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
    earthMat.emissiveIntensity = 1.3;
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
    transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false
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
  const sctx = sunGlowCanvas.getContext('2d')!;
  const grad = sctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,240,200,0.7)');
  grad.addColorStop(0.3, 'rgba(255,200,100,0.25)');
  grad.addColorStop(0.7, 'rgba(255,150,50,0.06)');
  grad.addColorStop(1, 'rgba(255,100,20,0)');
  sctx.fillStyle = grad; sctx.fillRect(0, 0, 128, 128);
  const sunGlowTex = new THREE.CanvasTexture(sunGlowCanvas);
  const sunGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: sunGlowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  sunGlow.scale.set(3, 3, 1);
  scene.add(sunGlow);

  scene.add(buildStars(2600, 40));

  // ---- Satellite point cloud ----
  let count = 0;
  let geom = new THREE.BufferGeometry();
  let posAttr: THREE.BufferAttribute;
  let colAttr: THREE.BufferAttribute;
  let visAttr: THREE.BufferAttribute;

  // ---- Generate glow texture for satellites (DataTexture — Metal safe) ----
  const TEX_SIZE = 128;
  const texData = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  const center = TEX_SIZE / 2;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const dx = x - center + 0.5, dy = y - center + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy) / center;
      
      if (dist > 1.0) {
        const idx = (y * TEX_SIZE + x) * 4;
        texData[idx] = texData[idx + 1] = texData[idx + 2] = texData[idx + 3] = 0;
        continue;
      }

      // Crisp solid bright core with a soft glowing halo transition
      let alpha = 0;
      let bright = 0;
      if (dist <= 0.28) {
        alpha = 1.0;
        bright = 1.0;
      } else if (dist <= 0.42) {
        const t = (dist - 0.28) / (0.42 - 0.28);
        alpha = 1.0 - t * 0.4;
        bright = 1.0 - t;
      } else {
        const t = (dist - 0.42) / (1.0 - 0.42);
        alpha = 0.6 * Math.pow(1.0 - t, 2.5);
        bright = 0;
      }

      const idx = (y * TEX_SIZE + x) * 4;
      texData[idx]     = Math.round(200 + 55 * bright);   // R
      texData[idx + 1] = Math.round(220 + 35 * bright);   // G
      texData[idx + 2] = 255;                             // B
      texData[idx + 3] = Math.round(alpha * 255);         // A
    }
  }
  const glowTex = new THREE.DataTexture(texData, TEX_SIZE, TEX_SIZE, THREE.RGBAFormat);
  glowTex.minFilter = THREE.LinearFilter;
  glowTex.magFilter = THREE.LinearFilter;
  glowTex.needsUpdate = true;

  const satMat = new THREE.PointsMaterial({
    size: 0.032, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity: 0.95, depthWrite: false,
    blending: THREE.AdditiveBlending,
    map: glowTex,
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
    const visArr = visAttr ? (visAttr.array as Float32Array) : null;
    for (let i = 0; i < count; i++) {
      const j = i * 3;
      if (visArr && visArr[i] < 0.5) {
        posArr[j] = posArr[j + 1] = posArr[j + 2] = 0;
      } else {
        posArr[j] = posBuf[j];
        posArr[j + 1] = posBuf[j + 1];
        posArr[j + 2] = posBuf[j + 2];
      }
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
    if (posAttr) {
      const posArr = posAttr.array as Float32Array;
      for (let i = 0; i < count; i++) {
        if (v[i] < 0.5) {
          const j = i * 3;
          posArr[j] = posArr[j + 1] = posArr[j + 2] = 0;
        }
      }
      posAttr.needsUpdate = true;
    }
  }

  function getPos(i: number, out: THREE.Vector3): void {
    if (!posAttr || i < 0 || i >= count) return;
    out.set(posAttr.array[i * 3], posAttr.array[i * 3 + 1], posAttr.array[i * 3 + 2]);
  }

  // ---- Orbit polyline ----
  let orbitLine: THREE.Line | null = null;
  function setOrbit(arr: Float32Array | null): void {
    if (orbitLine) { scene.remove(orbitLine); orbitLine.geometry.dispose(); orbitLine = null; }
    if (!arr || arr.length < 6) return;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < arr.length; i += 3) pts.push(new THREE.Vector3(arr[i], arr[i + 1], arr[i + 2]));
    orbitLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({
        color: 0x4cc9f0, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    scene.add(orbitLine);
  }

  // ---- Selection ring ----
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.045, 0.065, 40),
    new THREE.MeshBasicMaterial({
      color: 0xffffff, side: THREE.DoubleSide, transparent: true,
      opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  ring.visible = false;
  scene.add(ring);

  const _selPos = new THREE.Vector3();
  function setSelected(i: number, _name?: string, _alt?: number): void {
    if (i < 0 || i >= count) { ring.visible = false; return; }
    getPos(i, _selPos);
    // Don't show ring if satellite collapsed to origin (failed propagation)
    if (_selPos.lengthSq() < 0.01) { ring.visible = false; return; }
    ring.position.copy(_selPos);
    ring.visible = true;
  }

  // ---- CSS2D Label ----
  const labelDiv = document.createElement('div');
  labelDiv.className = 'sat-label';
  labelDiv.style.cssText = 'color:#e0e8f8;font-size:11px;font-family:"IBM Plex Mono",monospace;background:rgba(10,20,40,0.75);padding:3px 8px;border-radius:4px;border:1px solid rgba(74,175,240,0.3);pointer-events:none;backdrop-filter:blur(4px);white-space:nowrap';
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
        color: 0x00eeff, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    scene.add(nadirLine);
  }

  function setSelectedFull(i: number, name?: string, alt?: number): void {
    setSelected(i, name, alt);
    if (i < 0 || i >= count || _selPos.lengthSq() < 0.01) {
      label2D.visible = false;
      if (nadirLine) { scene.remove(nadirLine); nadirLine.geometry.dispose(); nadirLine = null; }
      return;
    }
    label2D.position.copy(_selPos);
    label2D.visible = true;
    const altStr = alt != null ? ` ${alt.toFixed(0)} km` : '';
    labelDiv.textContent = `${name || `SAT-${i}`}${altStr}`;
    updateNadir(_selPos);
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
  let flyTarget: THREE.Vector3 | null = null, flyT = 0;
  function flyTo(p: THREE.Vector3): void {
    if (!p || !isFinite(p.x)) return;
    const dir = p.clone().normalize();
    const dist = Math.max(p.length() * 1.1 + 1.35, 2.4);
    flyTarget = dir.multiplyScalar(dist); flyT = 0;
  }
  const DEFAULT_CAM = new THREE.Vector3(0, 1.4, 3.4);
  function resetView(): void {
    controls.target.set(0, 0, 0);
    flyTarget = DEFAULT_CAM.clone(); flyT = 0;
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
    (atmo.material as THREE.ShaderMaterial).uniforms.uSunPos.value.copy(sun.position).normalize();
  }

  let rafId = 0;
  let cloudRot = 0;
  function renderOnce(): void {
    earthGroup.rotation.y = gmstRot + Math.PI;
    cloudRot += 0.0002;
    clouds.rotation.y = cloudRot;

    if (flyTarget) {
      flyT = Math.min(1, flyT + 0.035);
      const e = 1 - Math.pow(1 - flyT, 3);
      camera.position.lerp(flyTarget, e * 0.25);
      if (flyT >= 1) flyTarget = null;
    }
    if (ring.visible) {
      ring.lookAt(camera.position);
      ring.scale.setScalar(1 + 0.15 * Math.sin(performance.now() * 0.006));
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.5 * Math.abs(Math.sin(performance.now() * 0.003));
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

  const onResize = () => resize();
  window.addEventListener('resize', onResize);
  resize();
  loop();

  // ---- Cleanup ----
  function destroy(): void {
    cancelAnimationFrame(rafId);
    clearTimeout(textureTimeout);
    window.removeEventListener('resize', onResize);
    container.removeEventListener('pointerdown', onPointerDown);
    container.removeEventListener('pointerup', onPointerUp);
    controls.dispose();
    geom.dispose();
    earthMat.dispose();
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
