// ============================================================
// OrbitIQ — Three.js Globe renderer
// Vanilla (no React) for raw point-cloud performance.
// Renders in ECI frame; Earth mesh spins under a fixed satellite frame.
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
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

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 1.25;
  controls.maxDistance = 14;
  controls.rotateSpeed = 0.5;
  controls.autoRotateSpeed = 0.35;

  // ECI inertial frame: Earth group spins under fixed satellite positions
  const earthGroup = new THREE.Group();
  scene.add(earthGroup);

  // ---- Lighting ----
  scene.add(new THREE.AmbientLight(0x3a4a66, 0.9));
  const sun = new THREE.DirectionalLight(0xeaf2ff, 1.25);
  sun.position.set(5, 2, 4);
  scene.add(sun);

  // ---- Earth ----
  const earthMat = new THREE.MeshPhongMaterial({
    color: 0x0a1830, emissive: 0x04101f, specular: 0x16243a, shininess: 12,
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

  earthGroup.add(buildGraticule(RE_SCENE * 1.0015, 0x2aa7c8, 0.14));

  // ---- Atmosphere ----
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(RE_SCENE * 1.13, 64, 64),
    new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(0x2e8fe6) } },
      vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix*normal);
        gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec3 vN; uniform vec3 uColor;
        void main(){ float i = pow(0.66 - dot(vN, vec3(0.0,0.0,1.0)), 4.2);
          gl_FragColor = vec4(uColor, 1.0)*clamp(i,0.0,0.9);}`,
    })
  );
  scene.add(atmo);

  scene.add(buildStars(2600, 40));

  // ---- Satellite point cloud ----
  let count = 0;
  let geom = new THREE.BufferGeometry();
  let posAttr: THREE.BufferAttribute;
  let colAttr: THREE.BufferAttribute;
  let visAttr: THREE.BufferAttribute;

  const satMat = new THREE.ShaderMaterial({
    transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uSize: { value: 0.0145 }, uScale: { value: 700 } },
    vertexShader: `
      attribute vec3 color; attribute float vis;
      varying vec3 vColor; varying float vVis;
      uniform float uSize; uniform float uScale;
      void main(){
        vColor = color; vVis = vis;
        vec4 mv = modelViewMatrix*vec4(position,1.0);
        gl_PointSize = vis * uSize * (uScale / -mv.z);
        gl_PointSize = clamp(gl_PointSize, vis > 0.5 ? 1.6 : 0.0, 7.0);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vVis;
      void main(){
        vec2 d = gl_PointCoord - vec2(0.5);
        float r = length(d);
        if(r>0.5) discard;
        float core = smoothstep(0.5,0.0,r);
        vec3 c = vColor + vec3(0.55) * pow(core, 3.5);
        gl_FragColor = vec4(c, (0.45 + 0.55*core) * vVis);
      }`,
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
    (posAttr.array as Float32Array).set(posBuf.subarray(0, count * 3));
    posAttr.needsUpdate = true;
  }
  function setColors(c: Float32Array): void {
    if (!colAttr) return;
    (colAttr.array as Float32Array).set(c.subarray(0, count * 3)); colAttr.needsUpdate = true;
  }
  function setVisible(v: Float32Array): void {
    if (!visAttr) return;
    (visAttr.array as Float32Array).set(v.subarray(0, count)); visAttr.needsUpdate = true;
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
  function setSelected(i: number): void {
    if (i < 0 || i >= count) { ring.visible = false; return; }
    getPos(i, _selPos);
    // Don't show ring if satellite collapsed to origin (failed propagation)
    if (_selPos.lengthSq() < 0.01) { ring.visible = false; return; }
    ring.position.copy(_selPos);
    ring.visible = true;
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
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);

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

  let rafId = 0;
  function renderOnce(): void {
    earthGroup.rotation.y = gmstRot + Math.PI;
    if (flyTarget) {
      flyT = Math.min(1, flyT + 0.035);
      const e = 1 - Math.pow(1 - flyT, 3);
      camera.position.lerp(flyTarget, e * 0.25);
      if (flyT >= 1) flyTarget = null;
    }
    if (ring.visible) ring.lookAt(camera.position);
    ring.scale.setScalar(1 + 0.12 * Math.sin(performance.now() * 0.005));
    controls.update();
    renderer.render(scene, camera);
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
    camera.aspect = w / h; camera.updateProjectionMatrix();
    satMat.uniforms['uScale'].value = h / (2 * Math.tan((camera.fov * Math.PI / 180) / 2));
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
    renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    renderer.domElement.removeEventListener('pointerup', onPointerUp);
    controls.dispose();
    geom.dispose();
    earthMat.dispose();
    satMat.dispose();
    renderer.dispose();
    if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
  }

  return {
    allocate, writePositions, setColors, setVisible,
    getPos: (i, out) => getPos(i, out as THREE.Vector3),
    setOrbit, setSelected, setRegionMarker,
    flyTo: (p) => flyTo(p as THREE.Vector3),
    setAutoRotate, setEarthRotation, onPick, resize, renderOnce, resetView,
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
