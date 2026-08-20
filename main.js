import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import JSZip from 'jszip';

// ===== Versioning =====
const APP_VERSION = '1.6.8';
const APP_CREATED = '19 août 2026';
const APP_UPDATED = '20 août 2026';
const TARGET_MODEL_SIZE = 4; // taille max (unités) pour auto-scale des gros modèles

// ===== Sauvegarde auto (matériaux + vue) par fichier =====
const PREFS_PREFIX = '3dviewer_prefs_v1:';
let currentFileKey = null;
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

// Ground grid + plane for shadows
const grid = new THREE.GridHelper(80, 80, 0x333844, 0x22252e);
scene.add(grid);

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
const undoStack = [];

function updateUndoMenu() {
  const n = undoStack.length;
  const btn = document.getElementById('menu-undo');
  if (btn) {
    btn.textContent = n ? ('↩️ Annuler (' + n + ')') : '↩️ Annuler';
    btn.disabled = n === 0;
    btn.style.opacity = n ? '1' : '0.45';
  }
  const tb = document.getElementById('toolbar-undo');
  if (tb) {
    tb.disabled = n === 0;
    tb.classList.toggle('disabled', n === 0);
    tb.title = n ? ('Annuler (' + n + ') — Ctrl+Z') : 'Rien à annuler';
  }
}

function pushUndo(entry) {
  undoStack.push(entry);
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
  // sync card UI if present
  if (entry.card) {
    const c = entry.card.querySelector('.ctrl-color');
    if (c && st.color) c.value = st.color;
    const i = entry.card.querySelector('.ctrl-intensity');
    if (i && st.intensity != null) { i.value = st.intensity; const v = entry.card.querySelector('.val-intensity'); if (v) v.textContent = Number(st.intensity).toFixed(2); }
    const px = entry.card.querySelector('.ctrl-px');
    if (px && st.position) { px.value = st.position[0]; entry.card.querySelector('.ctrl-py').value = st.position[1]; entry.card.querySelector('.ctrl-pz').value = st.position[2]; }
  }
  if (entry.helper) {
    if (entry.helper.update) entry.helper.update();
    if (entry.helper._marker && light.color) entry.helper._marker.material.color.copy(light.color);
  }
}

function performUndo() {
  const entry = undoStack.pop();
  updateUndoMenu();
  if (!entry) {
    setStatus('Rien à annuler.', true);
    return;
  }
  try {
    entry.undo();
    setStatus('Annulé : ' + (entry.label || 'action'));
  } catch (err) {
    console.error(err);
    setStatus('Échec de l\\'annulation', true);
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
  statusEl.style.color = isError ? '#ef4444' : '#9aa0a6';
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

function clearModel() {
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

function prepareModel(object) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;

      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        const newMats = mats.map((m) => {
          // Convertir MeshBasicMaterial (non éclairé) en Standard pour que les lumières fonctionnent
          if (m.isMeshBasicMaterial) {
            const std = new THREE.MeshStandardMaterial({
              color: m.color,
              map: m.map,
              transparent: m.transparent,
              opacity: m.opacity,
              side: THREE.FrontSide,
              metalness: 0.2,
              roughness: 0.6,
            });
            if (std.map) std.map.colorSpace = THREE.SRGBColorSpace;
            return std;
          }
          if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
          m.side = THREE.FrontSide;
          // Assurer que le matériau réagit bien à la lumière
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
  currentFileKey = fileKeyFromMeta(file.name, file.size);

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

function showSection(id, title) {
  sidePanel.classList.remove('hidden-ui');
  document.querySelectorAll('.side-section').forEach((s) => s.classList.add('hidden'));
  const sec = document.getElementById(id);
  if (sec) sec.classList.remove('hidden');
  if (sideTitle) sideTitle.textContent = title || 'Panneau';
}

function toggleSidePanel() {
  sidePanel.classList.toggle('hidden-ui');
  setStatus(sidePanel.classList.contains('hidden-ui') ? 'Panneau masqué.' : 'Panneau affiché.');
}

function closeSidePanel() {
  sidePanel.classList.add('hidden-ui');
}
document.getElementById('side-close')?.addEventListener('click', closeSidePanel);
document.getElementById('side-close-x')?.addEventListener('click', closeSidePanel);

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
  document.querySelectorAll('.menu-item.open').forEach((i) => i.classList.remove('open'));
}

// Menu burger (écrans étroits)
const menuBurger = document.getElementById('menu-burger');
const menuRoot = document.getElementById('menu-root');
menuBurger?.addEventListener('click', (e) => {
  e.stopPropagation();
  menuRoot?.classList.toggle('menu-open');
  menuBurger.classList.toggle('active');
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#menubar')) {
    collapseMenus();
  }
});

// Fermer le menu dès qu'on clique sur une action
document.querySelectorAll('.menu-dropdown button, #menu-about').forEach((btn) => {
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
document.getElementById('load-close-x')?.addEventListener('click', closeLoadWindow);
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
document.getElementById('menu-undo')?.addEventListener('click', performUndo);
// Raccourci Ctrl/Cmd+Z
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    performUndo();
  }
});
document.getElementById('menu-frame')?.addEventListener('click', doFrame);
document.getElementById('menu-reset-cam')?.addEventListener('click', doResetCam);
document.getElementById('menu-wireframe')?.addEventListener('click', toggleWireframe);
document.getElementById('menu-toggle-panel')?.addEventListener('click', toggleSidePanel);
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

// Touch-friendly: click to open menu on mobile
document.querySelectorAll('.menu-item').forEach((item) => {
  const label = item.querySelector('.menu-label');
  label?.addEventListener('click', (e) => {
    if (item.querySelector('.menu-dropdown')) {
      e.stopPropagation();
      document.querySelectorAll('.menu-item').forEach((i) => {
        if (i !== item) i.classList.remove('open');
      });
      item.classList.toggle('open');
    }
  });
});
document.addEventListener('click', () => {
  document.querySelectorAll('.menu-item.open').forEach((i) => i.classList.remove('open'));
});

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
    pushUndo({
      label: 'Ajout lumière ' + type.replace('Light', ''),
      undo: () => {
        skipLightUndo = true;
        removeLight(addedId);
        skipLightUndo = false;
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

  let html = `
    <div class="light-card-header">
      <strong>${shortType} #${id}</strong>
      <button class="btn-remove" title="Supprimer">×</button>
    </div>
    <div class="controls">
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
      pushUndo({
        label: 'Modif. lumière #' + id,
        undo: () => {
          const cur = lights.find((l) => l.id === id);
          if (cur) applyLightState(cur, before);
        },
      });
      // ré-armer après la fin du geste (change/pointerup)
      setTimeout(() => { armed = false; }, 800);
    };
  })();

  card.querySelector('.btn-remove').addEventListener('click', () => removeLight(id));

  card.querySelector('.ctrl-color').addEventListener('pointerdown', pushLightModUndo);
  card.querySelector('.ctrl-color').addEventListener('input', (e) => {
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
document.getElementById('btn-add-ambient').addEventListener('click', () => addLight('AmbientLight'));
document.getElementById('btn-add-directional').addEventListener('click', () => addLight('DirectionalLight'));
document.getElementById('btn-add-point').addEventListener('click', () => addLight('PointLight'));
document.getElementById('btn-add-spot').addEventListener('click', () => addLight('SpotLight'));

// Default lights for a nice starting point (good for car models)
skipLightUndo = true;
addLight('AmbientLight');
addLight('DirectionalLight');
skipLightUndo = false;
updateUndoMenu();

// ========== Resize & render loop ==========
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', onResize);

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
  renderer.render(scene, camera);
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
  pushUndo({
    label: "Réinit. matériaux",
    undo: () => restoreMaterialsSnap(matSnap),
  });
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
  refreshMaterialSelect(false);
  scheduleSavePrefs();
  setStatus("Matériaux d'origine restaurés (" + n + " mesh).");
}

function collectMaterials() {
  materialEntries = [];
  if (!currentModel) return materialEntries;
  const map = new Map();
  let autoIdx = 0;
  currentModel.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((m, mi) => {
      // Use object identity as key
      let entry = map.get(m);
      if (!entry) {
        const label = m.name || child.userData?.matName || child.name || (`Matériau ${++autoIdx}`);
        if (!m.name) m.name = label;
        entry = { key: String(map.size), label, material: m, meshes: [] };
        map.set(m, entry);
        materialEntries.push(entry);
      }
      if (!entry.meshes.includes(child)) entry.meshes.push(child);
    });
  });
  return materialEntries;
}

function refreshMaterialSelect(preserveLabel = true) {
  const sel = document.getElementById('mat-select');
  if (!sel) return;
  const prevLabel = preserveLabel && sel.selectedOptions[0]
    ? sel.selectedOptions[0].textContent
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
    opt.textContent = e.label;
    sel.appendChild(opt);
  });
  let idx = 0;
  if (prevLabel) {
    const found = materialEntries.findIndex((e) => e.label === prevLabel);
    if (found >= 0) idx = found;
  }
  sel.value = String(idx);
  loadMaterialToUI(idx);
}

function getSelectedMaterialEntry() {
  const sel = document.getElementById('mat-select');
  if (!sel || sel.value === '') return null;
  return materialEntries[parseInt(sel.value, 10)] || null;
}

function loadMaterialToUI(index) {
  const entry = materialEntries[index];
  if (!entry) return;
  const m = entry.material;
  const colorEl = document.getElementById('mat-color');
  if (colorEl && m.color) colorEl.value = '#' + m.color.getHexString();
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
  if (em && m.emissive) em.value = '#' + m.emissive.getHexString();
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
  const { color, metal, rough, opacity, transparent, transmission, emissive, emissiveInt } = allValues;
  let mat = m;
  if (transmission > 0.001 && !mat.isMeshPhysicalMaterial) {
    mat = ensurePhysical(mat);
  }
  if (mat.color) mat.color.set(color);
  if (mat.metalness !== undefined) mat.metalness = metal;
  if (mat.roughness !== undefined) mat.roughness = rough;
  mat.opacity = opacity;
  mat.transparent = transparent || opacity < 0.99 || transmission > 0.001;
  if (mat.transmission !== undefined) mat.transmission = transmission;
  if (mat.emissive) mat.emissive.set(emissive);
  if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = emissiveInt;
  if (pendingTexture) {
    mat.map = pendingTexture;
    mat.map.colorSpace = THREE.SRGBColorSpace;
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
  };
}

function applyMaterialsFromUI(applyAll = false) {
  if (!currentModel) {
    setStatus('Aucun modèle chargé.', true);
    return;
  }
  const matSnap = snapshotAllMaterials();
  pushUndo({
    label: applyAll ? 'Matériaux (tous)' : 'Matériau',
    undo: () => restoreMaterialsSnap(matSnap),
  });
  const values = readMatUI();
  if (applyAll) {
    let count = 0;
    collectMaterials();
    materialEntries.forEach((entry) => {
      const newMat = applyToMaterial(entry.material, values);
      entry.meshes.forEach((mesh) => {
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) => (m === entry.material ? newMat : m));
        } else if (mesh.material === entry.material) {
          mesh.material = newMat;
        }
      });
      entry.material = newMat;
      count++;
    });
    setStatus(`Matériaux appliqués sur ${count} entrée(s).`);
    scheduleSavePrefs();
  } else {
    const entry = getSelectedMaterialEntry();
    if (!entry) {
      setStatus('Sélectionne un matériau.', true);
      return;
    }
    const newMat = applyToMaterial(entry.material, values);
    entry.meshes.forEach((mesh) => {
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => (m === entry.material ? newMat : m));
      } else if (mesh.material === entry.material) {
        mesh.material = newMat;
      }
    });
    entry.material = newMat;
    setStatus(`Matériau « ${entry.label} » mis à jour.`);
    // garder le même matériau sélectionné
    refreshMaterialSelect(true);
    scheduleSavePrefs();
    return;
  }
  refreshMaterialSelect(true);
  scheduleSavePrefs();
}

document.getElementById('mat-select')?.addEventListener('change', (e) => {
  const i = parseInt(e.target.value, 10);
  if (!isNaN(i)) loadMaterialToUI(i);
});

['mat-metal', 'mat-rough', 'mat-opacity', 'mat-trans', 'mat-emissive-int'].forEach((id) => {
  const map = {
    'mat-metal': 'val-metal',
    'mat-rough': 'val-rough',
    'mat-opacity': 'val-opacity',
    'mat-trans': 'val-trans',
    'mat-emissive-int': 'val-emissive-int',
  };
  document.getElementById(id)?.addEventListener('input', (e) => {
    const val = document.getElementById(map[id]);
    if (val) val.textContent = parseFloat(e.target.value).toFixed(2);
  });
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
if (aboutUpd) aboutUpd.textContent = APP_UPDATED;

document.getElementById('about-close')?.addEventListener('click', () => {
  aboutModal?.classList.add('hidden');
});
aboutModal?.addEventListener('click', (e) => {
  if (e.target === aboutModal) aboutModal.classList.add('hidden');
});


// Modèle par défaut : 4x4.glb — aucune fenêtre ouverte au départ
showLoader('Chargement du modèle 4x4…');
currentFileKey = fileKeyFromMeta('4x4.glb', 0);
gltfLoader.load(
  '4x4.glb',
  (gltf) => {
    try {
      currentModel = prepareModel(gltf.scene);
      captureOriginalMaterials(currentModel);
      scene.add(currentModel);
      fitCameraToObject(currentModel);
      refreshMaterialSelect();
      restorePrefsAfterLoad();
      setStatus('Modèle 4x4 chargé.');
    } catch (err) {
      console.error(err);
      setStatus('Erreur préparation modèle 4x4', true);
    }
    hideLoader();
  },
  undefined,
  (err) => {
    console.error(err);
    hideLoader();
    setStatus('Impossible de charger 4x4.glb — placez le fichier à côté de index.html', true);
  }
);
