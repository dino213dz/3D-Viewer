import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import JSZip from 'jszip';

// ===== Versioning =====
const APP_VERSION = '2.4.1';
try { document.title = '3D Viewer'; } catch (_) {}
let currentLang = 'en';
try {
  const savedLang = localStorage.getItem('3dviewer_lang');
  if (savedLang === 'fr' || savedLang === 'en') {
    currentLang = savedLang;
  } else {
    const nav = String(navigator.language || navigator.userLanguage || 'en').toLowerCase();
    currentLang = nav.startsWith('fr') ? 'fr' : 'en';
  }
} catch (_) {}
const APP_CREATED = '19 août 2026';
const APP_UPDATED = '20 août 2026';
const TARGET_MODEL_SIZE = 4; // taille max (unités) pour auto-scale des gros modèles

// ===== Sauvegarde auto (matériaux + vue) par fichier =====
const PREFS_PREFIX = '3dviewer_prefs_v1:';
let currentFileKey = null;
let currentFileSize = 0;
let currentFileName = "";
let saveTimer = null;

function fileKeyFromMeta(name, size) {
  return PREFS_PREFIX + (name || 'unknown') + '::' + (size || 0);
}

function captureViewState() {
  return {
    cam: camera.position.toArray(),
    target: controls.target.toArray(),
    near: camera.near,
    far: camera.far,
    minDist: controls.minDistance,
    maxDist: controls.maxDistance,
  };
}

function applyViewState(vs) {
  if (!vs) return;
  if (vs.cam) camera.position.fromArray(vs.cam);
  if (vs.target) controls.target.fromArray(vs.target);
  if (vs.near) camera.near = vs.near;
  if (vs.far) camera.far = vs.far;
  if (vs.minDist) controls.minDistance = vs.minDist;
  if (vs.maxDist) controls.maxDistance = vs.maxDist;
  camera.updateProjectionMatrix();
  controls.update();
}

function captureMaterialsState() {
  collectMaterials();
  return materialEntries.map((e) => {
    const m = e.material;
    return {
      label: e.label,
      color: m.color ? '#' + m.color.getHexString() : null,
      metalness: m.metalness,
      roughness: m.roughness,
      opacity: m.opacity,
      transparent: !!m.transparent,
      transmission: m.transmission ?? 0,
      emissive: m.emissive ? '#' + m.emissive.getHexString() : '#000000',
      emissiveIntensity: m.emissiveIntensity ?? 0,
      wireframe: !!m.wireframe,
    };
  });
}

function applyMaterialsState(list) {
  if (!list || !list.length || !currentModel) return;
  collectMaterials();
  // Match by label order fallback
  list.forEach((saved, i) => {
    let entry = materialEntries.find((e) => e.label === saved.label) || materialEntries[i];
    if (!entry) return;
    const m = entry.material;
    if (saved.color && m.color) m.color.set(saved.color);
    if (m.metalness !== undefined && saved.metalness != null) m.metalness = saved.metalness;
    if (m.roughness !== undefined && saved.roughness != null) m.roughness = saved.roughness;
    if (saved.opacity != null) m.opacity = saved.opacity;
    if (saved.transparent != null) m.transparent = saved.transparent;
    if (m.transmission !== undefined && saved.transmission != null) m.transmission = saved.transmission;
    if (saved.emissive && m.emissive) m.emissive.set(saved.emissive);
    if (m.emissiveIntensity !== undefined && saved.emissiveIntensity != null) m.emissiveIntensity = saved.emissiveIntensity;
    if (saved.wireframe != null) m.wireframe = saved.wireframe;
    m.needsUpdate = true;
  });
  refreshMaterialSelect();
}

function savePrefsNow() {
  if (!currentFileKey) return;
  try {
    const data = {
      version: APP_VERSION,
      savedAt: Date.now(),
      view: captureViewState(),
      materials: captureMaterialsState(),
      wireframeMode: !!wireframeMode,
    };
    localStorage.setItem(currentFileKey, JSON.stringify(data));
  } catch (err) {
    console.warn('savePrefs', err);
  }
}

function scheduleSavePrefs() {
  if (!currentFileKey) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(savePrefsNow, 400);
}

function loadPrefs() {
  if (!currentFileKey) return null;
  try {
    const raw = localStorage.getItem(currentFileKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function restorePrefsAfterLoad() {
  const prefs = loadPrefs();
  if (!prefs) return false;
  if (prefs.materials) applyMaterialsState(prefs.materials);
  if (prefs.view) applyViewState(prefs.view);
  if (prefs.wireframeMode) {
    wireframeMode = true;
    if (currentModel) {
      currentModel.traverse((child) => {
        if (child.isMesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => { m.wireframe = true; });
        }
      });
    }
  }
  setStatus('Paramètres restaurés pour ce fichier.');
  return true;
}


// ========== Scene setup ==========
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1d24);
// Fog très léger pour ne pas noircir les objets
scene.fog = new THREE.Fog(0x1a1d24, 80, 400);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 5000);
camera.position.set(4, 2.5, 6);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.2;
controls.maxDistance = 500;
controls.maxPolarAngle = Math.PI * 0.95;
controls.target.set(0, 0.8, 0);
controls.update();
controls.addEventListener('end', () => scheduleSavePrefs());

// ===== Gizmo axes (style Blender 5 : Z vertical bleu, Y profondeur vert, X rouge) =====
const axesScene = new THREE.Scene();
const axesCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
const axesRoot = new THREE.Group();
// Three.js Y-up → Blender Z-up : rotation -90° sur X
axesRoot.rotation.x = -Math.PI / 2;
const axesGizmo = new THREE.AxesHelper(1.2);
axesRoot.add(axesGizmo);
function makeAxisLabel(text, color, pos) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 32, 34);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false });
  const spr = new THREE.Sprite(mat);
  spr.position.copy(pos);
  spr.scale.set(0.45, 0.45, 0.45);
  return spr;
}
axesRoot.add(makeAxisLabel('X', '#ff4444', new THREE.Vector3(1.35, 0, 0)));
axesRoot.add(makeAxisLabel('Y', '#44ff66', new THREE.Vector3(0, 1.35, 0)));
axesRoot.add(makeAxisLabel('Z', '#4488ff', new THREE.Vector3(0, 0, 1.35)));
axesScene.add(axesRoot);

// Axes dans la scène (origine) — même convention Blender (Z vertical)
const sceneAxesRoot = new THREE.Group();
sceneAxesRoot.rotation.x = -Math.PI / 2;
const sceneAxes = new THREE.AxesHelper(1.5);
sceneAxes.name = 'sceneAxes';
sceneAxesRoot.add(sceneAxes);
sceneAxesRoot.add(makeAxisLabel('X', '#ff4444', new THREE.Vector3(1.7, 0, 0)));
sceneAxesRoot.add(makeAxisLabel('Y', '#44ff66', new THREE.Vector3(0, 1.7, 0)));
sceneAxesRoot.add(makeAxisLabel('Z', '#4488ff', new THREE.Vector3(0, 0, 1.7)));
scene.add(sceneAxesRoot);
renderer.autoClear = false;


// Ground grid + plane for shadows
const grid = new THREE.GridHelper(80, 80, 0x333844, 0x22252e);
scene.add(grid);
const groundPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: 0x2a2d36, roughness: 0.9, metalness: 0.05 })
);
groundPlane.rotation.x = -Math.PI / 2;
groundPlane.position.y = -0.01;
groundPlane.receiveShadow = true;
groundPlane.visible = false;
scene.add(groundPlane);

let groundMode = 'grid'; // grid | plane | none
function setGroundMode(mode) {
  groundMode = mode || 'grid';
  grid.visible = groundMode === 'grid';
  groundPlane.visible = groundMode === 'plane';
  document.querySelectorAll('.ground-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.ground === groundMode);
  });
  const gsel = document.getElementById('ground-type-select');
  if (gsel) gsel.value = groundMode;
  try { localStorage.setItem('3dviewer_ground', groundMode); } catch (_) {}
  updateDynamicMenuLabels?.();
  setStatus(groundMode === 'grid' ? 'Sol : quadrillage' : groundMode === 'plane' ? 'Sol : surface plate' : 'Sol : aucun');
}
document.getElementById('ground-grid')?.addEventListener('click', () => setGroundMode('grid'));
document.getElementById('ground-plane')?.addEventListener('click', () => setGroundMode('plane'));
document.getElementById('ground-none')?.addEventListener('click', () => setGroundMode('none'));

const GROUND_DEFAULTS = { color: '#2a2d36', metalness: 0.05, roughness: 0.9, mode: 'grid' };
function resetGround() {
  setGroundMode(GROUND_DEFAULTS.mode);
  const col = document.getElementById('ground-color');
  if (col) {
    col.value = GROUND_DEFAULTS.color;
    if (groundPlane.material) groundPlane.material.color.set(GROUND_DEFAULTS.color);
  }
  const m = document.getElementById('ground-metal');
  const r = document.getElementById('ground-rough');
  if (m) {
    m.value = GROUND_DEFAULTS.metalness;
    if (groundPlane.material) groundPlane.material.metalness = GROUND_DEFAULTS.metalness;
    const vm = document.getElementById('val-ground-metal');
    if (vm) vm.textContent = Number(GROUND_DEFAULTS.metalness).toFixed(2);
  }
  if (r) {
    r.value = GROUND_DEFAULTS.roughness;
    if (groundPlane.material) groundPlane.material.roughness = GROUND_DEFAULTS.roughness;
    const vr = document.getElementById('val-ground-rough');
    if (vr) vr.textContent = Number(GROUND_DEFAULTS.roughness).toFixed(2);
  }
  setStatus(currentLang === 'en' ? 'Ground reset.' : 'Sol réinitialisé.');
}
document.getElementById('btn-reset-ground')?.addEventListener('click', resetGround);
try {
  const gm = localStorage.getItem('3dviewer_ground');
  if (gm) setGroundMode(gm);
} catch (_) {}


const groundGeo = new THREE.PlaneGeometry(80, 80);
const groundMat = new THREE.ShadowMaterial({ opacity: 0.3 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Éclairage ambiant de base plus fort (évite les modèles complètement noirs)
const hemi = new THREE.HemisphereLight(0xb1e1ff, 0x444444, 0.7);
scene.add(hemi);
const ambBase = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(ambBase);

// ========== State ==========
let currentModel = null;
const lights = []; // { id, type, light, helper, card }
let lightIdCounter = 0;
let skipLightUndo = false;

// ========== Historique Annuler (illimité) ==========
// Historique Annuler/Refaire **par fichier** (mémoire session)
const historyByFile = new Map(); // fileKey -> { undo: [], redo: [] }
let undoStack = [];
let redoStack = [];

function getHistoryKey() {
  return currentFileKey || '__none__';
}

function saveCurrentHistoryToMap() {
  const key = getHistoryKey();
  historyByFile.set(key, {
    undo: undoStack.slice(),
    redo: redoStack.slice(),
  });
}

/** Charge l'historique du fichier courant (vide si nouveau / jamais modifié) */
function loadHistoryForCurrentFile() {
  const key = getHistoryKey();
  const stored = historyByFile.get(key);
  if (stored) {
    undoStack = stored.undo.slice();
    redoStack = stored.redo.slice();
  } else {
    undoStack = [];
    redoStack = [];
  }
  updateUndoMenu();
}

/** À appeler avant de changer de fichier : sauvegarde puis reset/load du suivant */
function switchHistoryToFile(nextFileKey) {
  // sauvegarder l'historique du fichier qu'on quitte
  if (currentFileKey || undoStack.length || redoStack.length) {
    historyByFile.set(getHistoryKey(), {
      undo: undoStack.slice(),
      redo: redoStack.slice(),
    });
  }
  // currentFileKey sera mis à jour par l'appelant ; on prépare les stacks
  const key = nextFileKey || '__none__';
  const stored = historyByFile.get(key);
  if (stored) {
    undoStack = stored.undo.slice();
    redoStack = stored.redo.slice();
  } else {
    undoStack = [];
    redoStack = [];
  }
  updateUndoMenu();
}

function setHistoryBtn(btn, n, baseLabel) {
  if (!btn) return;
  const ico = btn.querySelector('svg.ico');
  const label = n ? (' ' + baseLabel + ' (' + n + ')') : (' ' + baseLabel);
  btn.textContent = '';
  if (ico) btn.appendChild(ico);
  btn.appendChild(document.createTextNode(label));
  btn.classList.toggle('is-disabled', n === 0);
  btn.style.opacity = n ? '1' : '0.45';
}

function updateUndoMenu() {
  const nu = undoStack.length;
  const nr = redoStack.length;
  setHistoryBtn(document.getElementById('menu-undo'), nu, 'Annuler');
  setHistoryBtn(document.getElementById('menu-redo'), nr, 'Refaire');
  const tbU = document.getElementById('toolbar-undo');
  if (tbU) {
    tbU.classList.toggle('disabled', nu === 0);
    tbU.title = nu ? ('Annuler (' + nu + ') — Ctrl+Z') : 'Rien à annuler';
  }
  const tbR = document.getElementById('toolbar-redo');
  if (tbR) {
    tbR.classList.toggle('disabled', nr === 0);
    tbR.title = nr ? ('Refaire (' + nr + ') — Ctrl+Y') : 'Rien à refaire';
  }
}

function pushUndo(entry) {
  undoStack.push(entry);
  // Nouvelle action : on ne peut plus refaire la branche abandonnée
  redoStack.length = 0;
  // persister sous la clé fichier courante
  historyByFile.set(getHistoryKey(), {
    undo: undoStack.slice(),
    redo: redoStack.slice(),
  });
  updateUndoMenu();
}

function snapshotAllMaterials() {
  const snap = [];
  if (!currentModel) return snap;
  currentModel.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    snap.push({
      mesh: child,
      isArray: Array.isArray(child.material),
      materials: mats.map((m) => { try { return m.clone(); } catch (_) { return m; } }),
    });
  });
  return snap;
}

function restoreMaterialsSnap(snap) {
  if (!snap) return;
  snap.forEach((entry) => {
    if (!entry.mesh) return;
    try {
      const restored = entry.materials.map((m) => { try { return m.clone(); } catch (_) { return m; } });
      entry.mesh.material = entry.isArray ? restored : restored[0];
      (entry.isArray ? restored : [restored[0]]).forEach((m) => { if (m) m.needsUpdate = true; });
    } catch (err) { console.warn(err); }
  });
  refreshMaterialSelect(true);
}

function captureLightState(entry) {
  if (!entry || !entry.light) return null;
  const light = entry.light;
  return {
    id: entry.id,
    type: entry.type,
    color: light.color ? '#' + light.color.getHexString() : '#ffffff',
    intensity: light.intensity,
    position: light.position ? light.position.toArray() : null,
    distance: light.distance,
    angle: light.angle,
    penumbra: light.penumbra,
    castShadow: !!light.castShadow,
    rotation: light.rotation ? [light.rotation.x, light.rotation.y, light.rotation.z] : null,
  };
}

function applyLightState(entry, st) {
  if (!entry || !st || !entry.light) return;
  const light = entry.light;
  if (st.color && light.color) light.color.set(st.color);
  if (st.intensity != null) light.intensity = st.intensity;
  if (st.position && light.position) light.position.fromArray(st.position);
  if (st.distance != null && light.distance !== undefined) light.distance = st.distance;
  if (st.angle != null && light.angle !== undefined) light.angle = st.angle;
  if (st.penumbra != null && light.penumbra !== undefined) light.penumbra = st.penumbra;
  if (st.castShadow != null && light.castShadow !== undefined) light.castShadow = st.castShadow;
  if (st.rotation && light.rotation) {
    light.rotation.set(st.rotation[0], st.rotation[1], st.rotation[2]);
    if (light.target) {
      const dist = light.position.distanceTo(light.target.position) || 5;
      const dir = new THREE.Vector3(0, -1, 0);
      dir.applyEuler(light.rotation);
      light.target.position.copy(light.position).addScaledVector(dir, dist);
    }
  }
  // sync card UI if present
  if (entry.card) {
    const c = entry.card.querySelector('.ctrl-color');
    if (c && st.color) c.value = st.color;
    const i = entry.card.querySelector('.ctrl-intensity');
    if (i && st.intensity != null) { i.value = st.intensity; const v = entry.card.querySelector('.val-intensity'); if (v) v.textContent = Number(st.intensity).toFixed(2); }
    const px = entry.card.querySelector('.ctrl-px');
    if (px && st.position) { px.value = st.position[0]; entry.card.querySelector('.ctrl-py').value = st.position[1]; entry.card.querySelector('.ctrl-pz').value = st.position[2]; }
    const rx = entry.card.querySelector('.ctrl-rx');
    if (rx && st.rotation) {
      rx.value = (st.rotation[0] * 180 / Math.PI).toFixed(0);
      entry.card.querySelector('.ctrl-ry').value = (st.rotation[1] * 180 / Math.PI).toFixed(0);
      entry.card.querySelector('.ctrl-rz').value = (st.rotation[2] * 180 / Math.PI).toFixed(0);
    }
  }
  if (entry.helper) {
    if (entry.helper.update) entry.helper.update();
    if (entry.helper._marker && light.color) entry.helper._marker.material.color.copy(light.color);
  }
}

function persistHistoryMap() {
  historyByFile.set(getHistoryKey(), {
    undo: undoStack.slice(),
    redo: redoStack.slice(),
  });
}

function performUndo() {
  const entry = undoStack.pop();
  if (!entry) {
    updateUndoMenu();
    setStatus('Rien à annuler.', true);
    return;
  }
  try {
    entry.undo();
    redoStack.push(entry);
    persistHistoryMap();
    updateUndoMenu();
    setStatus('Annulé : ' + (entry.label || 'action'));
  } catch (err) {
    console.error(err);
    updateUndoMenu();
    setStatus("Échec de l'annulation", true);
  }
}

function performRedo() {
  const entry = redoStack.pop();
  if (!entry) {
    updateUndoMenu();
    setStatus('Rien à refaire.', true);
    return;
  }
  try {
    if (typeof entry.redo === 'function') {
      entry.redo();
    } else {
      setStatus('Cette action ne peut pas être refaite.', true);
      undoStack.push(entry);
      updateUndoMenu();
      return;
    }
    undoStack.push(entry);
    persistHistoryMap();
    updateUndoMenu();
    setStatus('Refait : ' + (entry.label || 'action'));
  } catch (err) {
    console.error(err);
    updateUndoMenu();
    setStatus("Échec du refaire", true);
  }
}



const statusEl = document.getElementById('status');
const loaderEl = document.getElementById('loader');
const loaderText = document.getElementById('loader-text');
const lightsList = document.getElementById('lights-list');
const lightCountEl = document.getElementById('light-count');

function setStatus(msg, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.classList.toggle('is-error', !!isError);
  statusEl.style.color = isError ? '#ef4444' : '';
}
function setStatusExtra(text) {
  const el = document.getElementById('status-extra');
  if (el) el.textContent = text || '';
}


function showLoader(text = 'Chargement…') {
  if (loaderText) loaderText.textContent = text;
  loaderEl?.classList.remove('hidden');
}

function hideLoader() {
  loaderEl?.classList.add('hidden');
}

let busyTimer = null;
let busyDepth = 0;
function beginBusy(text) {
  busyDepth++;
  const msg = text || (currentLang === 'en' ? 'Working…' : 'Traitement…');
  if (loaderText && !busyTimer && loaderEl?.classList.contains('hidden')) {
    // keep last message if already visible
  }
  clearTimeout(busyTimer);
  busyTimer = setTimeout(() => {
    showLoader(msg);
  }, 1000);
}
function endBusy() {
  busyDepth = Math.max(0, busyDepth - 1);
  if (busyDepth > 0) return;
  clearTimeout(busyTimer);
  busyTimer = null;
  hideLoader();
}

// ========== Model loading ==========
const fbxLoader = new FBXLoader();
const gltfLoader = new GLTFLoader();

function disposeMaterialTextures(mat) {
  if (!mat) return;
  const maps = ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','bumpMap','displacementMap','alphaMap','envMap'];
  maps.forEach((k) => {
    if (mat[k] && mat[k].dispose) {
      try { mat[k].dispose(); } catch (_) {}
      mat[k] = null;
    }
  });
  if (mat.dispose) try { mat.dispose(); } catch (_) {}
}
function clearModel() {
  if (currentModel) {
    currentModel.traverse((ch) => {
      if (ch.isMesh) {
        const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
        mats.forEach(disposeMaterialTextures);
        if (ch.geometry?.dispose) ch.geometry.dispose();
      }
    });
  }

  originalMaterialsSnapshot = null;
  if (currentModel) {
    scene.remove(currentModel);
    currentModel.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });
    currentModel = null;
  }
}

function getModelBounds(object) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) {
    return { box, size: new THREE.Vector3(1, 1, 1), center: new THREE.Vector3(), maxDim: 1 };
  }
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.1);
  return { box, size, center, maxDim };
}

/** Repositionne toutes les lumières autour du modèle pour un éclairage correct */
function repositionLightsForModel(object) {
  if (!object) return;
  const { center, maxDim } = getModelBounds(object);
  const d = maxDim * 1.8; // distance relative

  lights.forEach((entry) => {
    const { type, light, helper, card } = entry;
    if (type === 'AmbientLight') return;

    if (type === 'DirectionalLight') {
      light.position.set(center.x + d * 0.8, center.y + d * 1.2, center.z + d * 0.6);
      light.intensity = Math.max(2.0, light.intensity);
      // Agrandir le volume d'ombre selon la taille
      const s = maxDim * 1.5;
      light.shadow.camera.left = -s;
      light.shadow.camera.right = s;
      light.shadow.camera.top = s;
      light.shadow.camera.bottom = -s;
      light.shadow.camera.far = maxDim * 10;
      light.shadow.camera.updateProjectionMatrix();
    } else if (type === 'PointLight') {
      light.position.set(center.x, center.y + d * 0.9, center.z + d * 0.5);
      light.distance = maxDim * 8;
      light.intensity = Math.max(40, light.intensity);
      light.decay = 1.5;
    } else if (type === 'SpotLight') {
      light.position.set(center.x + d * 0.5, center.y + d * 1.4, center.z + d * 0.5);
      light.target.position.copy(center);
      light.distance = maxDim * 10;
      light.intensity = Math.max(60, light.intensity);
    }

    // Mettre à jour les helpers / markers
    if (helper) {
      helper.update?.();
      if (helper._marker) {
        helper._marker.position.copy(light.position);
        // Adapter la taille du marqueur à l'échelle du modèle
        const s = Math.max(0.15, maxDim * 0.04);
        helper._marker.scale.setScalar(s / 0.18);
      }
    }

    // Synchroniser les inputs du panneau
    if (card && type !== 'AmbientLight') {
      const px = card.querySelector('.ctrl-px');
      const py = card.querySelector('.ctrl-py');
      const pz = card.querySelector('.ctrl-pz');
      if (px) px.value = light.position.x.toFixed(1);
      if (py) py.value = light.position.y.toFixed(1);
      if (pz) pz.value = light.position.z.toFixed(1);
      const dist = card.querySelector('.ctrl-dist');
      if (dist) {
        dist.value = light.distance;
        const val = card.querySelector('.val-dist');
        if (val) val.textContent = Math.round(light.distance);
      }
      const intens = card.querySelector('.ctrl-intensity');
      if (intens) {
        intens.value = light.intensity;
        const valI = card.querySelector('.val-intensity');
        if (valI) valI.textContent = light.intensity.toFixed(2);
      }
    }
  });
}

function fitCameraToObject(object) {
  if (!object) return;
  const { size, center, maxDim } = getModelBounds(object);

  // Distance pour que l'objet occupe au mieux le viewport sans dépasser
  const vFov = camera.fov * (Math.PI / 180);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(camera.aspect, 0.1));
  const distV = (size.y * 0.5) / Math.tan(vFov / 2);
  const distH = (Math.max(size.x, size.z) * 0.5) / Math.tan(hFov / 2);
  let distance = Math.max(distV, distH, maxDim * 0.5);
  distance *= 1.12; // petite marge ~12% pour ne pas coller aux bords

  // Angle de vue 3/4
  const dir = new THREE.Vector3(0.72, 0.42, 0.72).normalize();
  camera.position.copy(center).addScaledVector(dir, distance);
  controls.target.copy(center);

  controls.minDistance = Math.max(0.08, maxDim * 0.05);
  controls.maxDistance = Math.max(maxDim * 20, distance * 8);
  camera.near = Math.max(0.01, maxDim * 0.0005);
  camera.far = Math.max(5000, maxDim * 50);
  camera.updateProjectionMatrix();
  controls.update();

  // Repositionner les lumières autour de l'objet
  if (typeof repositionLightsForModel === 'function') repositionLightsForModel(object);
}

function fixTextureColorSpace(tex, isColorMap = true) {
  if (!tex) return;
  if (isColorMap) tex.colorSpace = THREE.SRGBColorSpace;
  else tex.colorSpace = THREE.NoColorSpace || THREE.LinearSRGBColorSpace || tex.colorSpace;
  tex.needsUpdate = true;
}

function prepareModel(object) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = true;

      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        const newMats = mats.map((m) => {
          // Conserver toutes les textures (map, normal, roughness, metalness, ao, emissive…)
          const applyMaps = (target) => {
            if (m.map) { target.map = m.map; fixTextureColorSpace(target.map, true); }
            if (m.normalMap) { target.normalMap = m.normalMap; fixTextureColorSpace(target.normalMap, false); }
            if (m.roughnessMap) { target.roughnessMap = m.roughnessMap; fixTextureColorSpace(target.roughnessMap, false); }
            if (m.metalnessMap) { target.metalnessMap = m.metalnessMap; fixTextureColorSpace(target.metalnessMap, false); }
            if (m.aoMap) { target.aoMap = m.aoMap; fixTextureColorSpace(target.aoMap, false); }
            if (m.emissiveMap) { target.emissiveMap = m.emissiveMap; fixTextureColorSpace(target.emissiveMap, true); }
            if (m.bumpMap) target.bumpMap = m.bumpMap;
            if (m.displacementMap) target.displacementMap = m.displacementMap;
            if (m.alphaMap) target.alphaMap = m.alphaMap;
          };

          if (m.isMeshBasicMaterial) {
            const std = new THREE.MeshStandardMaterial({
              color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
              transparent: m.transparent,
              opacity: m.opacity,
              side: THREE.FrontSide,
              metalness: 0.2,
              roughness: 0.6,
              name: m.name || '',
            });
            applyMaps(std);
            std.needsUpdate = true;
            return std;
          }

          // glTF Standard / Physical : ne pas remplacer, seulement corriger colorSpace
          if (m.map) fixTextureColorSpace(m.map, true);
          if (m.normalMap) fixTextureColorSpace(m.normalMap, false);
          if (m.roughnessMap) fixTextureColorSpace(m.roughnessMap, false);
          if (m.metalnessMap) fixTextureColorSpace(m.metalnessMap, false);
          if (m.aoMap) fixTextureColorSpace(m.aoMap, false);
          if (m.emissiveMap) fixTextureColorSpace(m.emissiveMap, true);
          m.side = m.side ?? THREE.FrontSide;
          if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
            if (m.metalness === undefined) m.metalness = 0.2;
            if (m.roughness === undefined) m.roughness = 0.55;
          }
          m.needsUpdate = true;
          return m;
        });
        child.material = Array.isArray(child.material) ? newMats : newMats[0];
      }
    }
  });

  // Center the model on the ground
  let box = new THREE.Box3().setFromObject(object);
  let center = box.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= box.min.y;

  // Auto-scale si le modèle est trop grand (ou trop petit)
  box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  if (maxDim > TARGET_MODEL_SIZE * 1.5 || maxDim < 0.3) {
    const scale = TARGET_MODEL_SIZE / maxDim;
    object.scale.multiplyScalar(scale);
    // Re-poser au sol après scale
    box = new THREE.Box3().setFromObject(object);
    object.position.y -= box.min.y;
  }

  return object;
}

function loadModelFromBlob(blob, fileName, displayName) {
  const url = URL.createObjectURL(blob);
  const name = fileName.toLowerCase();
  if (fileName) currentFileName = displayName || fileName;
  if (blob && typeof blob.size === 'number' && blob.size > 0) currentFileSize = blob.size;

  const onSuccess = (object) => {
    currentModel = prepareModel(object);
    captureOriginalMaterials(currentModel);
    // Appliquer le mode wireframe s'il est déjà actif
    if (wireframeMode) {
      currentModel.traverse((child) => {
        if (child.isMesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => { m.wireframe = true; });
        }
      });
    }
    scene.add(currentModel);
    fitCameraToObject(currentModel);
    refreshMaterialSelect();
    refreshFileProps();
    const restored = restorePrefsAfterLoad();
    if (!restored) scheduleSavePrefs();
    hideLoader();
    setStatus(restored ? `Modèle chargé + préférences : ${displayName}` : `Modèle chargé : ${displayName}`);
    URL.revokeObjectURL(url);
  };

  const onError = (err) => {
    console.error(err);
    hideLoader();
    setStatus(`Erreur de chargement : ${err.message || 'fichier corrompu ou format non supporté'}`, true);
    URL.revokeObjectURL(url);
  };

  if (name.endsWith('.fbx')) {
    fbxLoader.load(url, onSuccess, undefined, onError);
  } else if (name.endsWith('.glb') || name.endsWith('.gltf')) {
    gltfLoader.load(url, (gltf) => onSuccess(gltf.scene), undefined, onError);
  } else {
    hideLoader();
    setStatus('Aucun modèle 3D compatible trouvé dans le fichier.', true);
    URL.revokeObjectURL(url);
  }
}

async function loadFromZip(file) {
  showLoader(`Extraction du ZIP : ${file.name}…`);
  setStatus(`Extraction du ZIP : ${file.name}…`);

  try {
    const zip = await JSZip.loadAsync(file);
    const entries = Object.keys(zip.files);

    // Priorité : .fbx puis .glb puis .gltf (ignore les dossiers et __MACOSX)
    const candidates = entries
      .filter((path) => {
        const lower = path.toLowerCase();
        return !path.endsWith('/') &&
               !lower.includes('__macosx') &&
               (lower.endsWith('.fbx') || lower.endsWith('.glb') || lower.endsWith('.gltf'));
      })
      .sort((a, b) => {
        const score = (p) => {
          const l = p.toLowerCase();
          if (l.endsWith('.fbx')) return 0;
          if (l.endsWith('.glb')) return 1;
          return 2;
        };
        return score(a) - score(b);
      });

    if (candidates.length === 0) {
      hideLoader();
      setStatus('Aucun fichier .fbx, .glb ou .gltf trouvé dans le ZIP.', true);
      return;
    }

    const modelPath = candidates[0];
    const modelName = modelPath.split('/').pop();
    showLoader(`Chargement de ${modelName} depuis le ZIP…`);

    const blob = await zip.file(modelPath).async('blob');
    clearModel();
    loadModelFromBlob(blob, modelName, `${modelName} (dans ${file.name})`);
  } catch (err) {
    console.error(err);
    hideLoader();
    setStatus(`Erreur lors de l'extraction du ZIP : ${err.message || 'fichier invalide'}`, true);
  }
}

function loadFile(file) {
  const name = file.name.toLowerCase();
  const nextKey = fileKeyFromMeta(file.name, file.size);
  // Sauvegarder l'historique du fichier qu'on quitte (session)
  switchHistoryToFile(nextKey);
  currentFileKey = nextKey;
  currentFileName = file.name;
  currentFileSize = file.size || 0;
  // Nouveau modèle 3D = nouvelles refs meshes → on repart d'un historique vide
  // (l'ancien historique stocké reste en Map si on veut l'inspecter, mais
  //  on ne le réapplique pas : les meshes de la session précédente sont disposés)
  undoStack = [];
  redoStack = [];
  historyByFile.set(nextKey, { undo: [], redo: [] });
  updateUndoMenu();

  showLoader(`Chargement de ${file.name}…`);
  setStatus(`Chargement de ${file.name}…`);

  if (name.endsWith('.zip')) {
    loadFromZip(file);
    return;
  }

  clearModel();
  loadModelFromBlob(file, file.name, file.name);
}

// Chargement fichier uniquement via menu Fichier → Charger un fichier
const fileInput = document.getElementById('file-input');
fileInput?.addEventListener('change', (e) => {
  if (e.target.files?.[0]) {
    loadFile(e.target.files[0]);
    // reset pour pouvoir recharger le même fichier
    e.target.value = '';
  }
});

function clearModelAndMats() {
  switchHistoryToFile('__none__');
  currentFileKey = null;
  clearModel();
  refreshMaterialSelect();
  setStatus('Modèle effacé.');
}

function doFrame() {
  if (currentModel) {
    fitCameraToObject(currentModel);
    setStatus('Objet cadré.');
  } else {
    setStatus('Aucun modèle à cadrer.', true);
  }
}

function isPortraitLayout() {
  return window.innerHeight > window.innerWidth;
}

/** Repositionne panneau + fenêtres flottantes selon orientation */
function layoutFloatingWindows() {
  const panel = document.getElementById('side-panel');
  const loadWin = document.getElementById('load-window');
  const portrait = isPortraitLayout();
  const menuH = 32;
  const margin = 10;

  if (panel && !panel.classList.contains('maximized')) {
    panel.classList.remove('minimized');
    // reset inline size limits that could block
    if (portrait) {
      // bas de l'écran
      panel.style.left = margin + 'px';
      panel.style.right = margin + 'px';
      panel.style.top = 'auto';
      panel.style.bottom = margin + 'px';
      panel.style.width = 'auto';
      panel.style.maxWidth = 'calc(100vw - ' + (margin * 2) + 'px)';
      panel.style.maxHeight = 'min(48vh, 420px)';
      panel.style.minHeight = (PANEL_MIN_H || 280) + 'px';
      panel.style.minWidth = 'min(100%, ' + (PANEL_MIN_W || 300) + 'px)';
    } else {
      // haut gauche
      panel.style.left = margin + 'px';
      panel.style.right = 'auto';
      panel.style.top = (menuH + margin) + 'px';
      panel.style.bottom = 'auto';
      if (!panel.style.width) panel.style.width = 'min(340px, calc(100vw - 20px))';
      panel.style.maxWidth = 'min(340px, calc(100vw - 20px))';
      panel.style.maxHeight = 'calc(100vh - ' + (menuH + margin * 2) + 'px)';
      panel.style.minHeight = (PANEL_MIN_H || 280) + 'px';
      panel.style.minWidth = (PANEL_MIN_W || 300) + 'px';
    }
  }

  // Fenêtre de chargement : centrée mais ancrée selon orientation
  if (loadWin) {
    const inner = loadWin.querySelector('.floating-window-inner');
    if (inner) {
      if (portrait) {
        loadWin.style.alignItems = 'flex-end';
        loadWin.style.paddingBottom = '16px';
      } else {
        loadWin.style.alignItems = 'flex-start';
        loadWin.style.justifyContent = 'flex-start';
        loadWin.style.paddingTop = (menuH + 16) + 'px';
        loadWin.style.paddingLeft = '16px';
        loadWin.style.paddingBottom = '0';
      }
    }
  }
}

/**
 * Cadre l'objet dans la zone d'écran non masquée par le panneau.
 * Paysage + panneau à gauche → objet vers la droite.
 * Portrait + panneau en bas → objet vers le haut.
 */
function fitCameraToVisibleArea(object) {
  if (!object) return;
  if (typeof layoutFloatingWindows === 'function') {
    try { layoutFloatingWindows(); } catch (_) {}
  }

  const W = Math.max(1, window.innerWidth);
  const H = Math.max(1, window.innerHeight);
  let free = { left: 0, top: 0, right: W, bottom: H };

  const occlude = (el) => {
    if (!el) return;
    if (el.classList?.contains('hidden') || el.classList?.contains('hidden-ui')) return;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return;
    // Réduire le rectangle libre selon le côté le plus occupé
    const overlapX = Math.min(r.right, W) - Math.max(r.left, 0);
    const overlapY = Math.min(r.bottom, H) - Math.max(r.top, 0);
    if (overlapX <= 0 || overlapY <= 0) return;
    const area = overlapX * overlapY;
    if (area < W * H * 0.04) return; // ignorer petits widgets

    // Panneau bas / haut / gauche / droite
    const fromLeft = r.left <= 12;
    const fromRight = r.right >= W - 12;
    const fromTop = r.top <= 56;
    const fromBottom = r.bottom >= H - 24;

    if (fromBottom && r.height < H * 0.85) {
      free.bottom = Math.min(free.bottom, r.top);
    } else if (fromTop && r.height < H * 0.5) {
      free.top = Math.max(free.top, r.bottom);
    }
    if (fromLeft && r.width < W * 0.75) {
      free.left = Math.max(free.left, r.right);
    } else if (fromRight && r.width < W * 0.75) {
      free.right = Math.min(free.right, r.left);
    } else if (!fromBottom && !fromTop) {
      // flottant : choisir le côté qui libère le plus d'espace
      const leftSpace = r.left;
      const rightSpace = W - r.right;
      if (leftSpace >= rightSpace && leftSpace > W * 0.25) free.right = Math.min(free.right, r.left);
      else if (rightSpace > W * 0.25) free.left = Math.max(free.left, r.right);
    }
  };

  occlude(document.getElementById('side-panel'));
  occlude(document.getElementById('load-window'));
  occlude(document.getElementById('menubar'));
  occlude(document.getElementById('statusbar'));

  // Sécurité rectangle
  if (free.right - free.left < W * 0.22) { free.left = 0; free.right = W; }
  if (free.bottom - free.top < H * 0.22) { free.top = 44; free.bottom = H - 22; }

  const freeW = free.right - free.left;
  const freeH = free.bottom - free.top;
  const freeCx = (free.left + free.right) * 0.5;
  const freeCy = (free.top + free.bottom) * 0.5;

  // 1) Cadre classique
  fitCameraToObject(object);
  camera.updateMatrixWorld(true);
  controls.update();

  const { center, maxDim, size } = getModelBounds(object);
  const vFov = camera.fov * (Math.PI / 180);
  const aspect = Math.max(0.05, camera.aspect);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

  // 2) Zoom pour tenir dans la zone libre (pas tout l'écran)
  const margin = 1.18;
  const distV = (size.y * 0.5 * margin) / Math.tan(vFov / 2);
  const distH = (Math.max(size.x, size.z) * 0.5 * margin) / Math.tan(hFov / 2);
  let dist = Math.max(distV, distH, maxDim * 0.35);
  dist *= Math.max(W / Math.max(freeW, 1), H / Math.max(freeH, 1));

  let dir = camera.position.clone().sub(controls.target);
  if (dir.lengthSq() < 1e-8) dir.set(0.72, 0.42, 0.72);
  dir.normalize();
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(dir, dist);
  camera.updateMatrixWorld(true);
  controls.update();

  // 3) Pan pour que le centre du modèle se projette au centre de la zone libre
  const projected = center.clone().project(camera);
  const wantX = (freeCx / W) * 2 - 1;
  const wantY = -((freeCy / H) * 2 - 1);
  const dx = wantX - projected.x;
  const dy = wantY - projected.y;

  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
  // Déplacer caméra+cible à l'inverse du décalage NDC pour amener l'objet
  const shiftX = dx * Math.tan(hFov / 2) * dist;
  const shiftY = dy * Math.tan(vFov / 2) * dist;
  camera.position.addScaledVector(right, -shiftX);
  controls.target.addScaledVector(right, -shiftX);
  camera.position.addScaledVector(up, -shiftY);
  controls.target.addScaledVector(up, -shiftY);
  controls.update();

  setStatus(currentLang === 'en' ? 'Framed to visible area.' : 'Cadré sur la zone visible.');
}

function doFrameVisible() {
  if (currentModel) {
    // s'assurer du layout panneau avant mesure
    layoutFloatingWindows();
    requestAnimationFrame(() => fitCameraToVisibleArea(currentModel));
  } else {
    setStatus('Aucun modèle à cadrer.', true);
  }
}

function doResetCam() {
  if (currentModel) {
    fitCameraToObject(currentModel);
  } else {
    camera.position.set(4, 2.5, 6);
    controls.target.set(0, 0.8, 0);
    controls.update();
  }
  setStatus('Caméra recentrée.');
}

let wireframeMode = false;

function toggleWireframe() {
  beginBusy(currentLang === 'en' ? 'Updating wireframe…' : 'Mise à jour du wireframe…');
  try {
    wireframeMode = !wireframeMode;
    updateDynamicMenuLabels?.();
    if (currentModel) {
      currentModel.traverse((child) => {
        if (child.isMesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => { m.wireframe = wireframeMode; });
        }
      });
    }
    setStatus(wireframeMode ? (currentLang === 'en' ? 'Wireframe on.' : 'Wireframe activé.') : (currentLang === 'en' ? 'Solid render.' : 'Rendu solid.'));
    scheduleSavePrefs();
  } finally {
    endBusy();
  }
}

const sidePanel = document.getElementById('side-panel');
const sideTitle = document.getElementById('side-title');
/** Dernière section de panneau affichée */
let lastPanelSection = { id: 'sec-props', title: 'Propriétés' };


const PANEL_MIN_W = 300;
const PANEL_MIN_H = 280;

function ensurePanelMinSize() {
  const panel = document.getElementById('side-panel');
  if (!panel || panel.classList.contains('hidden-ui')) return;
  panel.classList.remove('minimized');
  const rect = panel.getBoundingClientRect();
  let w = rect.width;
  let h = rect.height;
  // si hauteur trop petite (contenu invisible)
  if (h < PANEL_MIN_H || (panel.style.height && parseFloat(panel.style.height) < PANEL_MIN_H)) {
    h = Math.min(Math.max(PANEL_MIN_H, window.innerHeight * 0.45), window.innerHeight - 60);
    panel.style.height = h + 'px';
    panel.style.maxHeight = 'none';
  }
  if (w < PANEL_MIN_W || (panel.style.width && parseFloat(panel.style.width) < PANEL_MIN_W)) {
    w = Math.min(Math.max(PANEL_MIN_W, 320), window.innerWidth - 20);
    panel.style.width = w + 'px';
  }
}

function rebuildLightsListIfNeeded() {
  const list = document.getElementById('lights-list');
  if (!list) return;
  if (list.children.length === 0 && typeof lights !== 'undefined' && lights.length) {
    lights.forEach((entry) => {
      if (!entry.card || !entry.card.isConnected) {
        entry.card = buildLightCard(entry);
      }
      if (entry.card && !entry.card.parentElement) list.appendChild(entry.card);
    });
  }
  updateLightCount();
}

function showSection(id, title) {
  // Localize common titles
  if (currentLang === 'en') {
    const tr = {
      'Matériaux': 'Materials', 'Lumières': 'Lights', 'Sol': 'Ground',
      'Propriétés': 'Properties', 'Propriétés du fichier': 'File properties', 'Panneau': 'Panel',
    };
    if (tr[title]) title = tr[title];
  }

  sidePanel.classList.remove('hidden-ui');
  sidePanel.classList.remove('minimized');
  document.querySelectorAll('.side-section').forEach((s) => s.classList.add('hidden'));
  const sec = document.getElementById(id);
  if (sec) sec.classList.remove('hidden');
  if (sideTitle) sideTitle.textContent = title || 'Panneau';
  lastPanelSection = { id, title: title || 'Panneau' };
  if (id === 'sec-props') refreshFileProps();
  if (id === 'sec-lights') rebuildLightsListIfNeeded();
  layoutFloatingWindows();
  ensurePanelMinSize();
  updateToolbarActiveState();
}

function toggleSidePanel() {
  if (sidePanel.classList.contains('hidden-ui')) {
    // Ouvrir : dernière fenêtre, ou propriétés par défaut
    const id = lastPanelSection?.id || 'sec-props';
    const title = lastPanelSection?.title || 'Propriétés';
    // si aucune section visible (cas 1ère ouverture), forcer props
    const anyVisible = !!document.querySelector('.side-section:not(.hidden)');
    if (!anyVisible) {
      showSection('sec-props', 'Propriétés');
    } else {
      showSection(id, title);
    }
    setStatus('Panneau affiché.');
  } else {
    sidePanel.classList.add('hidden-ui');
    setStatus('Panneau masqué.');
  }
}

function closeSidePanel() {
  sidePanel.classList.add('hidden-ui');
  updateToolbarActiveState();
}

function updateToolbarActiveState() {
  const matsBtn = document.getElementById('toolbar-mats');
  const lightsBtn = document.getElementById('toolbar-lights');
  if (matsBtn) matsBtn.classList.toggle('is-active', isSectionVisible('sec-mats'));
  if (lightsBtn) lightsBtn.classList.toggle('is-active', isSectionVisible('sec-lights'));
}

function formatBytes(n) {
  if (n == null || isNaN(n) || n <= 0) return '—';
  if (n < 1024) return n + ' o';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' Ko';
  return (n / (1024 * 1024)).toFixed(2) + ' Mo';
}

function refreshFileProps() {
  const body = document.getElementById('file-props-body');
  if (!body) return;
  if (!currentModel) {
    body.innerHTML = '<p class="muted">Aucun modèle chargé.</p>';
    return;
  }
  let meshes = 0;
  let tris = 0;
  let verts = 0;
  const matSet = new Set();
  currentModel.traverse((child) => {
    if (!child.isMesh) return;
    meshes++;
    const geo = child.geometry;
    if (geo) {
      const pos = geo.attributes?.position;
      if (pos) verts += pos.count;
      if (geo.index) tris += geo.index.count / 3;
      else if (pos) tris += pos.count / 3;
    }
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((m) => { if (m) matSet.add(m.uuid); });
  });
  const box = new THREE.Box3().setFromObject(currentModel);
  const size = box.getSize(new THREE.Vector3());
  const name = currentFileName || (currentFileKey || '').replace(/^3dviewer_prefs_v1:/, '').split('::')[0] || '—';
  const rows = [
    ['Nom', name],
    ['Taille', formatBytes(currentFileSize)],
    ['Meshes', String(meshes)],
    ['Vertices', Math.round(verts).toLocaleString('fr-FR')],
    ['Triangles (approx.)', Math.round(tris).toLocaleString('fr-FR')],
    ['Matériaux', String(matSet.size)],
    ['Dimensions X', size.x.toFixed(3)],
    ['Dimensions Y', size.y.toFixed(3)],
    ['Dimensions Z', size.z.toFixed(3)],
  ];
  body.innerHTML = rows.map(([l, v]) =>
    '<div class="prop-row"><span class="prop-label">' + l + '</span><span class="prop-value">' + v + '</span></div>'
  ).join('');
}

function showFilePropsPanel() {
  refreshFileProps();
  showSection('sec-props', 'Propriétés');
}
document.getElementById('side-close')?.addEventListener('click', closeSidePanel);

// Maximize / restore window
let panelPrevRect = null;
function toggleMaximizePanel() {
  if (!sidePanel) return;
  if (sidePanel.classList.contains('maximized')) {
    sidePanel.classList.remove('maximized');
    if (panelPrevRect) {
      sidePanel.style.left = panelPrevRect.left;
      sidePanel.style.top = panelPrevRect.top;
      sidePanel.style.width = panelPrevRect.width;
      sidePanel.style.height = panelPrevRect.height;
    }
  } else {
    panelPrevRect = {
      left: sidePanel.style.left || sidePanel.offsetLeft + 'px',
      top: sidePanel.style.top || sidePanel.offsetTop + 'px',
      width: sidePanel.style.width || sidePanel.offsetWidth + 'px',
      height: sidePanel.style.height || sidePanel.offsetHeight + 'px',
    };
    sidePanel.classList.add('maximized');
    sidePanel.style.left = '10px';
    sidePanel.style.top = 'calc(var(--menu-h) + 10px)';
    sidePanel.style.width = 'calc(100vw - 20px)';
    sidePanel.style.height = 'calc(100vh - var(--menu-h) - 20px)';
  }
}
document.getElementById('side-max')?.addEventListener('click', toggleMaximizePanel);
document.getElementById('side-min')?.addEventListener('click', () => {
  sidePanel.classList.toggle('minimized');
});

// Drag fenêtre (barre de titre)
(function enablePanelDrag() {
  const bar = sidePanel?.querySelector('.side-titlebar');
  if (!bar || !sidePanel) return;
  let dragging = false, ox = 0, oy = 0;
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || e.target.closest('.tl')) return;
    if (sidePanel.classList.contains('maximized')) return;
    dragging = true;
    const rect = sidePanel.getBoundingClientRect();
    ox = e.clientX - rect.left;
    oy = e.clientY - rect.top;
    bar.setPointerCapture(e.pointerId);
    sidePanel.classList.add('dragging');
  });
  bar.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const x = Math.max(0, Math.min(window.innerWidth - 80, e.clientX - ox));
    const y = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - oy));
    sidePanel.style.left = x + 'px';
    sidePanel.style.top = y + 'px';
    sidePanel.style.right = 'auto';
    sidePanel.style.bottom = 'auto';
  });
  bar.addEventListener('pointerup', (e) => {
    dragging = false;
    sidePanel.classList.remove('dragging');
    try { bar.releasePointerCapture(e.pointerId); } catch (_) {}
  });
})();

// Redimensionnement
(function enablePanelResize() {
  if (!sidePanel) return;
  const handle = document.createElement('div');
  handle.className = 'resize-handle';
  sidePanel.appendChild(handle);
  let resizing = false, startX = 0, startY = 0, startW = 0, startH = 0;
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (sidePanel.classList.contains('maximized')) return;
    resizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startW = sidePanel.offsetWidth;
    startH = sidePanel.offsetHeight;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!resizing) return;
    const w = Math.max(PANEL_MIN_W || 300, startW + (e.clientX - startX));
    const h = Math.max(PANEL_MIN_H || 280, startH + (e.clientY - startY));
    sidePanel.style.width = w + 'px';
    sidePanel.style.height = h + 'px';
    sidePanel.style.maxHeight = 'none';
  });
  handle.addEventListener('pointerup', (e) => {
    resizing = false;
    try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
  });
})();

function collapseMenus() {
  menuRoot?.classList.remove('menu-open');
  menuBurger?.classList.remove('active');
  document.getElementById('menubar')?.classList.remove('menu-active');
  document.querySelectorAll('.menu-item.open').forEach((i) => i.classList.remove('open'));
}

function openMenuItem(item) {
  document.querySelectorAll('.menu-item.open').forEach((i) => {
    if (i !== item) i.classList.remove('open');
  });
  if (item) {
    item.classList.add('open');
    document.getElementById('menubar')?.classList.add('menu-active');
  }
}

// Menu burger (écrans étroits)
const menuBurger = document.getElementById('menu-burger');
const menuRoot = document.getElementById('menu-root');
menuBurger?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  const willOpen = !menuRoot?.classList.contains('menu-open');
  if (willOpen) {
    menuRoot?.classList.add('menu-open');
    menuBurger.classList.add('active');
  } else {
    collapseMenus();
  }
});

// Fermer si clic / touch en dehors de la barre de menu
function isInsideMenubar(target) {
  return !!(target && (target.closest?.('#menubar') || target.closest?.('#ctx-menu')));
}
document.addEventListener('pointerdown', (e) => {
  if (!isInsideMenubar(e.target)) collapseMenus();
}, true);
document.addEventListener('click', (e) => {
  if (!isInsideMenubar(e.target)) collapseMenus();
}, true);

// Fermer le menu dès qu'on clique sur une action (délégation — mobile + desktop)
menuRoot?.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  // titres Fichier / Éditer / Vue : ouvrent un sous-menu, ne pas fermer ici
  if (btn.classList.contains('menu-label')) return;
  // inputs color dans le menu : ne pas fermer immédiatement (l'utilisateur choisit une couleur)
  if (btn.closest?.('.menu-sky-row') && e.target.closest('input')) return;
  // toute autre action : fermer (burger inclus)
  setTimeout(collapseMenus, 0);
});
// Compat : anciens bind directs
document.querySelectorAll('.menu-dropdown button, .menu-subdropdown button, #menu-about, #menu-help').forEach((btn) => {
  btn.addEventListener('click', () => {
    setTimeout(collapseMenus, 0);
  });
});

// Menu actions
document.getElementById('menu-open')?.addEventListener('click', () => openLoadWindow());

function openLoadWindow() {
  const w = document.getElementById('load-window');
  if (w) w.classList.remove('hidden');
}
function closeLoadWindow() {
  const w = document.getElementById('load-window');
  if (w) w.classList.add('hidden');
}
document.getElementById('load-close')?.addEventListener('click', closeLoadWindow);
document.getElementById('load-browse-btn')?.addEventListener('click', () => fileInput?.click());

const loadDrop = document.getElementById('load-drop-zone');
loadDrop?.addEventListener('click', () => fileInput?.click());
['dragenter', 'dragover'].forEach((evt) => {
  loadDrop?.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    loadDrop.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  loadDrop?.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    loadDrop.classList.remove('dragover');
  });
});
loadDrop?.addEventListener('drop', (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) {
    closeLoadWindow();
    loadFile(file);
  }
});
// Après choix via Parcourir, fermer la fenêtre
fileInput?.addEventListener('change', () => {
  closeLoadWindow();
}, true);

document.getElementById('menu-clear')?.addEventListener('click', clearModelAndMats);

function onUndoClick(e) {
  e.preventDefault();
  e.stopPropagation();
  collapseMenus();
  performUndo();
}
function onRedoClick(e) {
  e.preventDefault();
  e.stopPropagation();
  collapseMenus();
  performRedo();
}
document.getElementById('menu-undo')?.addEventListener('click', onUndoClick);
document.getElementById('toolbar-undo')?.addEventListener('click', onUndoClick);
document.getElementById('menu-redo')?.addEventListener('click', onRedoClick);
document.getElementById('toolbar-redo')?.addEventListener('click', onRedoClick);
function isSectionVisible(id) {
  const panel = document.getElementById('side-panel');
  const sec = document.getElementById(id);
  if (!panel || !sec) return false;
  if (panel.classList.contains('hidden-ui') || panel.classList.contains('minimized')) return false;
  return !sec.classList.contains('hidden');
}

function toggleSectionPanel(id, title, afterOpen) {
  if (isSectionVisible(id)) {
    closeSidePanel();
    setStatus('Panneau fermé.');
    return;
  }
  showSection(id, title);
  if (typeof afterOpen === 'function') afterOpen();
}

function toolbarClick(e, fn) {
  e.preventDefault();
  e.stopPropagation();
  collapseMenus();
  fn();
}
document.getElementById('toolbar-mats')?.addEventListener('click', (e) => {
  toolbarClick(e, () => toggleSectionPanel('sec-mats', 'Matériaux', () => refreshMaterialSelect()));
});
document.getElementById('toolbar-lights')?.addEventListener('click', (e) => {
  toolbarClick(e, () => toggleSectionPanel('sec-lights', 'Lumières'));
});
document.getElementById('toolbar-reframe')?.addEventListener('click', (e) => {
  toolbarClick(e, () => doFrame());
});
document.getElementById('toolbar-frame-visible')?.addEventListener('click', (e) => {
  toolbarClick(e, () => doFrameVisible());
});
document.getElementById('menu-frame-visible')?.addEventListener('click', doFrameVisible);
// Raccourcis : Ctrl/Cmd+Z annuler, Ctrl/Cmd+Y ou Shift+Z refaire
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) {
    e.preventDefault();
    performUndo();
  } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
    e.preventDefault();
    performRedo();
  }
});
document.getElementById('menu-frame')?.addEventListener('click', doFrame);

document.getElementById('menu-wireframe')?.addEventListener('click', toggleWireframe);
document.getElementById('menu-file-props')?.addEventListener('click', showFilePropsPanel);
document.getElementById('menu-toggle-panel')?.addEventListener('click', toggleSidePanel);

// ===== Couleur du ciel (arrière-plan) =====
function toHex6(hexOrColor) {
  if (!hexOrColor) return '#1a1d24';
  if (typeof hexOrColor === 'string') {
    let h = hexOrColor.trim();
    if (!h.startsWith('#')) h = '#' + h;
    if (h.length === 4) {
      h = '#' + h[1]+h[1]+h[2]+h[2]+h[3]+h[3];
    }
    return h.toLowerCase();
  }
  if (hexOrColor.isColor || hexOrColor.r !== undefined) {
    return '#' + new THREE.Color(hexOrColor).getHexString();
  }
  return '#1a1d24';
}

function setColorInput(el, hex) {
  if (!el) return;
  const h = toHex6(hex);
  el.value = h;
  el.setAttribute('value', h);
}

function setSkyColor(hex) {
  if (!hex) return;
  const h = toHex6(hex);
  const c = new THREE.Color(h);
  scene.background = c;
  if (scene.fog) scene.fog.color.copy(c);
  setColorInput(document.getElementById('menu-sky-color'), h);
  try { localStorage.setItem('3dviewer_sky_color', h); } catch (_) {}
}
document.getElementById('menu-sky-color')?.addEventListener('input', (e) => {
  setSkyColor(e.target.value);
});
document.getElementById('menu-sky-color')?.addEventListener('click', (e) => {
  e.stopPropagation();
  // synchroniser avec la couleur réelle de la scène avant d'ouvrir le sélecteur
  if (scene.background && scene.background.isColor) {
    setColorInput(e.target, '#' + scene.background.getHexString());
  }
});
document.getElementById('menu-sky-color')?.addEventListener('focus', (e) => {
  if (scene.background && scene.background.isColor) {
    setColorInput(e.target, '#' + scene.background.getHexString());
  }
});
document.getElementById('menu-reset-sky')?.addEventListener('click', () => {
  try { localStorage.removeItem('3dviewer_sky_color'); } catch (_) {}
  const def = (typeof loadAppSettings === 'function' ? loadAppSettings() : null)?.skyDefault || '#1a1d24';
  setSkyColor(def);
  setStatus(currentLang === 'en' ? 'Sky color reset.' : 'Couleur du ciel réinitialisée.');
});

let lightHelpersVisible = true;
function setLightHelpersVisible(vis) {
  lightHelpersVisible = !!vis;
  lights.forEach((e) => {
    if (e.helper) e.helper.visible = lightHelpersVisible;
  });
  try { localStorage.setItem('3dviewer_helpers', lightHelpersVisible ? '1' : '0'); } catch (_) {}
  updateDynamicMenuLabels();
  setStatus(lightHelpersVisible
    ? (currentLang === 'en' ? 'Light cones shown.' : 'Cônes de lumière affichés.')
    : (currentLang === 'en' ? 'Light cones hidden.' : 'Cônes de lumière masqués.'));
}
document.getElementById('menu-toggle-helpers')?.addEventListener('click', () => {
  setLightHelpersVisible(!lightHelpersVisible);
});

let gizmosVisible = true;

function updateDynamicMenuLabels() {
  const t = (key) => {
    const fr = {
      gizmoOn: 'Masquer les gizmo', gizmoOff: 'Afficher les gizmo',
      helpersOn: 'Masquer les cônes de lumière', helpersOff: 'Afficher les cônes de lumière',
      themeLight: 'Affichage clair', themeDark: 'Affichage sombre',
      wireOn: 'Désactiver le wireframe', wireOff: 'Wireframe',
      ground: groundMode === 'grid' ? 'Sol : surface plate' : groundMode === 'plane' ? 'Sol : aucun' : 'Sol : quadrillage',
    };
    const en = {
      gizmoOn: 'Hide gizmos', gizmoOff: 'Show gizmos',
      helpersOn: 'Hide light cones', helpersOff: 'Show light cones',
      themeLight: 'Light mode', themeDark: 'Dark mode',
      wireOn: 'Disable wireframe', wireOff: 'Wireframe',
      ground: groundMode === 'grid' ? 'Ground: flat' : groundMode === 'plane' ? 'Ground: none' : 'Ground: grid',
    };
    const dict = currentLang === 'en' ? en : fr;
    return dict[key] || key;
  };
  document.querySelectorAll('[data-dyn="gizmo"]').forEach((el) => {
    el.textContent = gizmosVisible ? t('gizmoOn') : t('gizmoOff');
  });
  document.querySelectorAll('[data-dyn="helpers"]').forEach((el) => {
    el.textContent = lightHelpersVisible ? t('helpersOn') : t('helpersOff');
  });
  document.querySelectorAll('[data-dyn="theme"]').forEach((el) => {
    el.textContent = document.body.classList.contains('theme-light') ? t('themeDark') : t('themeLight');
  });
  document.querySelectorAll('[data-ctx="gizmo"]').forEach((el) => {
    el.textContent = gizmosVisible ? t('gizmoOn') : t('gizmoOff');
  });
  document.querySelectorAll('[data-ctx="helpers"]').forEach((el) => {
    el.textContent = lightHelpersVisible ? t('helpersOn') : t('helpersOff');
  });
  document.querySelectorAll('[data-ctx="wire"]').forEach((el) => {
    el.textContent = wireframeMode ? t('wireOn') : t('wireOff');
  });
  document.querySelectorAll('[data-ctx="ground"]').forEach((el) => {
    el.textContent = t('ground');
  });
}

function setGizmosVisible(vis) {
  gizmosVisible = !!vis;
  if (typeof sceneAxesRoot !== 'undefined' && sceneAxesRoot) sceneAxesRoot.visible = gizmosVisible;
  if (typeof axesRoot !== 'undefined' && axesRoot) axesRoot.visible = gizmosVisible;
  try { localStorage.setItem('3dviewer_gizmos', gizmosVisible ? '1' : '0'); } catch (_) {}
  updateDynamicMenuLabels();
  setStatus(gizmosVisible ? (currentLang==='en'?'Gizmos shown.':'Gizmo affichés.') : (currentLang==='en'?'Gizmos hidden.':'Gizmo masqués.'));
}
document.getElementById('menu-toggle-gizmo')?.addEventListener('click', () => {
  setGizmosVisible(!gizmosVisible);
});
document.getElementById('menu-theme-light')?.addEventListener('click', () => {
  document.body.classList.toggle('theme-light');
  const on = document.body.classList.contains('theme-light');
  try { localStorage.setItem('3dviewer_theme', on ? 'light' : 'dark'); } catch (_) {}
  updateDynamicMenuLabels();
  setStatus(on ? (currentLang==='en'?'Light mode':'Affichage clair') : (currentLang==='en'?'Dark mode':'Affichage sombre'));
});

try {
  if (localStorage.getItem('3dviewer_theme') === 'light') document.body.classList.add('theme-light');
} catch (_) {}

try {
  const savedSky = localStorage.getItem('3dviewer_sky_color');
  if (savedSky) setSkyColor(savedSky);
} catch (_) {}

document.getElementById('menu-show-mats')?.addEventListener('click', () => {
  showSection('sec-mats', 'Matériaux');
  refreshMaterialSelect();
});
document.getElementById('menu-show-lights')?.addEventListener('click', () => showSection('sec-lights', 'Lumières'));
document.getElementById('menu-add-ambient')?.addEventListener('click', () => { showSection('sec-lights', 'Lumières'); addLight('AmbientLight'); });
document.getElementById('menu-add-directional')?.addEventListener('click', () => { showSection('sec-lights', 'Lumières'); addLight('DirectionalLight'); });
document.getElementById('menu-add-point')?.addEventListener('click', () => { showSection('sec-lights', 'Lumières'); addLight('PointLight'); });
document.getElementById('menu-add-spot')?.addEventListener('click', () => { showSection('sec-lights', 'Lumières'); addLight('SpotLight'); });
document.getElementById('menu-about')?.addEventListener('click', () => {
  openAboutWindow();
});
document.getElementById('menu-apply-all')?.addEventListener('click', () => {
  showSection('sec-mats', 'Matériaux');
  applyMaterialsFromUI(true);
});

// Menu style macOS : clic pour ouvrir, un seul sous-menu, survol bascule si déjà actif
document.querySelectorAll('.menu-item').forEach((item) => {
  const label = item.querySelector('.menu-label');
  const hasDrop = !!item.querySelector('.menu-dropdown');
  if (!hasDrop) return;

  label?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (item.classList.contains('open')) {
      // re-clic sur le même = fermer
      collapseMenus();
    } else {
      openMenuItem(item);
    }
  });

  // Si un menu est déjà ouvert, le survol d'un autre titre bascule uniquement sur celui-ci
  item.addEventListener('mouseenter', () => {
    const bar = document.getElementById('menubar');
    if (!bar?.classList.contains('menu-active')) return;
    openMenuItem(item);
  });
});
// Ne pas fermer au clic sur la barre elle-même (déjà géré : hors #menubar → collapse)


// ========== Lights management ==========
function updateLightCount() {
  lightCountEl.textContent = `(${lights.length})`;
}

function createLightHelper(light, type) {
  let helper = null;
  if (type === 'DirectionalLight') {
    helper = new THREE.DirectionalLightHelper(light, 2.5);
    helper.visible = true;
  } else if (type === 'PointLight') {
    helper = new THREE.PointLightHelper(light, 0.6);
  } else if (type === 'SpotLight') {
    helper = new THREE.SpotLightHelper(light);
  }
  if (helper) {
    helper.visible = (typeof lightHelpersVisible === 'undefined') ? true : lightHelpersVisible;
    scene.add(helper);
    // Petite sphère visible pour repérer facilement la position de la lumière
    if (type !== 'AmbientLight') {
      const markerGeo = new THREE.SphereGeometry(0.18, 12, 12);
      const markerMat = new THREE.MeshBasicMaterial({ color: light.color, transparent: true, opacity: 0.85 });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.copy(light.position);
      scene.add(marker);
      helper._marker = marker; // stocker pour mise à jour
    }
  }
  return helper;
}

function addLight(type) {
  beginBusy(currentLang === 'en' ? 'Adding light…' : 'Ajout de lumière…');
  try {
  const id = ++lightIdCounter;
  let light;

  // Taille de référence (modèle actuel ou valeur par défaut)
  let maxDim = 3;
  let center = new THREE.Vector3(0, 0.8, 0);
  if (currentModel) {
    const b = getModelBounds(currentModel);
    maxDim = b.maxDim;
    center = b.center.clone();
  }
  const d = maxDim * 1.8;

  if (type === 'AmbientLight') {
    light = new THREE.AmbientLight(0xffffff, 0.5);
  } else if (type === 'DirectionalLight') {
    light = new THREE.DirectionalLight(0xffffff, 3.0);
    light.position.set(center.x + d * 0.8, center.y + d * 1.2, center.z + d * 0.6);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.near = 0.5;
    const s = maxDim * 1.5;
    light.shadow.camera.far = maxDim * 10;
    light.shadow.camera.left = -s;
    light.shadow.camera.right = s;
    light.shadow.camera.top = s;
    light.shadow.camera.bottom = -s;
    light.shadow.bias = -0.0005;
  } else if (type === 'PointLight') {
    light = new THREE.PointLight(0xffffff, 60, maxDim * 8, 1.5);
    light.position.set(center.x, center.y + d * 0.9, center.z + d * 0.5);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
  } else if (type === 'SpotLight') {
    light = new THREE.SpotLight(0xffffff, 100, maxDim * 10, Math.PI / 5, 0.25, 1);
    light.position.set(center.x + d * 0.5, center.y + d * 1.4, center.z + d * 0.5);
    light.target.position.copy(center);
    scene.add(light.target);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
  }

  scene.add(light);
  const helper = createLightHelper(light, type);

  // Adapter la taille du marqueur
  if (helper && helper._marker) {
    const s = Math.max(0.15, maxDim * 0.04);
    helper._marker.scale.setScalar(s / 0.18);
  }

  const entry = { id, type, light, helper, card: null };
  lights.push(entry);
  entry.card = buildLightCard(entry);
  lightsList.appendChild(entry.card);
  updateLightCount();
  setStatus(`Lumière ${type.replace('Light', '')} ajoutée (positionnée autour du modèle).`);
  if (!skipLightUndo) {
    const addedId = id;
    const st = captureLightState(entry);
    pushUndo({
      label: 'Ajout lumière ' + type.replace('Light', ''),
      undo: () => {
        skipLightUndo = true;
        removeLight(addedId);
        skipLightUndo = false;
      },
      redo: () => {
        skipLightUndo = true;
        addLight(st.type);
        skipLightUndo = false;
        const last = lights[lights.length - 1];
        if (last && st) applyLightState(last, st);
      },
    });
  }
  } finally {
    endBusy();
  }
}

function removeLight(id) {
  const idx = lights.findIndex((l) => l.id === id);
  if (idx === -1) return;
  const entry = lights[idx];
  const st = captureLightState(entry);
  scene.remove(entry.light);
  if (entry.helper) {
    if (entry.helper._marker) scene.remove(entry.helper._marker);
    scene.remove(entry.helper);
  }
  if (entry.light.target) scene.remove(entry.light.target);
  if (entry.card) entry.card.remove();
  lights.splice(idx, 1);
  updateLightCount();
  setStatus('Lumière supprimée.');
  if (!skipLightUndo && st) {
    pushUndo({
      label: 'Suppression lumière',
      undo: () => {
        skipLightUndo = true;
        addLight(st.type);
        skipLightUndo = false;
        const last = lights[lights.length - 1];
        if (last) applyLightState(last, st);
      },
      redo: () => {
        // refaire = supprimer à nouveau la dernière lumière du même type/état au mieux
        const match = lights.find((l) => l.type === st.type);
        if (match) {
          skipLightUndo = true;
          removeLight(match.id);
          skipLightUndo = false;
        }
      },
    });
  }
}

function buildLightCard(entry) {
  const { id, type, light } = entry;
  const card = document.createElement('div');
  card.className = 'light-card';
  card.dataset.id = id;

  const shortType = type.replace('Light', '');
  const isAmbient = type === 'AmbientLight';

  const lightName = entry.name || (shortType + ' #' + id);
  entry.name = lightName;
  let html = `
    <div class="light-card-header">
      <button type="button" class="btn-collapse" title="Réduire / agrandir">−</button>
      <strong class="light-name" contenteditable="true" spellcheck="false" title="Cliquer pour renommer">${lightName}</strong>
      <button class="btn-remove" title="Supprimer">×</button>
    </div>
    <div class="controls light-card-body">
      <div class="control-row">
        <label>Couleur</label>
        <input type="color" class="ctrl-color" value="#${light.color.getHexString()}" />
      </div>
      <div class="control-row">
        <label>Intensité</label>
        <input type="range" class="ctrl-intensity" min="0" max="${isAmbient ? 2 : 100}" step="0.05" value="${light.intensity}" />
        <span class="val-intensity">${light.intensity.toFixed(2)}</span>
      </div>
  `;

  if (!isAmbient) {
    const bp = { x: light.position.x, y: light.position.z, z: light.position.y };
    const br = {
      x: light.rotation.x * 180 / Math.PI,
      y: light.rotation.z * 180 / Math.PI,
      z: light.rotation.y * 180 / Math.PI,
    };
    html += `
      <div class="control-row">
        <label>Pos X</label>
        <input type="number" class="ctrl-px" step="0.1" value="${bp.x.toFixed(1)}" />
      </div>
      <div class="control-row">
        <label>Pos Y</label>
        <input type="number" class="ctrl-py" step="0.1" value="${bp.y.toFixed(1)}" />
      </div>
      <div class="control-row">
        <label>Pos Z</label>
        <input type="number" class="ctrl-pz" step="0.1" value="${bp.z.toFixed(1)}" />
      </div>
      <div class="control-row">
        <label>Rot X °</label>
        <input type="number" class="ctrl-rx" step="1" value="${br.x.toFixed(0)}" />
      </div>
      <div class="control-row">
        <label>Rot Y °</label>
        <input type="number" class="ctrl-ry" step="1" value="${br.y.toFixed(0)}" />
      </div>
      <div class="control-row">
        <label>Rot Z °</label>
        <input type="number" class="ctrl-rz" step="1" value="${br.z.toFixed(0)}" />
      </div>
      <div class="control-row">
        <label>Ombres</label>
        <input type="checkbox" class="ctrl-shadow" ${light.castShadow ? 'checked' : ''} />
      </div>
    `;
  }

  if (type === 'SpotLight') {
    html += `
      <div class="control-row">
        <label>Angle</label>
        <input type="range" class="ctrl-angle" min="0.05" max="1.5" step="0.01" value="${light.angle}" />
        <span class="val-angle">${light.angle.toFixed(2)}</span>
      </div>
      <div class="control-row">
        <label>Penumbra</label>
        <input type="range" class="ctrl-penumbra" min="0" max="1" step="0.01" value="${light.penumbra}" />
      </div>
    `;
  }

  if (type === 'PointLight' || type === 'SpotLight') {
    html += `
      <div class="control-row">
        <label>Distance</label>
        <input type="range" class="ctrl-dist" min="0" max="100" step="1" value="${light.distance}" />
        <span class="val-dist">${light.distance}</span>
      </div>
    `;
  }

  html += `</div>`;
  card.innerHTML = html;

  // Events (+ undo sur modification)
  const pushLightModUndo = (() => {
    let armed = false;
    return () => {
      if (armed) return;
      armed = true;
      const before = captureLightState(entry);
      const afterRef = { st: null };
      const captureAfter = () => { afterRef.st = captureLightState(entry); };
      entry.card?.addEventListener('pointerup', captureAfter, { once: true });
      entry.card?.addEventListener('change', captureAfter, { once: true });
      pushUndo({
        label: 'Modif. lumière #' + id,
        undo: () => {
          const cur = lights.find((l) => l.id === id);
          if (cur) applyLightState(cur, before);
        },
        redo: () => {
          const cur = lights.find((l) => l.id === id);
          if (cur && afterRef.st) applyLightState(cur, afterRef.st);
        },
      });
      setTimeout(() => { armed = false; captureAfter(); }, 800);
    };
  })();

  card.querySelector('.btn-remove').addEventListener('click', () => removeLight(id));
  const collapseBtn = card.querySelector('.btn-collapse');
  const body = card.querySelector('.light-card-body');
  collapseBtn?.addEventListener('click', () => {
    const collapsed = card.classList.toggle('collapsed');
    collapseBtn.textContent = collapsed ? '+' : '−';
    if (body) body.style.display = collapsed ? 'none' : '';
  });
  const nameEl = card.querySelector('.light-name');
  nameEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
  });
  nameEl?.addEventListener('blur', () => {
    const n = (nameEl.textContent || '').trim() || lightName;
    nameEl.textContent = n;
    entry.name = n;
  });

  const colorInput = card.querySelector('.ctrl-color');
  colorInput.addEventListener('pointerdown', pushLightModUndo);
  colorInput.addEventListener('focus', () => {
    setColorInput(colorInput, '#' + light.color.getHexString());
  });
  colorInput.addEventListener('click', () => {
    setColorInput(colorInput, '#' + light.color.getHexString());
  });
  colorInput.addEventListener('input', (e) => {
    light.color.set(e.target.value);
    if (entry.helper) {
      entry.helper.update?.();
      if (entry.helper._marker) entry.helper._marker.material.color.copy(light.color);
    }
  });

  const intensityInput = card.querySelector('.ctrl-intensity');
  const intensityVal = card.querySelector('.val-intensity');
  intensityInput.addEventListener('pointerdown', pushLightModUndo);
  intensityInput.addEventListener('input', (e) => {
    light.intensity = parseFloat(e.target.value);
    intensityVal.textContent = light.intensity.toFixed(2);
  });

  if (!isAmbient) {
    const updatePos = () => {
      const px = parseFloat(card.querySelector('.ctrl-px').value) || 0;
      const py = parseFloat(card.querySelector('.ctrl-py').value) || 0;
      const pz = parseFloat(card.querySelector('.ctrl-pz').value) || 0;
      // UI Z = height (Three.js Y), UI Y = depth (Three.js Z) — same as gizmos
      light.position.set(px, pz, py);
      if (entry.helper) {
        entry.helper.update?.();
        if (entry.helper.position) entry.helper.position.copy(light.position);
        if (entry.helper._marker) {
          entry.helper._marker.position.copy(light.position);
          entry.helper._marker.material.color.copy(light.color);
        }
      }
    };
    card.querySelector('.ctrl-px').addEventListener('focus', pushLightModUndo);
    card.querySelector('.ctrl-py').addEventListener('focus', pushLightModUndo);
    card.querySelector('.ctrl-pz').addEventListener('focus', pushLightModUndo);
    card.querySelector('.ctrl-px').addEventListener('change', updatePos);
    card.querySelector('.ctrl-py').addEventListener('change', updatePos);
    card.querySelector('.ctrl-pz').addEventListener('change', updatePos);

    const updateRot = () => {
      const rx = (parseFloat(card.querySelector('.ctrl-rx').value) || 0) * Math.PI / 180;
      const ry = (parseFloat(card.querySelector('.ctrl-ry').value) || 0) * Math.PI / 180;
      const rz = (parseFloat(card.querySelector('.ctrl-rz').value) || 0) * Math.PI / 180;
      light.rotation.set(rx, rz, ry);
      // Directional / Spot : réorienter la cible selon la rotation
      if (light.target) {
        const dist = light.position.distanceTo(light.target.position) || 5;
        const dir = new THREE.Vector3(0, -1, 0);
        dir.applyEuler(light.rotation);
        light.target.position.copy(light.position).addScaledVector(dir, dist);
        light.target.updateMatrixWorld();
      }
      if (entry.helper) {
        entry.helper.update?.();
        if (entry.helper._marker) entry.helper._marker.position.copy(light.position);
      }
    };
    card.querySelector('.ctrl-rx').addEventListener('focus', pushLightModUndo);
    card.querySelector('.ctrl-ry').addEventListener('focus', pushLightModUndo);
    card.querySelector('.ctrl-rz').addEventListener('focus', pushLightModUndo);
    card.querySelector('.ctrl-rx').addEventListener('change', updateRot);
    card.querySelector('.ctrl-ry').addEventListener('change', updateRot);
    card.querySelector('.ctrl-rz').addEventListener('change', updateRot);

    card.querySelector('.ctrl-shadow').addEventListener('change', (e) => {
      pushLightModUndo();
      light.castShadow = e.target.checked;
    });
  }

  if (type === 'SpotLight') {
    const angleInput = card.querySelector('.ctrl-angle');
    const angleVal = card.querySelector('.val-angle');
    angleInput.addEventListener('pointerdown', pushLightModUndo);
    angleInput.addEventListener('input', (e) => {
      light.angle = parseFloat(e.target.value);
      angleVal.textContent = light.angle.toFixed(2);
      entry.helper?.update?.();
    });
    card.querySelector('.ctrl-penumbra').addEventListener('pointerdown', pushLightModUndo);
    card.querySelector('.ctrl-penumbra').addEventListener('input', (e) => {
      light.penumbra = parseFloat(e.target.value);
    });
  }

  if (type === 'PointLight' || type === 'SpotLight') {
    const distInput = card.querySelector('.ctrl-dist');
    const distVal = card.querySelector('.val-dist');
    distInput.addEventListener('pointerdown', pushLightModUndo);
    distInput.addEventListener('input', (e) => {
      light.distance = parseFloat(e.target.value);
      distVal.textContent = light.distance;
    });
  }

  return card;
}

// Buttons
document.getElementById('btn-add-ambient')?.addEventListener('click', () => addLight('AmbientLight'));
document.getElementById('btn-add-directional')?.addEventListener('click', () => addLight('DirectionalLight'));
document.getElementById('btn-add-point')?.addEventListener('click', () => addLight('PointLight'));
document.getElementById('btn-add-spot')?.addEventListener('click', () => addLight('SpotLight'));

// Default lights for a nice starting point (good for car models)
skipLightUndo = true;
addLight('AmbientLight');
addLight('DirectionalLight');
skipLightUndo = false;
updateUndoMenu();

// ========== Resize & render loop ==========
let lastPortrait = null;
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  const portrait = h > w;
  if (lastPortrait === null || lastPortrait !== portrait) {
    lastPortrait = portrait;
    layoutFloatingWindows();
  } else {
    layoutFloatingWindows();
  }
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    onResize();
    layoutFloatingWindows();
  }, 150);
});
// layout initial
lastPortrait = window.innerHeight > window.innerWidth;
layoutFloatingWindows();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  // Update helpers + markers
  lights.forEach((e) => {
    if (e.helper) {
      if (e.helper.update) e.helper.update();
      if (e.helper._marker) {
        e.helper._marker.position.copy(e.light.position);
      }
    }
  });
  renderer.clear();
  renderer.render(scene, camera);
  // Gizmo orientation (coin bas-droit)
  if (typeof gizmosVisible === 'undefined' || gizmosVisible) {
    const aw = 96;
    const ah = 96;
    const w = window.innerWidth;
    const h = window.innerHeight;
    axesCamera.position.copy(camera.position).sub(controls.target).normalize().multiplyScalar(2.8);
    axesCamera.up.copy(camera.up);
    axesCamera.lookAt(0, 0, 0);
    renderer.clearDepth();
    renderer.setScissorTest(true);
    renderer.setScissor(w - aw - 10, 10, aw, ah);
    renderer.setViewport(w - aw - 10, 10, aw, ah);
    renderer.render(axesScene, axesCamera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
  }
}
animate();

// ========== Optional: load a simple demo car shape so the scene isn't empty ==========
function createDemoCar() {
  const group = new THREE.Group();

  // Body
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e40af, metalness: 0.6, roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 1.1), bodyMat);
  body.position.y = 0.45;
  body.castShadow = true;
  body.name = 'Carrosserie';
  body.userData.matName = 'Carrosserie';
  group.add(body);

  // Cabin
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.3, roughness: 0.2 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 0.95), cabinMat);
  cabin.position.set(-0.15, 0.9, 0);
  cabin.castShadow = true;
  cabin.name = 'Cabine';
  cabin.userData.matName = 'Cabine';
  group.add(cabin);

  // Windows (simple)
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x93c5fd, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.6 });
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, 0.85), glassMat);
  windshield.position.set(0.4, 0.9, 0);
  windshield.name = 'Pare-brise';
  windshield.userData.matName = 'Verre';
  group.add(windshield);

  // Wheels
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.4, roughness: 0.6 });
  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.18, 16);
  const positions = [
    [0.7, 0.28, 0.55],
    [0.7, 0.28, -0.55],
    [-0.7, 0.28, 0.55],
    [-0.7, 0.28, -0.55],
  ];
  positions.forEach(([x, y, z], i) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat.clone());
    // Axe du cylindre selon Z (roues verticales, voiture orientée X)
    w.rotation.x = Math.PI / 2;
    w.position.set(x, y, z);
    w.castShadow = true;
    w.name = 'Roue_' + (i + 1);
    w.userData.matName = 'Roue';
    group.add(w);
  });

  // Headlights
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfef08a, emissiveIntensity: 0.6 });
  const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.25), lightMat);
  hl1.position.set(1.12, 0.45, 0.35);
  hl1.name = 'Phare_G';
  hl1.userData.matName = 'Phare';
  group.add(hl1);
  const hl2 = hl1.clone();
  hl2.position.z = -0.35;
  hl2.name = 'Phare_D';
  hl2.userData.matName = 'Phare';
  group.add(hl2);

  return group;
}


// ========== Matériaux ==========
const textureLoader = new THREE.TextureLoader();
let pendingTexture = null;
/** @type {{ key: string, label: string, material: THREE.Material, meshes: THREE.Mesh[] }[]} */
let materialEntries = [];
let originalMaterialsSnapshot = null;


function captureOriginalMaterials(model) {
  const snap = [];
  if (!model) {
    originalMaterialsSnapshot = null;
    return snap;
  }
  model.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    const clones = mats.map((m) => {
      try { return m.clone(); } catch (_) { return m; }
    });
    snap.push({
      mesh: child,
      isArray: Array.isArray(child.material),
      materials: clones,
    });
  });
  originalMaterialsSnapshot = snap;
  return snap;
}

function resetMaterialsToOriginal() {
  if (!currentModel) {
    setStatus('Aucun modèle chargé.', true);
    return;
  }
  if (!originalMaterialsSnapshot || originalMaterialsSnapshot.length === 0) {
    setStatus("Aucun matériau d'origine enregistré pour ce fichier.", true);
    return;
  }
  const matSnap = snapshotAllMaterials();
  let n = 0;
  originalMaterialsSnapshot.forEach((entry) => {
    if (!entry.mesh) return;
    try {
      const restored = entry.materials.map((m) => {
        try { return m.clone(); } catch (_) { return m; }
      });
      entry.mesh.material = entry.isArray ? restored : restored[0];
      (entry.isArray ? restored : [restored[0]]).forEach((m) => { if (m) m.needsUpdate = true; });
      n++;
    } catch (err) {
      console.warn('reset mat', err);
    }
  });
  pendingTexture = null;
  const texInput = document.getElementById('mat-texture');
  if (texInput) texInput.value = '';
  const afterSnap = snapshotAllMaterials();
  pushUndo({
    label: "Réinit. matériaux",
    undo: () => restoreMaterialsSnap(matSnap),
    redo: () => restoreMaterialsSnap(afterSnap),
  });
  refreshMaterialSelect(false);
  scheduleSavePrefs();
  setStatus("Matériaux d'origine restaurés (" + n + " mesh).");
}

function collectMaterials() {
  materialEntries = [];
  if (!currentModel) return materialEntries;
  // Regrouper par nom de matériau (même nom = une seule entrée éditable)
  const byName = new Map();
  let autoIdx = 0;
  currentModel.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((m, mi) => {
      let base = (m.name || child.userData?.matName || '').trim();
      if (!base) {
        base = (child.name || 'Matériau').trim() || ('Matériau ' + (++autoIdx));
        m.name = base;
      }
      const key = base.toLowerCase();
      let entry = byName.get(key);
      if (!entry) {
        entry = {
          key: key,
          baseLabel: base,
          label: base,
          material: m, // matériau "principal" pour l'UI
          materials: [m], // tous les instances THREE.Material du même nom
          meshes: [],
        };
        byName.set(key, entry);
        materialEntries.push(entry);
      } else if (!entry.materials.includes(m)) {
        entry.materials.push(m);
      }
      if (!entry.meshes.includes(child)) entry.meshes.push(child);
      if (m.userData._origMap === undefined) {
        m.userData._origMap = m.map || null;
        m.userData._origRepeat = m.map ? m.map.repeat.clone() : null;
        if (m.map) m.userData._origMapName = guessTextureName(m.map);
      }
    });
  });
  materialEntries.sort((a, b) => a.baseLabel.localeCompare(b.baseLabel, 'fr', { sensitivity: 'base' }));
  materialEntries.forEach((e, i) => {
    e.baseLabel = e.baseLabel;
    e.label = e.baseLabel; // sans numéro (affichage en-tête / bulles)
    e.listLabel = (i + 1) + '-' + e.baseLabel; // avec numéro (liste)
    e.key = String(i);
  });
  return materialEntries;
}

function refreshMaterialSelect(preserveLabel = true) {
  const sel = document.getElementById('mat-select');
  const list = document.getElementById('mat-select-list');
  const btnLabel = document.getElementById('mat-select-btn-label');
  const btnSw = document.getElementById('mat-select-btn-swatch');
  if (!sel) return;
  let prevBase = null;
  if (preserveLabel) {
    const cur = getSelectedMaterialEntry();
    if (cur) prevBase = cur.baseLabel || cur.label;
    else if (sel.selectedOptions[0]) prevBase = sel.selectedOptions[0].dataset.base || sel.selectedOptions[0].textContent;
  }
  collectMaterials();
  sel.innerHTML = '';
  if (list) list.innerHTML = '';
  if (materialEntries.length === 0) {
    sel.innerHTML = '<option value="">—</option>';
    if (btnLabel) btnLabel.textContent = currentLang === 'en' ? '— no material —' : '— aucun matériau —';
    if (btnSw) btnSw.style.background = '#666';
    const hdr = document.getElementById('mat-name-header');
    if (hdr) hdr.textContent = '';
    return;
  }
  materialEntries.forEach((e, i) => {
    const hex = e.material?.color ? ('#' + e.material.color.getHexString()) : '#888888';
    const label = e.listLabel || e.label || ('Mat ' + (i + 1));
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = label;
    opt.dataset.base = e.baseLabel || e.label || '';
    opt.dataset.color = hex;
    sel.appendChild(opt);
    if (list) {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.dataset.value = String(i);
      li.innerHTML = `<span class="mat-opt-label"></span><span class="mat-opt-swatch"></span>`;
      li.querySelector('.mat-opt-label').textContent = label;
      li.querySelector('.mat-opt-swatch').style.background = hex;
      li.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        selectMaterialIndex(i);
        closeMatSelectList();
      });
      list.appendChild(li);
    }
  });
  let idx = 0;
  if (prevBase) {
    const found = materialEntries.findIndex((e) => e.baseLabel === prevBase || e.label === prevBase);
    if (found >= 0) idx = found;
  }
  selectMaterialIndex(idx);
}

function selectMaterialIndex(idx) {
  idx = parseInt(idx, 10);
  if (isNaN(idx) || idx < 0) idx = 0;
  if (materialEntries.length && idx >= materialEntries.length) idx = materialEntries.length - 1;
  const sel = document.getElementById('mat-select');
  if (sel) sel.value = String(idx);
  const entry = materialEntries[idx] || null;
  loadMaterialToUI(idx);
  // Mise à jour explicite du bouton + header (source de vérité = entry)
  const hex = entry?.material?.color ? ('#' + entry.material.color.getHexString()) : '#666';
  const listLabel = entry ? (entry.listLabel || entry.label || entry.baseLabel || '—') : '—';
  const plainLabel = entry ? (entry.label || entry.baseLabel || listLabel) : '—';
  const btnSw = document.getElementById('mat-select-btn-swatch');
  const btnLabel = document.getElementById('mat-select-btn-label');
  if (btnSw) { btnSw.style.background = hex; btnSw.title = hex; }
  if (btnLabel) btnLabel.textContent = listLabel;
  const hdr = document.getElementById('mat-name-header');
  if (hdr) { hdr.textContent = plainLabel; hdr.title = plainLabel; }
  document.querySelectorAll('#mat-select-list li').forEach((li) => {
    const on = li.dataset.value === String(idx);
    li.classList.toggle('selected', on);
    if (on && entry) {
      const sw = li.querySelector('.mat-opt-swatch');
      const lb = li.querySelector('.mat-opt-label');
      if (sw) sw.style.background = hex;
      if (lb) lb.textContent = listLabel;
    }
  });
  setStatusExtra((currentLang === 'en' ? 'Material: ' : 'Matériau : ') + plainLabel);
}

function paintMatSelectSwatch() {
  const entry = getSelectedMaterialEntry();
  if (!entry) {
    const btnSw = document.getElementById('mat-select-btn-swatch');
    const btnLabel = document.getElementById('mat-select-btn-label');
    if (btnSw) btnSw.style.background = '#666';
    if (btnLabel) btnLabel.textContent = '—';
    return;
  }
  const idx = materialEntries.indexOf(entry);
  if (idx >= 0) {
    // Réutilise la même logique d'affichage
    const hex = entry.material?.color ? ('#' + entry.material.color.getHexString()) : '#666';
    const listLabel = entry.listLabel || entry.label || entry.baseLabel || '—';
    const btnSw = document.getElementById('mat-select-btn-swatch');
    const btnLabel = document.getElementById('mat-select-btn-label');
    if (btnSw) { btnSw.style.background = hex; btnSw.title = hex; }
    if (btnLabel) btnLabel.textContent = listLabel;
    const hdr = document.getElementById('mat-name-header');
    if (hdr) { hdr.textContent = entry.label || entry.baseLabel || listLabel; }
  }
}

function closeMatSelectList() {
  const list = document.getElementById('mat-select-list');
  const btn = document.getElementById('mat-select-btn');
  if (list) list.classList.add('hidden');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
function openMatSelectList() {
  const list = document.getElementById('mat-select-list');
  const btn = document.getElementById('mat-select-btn');
  if (list) list.classList.remove('hidden');
  if (btn) btn.setAttribute('aria-expanded', 'true');
}
document.getElementById('mat-select-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const list = document.getElementById('mat-select-list');
  if (list?.classList.contains('hidden')) openMatSelectList();
  else closeMatSelectList();
});
document.addEventListener('click', (e) => {
  if (!e.target.closest?.('.mat-select-wrap')) closeMatSelectList();
});

function getSelectedMaterialEntry() {
  const sel = document.getElementById('mat-select');
  if (!sel || sel.value === '') return null;
  return materialEntries[parseInt(sel.value, 10)] || null;
}

function loadMaterialToUI(index) {
  const entry = materialEntries[index];
  if (!entry) return;
  const hdr = document.getElementById('mat-name-header');
  if (hdr) {
    hdr.textContent = entry.label;
    hdr.title = entry.label;
  }
  setStatusExtra((currentLang === 'en' ? 'Material: ' : 'Matériau : ') + entry.label);

  const m = entry.material;
  const colorEl = document.getElementById('mat-color');
  if (colorEl && m.color) {
    const hx = '#' + m.color.getHexString();
    setColorInput(colorEl, hx);
    const hexEl = document.getElementById('mat-color-hex');
    if (hexEl) hexEl.value = hx;
  }
  const setRange = (id, valId, v) => {
    const el = document.getElementById(id);
    const val = document.getElementById(valId);
    if (el && v !== undefined && v !== null) {
      el.value = v;
      if (val) val.textContent = Number(v).toFixed(2);
    }
  };
  setRange('mat-metal', 'val-metal', m.metalness ?? 0.2);
  setRange('mat-rough', 'val-rough', m.roughness ?? 0.55);
  setRange('mat-opacity', 'val-opacity', m.opacity ?? 1);
  setRange('mat-trans', 'val-trans', m.transmission ?? 0);
  setRange('mat-emissive-int', 'val-emissive-int', m.emissiveIntensity ?? 0);
  const ta = m.userData.texAlpha != null ? m.userData.texAlpha : 1;
  setRange('mat-tex-alpha', 'val-tex-alpha', ta);
  const tr = document.getElementById('mat-transparent');
  if (tr) tr.checked = !!m.transparent;
  const em = document.getElementById('mat-emissive');
  if (em && m.emissive) setColorInput(em, '#' + m.emissive.getHexString());
  const rx = m.map?.repeat?.x ?? 1;
  const ry = m.map?.repeat?.y ?? 1;
  const setTex = (id, valId, v) => {
    const el = document.getElementById(id);
    const val = document.getElementById(valId);
    if (el) el.value = v;
    if (val) val.textContent = Number(v).toFixed(2);
  };
  setTex('mat-tex-sx', 'val-tex-sx', rx);
  setTex('mat-tex-sy', 'val-tex-sy', 1);
  setTex('mat-tex-sz', 'val-tex-sz', ry);
  updateTexInfo();
}

function ensurePhysical(m) {
  if (m.isMeshPhysicalMaterial) return m;
  if (m.isMeshStandardMaterial) {
    const phys = new THREE.MeshPhysicalMaterial();
    phys.copy(m);
    phys.transmission = m.transmission || 0;
    phys.thickness = 0.5;
    phys.name = m.name;
    return phys;
  }
  return m;
}

function applyToMaterial(m, allValues) {
  const {
    color, metal, rough, opacity, transparent, transmission,
    emissive, emissiveInt, texSx, texSy, texSz, texAlpha,
  } = allValues;
  let mat = m;
  if (transmission > 0.001 && !mat.isMeshPhysicalMaterial) {
    mat = ensurePhysical(mat);
  }
  // Toujours muter le matériau courant (évite les références orphelines au 2e apply)
  if (color && mat.color) mat.color.set(color);
  if (mat.metalness !== undefined && metal != null) mat.metalness = metal;
  if (mat.roughness !== undefined && rough != null) mat.roughness = rough;
  if (opacity != null) mat.opacity = opacity;
  if (texAlpha != null) {
    mat.userData.texAlpha = texAlpha;
    if (mat.map) {
      mat.opacity = (opacity != null ? opacity : 1) * texAlpha;
      if (texAlpha < 0.999) mat.transparent = true;
    }
  }
  mat.transparent = !!(transparent || mat.transparent || (opacity != null && opacity < 0.99) || (transmission != null && transmission > 0.001) || (texAlpha != null && texAlpha < 0.999));
  if (mat.transmission !== undefined && transmission != null) mat.transmission = transmission;
  if (emissive && mat.emissive) mat.emissive.set(emissive);
  if (mat.emissiveIntensity !== undefined && emissiveInt != null) mat.emissiveIntensity = emissiveInt;
  if (pendingTexture) {
    mat.map = pendingTexture;
    mat.map.colorSpace = THREE.SRGBColorSpace;
    mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
    mat.map.needsUpdate = true;
  }
  if (mat.map && texSx != null) {
    mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
    const zx = (texSx || 1) * (texSy || 1);
    const zy = (texSz || 1) * (texSy || 1);
    mat.map.repeat.set(zx, zy);
    mat.map.needsUpdate = true;
  }
  mat.needsUpdate = true;
  return mat;
}

function readMatUI() {
  return {
    color: document.getElementById('mat-color').value,
    metal: parseFloat(document.getElementById('mat-metal').value),
    rough: parseFloat(document.getElementById('mat-rough').value),
    opacity: parseFloat(document.getElementById('mat-opacity').value),
    transparent: document.getElementById('mat-transparent').checked,
    transmission: parseFloat(document.getElementById('mat-trans').value),
    emissive: document.getElementById('mat-emissive').value,
    emissiveInt: parseFloat(document.getElementById('mat-emissive-int').value),
    texSx: parseFloat(document.getElementById('mat-tex-sx')?.value || '1'),
    texSy: parseFloat(document.getElementById('mat-tex-sy')?.value || '1'),
    texSz: parseFloat(document.getElementById('mat-tex-sz')?.value || '1'),
    texAlpha: parseFloat(document.getElementById('mat-tex-alpha')?.value || '1'),
  };
}

function applyMaterialsFromUI(applyAll = false) {
  if (!currentModel) {
    setStatus('Aucun modèle chargé.', true);
    return;
  }
  beginBusy(currentLang === 'en' ? 'Updating materials…' : 'Mise à jour des matériaux…');
  try {
  const matSnap = snapshotAllMaterials();
  const values = readMatUI();
  const selectedLabel = (() => {
    const sel = document.getElementById('mat-select');
    return sel?.selectedOptions?.[0]?.textContent || null;
  })();

  if (applyAll) {
    collectMaterials();
    if (!materialEntries.length) {
      setStatus('Aucun matériau.', true);
      return;
    }
    materialEntries.forEach((entry) => {
      const list = entry.materials && entry.materials.length ? entry.materials : [entry.material];
      list.forEach((oldMat, i) => {
        const newMat = applyToMaterial(oldMat, values);
        entry.meshes.forEach((mesh) => {
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map((m) => (m === oldMat ? newMat : m));
          } else if (mesh.material === oldMat) {
            mesh.material = newMat;
          }
        });
        list[i] = newMat;
      });
      entry.materials = list;
      entry.material = list[0];
    });
    const afterSnap = snapshotAllMaterials();
    pushUndo({
      label: 'Matériaux (tous)',
      undo: () => restoreMaterialsSnap(matSnap),
      redo: () => restoreMaterialsSnap(afterSnap),
    });
    setStatus('Matériaux appliqués sur ' + materialEntries.length + ' entrée(s).');
  } else {
    // Re-collect pour synchroniser les références meshes ↔ matériaux
    collectMaterials();
    let entry = null;
    if (selectedLabel) entry = materialEntries.find((e) => e.label === selectedLabel) || null;
    if (!entry) entry = getSelectedMaterialEntry();
    if (!entry) {
      setStatus('Sélectionne un matériau.', true);
      return;
    }
    const list = entry.materials && entry.materials.length ? entry.materials.slice() : [entry.material];
    list.forEach((oldMat, i) => {
      const newMat = applyToMaterial(oldMat, values);
      entry.meshes.forEach((mesh) => {
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) => (m === oldMat ? newMat : m));
        } else if (mesh.material === oldMat) {
          mesh.material = newMat;
        }
      });
      list[i] = newMat;
    });
    entry.materials = list;
    entry.material = list[0];
    const afterSnap = snapshotAllMaterials();
    pushUndo({
      label: 'Matériau « ' + entry.label + ' »',
      undo: () => restoreMaterialsSnap(matSnap),
      redo: () => restoreMaterialsSnap(afterSnap),
    });
    setStatus('Matériau « ' + entry.label + ' » mis à jour (' + list.length + ' instance(s)).');
  }
  pendingTexture = null;
  refreshMaterialSelect(true);
  scheduleSavePrefs();
  } finally {
    endBusy();
  }
}


// ===== Clic objet 3D → nom du matériau =====
const pickRaycaster = new THREE.Raycaster();
const pickPointer = new THREE.Vector2();
let matBubbleTimer = null;

function showMatPickBubble(text, clientX, clientY) {
  const el = document.getElementById('mat-pick-bubble');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
  const pad = 12;
  const rect = el.getBoundingClientRect();
  let x = clientX + 14;
  let y = clientY + 14;
  if (x + rect.width > window.innerWidth - pad) x = clientX - rect.width - 10;
  if (y + rect.height > window.innerHeight - pad) y = clientY - rect.height - 10;
  el.style.left = Math.max(pad, x) + 'px';
  el.style.top = Math.max(pad, y) + 'px';
  clearTimeout(matBubbleTimer);
  matBubbleTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

function onCanvasPointerClick(e) {
  if (e.target !== canvas) return;
  const rect = canvas.getBoundingClientRect();
  pickPointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pickPointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  pickRaycaster.setFromCamera(pickPointer, camera);
  // Sol : ne plus ouvrir au simple clic (double-clic uniquement)
  if (!currentModel) return;
  const hits = pickRaycaster.intersectObject(currentModel, true);
  if (!hits.length) return;
  const hit = hits[0];
  const mesh = hit.object;
  if (!mesh.isMesh || !mesh.material) return;

  let mat = mesh.material;
  if (Array.isArray(mat)) {
    // face index → groupe matériau si possible
    const fi = hit.faceIndex;
    mat = mat[0];
    if (mesh.geometry?.groups?.length && fi != null) {
      for (const g of mesh.geometry.groups) {
        if (fi * 3 >= g.start && fi * 3 < g.start + g.count) {
          mat = mesh.material[g.materialIndex] || mat;
          break;
        }
      }
    }
  }

  collectMaterials();
  let entry = materialEntries.find((e) => e.material === mat);
  if (!entry) {
    // fallback : premier entry qui référence ce mesh
    entry = materialEntries.find((e) => e.meshes.includes(mesh));
  }
  const name = entry ? entry.label : (mat.name || mesh.name || 'Matériau');
  showMatPickBubble(name, e.clientX, e.clientY);
  setStatus('Matériau : ' + name);

  if (entry) {
    const idx = materialEntries.indexOf(entry);
    if (idx >= 0) selectMaterialIndex(idx);
  }
}

let pointerDownPos = null;
canvas.addEventListener('pointerdown', (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', (e) => {
  if (!pointerDownPos) return;
  const dx = e.clientX - pointerDownPos.x;
  const dy = e.clientY - pointerDownPos.y;
  pointerDownPos = null;
  if (Math.hypot(dx, dy) > 6) return; // drag → pas un clic
  onCanvasPointerClick(e);
});
canvas.addEventListener('dblclick', (e) => {
  if (e.target !== canvas) return;
  const rect = canvas.getBoundingClientRect();
  pickPointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pickPointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  pickRaycaster.setFromCamera(pickPointer, camera);

  // 1) Double-clic sur la lumière (marqueur sphère), pas le cône
  let hitLight = null;
  let hitLightDist = Infinity;
  lights.forEach((entry) => {
    const marker = entry?.helper?._marker;
    if (!marker || marker.visible === false) return;
    const hs = pickRaycaster.intersectObject(marker, true);
    if (hs.length && hs[0].distance < hitLightDist) {
      hitLight = entry;
      hitLightDist = hs[0].distance;
    }
  });
  if (hitLight) {
    focusLight(hitLight);
    return;
  }

  // 2) Double-clic sur un cône : ignorer
  if (lightHelpersVisible) {
    let hitHelper = false;
    lights.forEach((entry) => {
      if (!entry || entry.type === 'AmbientLight' || !entry.helper) return;
      if (!entry.helper.visible) return;
      const hs = pickRaycaster.intersectObject(entry.helper, true);
      if (hs.length) hitHelper = true;
    });
    if (hitHelper) return;
  }

  // 3) Double-clic sol
  const groundHits = [];
  if (grid.visible) groundHits.push(...pickRaycaster.intersectObject(grid, true));
  if (groundPlane.visible) groundHits.push(...pickRaycaster.intersectObject(groundPlane, true));
  const modelHits = currentModel ? pickRaycaster.intersectObject(currentModel, true) : [];
  if (groundHits.length && (!modelHits.length || groundHits[0].distance <= modelHits[0].distance)) {
    showSection('sec-ground', currentLang === 'en' ? 'Ground' : 'Sol');
    return;
  }

  // 4) Double-clic mesh → cadrer
  if (!modelHits.length) return;
  const mesh = modelHits[0].object;
  if (!mesh) return;
  fitCameraToObject(mesh);
  setStatus((currentLang === 'en' ? 'Framed: ' : 'Élément cadré : ') + (mesh.name || 'mesh'));
});

function focusLight(entry) {
  if (!entry) return;
  showSection('sec-lights', 'Lumières');
  lights.forEach((l) => l.card?.classList.remove('light-focused'));
  if (entry.card) {
    entry.card.classList.add('light-focused');
    entry.card.classList.remove('collapsed');
    const col = entry.card.querySelector('.btn-collapse');
    if (col) col.textContent = '−';
    try { entry.card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {}
  }
  setStatus((currentLang === 'en' ? 'Light: ' : 'Lumière : ') + (entry.name || entry.type));
}



document.getElementById('mat-select')?.addEventListener('change', (e) => {
  paintMatSelectSwatch();
  const i = parseInt(e.target.value, 10);
  if (!isNaN(i)) { loadMaterialToUI(i); paintMatSelectSwatch(); }
});

['mat-metal', 'mat-rough', 'mat-opacity', 'mat-trans', 'mat-emissive-int', 'mat-tex-sx', 'mat-tex-sy', 'mat-tex-sz', 'mat-tex-alpha'].forEach((id) => {
  const map = {
    'mat-metal': 'val-metal',
    'mat-rough': 'val-rough',
    'mat-opacity': 'val-opacity',
    'mat-trans': 'val-trans',
    'mat-emissive-int': 'val-emissive-int',
    'mat-tex-sx': 'val-tex-sx',
    'mat-tex-sy': 'val-tex-sy',
    'mat-tex-sz': 'val-tex-sz',
    'mat-tex-alpha': 'val-tex-alpha',
  };
  document.getElementById(id)?.addEventListener('input', (e) => {
    const val = document.getElementById(map[id]);
    if (val) val.textContent = parseFloat(e.target.value).toFixed(2);
  });
});

// Aperçu live de l'échelle de texture sur le matériau sélectionné
function applyTexScaleLive() {
  const entry = getSelectedMaterialEntry();
  if (!entry) return;
  const list = entry.materials && entry.materials.length ? entry.materials : [entry.material];
  const sx = parseFloat(document.getElementById('mat-tex-sx')?.value || '1');
  const sy = parseFloat(document.getElementById('mat-tex-sy')?.value || '1');
  const sz = parseFloat(document.getElementById('mat-tex-sz')?.value || '1');
  list.forEach((mat) => {
    if (!mat?.map) return;
    mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
    mat.map.repeat.set(sx * sy, sz * sy);
    mat.map.needsUpdate = true;
    mat.needsUpdate = true;
  });
}
['mat-tex-sx', 'mat-tex-sy', 'mat-tex-sz'].forEach((id) => {
  document.getElementById(id)?.addEventListener('input', applyTexScaleLive);
});

function applyTexAlphaLive() {
  const entry = getSelectedMaterialEntry();
  if (!entry) return;
  const ta = parseFloat(document.getElementById('mat-tex-alpha')?.value || '1');
  const baseOp = parseFloat(document.getElementById('mat-opacity')?.value || '1');
  const list = entry.materials && entry.materials.length ? entry.materials : [entry.material];
  list.forEach((mat) => {
    if (!mat) return;
    mat.userData.texAlpha = ta;
    if (mat.map) {
      mat.opacity = baseOp * ta;
      if (ta < 0.999) mat.transparent = true;
      mat.needsUpdate = true;
    }
  });
}
document.getElementById('mat-tex-alpha')?.addEventListener('input', applyTexAlphaLive);

function guessTextureName(tex) {
  if (!tex) return '';
  if (tex.userData?.fileName) return tex.userData.fileName;
  if (tex.name && tex.name !== 'Texture' && tex.name !== '') return tex.name;
  const img = tex.image || tex.source?.data;
  if (img && typeof img.src === 'string' && img.src) {
    const src = img.src;
    if (src.startsWith('blob:')) return currentLang === 'en' ? 'embedded (blob)' : 'embarquée (blob)';
    try {
      const last = decodeURIComponent(src.split('/').pop().split('?')[0] || '');
      if (last && last.length < 80) return last;
    } catch (_) {}
  }
  const w = img?.width || img?.naturalWidth || 0;
  const h = img?.height || img?.naturalHeight || 0;
  if (w && h) return (currentLang === 'en' ? 'embedded' : 'embarquée') + ` (${w}×${h})`;
  return currentLang === 'en' ? 'embedded' : 'embarquée';
}

function updateTexInfo() {
  const el = document.getElementById('mat-tex-info');
  if (!el) return;
  const dict = (typeof UI_I18N === 'object' && UI_I18N) ? (UI_I18N[currentLang] || UI_I18N.fr) : null;
  const entry = getSelectedMaterialEntry();
  const tex = pendingTexture || entry?.material?.map || null;
  if (!tex) {
    el.textContent = dict?.tex_none || (currentLang === 'en' ? 'No texture' : 'Aucune texture');
    return;
  }
  el.textContent = (dict?.tex_loaded || (currentLang === 'en' ? 'Texture: ' : 'Texture : ')) + guessTextureName(tex);
}

document.getElementById('mat-texture')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  textureLoader.load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.name = file.name;
    tex.userData.fileName = file.name;
    pendingTexture = tex;
    setStatus((currentLang === 'en' ? 'Texture ready: ' : 'Texture prête : ') + file.name);
    updateTexInfo();
    URL.revokeObjectURL(url);
  });
});

document.getElementById('btn-clear-tex')?.addEventListener('click', () => {
  pendingTexture = null;
  const texInput = document.getElementById('mat-texture');
  if (texInput) texInput.value = '';
  const entry = getSelectedMaterialEntry();
  if (entry && entry.material.map) {
    entry.material.map = null;
    entry.material.needsUpdate = true;
  }
  updateTexInfo();
  setStatus(currentLang === 'en' ? 'Texture removed.' : 'Texture retirée.');
});

document.getElementById('btn-reset-tex-scale')?.addEventListener('click', () => {
  ['mat-tex-sx', 'mat-tex-sy', 'mat-tex-sz'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '1';
    const val = document.getElementById(id.replace('mat-tex-s', 'val-tex-s'));
    if (val) val.textContent = '1.00';
  });
  applyTexScaleLive();
  setStatus(currentLang === 'en' ? 'Texture scale reset.' : 'Échelle texture réinitialisée.');
});

document.getElementById('btn-reload-tex')?.addEventListener('click', () => {
  const entry = getSelectedMaterialEntry();
  if (!entry) return;
  pendingTexture = null;
  const list = entry.materials || [entry.material];
  list.forEach((mat) => {
    if (mat.userData._origMap !== undefined) {
      mat.map = mat.userData._origMap;
      if (mat.map && mat.userData._origRepeat) mat.map.repeat.copy(mat.userData._origRepeat);
      mat.needsUpdate = true;
    }
  });
  loadMaterialToUI(materialEntries.indexOf(entry));
  updateTexInfo();
  setStatus(currentLang === 'en' ? 'Original texture restored.' : 'Texture d’origine rechargée.');
});

function textureImageToUrl(tex) {
  if (!tex) return null;
  const img = tex.image || tex.source?.data;
  if (!img) return null;
  if (typeof img.src === 'string' && img.src && !img.src.startsWith('blob:') && !img.src.startsWith('data:')) {
    return img.src;
  }
  try {
    const w = img.width || img.naturalWidth || img.videoWidth || 0;
    const h = img.height || img.naturalHeight || img.videoHeight || 0;
    if (w && h && typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      const drawable = (
        (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) ||
        (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) ||
        (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) ||
        (typeof HTMLVideoElement !== 'undefined' && img instanceof HTMLVideoElement) ||
        (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas)
      );
      if (drawable) {
        ctx.drawImage(img, 0, 0, w, h);
        try { return c.toDataURL('image/png'); } catch (_) { return null; }
      }
      if (img.data) {
        const id = ctx.createImageData(w, h);
        const src = img.data;
        if (src.length >= w * h * 4) {
          id.data.set(src.subarray ? src.subarray(0, w * h * 4) : src);
        } else if (src.length >= w * h * 3) {
          for (let i = 0, j = 0; i < w * h * 3; i += 3, j += 4) {
            id.data[j] = src[i];
            id.data[j + 1] = src[i + 1];
            id.data[j + 2] = src[i + 2];
            id.data[j + 3] = 255;
          }
        } else {
          return null;
        }
        ctx.putImageData(id, 0, 0);
        return c.toDataURL('image/png');
      }
    }
  } catch (err) {
    console.warn('textureImageToUrl', err);
  }
  return null;
}

function drawTextureToCanvas(tex, canvas) {
  if (!tex || !canvas) return false;
  const img = tex.image || tex.source?.data;
  if (!img) return false;
  const w = img.width || img.naturalWidth || 256;
  const h = img.height || img.naturalHeight || 256;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  try {
    ctx.drawImage(img, 0, 0, w, h);
    return true;
  } catch (_) {
    if (img.data) {
      try {
        const id = ctx.createImageData(w, h);
        const src = img.data;
        if (src.length >= w * h * 4) id.data.set(src.subarray ? src.subarray(0, w * h * 4) : src);
        else if (src.length >= w * h * 3) {
          for (let i = 0, j = 0; i < w * h * 3; i += 3, j += 4) {
            id.data[j] = src[i]; id.data[j + 1] = src[i + 1]; id.data[j + 2] = src[i + 2]; id.data[j + 3] = 255;
          }
        } else return false;
        ctx.putImageData(id, 0, 0);
        return true;
      } catch (e2) { return false; }
    }
  }
  return false;
}

function getPreviewTexture() {
  if (pendingTexture) return pendingTexture;
  const entry = getSelectedMaterialEntry();
  if (!entry) return null;
  const mats = entry.materials && entry.materials.length ? entry.materials : [entry.material];
  for (const m of mats) {
    if (!m) continue;
    if (m.map) return m.map;
    if (m.userData && m.userData._origMap) return m.userData._origMap;
    if (m.emissiveMap) return m.emissiveMap;
    if (m.normalMap) return m.normalMap;
    if (m.roughnessMap) return m.roughnessMap;
    if (m.metalnessMap) return m.metalnessMap;
    if (m.aoMap) return m.aoMap;
  }
  return null;
}

function openTexturePreview() {
  const win = document.getElementById('tex-preview-window');
  const img = document.getElementById('tex-preview-img');
  const canvas = document.getElementById('tex-preview-canvas');
  const empty = document.getElementById('tex-preview-empty');
  const tex = getPreviewTexture();
  let shown = false;
  if (tex && canvas && drawTextureToCanvas(tex, canvas)) {
    canvas.classList.remove('hidden');
    if (img) img.classList.add('hidden');
    if (empty) empty.classList.add('hidden');
    shown = true;
  } else {
    const url = textureImageToUrl(tex);
    if (url && img) {
      img.onload = () => { img.classList.remove('hidden'); if (empty) empty.classList.add('hidden'); };
      img.src = url;
      img.classList.remove('hidden');
      if (canvas) canvas.classList.add('hidden');
      if (empty) empty.classList.add('hidden');
      shown = true;
    }
  }
  if (!shown) {
    if (img) img.classList.add('hidden');
    if (canvas) canvas.classList.add('hidden');
    if (empty) empty.classList.remove('hidden');
  }
  win?.classList.remove('hidden');
  document.getElementById('tex-preview-inner')?.classList.remove('minimized');
}
document.getElementById('btn-preview-tex')?.addEventListener('click', openTexturePreview);
document.getElementById('tex-preview-close')?.addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('tex-preview-window')?.classList.add('hidden');
});


// ===== Couleur hex + couleurs personnalisées =====
const CUSTOM_COLORS_KEY = '3dviewer_custom_colors_v1';

function normalizeHex(v) {
  if (!v) return null;
  let s = String(v).trim();
  if (s[0] !== '#') s = '#' + s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return null;
  return s.toLowerCase();
}

function loadCustomColors() {
  try {
    const raw = localStorage.getItem(CUSTOM_COLORS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((c) => normalizeHex(c)) : [];
  } catch (_) {
    return [];
  }
}

function saveCustomColors(list) {
  try {
    localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(list.slice(0, 24)));
  } catch (_) {}
}

function renderCustomColors() {
  const box = document.getElementById('custom-colors');
  if (!box) return;
  box.innerHTML = '';
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const tip = isTouch
    ? (currentLang === 'en' ? ' — long press: delete' : ' — appui long : supprimer')
    : (currentLang === 'en' ? ' — click: use · right-click: delete' : ' — clic : utiliser · clic droit : supprimer');
  loadCustomColors().forEach((hex) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.title = hex + tip;
    b.style.background = hex;
    let longTimer = null;
    let longFired = false;
    const clearLong = () => { if (longTimer) { clearTimeout(longTimer); longTimer = null; } };
    const removeColor = () => {
      longFired = true;
      const next = loadCustomColors().filter((x) => x !== hex);
      saveCustomColors(next);
      renderCustomColors();
      setStatus((currentLang === 'en' ? 'Color removed: ' : 'Couleur retirée : ') + hex);
    };
    b.addEventListener('pointerdown', (e) => {
      longFired = false;
      clearLong();
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        longTimer = setTimeout(removeColor, 550);
      }
    });
    b.addEventListener('pointerup', clearLong);
    b.addEventListener('pointerleave', clearLong);
    b.addEventListener('pointercancel', clearLong);
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeColor();
    });
    b.addEventListener('click', (e) => {
      if (longFired) { e.preventDefault(); e.stopPropagation(); return; }
      const c = document.getElementById('mat-color');
      const h = document.getElementById('mat-color-hex');
      if (c) c.value = hex;
      if (h) h.value = hex;
    });
    box.appendChild(b);
  });
}

function syncColorInputs(from) {
  const c = document.getElementById('mat-color');
  const h = document.getElementById('mat-color-hex');
  if (!c || !h) return;
  if (from === 'picker') {
    h.value = c.value;
  } else {
    const n = normalizeHex(h.value);
    if (n) {
      c.value = n;
      h.value = n;
    }
  }
}

function syncMatColorPickerFromSelection() {
  const entry = getSelectedMaterialEntry();
  if (!entry?.material?.color) return;
  const hx = '#' + entry.material.color.getHexString();
  setColorInput(document.getElementById('mat-color'), hx);
  const hexEl = document.getElementById('mat-color-hex');
  if (hexEl) hexEl.value = hx;
  if (entry.material.emissive) {
    setColorInput(document.getElementById('mat-emissive'), '#' + entry.material.emissive.getHexString());
  }
}
document.getElementById('mat-color')?.addEventListener('focus', syncMatColorPickerFromSelection);
document.getElementById('mat-color')?.addEventListener('click', syncMatColorPickerFromSelection);
document.getElementById('mat-emissive')?.addEventListener('focus', syncMatColorPickerFromSelection);
document.getElementById('mat-emissive')?.addEventListener('click', syncMatColorPickerFromSelection);
document.getElementById('mat-color')?.addEventListener('input', () => syncColorInputs('picker'));
document.getElementById('mat-color-hex')?.addEventListener('change', () => syncColorInputs('hex'));
document.getElementById('mat-color-hex')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    syncColorInputs('hex');
  }
});
document.getElementById('btn-save-color')?.addEventListener('click', () => {
  const hex = normalizeHex(document.getElementById('mat-color')?.value);
  if (!hex) {
    setStatus('Couleur invalide.', true);
    return;
  }
  const list = loadCustomColors().filter((c) => c !== hex);
  list.unshift(hex);
  saveCustomColors(list);
  renderCustomColors();
  setStatus('Couleur enregistrée : ' + hex);
});
try { renderCustomColors(); } catch (_) {}


document.getElementById('btn-apply-mat')?.addEventListener('click', () => applyMaterialsFromUI(false));
document.getElementById('btn-apply-mat-all')?.addEventListener('click', () => applyMaterialsFromUI(true));
document.getElementById('btn-reset-mats')?.addEventListener('click', () => resetMaterialsToOriginal());
document.getElementById('menu-reset-mats')?.addEventListener('click', () => {
  showSection('sec-mats', 'Matériaux');
  resetMaterialsToOriginal();
});

// ========== À propos ==========
const aboutModal = document.getElementById('about-modal');
const aboutVer = document.getElementById('about-version');
const aboutUpd = document.getElementById('about-updated');
if (aboutVer) aboutVer.textContent = APP_VERSION;

function setAboutUpdatedLabel() {
  const el = document.getElementById('about-updated');
  if (!el) return;
  el.textContent = currentLang === 'en' ? 'August 26, 2026' : '26 août 2026';
}
setAboutUpdatedLabel();

function setAboutRing(on) {
  const ring = document.querySelector('.about-logo-ring');
  if (!ring) return;
  ring.classList.toggle('is-on', !!on);
}
function openAboutWindow() {
  document.getElementById('about-modal')?.classList.remove('hidden');
  setAboutRing(true);
}

document.getElementById('about-close')?.addEventListener('click', () => {
  aboutModal?.classList.add('hidden');
  setAboutRing(false);
});
aboutModal?.addEventListener('click', (e) => {
  if (e.target === aboutModal) {
    aboutModal.classList.add('hidden');
    setAboutRing(false);
  }
});


// Modèle par défaut : modele.glb — aucune fenêtre ouverte au départ
function bootDefaultModel() {
  const msg = currentLang === 'en' ? 'Loading default model…' : 'Chargement du modèle par défaut…';
  showLoader(msg);
  const k = fileKeyFromMeta('modele.glb', 0);
  try { switchHistoryToFile(k); } catch (_) {}
  currentFileKey = k;
  currentFileName = 'modele.glb';
  currentFileSize = 0;
  fetch('modele.glb', { method: 'HEAD' }).then((r) => {
    const len = r.headers.get('content-length');
    if (len) currentFileSize = parseInt(len, 10) || 0;
    if (typeof refreshFileProps === 'function') refreshFileProps();
  }).catch(() => {});

  const url = new URL('modele.glb', window.location.href).href;
  gltfLoader.load(
    url,
    (gltf) => {
      try {
        if (currentModel) {
          scene.remove(currentModel);
          currentModel = null;
        }
        currentModel = prepareModel(gltf.scene);
        if (typeof captureOriginalMaterials === 'function') captureOriginalMaterials(currentModel);
        scene.add(currentModel);
        fitCameraToObject(currentModel);
        refreshMaterialSelect();
        if (typeof refreshFileProps === 'function') refreshFileProps();
        if (typeof restorePrefsAfterLoad === 'function') restorePrefsAfterLoad();
        setStatus(currentLang === 'en' ? 'Default model loaded.' : 'Modèle par défaut chargé.');
      } catch (err) {
        console.error('prepareModel failed', err);
        setStatus(currentLang === 'en' ? 'Error preparing default model' : 'Erreur préparation modèle par défaut', true);
      }
      hideLoader();
    },
    undefined,
    (err) => {
      console.error('gltf load failed', err);
      hideLoader();
      setStatus(currentLang === 'en'
        ? 'Could not load modele.glb'
        : 'Impossible de charger modele.glb — placez le fichier à côté de index.html', true);
    }
  );
}
// Load after a tick so all const/lets in module are initialized
queueMicrotask(() => bootDefaultModel());

function loadDefaultModel() {
  bootDefaultModel();
}
function loadDefaultModel_legacy_unused() {
  showLoader(currentLang === 'en' ? 'Loading default model…' : 'Chargement du modèle par défaut…');
  const k = fileKeyFromMeta('modele.glb', 0);
  switchHistoryToFile(k);
  currentFileKey = k;
  currentFileName = 'modele.glb';
  currentFileSize = 0;
  clearModel();
  gltfLoader.load(
    new URL('modele.glb', window.location.href).href,
    (gltf) => {
      try {
        currentModel = prepareModel(gltf.scene);
        scene.add(currentModel);
        fitCameraToObject(currentModel);
        refreshMaterialSelect();
        refreshFileProps();
        restorePrefsAfterLoad();
        setStatus('Modèle par défaut chargé.');
      } catch (err) {
        console.error(err);
        setStatus('Erreur préparation modèle par défaut', true);
      }
      hideLoader();
    },
    undefined,
    (err) => {
      console.error(err);
      hideLoader();
      setStatus('Impossible de charger modele.glb', true);
    }
  );
}
document.getElementById('menu-reload-default')?.addEventListener('click', loadDefaultModel);
function renderHelpBody() {
  const body = document.getElementById('help-body');
  if (!body) return;
  const en = currentLang === 'en';
  const t = en
    ? {
      shortcuts: 'Keyboard shortcuts',
      mouse: 'Mouse and touch',
      formats: 'Supported formats',
      k1: 'Ctrl/Cmd + Z — Undo',
      k2: 'Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z — Redo',
      m1: '<strong>Left drag</strong> — Orbit (rotate around the target)',
      m2: '<strong>Right drag</strong> — Pan the camera',
      m3: '<strong>Scroll / middle drag</strong> — Zoom',
      m4: '<strong>Right click</strong> (without moving) — Context menu',
      m5: '<strong>Left click</strong> on the model — Material name bubble and select it in the editor',
      m6: '<strong>Double-click</strong> an object — Frame that element',
      m7: '<strong>Double-click</strong> the ground — Ground editor',
      m8: '<strong>Double-click</strong> a light — Light properties',
      m9: '<strong>1 finger</strong> — Orbit',
      m10: '<strong>2 fingers</strong> — Zoom / pan',
      f1: '.glb / .gltf — glTF 2.0 (embedded textures)',
      f2: '.fbx — FBX',
      f3: '.zip — archive containing FBX/glTF and textures',
      readme: 'README.md on GitHub',
    }
    : {
      shortcuts: 'Raccourcis clavier',
      mouse: 'Souris et tactile',
      formats: 'Formats pris en charge',
      k1: 'Ctrl/Cmd + Z — Annuler',
      k2: 'Ctrl/Cmd + Y ou Ctrl/Cmd + Shift + Z — Refaire',
      m1: '<strong>Clic gauche glissé</strong> — Orbite (rotation autour de la cible)',
      m2: '<strong>Clic droit glissé</strong> — Déplacer la caméra',
      m3: '<strong>Molette / clic milieu glissé</strong> — Zoom',
      m4: '<strong>Clic droit</strong> (sans bouger) — Menu contextuel',
      m5: '<strong>Clic gauche</strong> sur le modèle — Bulle du matériau et sélection dans l’éditeur',
      m6: '<strong>Double-clic</strong> sur un objet — Cadrer l’élément',
      m7: '<strong>Double-clic</strong> sur le sol — Éditeur du sol',
      m8: '<strong>Double-clic</strong> sur une lumière — Propriétés de la lumière',
      m9: '<strong>1 doigt</strong> — Orbite',
      m10: '<strong>2 doigts</strong> — Zoom / déplacement',
      f1: '.glb / .gltf — glTF 2.0 (textures embarquées)',
      f2: '.fbx — FBX',
      f3: '.zip — archive contenant FBX/glTF et textures',
      readme: 'README.md sur GitHub',
    };
  body.innerHTML = `
    <p><strong>${t.shortcuts}</strong></p>
    <ul class="help-list">
      <li>${t.k1}</li>
      <li>${t.k2}</li>
    </ul>
    <p><strong>${t.mouse}</strong></p>
    <ul class="help-list">
      <li>${t.m1}</li>
      <li>${t.m2}</li>
      <li>${t.m3}</li>
      <li>${t.m4}</li>
      <li>${t.m5}</li>
      <li>${t.m6}</li>
      <li>${t.m7}</li>
      <li>${t.m8}</li>
      <li>${t.m9}</li>
      <li>${t.m10}</li>
    </ul>
    <p><strong>${t.formats}</strong></p>
    <ul class="help-list">
      <li>${t.f1}</li>
      <li>${t.f2}</li>
      <li>${t.f3}</li>
    </ul>
    <p><a class="about-link" href="https://github.com/dino213dz/3D-Viewer/blob/main/README.md" target="_blank" rel="noopener">${t.readme}</a></p>
  `;
}

document.getElementById('menu-help')?.addEventListener('click', () => {
  renderHelpBody();
  document.getElementById('help-modal')?.classList.remove('hidden');
});
document.getElementById('help-close')?.addEventListener('click', () => {
  document.getElementById('help-modal')?.classList.add('hidden');
});
const helpModal = document.getElementById('help-modal');
helpModal?.addEventListener('click', (e) => {
  if (e.target === helpModal) helpModal.classList.add('hidden');
});

(function makeLoadWindowDraggable() {
  const win = document.getElementById('load-window');
  if (!win) return;
  const bar = win.querySelector('.side-titlebar') || win.querySelector('.floating-window-inner > div');
  const inner = win.querySelector('.floating-window-inner');
  if (!inner) return;
  let dragging = false, ox = 0, oy = 0;
  const title = win.querySelector('.side-title-text')?.parentElement || inner.firstElementChild;
  if (!title) return;
  title.style.cursor = 'move';
  title.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    dragging = true;
    const r = inner.getBoundingClientRect();
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    inner.style.position = 'fixed';
    inner.style.margin = '0';
    try { title.setPointerCapture(e.pointerId); } catch (_) {}
  });
  title.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    inner.style.left = Math.max(0, e.clientX - ox) + 'px';
    inner.style.top = Math.max(0, e.clientY - oy) + 'px';
  });
  title.addEventListener('pointerup', (e) => {
    dragging = false;
    try { title.releasePointerCapture(e.pointerId); } catch (_) {}
  });
})();

const MENU_I18N = {
  fr: {
    'Fichier': 'Fichier', 'Éditer': 'Éditer', 'Vue': 'Vue',
    'Charger un fichier…': 'Charger un fichier…',
    'Effacer le modèle': 'Effacer le modèle',
    'Recharger le modèle par défaut': 'Recharger le modèle par défaut',
    'Propriétés du fichier': 'Propriétés du fichier',
    'Télécharger depuis Sketchfab': 'Télécharger depuis Sketchfab',
    'Paramètres': 'Paramètres',
    'Langues': 'Langues', 'Aide': 'Aide', 'À propos': 'À propos',
    'Annuler': 'Annuler', 'Refaire': 'Refaire',
    'Couleur du ciel': 'Couleur du ciel',
    'Réinitialiser couleur du ciel': 'Réinitialiser couleur du ciel',
    'Éditeur de matériaux': 'Éditeur de matériaux',
    'Réinitialiser matériaux d\'origine': 'Réinitialiser matériaux d\'origine',
    'Lumières': 'Lumières',
    'Cadrer l\'objet': 'Cadrer l\'objet',
    'Cadrer zone visible': 'Cadrer zone visible',
    'Wireframe': 'Wireframe',
    'Panneau flottant': 'Panneau flottant',
    'Sol': 'Sol', 'Quadrillage': 'Quadrillage', 'Surface plate': 'Surface plate', 'Aucun': 'Aucun',
    'Modifier le sol': 'Modifier le sol',
  },
  en: {
    'Fichier': 'File', 'Éditer': 'Edit', 'Vue': 'View',
    'Charger un fichier…': 'Open file…',
    'Effacer le modèle': 'Clear model',
    'Recharger le modèle par défaut': 'Reload default model',
    'Propriétés du fichier': 'File properties',
    'Télécharger depuis Sketchfab': 'Download from Sketchfab',
    'Paramètres': 'Settings',
    'Langues': 'Languages', 'Aide': 'Help', 'À propos': 'About',
    'Annuler': 'Undo', 'Refaire': 'Redo',
    'Couleur du ciel': 'Sky color',
    'Réinitialiser couleur du ciel': 'Reset sky color',
    'Éditeur de matériaux': 'Material editor',
    'Réinitialiser matériaux d\'origine': 'Reset original materials',
    'Lumières': 'Lights',
    'Cadrer l\'objet': 'Frame object',
    'Cadrer zone visible': 'Frame visible area',
    'Wireframe': 'Wireframe',
    'Panneau flottant': 'Floating panel',
    'Sol': 'Ground', 'Quadrillage': 'Grid', 'Surface plate': 'Flat surface', 'Aucun': 'None',
    'Modifier le sol': 'Edit ground',
  },
};
const UI_I18N = {
  fr: {
    ready: 'Prêt',
    panel: 'Panneau',
    materials: 'Matériaux',
    lights: 'Lumières',
    ground: 'Sol',
    file_props: 'Propriétés du fichier',
    load_file: 'Charger un fichier',
    about: 'À propos de 3D Viewer',
    help: 'Aide',
    selection: 'Sélection',
    colors: 'Couleurs',
    color: 'Couleur',
    properties: 'Propriétés',
    texture_scales: 'Texture & échelles',
    type: 'Type',
    apply_mat: 'Appliquer',
    apply_all: 'Appliquer à tout',
    reset_mats: 'Réinitialiser',
    no_model: 'Aucun modèle chargé.',
    no_model_opt: '— aucun modèle —',
    version: 'Version',
    created: 'Date de création',
    updated: 'Dernière mise à jour',
    author: 'Auteur',
    desc: '3D Viewer permet de visualiser vos fichiers 3D aux formats FBX, GLB et GLTF.',
    updated_date: '26 août 2026',
    created_date: '19 août 2026',
    update_available: 'MàJ disponible',
    metal: 'Métal',
    rough: 'Rugosité',
    opacity: 'Opacité',
    transparent: 'Transparent',
    transmission: 'Transmission',
    emissive: 'Émissif',
    emissive_int: 'Intensité émissive',
    texture: 'Texture',
    tex_alpha: 'Alpha texture',
    scale_x: 'Échelle X',
    scale_y: 'Échelle Y',
    scale_z: 'Échelle Z',
    reset_scale: 'Réinit. échelle',
    reload_tex: "Texture d'origine",
    preview_tex: 'Aperçu',
    settings: 'Paramètres',
    leave_title: 'Quitter la page ?',
    leave_msg: 'Vous allez quitter (ou rafraîchir) la page. Le modèle 3D va être oublié. Cependant les modifications seront sauvegardées. Voulez-vous continuer ?',
    apply_settings: 'Appliquer',
    save_settings: 'Enregistrer',
    reset_settings: 'Réinitialiser',
    yes: 'Oui',
    no: 'Non',
    tex_preview: 'Aperçu texture',
    no_tex: 'Aucune texture.',
    tex_loaded: 'Texture : ',
    tex_none: 'Aucune texture',
    ui_alpha: 'Transparence UI',
    swatch_tip_pc: ' — clic : utiliser · clic droit : supprimer',
    swatch_tip_touch: ' — appui long : supprimer',
  },
  en: {
    ready: 'Ready',
    panel: 'Panel',
    materials: 'Materials',
    lights: 'Lights',
    ground: 'Ground',
    file_props: 'File properties',
    load_file: 'Open file',
    about: 'About 3D Viewer',
    help: 'Help',
    update_available: 'Update available',
    selection: 'Selection',
    colors: 'Colors',
    color: 'Color',
    properties: 'Properties',
    texture_scales: 'Texture & scales',
    type: 'Type',
    apply_mat: 'Apply',
    apply_all: 'Apply to all',
    reset_mats: 'Reset',
    no_model: 'No model loaded.',
    no_model_opt: '— no model —',
    version: 'Version',
    created: 'Created',
    updated: 'Last updated',
    author: 'Author',
    desc: '3D Viewer lets you view your 3D files in FBX, GLB and GLTF formats.',
    updated_date: 'August 26, 2026',
    created_date: 'August 19, 2026',
    update_available: 'Update available!',
    metal: 'Metalness',
    rough: 'Roughness',
    opacity: 'Opacity',
    transparent: 'Transparent',
    transmission: 'Transmission',
    emissive: 'Emissive',
    emissive_int: 'Emissive intensity',
    texture: 'Texture',
    tex_alpha: 'Texture alpha',
    scale_x: 'Scale X',
    scale_y: 'Scale Y',
    scale_z: 'Scale Z',
    reset_scale: 'Reset scale',
    reload_tex: 'Original texture',
    preview_tex: 'Preview',
    settings: 'Settings',
    leave_title: 'Leave this page?',
    leave_msg: 'You are about to leave (or refresh) the page. The 3D model will be forgotten. Your edits will still be saved. Do you want to continue?',
    apply_settings: 'Apply',
    save_settings: 'Save',
    reset_settings: 'Reset',
    yes: 'Yes',
    no: 'No',
    tex_preview: 'Texture preview',
    no_tex: 'No texture.',
    tex_loaded: 'Texture: ',
    tex_none: 'No texture',
    ui_alpha: 'UI transparency',
    swatch_tip_pc: ' — click: use · right-click: delete',
    swatch_tip_touch: ' — long press: delete',
  },
};

function applyUITranslations() {
  const t = UI_I18N[currentLang] || UI_I18N.fr;
  const mapLabel = (selector, text) => {
    document.querySelectorAll(selector).forEach((el) => {
      if (!el.dataset.i18nKeep) el.textContent = text;
    });
  };
  // Panel section titles
  const secMap = {
    'sec-mats': t.materials,
    'sec-lights': t.lights,
    'sec-ground': t.ground,
    'sec-props': t.file_props,
  };
  Object.entries(secMap).forEach(([id, title]) => {
    const h = document.querySelector('#' + id + ' > h3');
    if (h) h.textContent = title;
  });
  // Mat groups
  document.querySelectorAll('.mat-group-colors .mat-group-label').forEach((el) => { el.textContent = t.colors; });
  document.querySelectorAll('.mat-group-props .mat-group-label').forEach((el) => { el.textContent = t.properties; });
  document.querySelectorAll('.mat-group-tex .mat-group-label').forEach((el) => { el.textContent = t.texture_scales; });
  document.querySelectorAll('[data-i18n-prop]').forEach((el) => {
    const k = el.dataset.i18nProp;
    if (t[k]) el.textContent = t[k];
  });
  const btnRs = document.getElementById('btn-reset-tex-scale');
  if (btnRs) btnRs.textContent = t.reset_scale;
  const btnRt = document.getElementById('btn-reload-tex');
  if (btnRt) btnRt.textContent = t.reload_tex;
  const btnPv = document.getElementById('btn-preview-tex');
  if (btnPv) btnPv.textContent = t.preview_tex;
  const stTitle = document.getElementById('settings-title');
  if (stTitle) stTitle.textContent = t.settings;
  const leaveT = document.getElementById('leave-title');
  if (leaveT) leaveT.textContent = t.leave_title;
  const leaveM = document.getElementById('leave-msg');
  if (leaveM) leaveM.textContent = t.leave_msg;
  const ly = document.getElementById('leave-yes');
  if (ly) ly.textContent = t.yes;
  const ln = document.getElementById('leave-no');
  if (ln) ln.textContent = t.no;
  const tpt = document.getElementById('tex-preview-title');
  if (tpt) tpt.textContent = t.tex_preview;
  const tpe = document.getElementById('tex-preview-empty');
  if (tpe) tpe.textContent = t.no_tex;
  try { updateTexInfo(); } catch (_) {}
  // Settings section titles
  const setMap = currentLang === 'en' ? {
    'set-sec-lang': 'Language', 'set-sec-colors': 'Colors', 'set-sec-ground': 'Default ground',
    'set-sec-view': 'Default display', 'set-sec-updates': 'Updates',
    'lbl-accent-dark': 'Accent (dark)', 'lbl-accent-light': 'Accent (light)',
    'lbl-sky-default': 'Default sky', 'lbl-set-gmode': 'Type', 'lbl-set-gcolor': 'Color',
    'lbl-set-gmetal': 'Metalness', 'lbl-set-grough': 'Roughness',
    'lbl-set-gizmo': 'Show gizmos', 'lbl-set-cones': 'Show light cones',
    'lbl-ui-alpha': 'UI transparency',
    'btn-settings-apply': 'Apply', 'btn-settings-save': 'Save', 'btn-settings-reset': 'Reset',
  } : {
    'set-sec-lang': 'Langue', 'set-sec-colors': 'Couleurs', 'set-sec-ground': 'Sol par défaut',
    'set-sec-view': 'Affichage par défaut', 'set-sec-updates': 'Mises à jour',
    'lbl-accent-dark': 'Accent (sombre)', 'lbl-accent-light': 'Accent (clair)',
    'lbl-sky-default': 'Ciel par défaut', 'lbl-set-gmode': 'Type', 'lbl-set-gcolor': 'Couleur',
    'lbl-set-gmetal': 'Métal', 'lbl-set-grough': 'Rugosité',
    'lbl-set-gizmo': 'Afficher les gizmo', 'lbl-set-cones': 'Afficher les cônes de lumière',
    'lbl-ui-alpha': 'Transparence UI',
    'btn-settings-apply': 'Appliquer', 'btn-settings-save': 'Enregistrer', 'btn-settings-reset': 'Réinitialiser',
  };
  Object.entries(setMap).forEach(([id, txt]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  });
  // Common labels by for/id proximity
  const labelPairs = [
    ['#mat-select', t.selection],
    ['#mat-color', t.color],
    ['#ground-type-select', t.type],
    ['#ground-color', t.color],
  ];
  labelPairs.forEach(([sel, text]) => {
    const el = document.querySelector(sel);
    const lab = el?.closest('.control-row')?.querySelector('label');
    if (lab) lab.textContent = text;
  });
  const btnApply = document.getElementById('btn-apply-mat');
  if (btnApply) btnApply.textContent = t.apply_mat;
  const btnAll = document.getElementById('btn-apply-mat-all');
  if (btnAll) btnAll.textContent = t.apply_all;
  const btnReset = document.getElementById('btn-reset-mats');
  if (btnReset) btnReset.textContent = t.reset_mats;
  const opt = document.querySelector('#mat-select option[value=""]');
  if (opt) opt.textContent = t.no_model_opt;
  // About
  const aboutH = document.getElementById('about-title') || document.querySelector('#about-modal h2');
  if (aboutH) aboutH.textContent = t.about;
  const helpH = document.getElementById('help-title') || document.querySelector('#help-modal h2');
  if (helpH) helpH.textContent = t.help;
  try { renderHelpBody(); } catch (_) {}
  const badge = document.getElementById('about-update-badge');
  if (badge && !badge.classList.contains('hidden')) badge.textContent = t.update_available || badge.textContent;

  document.querySelectorAll('.about-desc').forEach((el) => { el.textContent = t.desc; });
  const aboutUpd = document.getElementById('about-updated');
  if (aboutUpd) aboutUpd.textContent = t.updated_date;
  try { setAboutUpdatedLabel(); } catch (_) {}
  // Translate strong labels in about
  document.querySelectorAll('#about-modal .about-body p').forEach((p) => {
    const strong = p.querySelector('strong');
    if (!strong) return;
    const key = strong.textContent.replace(/\s*:?\s*$/, '').trim();
    const dict = {
      'Version': t.version, 'Date de création': t.created, 'Created': t.created,
      'Dernière mise à jour': t.updated, 'Last updated': t.updated,
      'Auteur': t.author, 'Author': t.author,
    };
    if (dict[key]) strong.textContent = dict[key];
  });
  // Load window title
  document.querySelectorAll('#load-window .side-title-text').forEach((el) => { el.textContent = t.load_file; });
  // Side title if default
  const st = document.getElementById('side-title');
  if (st && (st.textContent === 'Panneau' || st.textContent === 'Panel')) st.textContent = t.panel;
  // Status ready if still default
  if (statusEl && (statusEl.textContent === 'Prêt' || statusEl.textContent === 'Ready')) {
    setStatus(t.ready);
  }
  // Buttons clear tex
  const clr = document.getElementById('btn-clear-tex');
  if (clr) clr.textContent = currentLang === 'en' ? 'Remove' : 'Retirer';
  const rg = document.getElementById('btn-reset-ground');
  if (rg) rg.textContent = currentLang === 'en' ? 'Reset ground' : 'Réinitialiser le sol';
  // Ground options
  const gsel = document.getElementById('ground-type-select');
  if (gsel) {
    const map = currentLang === 'en'
      ? { grid: 'Grid', plane: 'Flat surface', none: 'None' }
      : { grid: 'Quadrillage', plane: 'Surface plate', none: 'Aucun' };
    [...gsel.options].forEach((o) => { if (map[o.value]) o.textContent = map[o.value]; });
  }
  // Context menu
  const ctx = {
    'frame-object': currentLang === 'en' ? 'Frame object' : "Centrer la vue sur l'objet",
    'frame-mouse': currentLang === 'en' ? 'Frame under pointer' : 'Centrer la vue sur le pointeur',
  };
  document.querySelectorAll('#ctx-menu button[data-act]').forEach((b) => {
    if (ctx[b.dataset.act] && !b.querySelector('[data-ctx]')) b.textContent = ctx[b.dataset.act];
  });
}

function setLanguage(lang) {
  currentLang = lang === 'en' ? 'en' : 'fr';
  document.documentElement.lang = currentLang;
  document.querySelectorAll('.lang-btn').forEach((b) => {
    const on = b.dataset.lang === currentLang;
    b.classList.toggle('active', on);
    b.setAttribute('aria-current', on ? 'true' : 'false');
  });
  const dict = MENU_I18N[currentLang] || MENU_I18N.fr;
  document.querySelectorAll('.menu-label, .menu-dropdown button, .menu-dropdown a, .menu-hint-label, .ground-btn').forEach((el) => {
    if (el.querySelector('.dyn-label')) return;
    if (el.id && el.id.startsWith('lang-')) return;
    if (el.classList.contains('ground-btn')) {
      const g = el.dataset.ground;
      const map = currentLang === 'en'
        ? { grid: 'Grid', plane: 'Flat surface', none: 'None' }
        : { grid: 'Quadrillage', plane: 'Surface plate', none: 'Aucun' };
      if (map[g]) el.textContent = map[g];
      return;
    }
    const nodes = [...el.childNodes];
    nodes.forEach((n) => {
      if (n.nodeType === 3) {
        const raw = n.textContent.trim();
        if (!raw) return;
        if (!el.dataset.i18nSrc) el.dataset.i18nSrc = raw;
        const src = el.dataset.i18nSrc;
        if (dict[src]) n.textContent = ' ' + dict[src];
        else if (currentLang === 'fr' && MENU_I18N.fr[src]) n.textContent = ' ' + src;
      }
    });
    if (el.classList.contains('menu-label') || el.classList.contains('menu-hint-label')) {
      const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ');
      if (!el.dataset.i18nSrc && txt) el.dataset.i18nSrc = txt;
      if (el.dataset.i18nSrc && dict[el.dataset.i18nSrc]) {
        [...el.childNodes].forEach((n) => {
          if (n.nodeType === 3 && n.textContent.trim()) n.textContent = ' ' + dict[el.dataset.i18nSrc];
        });
      }
    }
  });
  // Expand MENU_I18N missing keys for light adds etc.
  const extraEn = {
    '+ Ambient': '+ Ambient', '+ Directional': '+ Directional', '+ Point': '+ Point', '+ Spot': '+ Spot',
  };
  applyUITranslations();
  updateDynamicMenuLabels?.();
  // refresh version status label language
  const vs = document.getElementById('about-version-status');
  if (vs) {
    if (vs.classList.contains('is-update')) setVersionStatus('update');
    else if (vs.classList.contains('is-ok')) setVersionStatus('ok');
  }
  try { localStorage.setItem('3dviewer_lang', currentLang); } catch (_) {}
  applySettingsTips?.();
  setStatus(currentLang === 'en' ? 'Language: English' : 'Langue : Français');
}
document.getElementById('lang-fr')?.addEventListener('click', () => setLanguage('fr'));
document.getElementById('lang-en')?.addEventListener('click', () => setLanguage('en'));
// Apply language at startup (default English, or saved preference)
try {
  setLanguage(currentLang);
} catch (e) {
  console.error('setLanguage init', e);
}

document.getElementById('brand-about')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  collapseMenus();
  openAboutWindow();
});

document.getElementById('menu-edit-ground')?.addEventListener('click', () => {
  showSection('sec-ground', currentLang === 'en' ? 'Ground' : 'Sol');
});
document.getElementById('ground-type-select')?.addEventListener('change', (e) => setGroundMode(e.target.value));
document.getElementById('ground-color')?.addEventListener('input', (e) => {
  const c = e.target.value;
  if (groundPlane.material) {
    groundPlane.material.color.set(c);
    groundPlane.material.needsUpdate = true;
  }
  // tint grid roughly
  if (grid?.material) {
    if (Array.isArray(grid.material)) {
      grid.material.forEach((m) => { m.color?.set?.(c); m.needsUpdate = true; });
    } else {
      grid.material.color?.set?.(c);
    }
  }
});
document.getElementById('ground-metal')?.addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  document.getElementById('val-ground-metal').textContent = v.toFixed(2);
  if (groundPlane.material) groundPlane.material.metalness = v;
});
document.getElementById('ground-rough')?.addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  document.getElementById('val-ground-rough').textContent = v.toFixed(2);
  if (groundPlane.material) groundPlane.material.roughness = v;
});

// Click on ground opens editor
canvas.addEventListener('pointerup', (e) => {
  // handled after pick — ground hit
}, true);

(function setupContextMenu() {
  const ctx = document.getElementById('ctx-menu');
  if (!ctx) return;
  let lastCtx = { x: 0, y: 0 };
  let rightDown = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 2) rightDown = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (e.button === 2 && rightDown) {
      const moved = Math.hypot(e.clientX - rightDown.x, e.clientY - rightDown.y);
      rightDown.moved = moved > 6;
    }
  });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const moved = rightDown
      ? Math.hypot(e.clientX - rightDown.x, e.clientY - rightDown.y) > 6
      : false;
    rightDown = null;
    if (moved) return; // pan avec clic droit : pas de menu
    lastCtx = { x: e.clientX, y: e.clientY };
    updateDynamicMenuLabels();
    ctx.classList.remove('hidden');
    const w = ctx.offsetWidth, h = ctx.offsetHeight;
    ctx.style.left = Math.min(e.clientX, window.innerWidth - w - 8) + 'px';
    ctx.style.top = Math.min(e.clientY, window.innerHeight - h - 8) + 'px';
  });
  document.addEventListener('pointerdown', (e) => {
    if (!ctx.contains(e.target)) ctx.classList.add('hidden');
  });
  ctx.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    ctx.classList.add('hidden');
    if (act === 'frame-object') {
      if (currentModel) doFrame();
    } else if (act === 'frame-mouse') {
      const rect = canvas.getBoundingClientRect();
      pickPointer.x = ((lastCtx.x - rect.left) / rect.width) * 2 - 1;
      pickPointer.y = -((lastCtx.y - rect.top) / rect.height) * 2 + 1;
      pickRaycaster.setFromCamera(pickPointer, camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const target = new THREE.Vector3();
      pickRaycaster.ray.intersectPlane(plane, target);
      if (target) {
        controls.target.copy(target);
        controls.update();
        setStatus(currentLang === 'en' ? 'View centered on pointer' : 'Vue centrée sur le pointeur');
      }
    } else if (act === 'gizmo') {
      setGizmosVisible(!gizmosVisible);
    } else if (act === 'wireframe') {
      toggleWireframe();
      updateDynamicMenuLabels();
    } else if (act === 'helpers') {
      setLightHelpersVisible(!lightHelpersVisible);
    }
  });
})();
updateDynamicMenuLabels?.();

// ===== Vérification version GitHub (README main) =====
function parseVersion(str) {
  const m = String(str || '').match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [parseInt(m[1],10), parseInt(m[2],10), parseInt(m[3],10)];
}
function isNewer(remote, local) {
  if (!remote || !local) return false;
  for (let i = 0; i < 3; i++) {
    if (remote[i] > local[i]) return true;
    if (remote[i] < local[i]) return false;
  }
  return false;
}
function setVersionStatus(kind) {
  // kind: 'ok' | 'update' | 'unknown'
  const el = document.getElementById('about-version-status');
  if (!el) return;
  el.className = 'version-status';
  if (kind === 'update') {
    el.classList.add('is-update');
    el.innerHTML = currentLang === 'en'
      ? '(<a class="maj-link" href="https://github.com/dino213dz/3D-Viewer" target="_blank" rel="noopener">Update available</a>)'
      : '(<a class="maj-link" href="https://github.com/dino213dz/3D-Viewer" target="_blank" rel="noopener">MàJ disponible</a>)';
  } else if (kind === 'ok') {
    el.classList.add('is-ok');
    el.textContent = currentLang === 'en' ? '(Up to date)' : '(Version à jour)';
  } else {
    el.textContent = '';
  }
}
async function checkGitHubVersion() {
  const urls = [
    'https://raw.githubusercontent.com/dino213dz/3D-Viewer/main/README.md',
    'https://cdn.jsdelivr.net/gh/dino213dz/3D-Viewer@main/README.md',
  ];
  let text = '';
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: 'no-store' });
      if (r.ok) { text = await r.text(); break; }
    } catch (_) {}
  }
  if (!text) { setVersionStatus('unknown'); return; }
  const line = text.split('\n').find((l) => /^\*\*Version\s*:\*\*/i.test(l.trim()) || /^Version\s*:/i.test(l.trim()));
  if (!line) { setVersionStatus('unknown'); return; }
  const remote = parseVersion(line);
  const local = parseVersion(APP_VERSION);
  if (isNewer(remote, local)) setVersionStatus('update');
  else setVersionStatus('ok');
}
queueMicrotask(() => { checkGitHubVersion().catch(() => {}); });

document.getElementById('titlebar-apply-mat')?.addEventListener('click', (e) => {
  e.stopPropagation();
  applyMaterialsFromUI(false);
});

// Réduire/déplier groupes matériaux (comme les lumières)
document.getElementById('sec-mats')?.addEventListener('click', (e) => {
  const header = e.target.closest?.('.mat-group-header, .mat-group-toggle');
  if (!header || !document.getElementById('sec-mats').contains(header)) return;
  // clic sur contenu interne hors header ne collaps pas
  if (!e.target.closest('.mat-group-header') && !e.target.classList.contains('btn-collapse')) return;
  e.preventDefault();
  e.stopPropagation();
  const group = header.closest('.mat-group');
  if (!group) return;
  const collapsed = group.classList.toggle('collapsed');
  header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  const col = group.querySelector('.btn-collapse');
  if (col) col.textContent = collapsed ? '+' : '−';
});

// Afficher bouton Appliquer titre uniquement sur section matériaux
(function watchMatsApplyBtn() {
  const btn = document.getElementById('titlebar-apply-mat');
  const sec = document.getElementById('sec-mats');
  if (!btn || !sec) return;
  const sync = () => {
    const visible = !sec.classList.contains('hidden') && !document.getElementById('side-panel')?.classList.contains('hidden-ui');
    btn.classList.toggle('hidden', !visible);
  };
  const obs = new MutationObserver(sync);
  obs.observe(sec, { attributes: true, attributeFilter: ['class'] });
  const panel = document.getElementById('side-panel');
  if (panel) obs.observe(panel, { attributes: true, attributeFilter: ['class'] });
  sync();
})();

// ===== Paramètres application =====
const SETTINGS_KEY = '3dviewer_settings_v1';
const SETTINGS_DEFAULTS = {
  accentDark: '#6761FF',
  accentLight: '#F54927',
  skyDefault: '#1a1d24',
  groundMode: 'grid',
  groundColor: '#2a2d36',
  groundMetal: 0.05,
  groundRough: 0.9,
  gizmosDefault: true,
  helpersDefault: true,
  uiAlpha: 0.66,
};

const SETTINGS_TIPS = {
  fr: {
    'lbl-accent-dark': 'Couleur d’accent du mode sombre (menus, boutons actifs).',
    'set-accent-dark': 'Accent du thème sombre',
    'lbl-accent-light': 'Couleur d’accent du mode clair.',
    'set-accent-light': 'Accent du thème clair',
    'lbl-sky-default': 'Couleur du ciel utilisée à la réinitialisation.',
    'set-sky-default': 'Ciel par défaut (réinitialisation)',
    'lbl-set-gmode': 'Type de sol au démarrage et à la réinitialisation.',
    'set-ground-mode': 'Type de sol par défaut',
    'lbl-set-gcolor': 'Couleur du sol par défaut.',
    'set-ground-color': 'Couleur du sol par défaut',
    'lbl-set-gmetal': 'Aspect métallique du sol par défaut.',
    'set-ground-metal': 'Métal du sol par défaut',
    'lbl-set-grough': 'Rugosité du sol par défaut.',
    'set-ground-rough': 'Rugosité du sol par défaut',
    'lbl-set-gizmo': 'Afficher les axes (gizmo) au démarrage.',
    'set-gizmo-default': 'Gizmo visibles par défaut',
    'lbl-set-cones': 'Afficher les cônes d’aide des lumières au démarrage.',
    'set-helpers-default': 'Cônes de lumière visibles par défaut',
    'btn-settings-apply': 'Appliquer ces valeurs à la scène actuelle',
    'btn-settings-save': 'Enregistrer comme valeurs par défaut (réinitialisations)',
    'btn-settings-reset': 'Revenir aux valeurs d’usine',
    'lang-fr': 'Interface en français',
    'lang-en': 'English interface',
    'lbl-ui-alpha': 'Transparence du menu et des fenêtres (0 = invisible, 1 = opaque).',
    'set-ui-alpha': 'Transparence des fenêtres et du menu',
  },
  en: {
    'lbl-accent-dark': 'Accent color in dark mode (menus, active buttons).',
    'set-accent-dark': 'Dark-theme accent',
    'lbl-accent-light': 'Accent color in light mode.',
    'set-accent-light': 'Light-theme accent',
    'lbl-sky-default': 'Sky color used when you reset the sky.',
    'set-sky-default': 'Default sky (on reset)',
    'lbl-set-gmode': 'Ground type at startup and on reset.',
    'set-ground-mode': 'Default ground type',
    'lbl-set-gcolor': 'Default ground color.',
    'set-ground-color': 'Default ground color',
    'lbl-set-gmetal': 'Default ground metalness.',
    'set-ground-metal': 'Default ground metalness',
    'lbl-set-grough': 'Default ground roughness.',
    'set-ground-rough': 'Default ground roughness',
    'lbl-set-gizmo': 'Show axis gizmos at startup.',
    'set-gizmo-default': 'Gizmos visible by default',
    'lbl-set-cones': 'Show light helper cones at startup.',
    'set-helpers-default': 'Light cones visible by default',
    'btn-settings-apply': 'Apply these values to the current scene',
    'btn-settings-save': 'Save as defaults (used on reset)',
    'btn-settings-reset': 'Restore factory defaults',
    'lang-fr': 'Interface en français',
    'lang-en': 'English interface',
    'lbl-ui-alpha': 'Transparency of the menu and windows (0 = invisible, 1 = opaque).',
    'set-ui-alpha': 'Window and menu transparency',
  },
};

function applySettingsTips() {
  const tips = SETTINGS_TIPS[currentLang] || SETTINGS_TIPS.fr;
  Object.entries(tips).forEach(([id, tip]) => {
    const el = document.getElementById(id);
    if (el) el.title = tip;
  });
}

function loadAppSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { ...SETTINGS_DEFAULTS, ...raw };
  } catch (_) {
    return { ...SETTINGS_DEFAULTS };
  }
}

function saveAppSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (_) {}
}

function darkerHex(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (Number.isNaN(n)) return hex;
  const r = Math.max(0, ((n >> 16) & 255) - 24);
  const g = Math.max(0, ((n >> 8) & 255) - 24);
  const b = Math.max(0, (n & 255) - 24);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function applyAccentFromSettings(s) {
  const light = document.body.classList.contains('theme-light');
  const acc = light ? (s.accentLight || SETTINGS_DEFAULTS.accentLight) : (s.accentDark || SETTINGS_DEFAULTS.accentDark);
  const hover = darkerHex(acc);
  const apply = (el) => {
    if (!el?.style) return;
    el.style.setProperty('--accent', acc, 'important');
    el.style.setProperty('--accent-hover', hover, 'important');
  };
  apply(document.documentElement);
  apply(document.body);
}

function applyUiAlpha(alpha) {
  const a = Math.min(1, Math.max(0.2, Number(alpha) || 0.66));
  document.documentElement.style.setProperty('--ui-alpha', String(a));
  document.body.style.setProperty('--ui-alpha', String(a));
}

function fillSettingsForm(s) {
  const set = (id, v, type) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (type === 'check') el.checked = !!v;
    else el.value = v;
  };
  set('set-accent-dark', s.accentDark);
  set('set-accent-light', s.accentLight);
  set('set-sky-default', s.skyDefault);
  set('set-ground-mode', s.groundMode);
  set('set-ground-color', s.groundColor);
  set('set-ground-metal', s.groundMetal);
  set('set-ground-rough', s.groundRough);
  const vm = document.getElementById('val-set-gmetal');
  if (vm) vm.textContent = Number(s.groundMetal).toFixed(2);
  const vr = document.getElementById('val-set-grough');
  if (vr) vr.textContent = Number(s.groundRough).toFixed(2);
  set('set-gizmo-default', s.gizmosDefault, 'check');
  set('set-helpers-default', s.helpersDefault, 'check');
  set('set-ui-alpha', s.uiAlpha != null ? s.uiAlpha : 0.66);
  const va = document.getElementById('val-ui-alpha');
  if (va) va.textContent = Math.round(Number(s.uiAlpha != null ? s.uiAlpha : 0.66) * 100) + '%';
}

function readSettingsForm() {
  return {
    accentDark: document.getElementById('set-accent-dark')?.value || SETTINGS_DEFAULTS.accentDark,
    accentLight: document.getElementById('set-accent-light')?.value || SETTINGS_DEFAULTS.accentLight,
    skyDefault: document.getElementById('set-sky-default')?.value || SETTINGS_DEFAULTS.skyDefault,
    groundMode: document.getElementById('set-ground-mode')?.value || 'grid',
    groundColor: document.getElementById('set-ground-color')?.value || SETTINGS_DEFAULTS.groundColor,
    groundMetal: parseFloat(document.getElementById('set-ground-metal')?.value || '0.05'),
    groundRough: parseFloat(document.getElementById('set-ground-rough')?.value || '0.9'),
    gizmosDefault: !!document.getElementById('set-gizmo-default')?.checked,
    helpersDefault: !!document.getElementById('set-helpers-default')?.checked,
    uiAlpha: parseFloat(document.getElementById('set-ui-alpha')?.value || '0.66'),
  };
}

function applySettingsToScene(s) {
  applyAccentFromSettings(s);
  applyUiAlpha(s.uiAlpha);
  GROUND_DEFAULTS.color = s.groundColor;
  GROUND_DEFAULTS.metalness = s.groundMetal;
  GROUND_DEFAULTS.roughness = s.groundRough;
  GROUND_DEFAULTS.mode = s.groundMode;
  setSkyColor(s.skyDefault);
  resetGround();
  setGizmosVisible(s.gizmosDefault);
  setLightHelpersVisible(s.helpersDefault);
}

function rememberDefaultsOnly(s) {
  GROUND_DEFAULTS.color = s.groundColor;
  GROUND_DEFAULTS.metalness = s.groundMetal;
  GROUND_DEFAULTS.roughness = s.groundRough;
  GROUND_DEFAULTS.mode = s.groundMode;
}

function openSettingsWindow() {
  const s = loadAppSettings();
  appSettings = s;
  fillSettingsForm(s);
  applySettingsTips();
  const win = document.getElementById('settings-window');
  const inner = document.getElementById('settings-inner');
  win?.classList.remove('hidden');
  inner?.classList.remove('minimized', 'maximized');
  collapseMenus?.();
}

function closeSettingsWindow() {
  document.getElementById('settings-window')?.classList.add('hidden');
}

let appSettings = loadAppSettings();
fillSettingsForm(appSettings);
rememberDefaultsOnly(appSettings);
applyAccentFromSettings(appSettings);
applyUiAlpha(appSettings.uiAlpha);

document.getElementById('menu-settings')?.addEventListener('click', openSettingsWindow);
document.getElementById('settings-close')?.addEventListener('click', (e) => {
  e.stopPropagation();
  closeSettingsWindow();
});
document.getElementById('settings-window')?.addEventListener('pointerdown', (e) => {
  if (e.target === document.getElementById('settings-window')) closeSettingsWindow();
});
document.getElementById('btn-settings-save')?.addEventListener('click', () => {
  appSettings = readSettingsForm();
  saveAppSettings(appSettings);
  rememberDefaultsOnly(appSettings);
  setStatus(currentLang === 'en'
    ? 'Defaults saved. Use Apply to update the scene.'
    : 'Valeurs par défaut enregistrées. Utilisez Appliquer pour la scène.');
});
document.getElementById('btn-settings-apply')?.addEventListener('click', () => {
  appSettings = readSettingsForm();
  saveAppSettings(appSettings);
  rememberDefaultsOnly(appSettings);
  applySettingsToScene(appSettings);
  setStatus(currentLang === 'en' ? 'Settings applied to the scene.' : 'Paramètres appliqués à la scène.');
});
document.getElementById('btn-settings-reset')?.addEventListener('click', () => {
  appSettings = { ...SETTINGS_DEFAULTS };
  saveAppSettings(appSettings);
  fillSettingsForm(appSettings);
  rememberDefaultsOnly(appSettings);
  setStatus(currentLang === 'en'
    ? 'Factory defaults restored (not applied to the scene).'
    : 'Valeurs d’usine restaurées (non appliquées à la scène).');
});
['set-ground-metal', 'set-ground-rough'].forEach((id) => {
  document.getElementById(id)?.addEventListener('input', (e) => {
    const span = document.getElementById(id === 'set-ground-metal' ? 'val-set-gmetal' : 'val-set-grough');
    if (span) span.textContent = parseFloat(e.target.value).toFixed(2);
  });
});
['set-accent-dark', 'set-accent-light'].forEach((id) => {
  document.getElementById(id)?.addEventListener('input', () => {
    const s = { ...loadAppSettings(), ...readSettingsForm() };
    appSettings = s;
    saveAppSettings(s);
    applyAccentFromSettings(s);
  });
});
document.getElementById('set-ui-alpha')?.addEventListener('input', (e) => {
  const a = parseFloat(e.target.value);
  const va = document.getElementById('val-ui-alpha');
  if (va) va.textContent = Math.round(a * 100) + '%';
  applyUiAlpha(a);
  const s = { ...loadAppSettings(), ...readSettingsForm() };
  appSettings = s;
  saveAppSettings(s);
});

// Sections repliables
document.getElementById('settings-body')?.addEventListener('click', (e) => {
  const header = e.target.closest?.('.settings-sec-toggle');
  if (!header) return;
  e.preventDefault();
  e.stopPropagation();
  const group = header.closest('.settings-section');
  if (!group) return;
  const collapsed = group.classList.toggle('collapsed');
  header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  const col = group.querySelector('.btn-collapse');
  if (col) col.textContent = collapsed ? '+' : '−';
});

// Drag / resize / min / max
(function setupSettingsWindowChrome() {
  const win = document.getElementById('settings-window');
  const inner = document.getElementById('settings-inner');
  const bar = document.getElementById('settings-titlebar');
  const handle = document.getElementById('settings-resize');
  if (!win || !inner || !bar) return;
  let prevRect = null;
  let dragging = false, ox = 0, oy = 0;
  bar.style.cursor = 'move';
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || e.target.closest('.tl')) return;
    if (inner.classList.contains('maximized')) return;
    dragging = true;
    const r = inner.getBoundingClientRect();
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    inner.style.position = 'fixed';
    inner.style.margin = '0';
    inner.style.left = r.left + 'px';
    inner.style.top = r.top + 'px';
    try { bar.setPointerCapture(e.pointerId); } catch (_) {}
  });
  bar.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const w = inner.offsetWidth;
    const h = inner.offsetHeight;
    const x = Math.max(0, Math.min(window.innerWidth - 80, e.clientX - ox));
    const y = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - oy));
    inner.style.left = x + 'px';
    inner.style.top = y + 'px';
    inner.style.right = 'auto';
    inner.style.bottom = 'auto';
    void w; void h;
  });
  bar.addEventListener('pointerup', (e) => {
    dragging = false;
    try { bar.releasePointerCapture(e.pointerId); } catch (_) {}
  });
  document.getElementById('settings-min')?.addEventListener('click', (e) => {
    e.stopPropagation();
    inner.classList.toggle('minimized');
    inner.classList.remove('maximized');
  });
  document.getElementById('settings-max')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (inner.classList.contains('maximized')) {
      inner.classList.remove('maximized');
      if (prevRect) {
        inner.style.left = prevRect.left;
        inner.style.top = prevRect.top;
        inner.style.width = prevRect.width;
        inner.style.height = prevRect.height;
      }
    } else {
      const r = inner.getBoundingClientRect();
      prevRect = { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' };
      inner.classList.remove('minimized');
      inner.classList.add('maximized');
      inner.style.position = 'fixed';
      inner.style.left = '10px';
      inner.style.top = 'calc(var(--menu-h) + 10px)';
      inner.style.width = 'calc(100vw - 20px)';
      inner.style.height = 'calc(100vh - var(--menu-h) - 20px)';
      inner.style.margin = '0';
    }
  });
  if (handle) {
    let resizing = false, sx = 0, sy = 0, sw = 0, sh = 0;
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (inner.classList.contains('maximized')) return;
      resizing = true;
      const r = inner.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; sw = r.width; sh = r.height;
      inner.style.position = 'fixed';
      inner.style.left = r.left + 'px';
      inner.style.top = r.top + 'px';
      inner.style.margin = '0';
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    });
    handle.addEventListener('pointermove', (e) => {
      if (!resizing) return;
      inner.style.width = Math.max(300, sw + (e.clientX - sx)) + 'px';
      inner.style.height = Math.max(240, sh + (e.clientY - sy)) + 'px';
    });
    handle.addEventListener('pointerup', (e) => {
      resizing = false;
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
    });
  }
})();

(function setupTexPreviewChrome() {
  const win = document.getElementById('tex-preview-window');
  const inner = document.getElementById('tex-preview-inner');
  const bar = document.getElementById('tex-preview-titlebar');
  const handle = document.getElementById('tex-preview-resize');
  if (!win || !inner || !bar) return;
  let prevRect = null;
  let dragging = false, ox = 0, oy = 0;
  bar.style.cursor = 'move';
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || e.target.closest('.tl')) return;
    if (inner.classList.contains('maximized')) return;
    dragging = true;
    const r = inner.getBoundingClientRect();
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    inner.style.position = 'fixed';
    inner.style.margin = '0';
    inner.style.left = r.left + 'px';
    inner.style.top = r.top + 'px';
    try { bar.setPointerCapture(e.pointerId); } catch (_) {}
  });
  bar.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const x = Math.max(0, Math.min(window.innerWidth - 80, e.clientX - ox));
    const y = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - oy));
    inner.style.left = x + 'px';
    inner.style.top = y + 'px';
  });
  bar.addEventListener('pointerup', () => { dragging = false; });
  document.getElementById('tex-preview-min')?.addEventListener('click', (e) => {
    e.stopPropagation();
    inner.classList.toggle('minimized');
    inner.classList.remove('maximized');
  });
  document.getElementById('tex-preview-max')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (inner.classList.contains('maximized')) {
      inner.classList.remove('maximized');
      if (prevRect) {
        inner.style.left = prevRect.left;
        inner.style.top = prevRect.top;
        inner.style.width = prevRect.width;
        inner.style.height = prevRect.height;
      }
    } else {
      const r = inner.getBoundingClientRect();
      prevRect = { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' };
      inner.classList.remove('minimized');
      inner.classList.add('maximized');
      inner.style.position = 'fixed';
      inner.style.left = '10px';
      inner.style.top = 'calc(var(--menu-h) + 10px)';
      inner.style.width = 'calc(100vw - 20px)';
      inner.style.height = 'calc(100vh - var(--menu-h) - 20px)';
      inner.style.margin = '0';
    }
  });
  if (handle) {
    let resizing = false, sx = 0, sy = 0, sw = 0, sh = 0;
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (inner.classList.contains('maximized')) return;
      resizing = true;
      const r = inner.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; sw = r.width; sh = r.height;
      inner.style.position = 'fixed';
      inner.style.left = r.left + 'px';
      inner.style.top = r.top + 'px';
      inner.style.margin = '0';
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    });
    handle.addEventListener('pointermove', (e) => {
      if (!resizing) return;
      inner.style.width = Math.max(280, sw + (e.clientX - sx)) + 'px';
      inner.style.height = Math.max(220, sh + (e.clientY - sy)) + 'px';
    });
    handle.addEventListener('pointerup', () => { resizing = false; });
  }
})();

// Apply default gizmos / helpers / accent at startup
try {
  const s0 = loadAppSettings();
  applyAccentFromSettings(s0);
  applyUiAlpha(s0.uiAlpha);
  const g = localStorage.getItem('3dviewer_gizmos');
  if (g === '0') setGizmosVisible(false);
  else if (g === '1') setGizmosVisible(true);
  else if (s0.gizmosDefault === false) setGizmosVisible(false);
  const h = localStorage.getItem('3dviewer_helpers');
  if (h === '0') setLightHelpersVisible(false);
  else if (h === '1') setLightHelpersVisible(true);
  else if (s0.helpersDefault === false) setLightHelpersVisible(false);
} catch (_) {}

document.getElementById('menu-theme-light')?.addEventListener('click', () => {
  setTimeout(() => applyAccentFromSettings(loadAppSettings()), 0);
});

function applySettingsTipsOnLang() {
  try { applySettingsTips(); } catch (_) {}
}

// ===== Quit / refresh confirmation =====
let pendingLeave = null; // { type: 'reload' | 'href', href? }
function showLeaveModal(action) {
  pendingLeave = action;
  const t = UI_I18N[currentLang] || UI_I18N.fr;
  const title = document.getElementById('leave-title');
  const msg = document.getElementById('leave-msg');
  if (title) title.textContent = t.leave_title;
  if (msg) msg.textContent = t.leave_msg;
  document.getElementById('leave-yes').textContent = t.yes;
  document.getElementById('leave-no').textContent = t.no;
  document.getElementById('leave-modal')?.classList.remove('hidden');
}
function hideLeaveModal() {
  pendingLeave = null;
  document.getElementById('leave-modal')?.classList.add('hidden');
}
document.getElementById('leave-no')?.addEventListener('click', hideLeaveModal);
document.getElementById('leave-yes')?.addEventListener('click', () => {
  const act = pendingLeave;
  hideLeaveModal();
  allowLeave = true;
  if (!act || act.type === 'reload') location.reload();
  else if (act.type === 'href' && act.href) location.href = act.href;
});
let allowLeave = false;
window.addEventListener('keydown', (e) => {
  const k = e.key;
  if ((k === 'F5') || ((e.ctrlKey || e.metaKey) && (k === 'r' || k === 'R'))) {
    e.preventDefault();
    showLeaveModal({ type: 'reload' });
  }
});
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[href]');
  if (!a) return;
  if (a.target === '_blank' || a.hasAttribute('download')) return;
  const href = a.getAttribute('href') || '';
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) return;
  if (href.startsWith('http') && !href.includes(location.host)) return; // new origin: let target=_blank or skip
  e.preventDefault();
  showLeaveModal({ type: 'href', href: a.href });
}, true);

window.addEventListener('beforeunload', (e) => {
  if (allowLeave) return;
  e.preventDefault();
  e.returnValue = '';
});

