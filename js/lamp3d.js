// «Лучина» — a small evening scene: the lamp on a stone table, an old svetets with a burning splinter,
// moss and a branch that throws its shadow on the wall. Everything is built in code (no model files).
// Units: 1 = 10 cm. Table top at y = 0, wall at z = -2.4.
import * as THREE from './three.module.min.js';
import { EffectComposer } from './pp/EffectComposer.js';
import { RenderPass } from './pp/RenderPass.js';
import { UnrealBloomPass } from './pp/UnrealBloomPass.js';
import { OutputPass } from './pp/OutputPass.js';

const WARM = new THREE.Color('#ffae5c');
const STRIP_H = 2.6, STRIP_W = .2, STRIP_T = .055, GLOW_H = .62, SEAT = .36;

// ------------------------------------------------------------------ small helpers
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function vnoise2(seed) {
  const r = rng(seed), P = new Float32Array(256 * 256); for (let i = 0; i < P.length; i++) P[i] = r();
  const at = (x, y) => P[((y & 255) << 8) | (x & 255)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function canvasTex(w, h, draw, srgb = true, repeat = null) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function pixels(w, h, fn) {         // per-pixel canvas painter: fn(x, y) -> [r, g, b]
  return (g) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const [r, gg, b] = fn(x, y), i = (y * w + x) * 4;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  };
}
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const ease = (x) => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

// ------------------------------------------------------------------ textures
function oakTex(pale = false) {
  const n = vnoise2(3), W = 128, H = 1024;
  return canvasTex(W, H, pixels(W, H, (x, y) => {
    const w = x + 9 * n(y * .012, 1) + 3 * n(y * .05, 7);
    const ring = .5 + .5 * Math.sin(w * .55 + 4 * n(x * .02, y * .004));
    const fine = n(x * .9, y * .03);
    const fleck = n(x * .25, y * .5) > .82 ? .1 : 0;
    let k = .78 + .14 * ring + .08 * fine + fleck;
    const base = pale ? [236, 214, 178] : [196, 152, 98];
    return base.map((c, i) => clamp(c * k * (i === 2 ? .96 : 1), 0, 255));
  }));
}
function stoneTex(base, seed, W = 512, H = 512, rough = 1) {
  const n = vnoise2(seed), r = rng(seed + 1);
  return canvasTex(W, H, pixels(W, H, (x, y) => {
    const v = .55 * n(x * .02, y * .02) + .3 * n(x * .08, y * .08) + .15 * n(x * .3, y * .3);
    const sp = r() < .04 * rough ? (r() - .5) * .5 : 0;
    const k = .78 + .42 * v + sp;
    return base.map(c => clamp(c * k, 0, 255));
  }));
}
function flameTex() {               // soft radial sprite for smoke
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(.5, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }, false);
}
function sprigTex() {               // thuja-like frond with alpha, used for the branch (and its shadow)
  return canvasTex(256, 512, (g, W, H) => {
    const r = rng(11);
    g.clearRect(0, 0, W, H);
    const frond = (x, y, ang, len, w, depth) => {
      const ex = x + Math.sin(ang) * len, ey = y - Math.cos(ang) * len;
      g.strokeStyle = '#3d5a2a'; g.lineWidth = Math.max(1, w * .35);
      g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
      const steps = Math.floor(len / 5);
      for (let i = 0; i < steps; i++) {
        const t = i / steps, px = x + (ex - x) * t, py = y + (ey - y) * t, s = w * (1 - t * .7);
        for (const side of [-1, 1]) {
          const a = ang + side * (.9 + r() * .3);
          g.fillStyle = `hsl(${92 + r() * 18}, ${38 + r() * 14}%, ${24 + r() * 16}%)`;
          g.beginPath(); g.ellipse(px + Math.sin(a) * s * .6, py - Math.cos(a) * s * .6, s * .55, s * .24, a, 0, Math.PI * 2); g.fill();
        }
        if (depth > 0 && i % 4 === 2 && t < .8) frond(px, py, ang + (i % 8 === 2 ? .7 : -.7), len * .42 * (1 - t), w * .7, depth - 1);
      }
    };
    frond(128, 500, 0, 470, 26, 2);
  }, true);
}

// ------------------------------------------------------------------ studio environment for subtle reflections
function envScene() {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: '#0c0a09', side: THREE.BackSide })));
  const p = (w, h, c, k, pos) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(0, 0, 0); s.add(m); };
  p(8, 3, '#ffd9a8', 1.6, [4, 6, 6]); p(3, 8, '#ffffff', .6, [-9, 2, 4]);
  return s;
}

// ------------------------------------------------------------------ builders
function buildRoom(scene) {
  const wallMat = new THREE.MeshStandardMaterial({ map: stoneTex([62, 56, 48], 5, 512, 512, .2), roughness: .95 });
  wallMat.map.wrapS = wallMat.map.wrapT = THREE.RepeatWrapping; wallMat.map.repeat.set(4, 2);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), wallMat); wall.position.set(0, 5, -2.4); wall.receiveShadow = true; scene.add(wall);
  const topMat = new THREE.MeshStandardMaterial({ map: stoneTex([70, 68, 64], 9, 512, 512, 1.5), roughness: .55, metalness: 0 });
  topMat.map.wrapS = topMat.map.wrapT = THREE.RepeatWrapping; topMat.map.repeat.set(5, 3);
  const top = new THREE.Mesh(new THREE.BoxGeometry(30, .6, 8), topMat); top.position.set(0, -.3, 1.6); top.receiveShadow = true; scene.add(top);
  return { wall, top };
}

function buildLamp() {
  const g = new THREE.Group();
  // pebble base: squashed, slightly irregular
  const pg = new THREE.SphereGeometry(1, 72, 36), pos = pg.attributes.position, n = vnoise2(21);
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 + .06 * (n(x * 2 + 5, z * 2 + 3) - .5) + .03 * (n(x * 6, y * 6 + z * 3) - .5);
    x *= .74 * k; z *= .64 * k; y = (y < 0 ? y * .1 : y * .42) * k;
    pos.setXYZ(i, x, y, z);
  }
  pg.computeVertexNormals();
  const pebble = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: stoneTex([138, 138, 134], 31, 512, 256, 2.5), roughness: .88 }));
  pebble.position.y = .02; pebble.castShadow = pebble.receiveShadow = true; g.add(pebble);
  // charging ring around the slot (lights up when the strip is taken out)
  const ringMat = new THREE.MeshStandardMaterial({ color: '#2a2016', emissive: WARM, emissiveIntensity: 0, roughness: .4 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.17, .012, 10, 64), ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = .45; g.add(ring);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(STRIP_W + .03, .02, STRIP_T + .03), new THREE.MeshStandardMaterial({ color: '#0e0c0a', roughness: 1 }));
  slot.position.y = .44; g.add(slot);
  // the strip: oak body + frosted glowing top; its pivot sits at the slot
  const strip = new THREE.Group(); strip.position.y = SEAT; g.add(strip);
  const bodyH = STRIP_H - GLOW_H;
  const body = new THREE.Mesh(new THREE.BoxGeometry(STRIP_W, bodyH, STRIP_T), new THREE.MeshStandardMaterial({ map: oakTex(), roughness: .62 }));
  body.position.y = bodyH / 2; body.castShadow = true; strip.add(body);
  // emissive profile along the glowing section, rewritten every frame (burn-down / brightness / flicker)
  const prof = document.createElement('canvas'); prof.width = 4; prof.height = 128;
  const profTex = new THREE.CanvasTexture(prof); profTex.colorSpace = THREE.SRGBColorSpace;
  const glowMat = new THREE.MeshStandardMaterial({ map: oakTex(true), color: '#e9d9c0', roughness: .5, emissive: WARM, emissiveMap: profTex, emissiveIntensity: 2 });
  // cut the top at a slight angle, like a split splinter
  const gg = new THREE.BoxGeometry(STRIP_W, GLOW_H, STRIP_T, 1, 16, 1), gp = gg.attributes.position;
  for (let i = 0; i < gp.count; i++) if (gp.getY(i) > GLOW_H / 2 - 1e-4) gp.setY(i, gp.getY(i) + (gp.getX(i) / STRIP_W) * .12);
  gg.computeVertexNormals();
  const glow = new THREE.Mesh(gg, glowMat); glow.position.y = bodyH + GLOW_H / 2; glow.castShadow = false; strip.add(glow);
  // cord: braided moss-green textile, from the back of the pebble along the table
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(.55, .1, -.25), new THREE.Vector3(1.1, .03, -.35), new THREE.Vector3(2.2, .03, .1), new THREE.Vector3(3.4, .03, .9), new THREE.Vector3(5.5, .03, 1.2)]);
  const cordTex = canvasTex(64, 16, (c) => { for (let x = 0; x < 64; x++) { c.fillStyle = x % 8 < 4 ? '#6f7848' : '#5a6238'; c.fillRect(x, 0, 1, 16); } }, true, [40, 1]);
  const cord = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, .035, 10), new THREE.MeshStandardMaterial({ map: cordTex, roughness: .9 }));
  cord.castShadow = cord.receiveShadow = true; g.add(cord);
  // light sources: warm point light at the glow (with shadows), and a torch spot used when the strip is taken out
  const light = new THREE.PointLight(WARM, 0, 14, 1.6); light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024); light.shadow.bias = -.004; light.shadow.radius = 6; light.position.y = bodyH + GLOW_H * .6; strip.add(light);
  const spot = new THREE.SpotLight(WARM, 0, 16, .42, .65, 1.3); spot.position.y = STRIP_H; strip.add(spot);
  const spotTarget = new THREE.Object3D(); spotTarget.position.set(0, STRIP_H + 4, 0); strip.add(spotTarget); spot.target = spotTarget;
  return { group: g, strip, glow, glowMat, prof, profTex, light, spot, ringMat, body };
}

function buildSvetets(smokeSprite) {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: '#2a221d', roughness: .62, metalness: .7 });
  const add = (geo, m = iron) => { const o = new THREE.Mesh(geo, m); o.castShadow = true; g.add(o); return o; };
  // tripod legs: curved tubes
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 + .4, dx = Math.cos(a), dz = Math.sin(a);
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, .62, 0), new THREE.Vector3(dx * .35, .42, dz * .35), new THREE.Vector3(dx * .7, .12, dz * .7), new THREE.Vector3(dx * .82, .02, dz * .82)]);
    add(new THREE.TubeGeometry(c, 24, .045, 8));
  }
  add(new THREE.SphereGeometry(.07, 16, 12)).position.y = .62;
  const rod = add(new THREE.CylinderGeometry(.055, .07, 2.2, 12)); rod.position.y = .62 + 1.1;
  for (const y of [1.35, 2.25]) { const k = add(new THREE.TorusGeometry(.085, .035, 8, 24)); k.rotation.x = Math.PI / 2; k.position.y = y; }
  // fork clamp on top
  const forkY = .62 + 2.2;
  for (const s of [-1, 1]) { const f = add(new THREE.CylinderGeometry(.02, .025, .28, 8)); f.position.set(s * .07, forkY + .12, 0); f.rotation.z = -s * .25; }
  // the splinter (luchina): long, flat, tilted; charred toward the burning end
  const spl = new THREE.Group(); spl.position.set(0, forkY + .14, 0); spl.rotation.z = -.55; g.add(spl);
  const charTex = canvasTex(16, 256, (c) => {
    const gr = c.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#120c08'); gr.addColorStop(.12, '#3a2414'); gr.addColorStop(.2, '#c8a070'); gr.addColorStop(1, '#d2ab78');
    c.fillStyle = gr; c.fillRect(0, 0, 16, 256);
  });
  const sp = new THREE.Mesh(new THREE.BoxGeometry(.11, 2.1, .018), new THREE.MeshStandardMaterial({ map: charTex, roughness: .8 }));
  sp.position.y = .4; sp.castShadow = true; spl.add(sp);
  const tip = new THREE.Object3D(); tip.position.y = .4 + 1.05; spl.add(tip);
  // flame: camera-facing sprite with a noise shader
  const fMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uK: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0., 0., 0., 1.); mv.xy += position.xy; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec2 vUv; uniform float uT, uK;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vUv - vec2(.5, .12);
        float wob = (n(vec2(p.y * 4. - uT * 3., uT)) - .5) * .18 * p.y * 2.;
        p.x += wob;
        float w = .17 * (1. - smoothstep(0., .85, p.y)) * smoothstep(-.12, .06, p.y);
        float d = abs(p.x) / max(w, 1e-3);
        float body = (1. - smoothstep(.55, 1., d)) * smoothstep(-.1, .05, p.y);
        float flick = .85 + .15 * n(vec2(uT * 9., 3.));
        float core = (1. - smoothstep(.0, .55, d)) * (1. - smoothstep(.0, .35, p.y));
        vec3 c = mix(vec3(1., .42, .08), vec3(1., .78, .42), core) + vec3(.2, .3, .9) * (1. - smoothstep(-.1, .02, p.y)) * (1. - smoothstep(0., .6, d)) * .5;
        gl_FragColor = vec4(c * body * flick * 2.2 * uK, 1.);
      }` });
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(.42, .9), fMat); flame.position.y = .3; tip.add(flame);
  const fl = new THREE.PointLight('#ff9a48', 0, 12, 1.7); fl.position.y = .2; fl.castShadow = true; fl.shadow.mapSize.set(512, 512); fl.shadow.bias = -.004; tip.add(fl);
  // smoke particles
  const smoke = []; const sMat = new THREE.SpriteMaterial({ map: smokeSprite, color: '#bdb5aa', transparent: true, depthWrite: false, opacity: 0 });
  for (let i = 0; i < 26; i++) { const s = new THREE.Sprite(sMat.clone()); s.userData.t = i / 26; g.add(s); smoke.push(s); }
  // soot stain on the wall above the flame (grows while the splinter burns)
  const sootTex = canvasTex(256, 256, (c) => {
    const gr = c.createRadialGradient(128, 160, 4, 128, 140, 128);
    gr.addColorStop(0, 'rgba(8,6,4,.9)'); gr.addColorStop(.45, 'rgba(8,6,4,.45)'); gr.addColorStop(1, 'rgba(8,6,4,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 256, 256);
  }, false);
  const soot = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4), new THREE.MeshBasicMaterial({ map: sootTex, transparent: true, depthWrite: false, opacity: 0 }));
  return { group: g, tip, flame, fMat, light: fl, smoke, soot };
}

function buildMoss(scene) {
  const blade = new THREE.ConeGeometry(.016, .09, 4); blade.translate(0, .045, 0);
  const N = 6000, mesh = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ roughness: 1 }), N);
  const r = rng(77), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const patches = [[-3.9, 2.2, 1.5], [-4.6, 1.0, 1.1], [-2.8, 3.1, 1.2], [-5.2, 2.8, 1.4]];
  for (let i = 0; i < N; i++) {
    const [cx, cz, rad] = patches[i % patches.length];
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d * .7, h = (1 - d / rad) * .16;
    p.set(x, h * 1.6, z); e.set((r() - .5) * .8, r() * 6, (r() - .5) * .8); q.setFromEuler(e);
    const k = .7 + r() * .8; s.set(k, k * (.8 + r() * .6), k);
    m.compose(p, q, s); mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.setHSL(.24 + r() * .05, .45 + r() * .2, .13 + r() * .12));
  }
  mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
  // soft mounds under the blades so the moss reads as a cushion, not grass
  const mm = new THREE.MeshStandardMaterial({ color: '#23300f', roughness: 1 });
  for (const [cx, cz, rad] of patches) {
    const m2 = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mm);
    m2.scale.set(rad, .2, rad * .7); m2.position.set(cx, -.02, cz); m2.receiveShadow = true; scene.add(m2);
  }
  return mesh;
}

function buildBranch(scene, tex) {
  const g = new THREE.Group();
  const stemCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(3.9, 0, -1.7), new THREE.Vector3(3.6, 1.2, -1.65), new THREE.Vector3(3.2, 2.4, -1.6), new THREE.Vector3(2.85, 3.4, -1.55), new THREE.Vector3(2.65, 4.3, -1.5)]);
  const stem = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 60, .025, 6), new THREE.MeshStandardMaterial({ color: '#3b2c20', roughness: .9 }));
  stem.castShadow = true; g.add(stem);
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: .45, side: THREE.DoubleSide, roughness: .9 });
  const dist = new THREE.MeshDistanceMaterial({ map: tex, alphaTest: .45 });
  const r = rng(5);
  for (let i = 0; i < 34; i++) {
    const t = .06 + i / 34 * .92, p = stemCurve.getPoint(t).add(new THREE.Vector3((r() - .5) * .35, (r() - .5) * .2, (r() - .5) * .3)), side = i % 2 ? 1 : -1;
    const sz = .34 + r() * .26 - t * .1;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sz * .55, sz * 1.1), mat);
    m.geometry.translate(0, sz * .5, 0);
    m.position.copy(p); m.rotation.set((r() - .5) * .5, (r() - .5) * .9, side * (.8 + r() * .5));
    m.castShadow = true; m.customDistanceMaterial = dist; g.add(m);
  }
  scene.add(g);
  return g;
}

// ------------------------------------------------------------------ the viewer
export async function mountScene(host, { onLight } = {}) {
  const canvas = host.querySelector('canvas');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
  catch (e) { host.classList.add('no-webgl'); return null; }
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene(); scene.background = new THREE.Color('#050404');
  scene.fog = new THREE.Fog('#050404', 9, 22);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene(), .04).texture; scene.environmentIntensity = .25;
  const amb = new THREE.HemisphereLight('#8a7a66', '#0d0a08', .05); scene.add(amb);
  const fillL = new THREE.DirectionalLight('#ffc98f', 0); fillL.position.set(-3, 5, 8); scene.add(fillL);

  buildRoom(scene);
  const lamp = buildLamp(); scene.add(lamp.group);
  const sv = buildSvetets(flameTex()); sv.group.position.set(-3.3, 0, -1.0); sv.group.rotation.y = .25; scene.add(sv.group);
  sv.soot.position.set(-2.55, 5.0, -2.39); scene.add(sv.soot);
  buildMoss(scene);
  buildBranch(scene, sprigTex());

  const camera = new THREE.PerspectiveCamera(30, 1, .1, 60);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .55, .55, .82); composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let aspect = 1;
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false); composer.setPixelRatio(dpr); composer.setSize(w, h);
    camera.aspect = aspect = w / h;
    // portrait screens: the story cards cover the lower part, so lift the scene into the upper part
    if (aspect < .8) camera.setViewOffset(w, h, 0, h * .15, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- state
  const DEF = () => ({
    on: 0, target: 0,            // lamp light 0..1 (eased)
    bright: .85,                 // user brightness
    burn: 1, timer: false,       // burn-down (1 = full, 0 = out)
    blow: 0,                     // blow-out animation 0..1
    out: 0, outT: 0,             // strip taken out of the stone 0..1
    fire: 0, fireT: 0,           // svetets flame
    soot: 0, view: 'now', viewK: 0, // camera: 0 = lamp, 1 = both / svetets
    spark: 0, t: 0,
  });
  const S = DEF();
  const views = {
    dark: { pos: new THREE.Vector3(1.2, 2.0, 8.0), look: new THREE.Vector3(.45, 1.55, 0) },
    now: { pos: new THREE.Vector3(1.5, 2.1, 7.2), look: new THREE.Vector3(.55, 1.6, 0) },
    then: { pos: new THREE.Vector3(-2.2, 3.4, 8.2), look: new THREE.Vector3(-2.4, 3.05, -.8) },
    both: { pos: new THREE.Vector3(-.9, 2.6, 11.4), look: new THREE.Vector3(-1.35, 2.3, -.4) },
  };
  const camPos = views.dark.pos.clone(), camLook = views.dark.look.clone();

  // ---------------------------------------------------------------- interactions
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const hitStrip = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects([lamp.body, lamp.glow], false);
    return hits.length ? hits[0].point : null;
  };
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    const p = hitStrip(e);
    if (!p) return;
    drag = { y0: e.clientY, y: e.clientY, b0: S.bright, travel: 0, lit: S.target > .5 };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    canvas.style.cursor = hitStrip(e) ? 'pointer' : '';
    if (!drag) return;
    const dy = drag.y - e.clientY; drag.y = e.clientY; drag.travel += Math.max(0, dy);
    if (!drag.lit) {                     // strike: a quick upward stroke lights it
      if (drag.travel > 50) { api.ignite(); drag.lit = true; drag.y0 = e.clientY; drag.b0 = S.bright; }
    } else {                             // brightness: slide along the strip
      S.bright = clamp(drag.b0 + (drag.y0 - e.clientY) / (canvas.clientHeight * .5), .15, 1);
      emit();
    }
  });
  const end = () => { drag = null; };
  // on touch screens a stroke that starts on the strip must not scroll the page
  canvas.addEventListener('touchstart', (e) => { const t = e.touches[0]; if (t && hitStrip(t)) e.preventDefault(); }, { passive: false });
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

  const listeners = new Set();
  function emit() { const st = api.state(); listeners.forEach(f => f(st)); if (onLight) onLight(st); }

  // microphone: blow detection (low-frequency energy held for a moment)
  let mic = null;
  async function enableMic() {
    if (mic) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const src = ac.createMediaStreamSource(stream), an = ac.createAnalyser(); an.fftSize = 1024; src.connect(an);
      mic = { an, buf: new Uint8Array(an.frequencyBinCount), hold: 0, stream, ac };
      return true;
    } catch (e) { return false; }
  }
  function micStep(dt) {
    if (!mic) return;
    mic.an.getByteFrequencyData(mic.buf);
    let low = 0; for (let i = 1; i < 24; i++) low += mic.buf[i]; low /= 23;
    mic.hold = low > 150 ? mic.hold + dt : Math.max(0, mic.hold - dt * 2);
    if (mic.hold > .18) { mic.hold = 0; if (S.target > .5 && !S.out) api.blowOut(); else if (S.fire) api.setFire(false); }
  }

  // ---------------------------------------------------------------- per-frame
  const profCtx = lamp.prof.getContext('2d');
  function drawProfile(level, burn, flick) {
    // y = 0 at the top of the glowing section. The lit front sinks as `burn` drops, the top goes dark first.
    const H = 128, img = profCtx.createImageData(4, H);
    const front = (1 - burn) * 1.05;   // 0 = top, 1 = bottom
    for (let y = 0; y < H; y++) {
      const u = y / (H - 1);
      let e = smooth(front - .02, front + .08, u) * (1 - smooth(front + .25, front + .65, u) * .7);
      e *= (1 + .35 * Math.exp(-Math.pow((u - front - .1) / .07, 2)));   // hot band at the front
      e = clamp(e * level * flick, 0, 1);
      const c = Math.round(255 * Math.pow(e, .8));
      for (let x = 0; x < 4; x++) { const i = (y * 4 + x) * 4; img.data[i] = c; img.data[i + 1] = c; img.data[i + 2] = c; img.data[i + 3] = 255; }
    }
    profCtx.putImageData(img, 0, 0); lamp.profTex.needsUpdate = true;
  }
  const sparks = [];
  const sparkMat = new THREE.SpriteMaterial({ map: flameTex(), color: '#ffcf8a', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  function sparkBurst() {
    const tipW = new THREE.Vector3(0, STRIP_H, 0); lamp.strip.localToWorld(tipW);
    for (let i = 0; i < 18; i++) {
      const s = new THREE.Sprite(sparkMat.clone()); s.scale.setScalar(.06); s.position.copy(tipW);
      s.userData.v = new THREE.Vector3((Math.random() - .5) * 2.2, Math.random() * 2 + .5, (Math.random() - .5) * 1.5); s.userData.life = 0;
      scene.add(s); sparks.push(s);
    }
  }
  let lastEmit = 0;
  function update(dt) {
    S.t += dt;
    micStep(dt);
    // lamp on/off and blow-out
    const goal = S.target;
    S.on += (goal - S.on) * (1 - Math.pow(goal > S.on ? .03 : .002, dt));
    if (S.blow > 0) { S.blow = Math.max(0, S.blow - dt * 1.1); }
    if (S.timer) {
      S.burn = Math.max(0, S.burn - dt / 14);           // demo: a whole sleep timer in ~14 s
      if (S.burn <= 0) { S.timer = false; S.target = 0; emit(); }
    } else if (S.target > .5) S.burn += (1 - S.burn) * (1 - Math.pow(.2, dt));
    // live flicker (a warm, slightly breathing light; stronger while being blown out)
    const n = Math.sin(S.t * 7.1) * .5 + Math.sin(S.t * 11.7 + 1) * .3 + Math.sin(S.t * 23.3 + 2) * .2;
    const flick = reduce ? 1 : 1 + n * (.035 + .25 * S.blow);
    const level = S.on * S.bright * (.25 + .75 * Math.pow(S.burn, .7)) * (1 - S.blow * .6);
    drawProfile(level, S.burn, flick);
    lamp.glowMat.emissiveIntensity = 2.1;
    lamp.light.intensity = 6.5 * level * flick;
    lamp.light.position.y = (STRIP_H - GLOW_H) + GLOW_H * (.75 - .55 * (1 - S.burn));
    // taking the strip out: lift, then tilt toward the viewer like a torch
    S.out += ((S.outT) - S.out) * (1 - Math.pow(.02, dt));
    const o = ease(clamp(S.out, 0, 1));
    lamp.strip.position.set(o * .35, SEAT + o * 1.15 + (reduce ? 0 : Math.sin(S.t * 1.3) * .03 * o), o * .25);
    lamp.strip.rotation.set(-o * .12, o * .3, -o * .2);
    lamp.spot.intensity = 0;
    lamp.ringMat.emissiveIntensity = o * (1.4 + .6 * Math.sin(S.t * 2.4));
    // svetets
    S.fire += (S.fireT - S.fire) * (1 - Math.pow(.05, dt));
    const ff = 1 + (reduce ? 0 : (Math.sin(S.t * 13) * .08 + Math.sin(S.t * 31 + 1) * .06 + Math.sin(S.t * 5.3) * .05));
    sv.fMat.uniforms.uT.value = S.t; sv.fMat.uniforms.uK.value = S.fire;
    sv.flame.visible = S.fire > .01;
    sv.light.intensity = 5.2 * S.fire * ff;
    if (S.fire > .5) S.soot = Math.min(1, S.soot + dt / 25);
    sv.soot.material.opacity = S.soot * .55;
    const tipL = new THREE.Vector3(); sv.tip.getWorldPosition(tipL); sv.group.worldToLocal(tipL);
    sv.smoke.forEach((s, i) => {
      s.userData.t = (s.userData.t + dt / 4.5) % 1;
      const u = s.userData.t;
      s.position.set(tipL.x + Math.sin(u * 7 + i) * .22 * u + u * .25, tipL.y + .5 + u * 3.6, tipL.z - u * .3);
      s.scale.setScalar(.25 + u * 1.3);
      s.material.opacity = S.fire * .16 * Math.sin(Math.PI * u) * (1 - u * .3);
      s.material.rotation = u * 2 + i;
    });
    // sparks from striking
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.userData.life += dt; s.userData.v.y -= 4 * dt;
      s.position.addScaledVector(s.userData.v, dt); s.material.opacity = Math.max(0, 1 - s.userData.life * 2.2);
      if (s.userData.life > .5) { scene.remove(s); sparks.splice(i, 1); }
    }
    // camera: ease toward the current view, with a slow breathing drift
    const v = views[S.view] || views.now, lift = ease(clamp(S.out, 0, 1)) * (S.view === 'now' || S.view === 'dark' ? 1 : 0);
    const vp = v.pos.clone().add(new THREE.Vector3(0, .55 * lift, 1.2 * lift)), vl = v.look.clone().add(new THREE.Vector3(.1 * lift, .65 * lift, 0));
    if (aspect < .8 && S.view === 'then') { vp.x -= .9; vl.x -= .9; }            // narrow screens: keep the svetets in frame
    camPos.lerp(vp, 1 - Math.pow(.15, dt)); camLook.lerp(vl, 1 - Math.pow(.15, dt));
    const fitBack = Math.max(0, .9 / aspect - 1) * 5.2;           // tall phone screens: step back
    camera.position.copy(camPos).add(new THREE.Vector3(reduce ? 0 : Math.sin(S.t * .13) * .25, reduce ? 0 : Math.sin(S.t * .09) * .1, fitBack));
    camera.lookAt(camLook);
    // overall exposure tracks the light in the room, the page follows
    const roomLight = clamp(level * (1 - S.out * .3) + S.fire * .8, 0, 1.2);
    amb.intensity = .05 + .25 * roomLight;
    fillL.intensity = .05 + .55 * roomLight;
    bloom.strength = .45 + .25 * roomLight;
    if (S.t - lastEmit > .1) { lastEmit = S.t; emit(); }
  }

  let visible = true, prev = performance.now();
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(host);
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(Math.max((now - prev) / 1000, 0), .1); prev = now;
    if (!visible || document.hidden || api.frozen) return;
    update(dt); composer.render();
  }

  const api = {
    frozen: false, scene, camera,
    state: () => ({ on: S.target > .5, level: S.on * S.bright * (.25 + .75 * Math.pow(S.burn, .7)), burn: S.burn, timer: S.timer, out: S.outT > .5, fire: S.fireT > .5, bright: S.bright, mic: !!mic, view: S.view }),
    on(f) { listeners.add(f); return () => listeners.delete(f); },
    ignite() { if (S.target > .5 && !S.timer) return; S.target = 1; S.burn = Math.max(S.burn, .02); S.timer = false; S.blow = 0; sparkBurst(); emit(); },
    blowOut() { if (S.target < .5) return; S.blow = 1; setTimeout(() => { S.target = 0; S.timer = false; emit(); }, 380); emit(); },
    toggle() { S.target > .5 ? api.blowOut() : api.ignite(); },
    startTimer() { if (S.target < .5) api.ignite(); S.burn = 1; S.timer = true; emit(); },
    stopTimer() { S.timer = false; emit(); },
    setBright(b) { S.bright = clamp(b, .15, 1); emit(); },
    takeOut(v) { S.outT = v ? 1 : 0; if (v && S.target < .5) api.ignite(); emit(); },
    setFire(v) { S.fireT = v ? 1 : 0; if (!v) S.soot = Math.max(0, S.soot); emit(); },
    resetSoot() { S.soot = 0; },
    setView(v) { S.view = v; emit(); },
    enableMic,
    // where the strip is on screen (client px), for tests and hints
    stripScreen() {
      const v = new THREE.Vector3(0, STRIP_H * .55, 0); lamp.strip.localToWorld(v); v.project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
    },
    // test hook: render one still frame in a given state
    still(o = {}) {
      this.frozen = true; Object.assign(S, DEF(), o);
      if (o.view) { camPos.copy(views[o.view].pos); camLook.copy(views[o.view].look); }
      for (let i = 0; i < 4; i++) update(.016);
      if (o.view) { for (let i = 0; i < 60; i++) update(.05); }
      composer.render();
    },
  };
  requestAnimationFrame(frame);
  host.classList.add('ready');
  return api;
}
