import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import JSZip from 'jszip';

// ===== Versioning =====
const APP_VERSION = '2.1.7';
let currentLang = 'en';
try {
  const savedLang = localStorage.getItem('3dviewer_lang');
  if (savedLang === 'fr' || savedLang === 'en') currentLang = savedLang;
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

// ===== Gizmo axes (style Blender) =====
const axesScene = new THREE.Scene();
const axesCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
const axesGizmo = new THREE.AxesHelper(1.2);
axesScene.add(axesGizmo);
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
axesScene.add(makeAxisLabel('X', '#ff4444', new THREE.Vector3(1.35, 0, 0)));
axesScene.add(makeAxisLabel('Y', '#44ff66', new THREE.Vector3(0, 1.35, 0)));
axesScene.add(makeAxisLabel('Z', '#4488ff', new THREE.Vector3(0, 0, 1.35)));

// Axes dans la scène (origine)
const sceneAxes = new THREE.AxesHelper(1.5);
sceneAxes.name = 'sceneAxes';
scene.add(sceneAxes);
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
  loaderText.textContent = text;
  loaderEl.classList.remove('hidden');
}

function hideLoader() {
  loaderEl.classList.add('hidden');
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
  const { size, center, maxDim } = getModelBounds(object);

  const fov = camera.fov * (Math.PI / 180);
  let distance = Math.abs(maxDim / 2 / Math.tan(fov / 2));
  distance *= 2.4; // marge confortable

  const offset = new THREE.Vector3(distance * 0.75, distance * 0.4, distance * 0.75);
  camera.position.copy(center).add(offset);
  controls.target.copy(center);

  controls.minDistance = Math.max(0.15, maxDim * 0.12);
  controls.maxDistance = maxDim * 12;
  camera.near = Math.max(0.01, maxDim * 0.001);
  camera.far = Math.max(5000, maxDim * 40);
  camera.updateProjectionMatrix();
  controls.update();

  // Repositionner les lumières autour de l'objet
  repositionLightsForModel(object);
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
      panel.style.maxHeight = 'min(42vh, 360px)';
    } else {
      // haut gauche
      panel.style.left = margin + 'px';
      panel.style.right = 'auto';
      panel.style.top = (menuH + margin) + 'px';
      panel.style.bottom = 'auto';
      panel.style.width = '';
      panel.style.maxWidth = 'min(340px, calc(100vw - 20px))';
      panel.style.maxHeight = 'calc(100vh - ' + (menuH + margin * 2) + 'px)';
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
  fitCameraToObject(object);

  const panel = document.getElementById('side-panel');
  const panelOpen = panel && !panel.classList.contains('hidden-ui');
  if (!panelOpen) {
    setStatus('Objet cadré (plein écran).');
    return;
  }

  const portrait = isPortraitLayout();
  const dist = camera.position.distanceTo(controls.target);
  const vFov = camera.fov * (Math.PI / 180);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);

  // Vecteurs caméra
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();

  if (!portrait) {
    // panneau à gauche : objet doit apparaître dans la zone libre à DROITE
    const panelW = Math.min(panel.getBoundingClientRect().width || 320, window.innerWidth * 0.45);
    const frac = Math.min(0.55, (panelW / window.innerWidth) * 1.15);
    const shift = Math.tan(hFov / 2) * dist * frac;
    // translater caméra+cible vers la droite (axe right caméra) → sujet visible à droite
    camera.position.addScaledVector(right, shift);
    controls.target.addScaledVector(right, shift);
  } else {
    // panneau en bas : objet doit apparaître dans la zone libre en HAUT
    const panelH = Math.min(panel.getBoundingClientRect().height || 280, window.innerHeight * 0.45);
    const frac = Math.min(0.55, (panelH / window.innerHeight) * 1.15);
    const shift = Math.tan(vFov / 2) * dist * frac;
    // translater vers le bas de l'écran caméra pour que le sujet monte dans le cadre
    camera.position.addScaledVector(up, -shift);
    controls.target.addScaledVector(up, -shift);
  }
  controls.update();
  setStatus(portrait ? 'Cadré zone visible (haut).' : 'Cadré zone visible (droite).');
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
  setStatus(wireframeMode ? 'Wireframe activé.' : 'Rendu solid.');
  scheduleSavePrefs();
}

const sidePanel = document.getElementById('side-panel');
const sideTitle = document.getElementById('side-title');
/** Dernière section de panneau affichée */
let lastPanelSection = { id: 'sec-props', title: 'Propriétés' };

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
  layoutFloatingWindows();
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
    const w = Math.max(260, startW + (e.clientX - startX));
    const h = Math.max(180, startH + (e.clientY - startY));
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
  setSkyColor('#1a1d24');
  setStatus('Couleur du ciel réinitialisée.');
});

let lightHelpersVisible = true;
function setLightHelpersVisible(vis) {
  lightHelpersVisible = !!vis;
  lights.forEach((e) => {
    if (e.helper) e.helper.visible = lightHelpersVisible;
  });
  updateDynamicMenuLabels();
  setStatus(lightHelpersVisible ? 'Cônes de lumière affichés.' : 'Cônes de lumière masqués.');
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
  if (typeof sceneAxes !== 'undefined' && sceneAxes) sceneAxes.visible = gizmosVisible;
  if (typeof axesGizmo !== 'undefined' && axesGizmo) axesGizmo.visible = gizmosVisible;
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
  const g = localStorage.getItem('3dviewer_gizmos');
  if (g === '0') setGizmosVisible(false);
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
  document.getElementById('about-modal')?.classList.remove('hidden');
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
    html += `
      <div class="control-row">
        <label>Pos X</label>
        <input type="number" class="ctrl-px" step="0.1" value="${light.position.x.toFixed(1)}" />
      </div>
      <div class="control-row">
        <label>Pos Y</label>
        <input type="number" class="ctrl-py" step="0.1" value="${light.position.y.toFixed(1)}" />
      </div>
      <div class="control-row">
        <label>Pos Z</label>
        <input type="number" class="ctrl-pz" step="0.1" value="${light.position.z.toFixed(1)}" />
      </div>
      <div class="control-row">
        <label>Rot X °</label>
        <input type="number" class="ctrl-rx" step="1" value="${(light.rotation.x * 180 / Math.PI).toFixed(0)}" />
      </div>
      <div class="control-row">
        <label>Rot Y °</label>
        <input type="number" class="ctrl-ry" step="1" value="${(light.rotation.y * 180 / Math.PI).toFixed(0)}" />
      </div>
      <div class="control-row">
        <label>Rot Z °</label>
        <input type="number" class="ctrl-rz" step="1" value="${(light.rotation.z * 180 / Math.PI).toFixed(0)}" />
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
      light.position.set(
        parseFloat(card.querySelector('.ctrl-px').value) || 0,
        parseFloat(card.querySelector('.ctrl-py').value) || 0,
        parseFloat(card.querySelector('.ctrl-pz').value) || 0
      );
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
      light.rotation.set(rx, ry, rz);
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
  if (!sel) return;
  const prevBase = preserveLabel && sel.selectedOptions[0]
    ? (sel.selectedOptions[0].dataset.base || sel.selectedOptions[0].textContent)
    : null;
  collectMaterials();
  sel.innerHTML = '';
  if (materialEntries.length === 0) {
    sel.innerHTML = '<option value="">— aucun matériau —</option>';
    return;
  }
  materialEntries.forEach((e, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    const hex = e.material?.color ? ('#' + e.material.color.getHexString()) : '#888888';
    opt.textContent = e.listLabel || e.label;
    opt.dataset.base = e.baseLabel;
    opt.dataset.color = hex;
    // Note: native <option> ne permet pas de carré HTML ; on utilise un select custom si besoin
    // Fallback: préfixe unicode carré coloré via text + style on select change
    sel.appendChild(opt);
  });
  // peindre un swatch à droite du select
  paintMatSelectSwatch();
  let idx = 0;
  if (prevBase) {
    const found = materialEntries.findIndex((e) => e.baseLabel === prevBase || e.label === prevBase);
    if (found >= 0) idx = found;
  }
  sel.value = String(idx);
  loadMaterialToUI(idx);
  paintMatSelectSwatch();
}

function paintMatSelectSwatch() {
  const sel = document.getElementById('mat-select');
  let sw = document.getElementById('mat-select-swatch');
  if (!sw) {
    sw = document.createElement('span');
    sw.id = 'mat-select-swatch';
    sw.className = 'mat-select-swatch';
    sel?.parentElement?.appendChild(sw);
  }
  const entry = getSelectedMaterialEntry();
  const hex = entry?.material?.color ? ('#' + entry.material.color.getHexString()) : '#666';
  sw.style.background = hex;
  sw.title = hex;
}

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
  setTex('mat-tex-sy', 'val-tex-sy', ry);
  setTex('mat-tex-sz', 'val-tex-sz', 1);
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
    emissive, emissiveInt, texSx, texSy, texSz,
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
  mat.transparent = !!(transparent || (opacity != null && opacity < 0.99) || (transmission != null && transmission > 0.001));
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
    const zx = (texSx || 1) * (texSz || 1);
    const zy = (texSy || 1) * (texSz || 1);
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
  };
}

function applyMaterialsFromUI(applyAll = false) {
  if (!currentModel) {
    setStatus('Aucun modèle chargé.', true);
    return;
  }
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
    const sel = document.getElementById('mat-select');
    const idx = materialEntries.indexOf(entry);
    if (sel && idx >= 0) {
      sel.value = String(idx);
      loadMaterialToUI(idx);
    }
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

  // 1) Double-clic sur une lumière (helper / marker)
  let bestLight = null;
  let bestDist = Infinity;
  lights.forEach((entry) => {
    if (!entry || entry.type === 'AmbientLight') return;
    const objs = [];
    if (entry.helper) objs.push(entry.helper);
    if (entry.helper?._marker) objs.push(entry.helper._marker);
    objs.forEach((o) => {
      const hs = pickRaycaster.intersectObject(o, true);
      if (hs.length && hs[0].distance < bestDist) {
        bestDist = hs[0].distance;
        bestLight = entry;
      }
    });
    // also test light position with a small sphere ray approx via marker
  });
  if (bestLight) {
    showSection('sec-lights', currentLang === 'en' ? 'Lights' : 'Lumières');
    document.querySelectorAll('.light-card').forEach((c) => c.classList.remove('light-focused'));
    if (bestLight.card) {
      bestLight.card.classList.add('light-focused');
      bestLight.card.classList.remove('collapsed');
      const body = bestLight.card.querySelector('.light-card-body');
      if (body) body.style.display = '';
      const col = bestLight.card.querySelector('.btn-collapse');
      if (col) col.textContent = '−';
      bestLight.card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    setStatus((currentLang === 'en' ? 'Light: ' : 'Lumière : ') + (bestLight.name || bestLight.type));
    return;
  }

  // 2) Double-clic sol
  const groundHits = [];
  if (grid.visible) groundHits.push(...pickRaycaster.intersectObject(grid, true));
  if (groundPlane.visible) groundHits.push(...pickRaycaster.intersectObject(groundPlane, true));
  const modelHits = currentModel ? pickRaycaster.intersectObject(currentModel, true) : [];
  if (groundHits.length && (!modelHits.length || groundHits[0].distance <= modelHits[0].distance)) {
    showSection('sec-ground', currentLang === 'en' ? 'Ground' : 'Sol');
    return;
  }

  // 3) Double-clic mesh → cadrer
  if (!modelHits.length) return;
  const mesh = modelHits[0].object;
  if (!mesh) return;
  fitCameraToObject(mesh);
  setStatus((currentLang === 'en' ? 'Framed: ' : 'Élément cadré : ') + (mesh.name || 'mesh'));
});



document.getElementById('mat-select')?.addEventListener('change', (e) => {
  const i = parseInt(e.target.value, 10);
  if (!isNaN(i)) { loadMaterialToUI(i); paintMatSelectSwatch(); }
});

['mat-metal', 'mat-rough', 'mat-opacity', 'mat-trans', 'mat-emissive-int', 'mat-tex-sx', 'mat-tex-sy', 'mat-tex-sz'].forEach((id) => {
  const map = {
    'mat-metal': 'val-metal',
    'mat-rough': 'val-rough',
    'mat-opacity': 'val-opacity',
    'mat-trans': 'val-trans',
    'mat-emissive-int': 'val-emissive-int',
    'mat-tex-sx': 'val-tex-sx',
    'mat-tex-sy': 'val-tex-sy',
    'mat-tex-sz': 'val-tex-sz',
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
    mat.map.repeat.set(sx * sz, sy * sz);
    mat.map.needsUpdate = true;
    mat.needsUpdate = true;
  });
}
['mat-tex-sx', 'mat-tex-sy', 'mat-tex-sz'].forEach((id) => {
  document.getElementById(id)?.addEventListener('input', applyTexScaleLive);
});

document.getElementById('mat-texture')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  textureLoader.load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    pendingTexture = tex;
    setStatus(`Texture prête : ${file.name}`);
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
  setStatus('Texture retirée.');
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
  loadCustomColors().forEach((hex) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.title = hex + ' (clic = utiliser, dbl-clic = supprimer)';
    b.style.background = hex;
    b.addEventListener('click', () => {
      const c = document.getElementById('mat-color');
      const h = document.getElementById('mat-color-hex');
      if (c) c.value = hex;
      if (h) h.value = hex;
    });
    b.addEventListener('dblclick', (e) => {
      e.preventDefault();
      const next = loadCustomColors().filter((x) => x !== hex);
      saveCustomColors(next);
      renderCustomColors();
      setStatus('Couleur retirée : ' + hex);
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
renderCustomColors();


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
if (aboutUpd) aboutUpd.textContent = currentLang === 'en' ? 'August 21, 2026' : '21 août 2026';

document.getElementById('about-close')?.addEventListener('click', () => {
  aboutModal?.classList.add('hidden');
});
aboutModal?.addEventListener('click', (e) => {
  if (e.target === aboutModal) aboutModal.classList.add('hidden');
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
document.getElementById('menu-help')?.addEventListener('click', () => {
  document.getElementById('help-modal')?.classList.remove('hidden');
});
document.getElementById('help-close')?.addEventListener('click', () => {
  document.getElementById('help-modal')?.classList.add('hidden');
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
    help: 'Aide — 3D Viewer',
    selection: 'Sélection',
    colors: 'Couleurs',
    color: 'Couleur',
    properties: 'Propriétés',
    texture_scales: 'Texture & échelles',
    type: 'Type',
    apply_mat: 'Appliquer au matériau sélectionné',
    apply_all: 'Appliquer à tous',
    reset_mats: "Réinitialiser matériaux d'origine",
    no_model: 'Aucun modèle chargé.',
    no_model_opt: '— aucun modèle —',
    version: 'Version',
    created: 'Date de création',
    updated: 'Dernière mise à jour',
    author: 'Auteur',
    desc: '3D Viewer permet de visualiser vos fichiers 3D.',
    updated_date: '21 août 2026',
    created_date: '19 août 2026',
    update_available: 'MAJ disponible !',
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
    help: 'Help — 3D Viewer',
    update_available: 'Update available!',
    selection: 'Selection',
    colors: 'Colors',
    color: 'Color',
    properties: 'Properties',
    texture_scales: 'Texture & scales',
    type: 'Type',
    apply_mat: 'Apply to selected material',
    apply_all: 'Apply to all',
    reset_mats: 'Reset original materials',
    no_model: 'No model loaded.',
    no_model_opt: '— no model —',
    version: 'Version',
    created: 'Created',
    updated: 'Last updated',
    author: 'Author',
    desc: '3D Viewer lets you view your 3D files.',
    updated_date: 'August 21, 2026',
    created_date: 'August 19, 2026',
    update_available: 'Update available!',
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
  document.querySelectorAll('.mat-group-colors .mat-group-title').forEach((el) => { el.textContent = t.colors; });
  document.querySelectorAll('.mat-group-props .mat-group-title').forEach((el) => { el.textContent = t.properties; });
  document.querySelectorAll('.mat-group-tex .mat-group-title').forEach((el) => { el.textContent = t.texture_scales; });
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
  const badge = document.getElementById('about-update-badge');
  if (badge && !badge.classList.contains('hidden')) badge.textContent = t.update_available || badge.textContent;

  document.querySelectorAll('.about-desc').forEach((el) => { el.textContent = t.desc; });
  const aboutUpd = document.getElementById('about-updated');
  if (aboutUpd) aboutUpd.textContent = t.updated_date;
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
  document.querySelectorAll('.menu-label, .menu-dropdown button, .menu-hint-label, .ground-btn').forEach((el) => {
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
  document.getElementById('about-modal')?.classList.remove('hidden');
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
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
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
      ? '(<a href="https://github.com/dino213dz/3D-Viewer" target="_blank" rel="noopener">Update</a>)'
      : '(<a href="https://github.com/dino213dz/3D-Viewer" target="_blank" rel="noopener">Mettre à jour</a>)';
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
