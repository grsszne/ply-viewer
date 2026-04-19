import * as THREE from "https://esm.sh/three@0.181.1";
import { OrbitControls } from "https://esm.sh/three@0.181.1/examples/jsm/controls/OrbitControls.js";
import { PLYLoader } from "https://esm.sh/three@0.181.1/examples/jsm/loaders/PLYLoader.js";

const state = {
  cloud: null,
  autoRadius: 0.01,
  radiusMultiplier: 1,
  minSize: 2,
  maxSize: 72,
  background: "dark",
  activeFileName: null,
};

const viewport = document.querySelector("#viewport");
const statusEl = document.querySelector("#status");
const fileInput = document.querySelector("#file-input");
const browseButton = document.querySelector("#browse-button");
const resetViewButton = document.querySelector("#reset-view-button");
const dropzone = document.querySelector("#dropzone");
const radiusSlider = document.querySelector("#radius-slider");
const radiusOutput = document.querySelector("#radius-output");
const minSizeSlider = document.querySelector("#min-size-slider");
const minSizeOutput = document.querySelector("#min-size-output");
const maxSizeSlider = document.querySelector("#max-size-slider");
const maxSizeOutput = document.querySelector("#max-size-output");
const themeToggle = document.querySelector("#theme-toggle");

const statFile = document.querySelector("#stat-file");
const statPoints = document.querySelector("#stat-points");
const statBounds = document.querySelector("#stat-bounds");
const statRadius = document.querySelector("#stat-radius");

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 1, 0.01, 2000);
camera.position.set(2.6, 1.9, 2.8);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
controls.zoomSpeed = 0.85;
controls.target.set(0, 0, 0);

const grid = new THREE.GridHelper(10, 20, 0x56483c, 0x2d2621);
grid.material.opacity = 0.45;
grid.material.transparent = true;
scene.add(grid);

const ambientLight = new THREE.HemisphereLight(0xfbf0df, 0x1b1815, 0.75);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 0.6);
keyLight.position.set(3, 5, 6);
scene.add(keyLight);

const placeholder = new THREE.Group();
const placeholderSphere = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.5, 4),
  new THREE.MeshStandardMaterial({
    color: 0xc07a4e,
    roughness: 0.35,
    metalness: 0.0,
    transparent: true,
    opacity: 0.85,
  }),
);
const placeholderRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.86, 0.02, 20, 80),
  new THREE.MeshBasicMaterial({ color: 0xf5dcc6, transparent: true, opacity: 0.25 }),
);
placeholderRing.rotation.x = Math.PI / 2;
placeholder.add(placeholderSphere, placeholderRing);
scene.add(placeholder);

const loader = new PLYLoader();

const numberFormatter = new Intl.NumberFormat("en-US");

function setStatus(message) {
  statusEl.textContent = message;
}

function setTheme(theme) {
  state.background = theme;
  document.body.dataset.theme = theme;
  const isDark = theme === "dark";
  scene.background = new THREE.Color(isDark ? 0x151311 : 0xefebe3);
  grid.material.color.setHex(isDark ? 0x2d2621 : 0xd8d0c5);
  grid.material.opacity = isDark ? 0.45 : 0.6;
}

function resize() {
  const { clientWidth, clientHeight } = viewport;
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(clientWidth, clientHeight, false);
  if (state.cloud) {
    state.cloud.material.uniforms.uViewportHeight.value = clientHeight;
  }
}

function formatBounds(box) {
  const size = new THREE.Vector3();
  box.getSize(size);
  return `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`;
}

function ensureColorAttribute(geometry) {
  const source = geometry.getAttribute("color");
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);

  if (source) {
    for (let i = 0; i < count; i += 1) {
      const r = source.getX(i);
      const g = source.getY(i);
      const b = source.getZ(i);
      const scale = r > 1 || g > 1 || b > 1 ? 255 : 1;
      colors[i * 3] = r / scale;
      colors[i * 3 + 1] = g / scale;
      colors[i * 3 + 2] = b / scale;
    }
  } else {
    colors.fill(0.86);
  }

  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
}

function estimatePointRadius(geometry) {
  const position = geometry.getAttribute("position");
  const count = position.count;
  if (count < 2) {
    return 0.01;
  }

  const sampleCount = Math.min(count, 720);
  const step = Math.max(1, Math.floor(count / sampleCount));
  const nearestDistances = [];

  for (let i = 0; i < count && nearestDistances.length < sampleCount; i += step) {
    const ax = position.getX(i);
    const ay = position.getY(i);
    const az = position.getZ(i);
    let nearestSquared = Infinity;

    for (let j = 0; j < count; j += step) {
      if (i === j) {
        continue;
      }
      const dx = ax - position.getX(j);
      const dy = ay - position.getY(j);
      const dz = az - position.getZ(j);
      const squared = dx * dx + dy * dy + dz * dz;
      if (squared > 0 && squared < nearestSquared) {
        nearestSquared = squared;
      }
    }

    if (Number.isFinite(nearestSquared)) {
      nearestDistances.push(Math.sqrt(nearestSquared));
    }
  }

  nearestDistances.sort((a, b) => a - b);
  const median = nearestDistances[Math.floor(nearestDistances.length / 2)];
  if (Number.isFinite(median) && median > 0) {
    return median * 0.65;
  }

  geometry.computeBoundingBox();
  const diagonal = geometry.boundingBox.getSize(new THREE.Vector3()).length();
  return diagonal / Math.max(Math.cbrt(count) * 42, 1);
}

function createSplatMaterial() {
  return new THREE.ShaderMaterial({
    transparent: false,
    depthTest: true,
    depthWrite: true,
    vertexColors: true,
    extensions: {
      fragDepth: true,
    },
    uniforms: {
      uRadius: { value: 0.01 },
      uViewportHeight: { value: viewport.clientHeight },
      uMinSize: { value: state.minSize },
      uMaxSize: { value: state.maxSize },
      uLightDirection: { value: new THREE.Vector3(0.34, 0.48, 1).normalize() },
    },
    vertexShader: `
      uniform float uRadius;
      uniform float uViewportHeight;
      uniform float uMinSize;
      uniform float uMaxSize;

      varying vec3 vColor;
      varying vec3 vViewCenter;
      varying float vRadius;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewCenter = mvPosition.xyz;
        vRadius = uRadius;
        vColor = color;

        gl_Position = projectionMatrix * mvPosition;

        float projectedRadius = projectionMatrix[1][1] * uViewportHeight * uRadius / max(0.0001, -mvPosition.z);
        gl_PointSize = clamp(projectedRadius * 2.0, uMinSize, uMaxSize);
      }
    `,
    fragmentShader: `
      uniform mat4 projectionMatrix;
      uniform vec3 uLightDirection;

      varying vec3 vColor;
      varying vec3 vViewCenter;
      varying float vRadius;

      void main() {
        vec2 uv = gl_PointCoord.xy * 2.0 - 1.0;
        float radialSquared = dot(uv, uv);
        if (radialSquared > 1.0) {
          discard;
        }

        float z = sqrt(1.0 - radialSquared);
        vec3 normal = normalize(vec3(uv.x, -uv.y, z));

        float light = 0.32 + 0.68 * max(dot(normal, normalize(uLightDirection)), 0.0);
        float rim = pow(1.0 - z, 2.5) * 0.12;
        vec3 shadedColor = vColor * light + rim;

        vec4 viewPosition = vec4(vViewCenter + normal * vRadius, 1.0);
        vec4 clipPosition = projectionMatrix * viewPosition;
        float ndcDepth = clipPosition.z / clipPosition.w;

        gl_FragDepth = ndcDepth * 0.5 + 0.5;
        gl_FragColor = vec4(shadedColor, 1.0);
      }
    `,
  });
}

function fitCameraToSphere(sphere) {
  const radius = Math.max(sphere.radius, 0.01);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const distance = radius / Math.sin(fov / 2) * 1.15;
  const direction = new THREE.Vector3(1.15, 0.92, 1.08).normalize();

  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(direction, distance);
  camera.near = Math.max(radius / 1000, 0.001);
  camera.far = Math.max(distance * 25, 100);
  camera.updateProjectionMatrix();

  controls.minDistance = radius * 0.02;
  controls.maxDistance = radius * 60;
  controls.update();
}

function updateMaterialRadius() {
  if (!state.cloud) {
    return;
  }
  state.cloud.material.uniforms.uRadius.value = state.autoRadius * state.radiusMultiplier;
  state.cloud.material.uniforms.uMinSize.value = state.minSize;
  state.cloud.material.uniforms.uMaxSize.value = state.maxSize;
  statRadius.textContent = `${(state.autoRadius * state.radiusMultiplier).toExponential(2)} world units`;
}

function clearCurrentCloud() {
  if (!state.cloud) {
    return;
  }
  scene.remove(state.cloud);
  state.cloud.geometry.dispose();
  state.cloud.material.dispose();
  state.cloud = null;
}

function loadGeometry(geometry, fileName) {
  clearCurrentCloud();
  placeholder.visible = false;

  geometry = geometry.toNonIndexed();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  ensureColorAttribute(geometry);

  const material = createSplatMaterial();
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  state.cloud = points;
  state.activeFileName = fileName;
  state.autoRadius = estimatePointRadius(geometry);
  scene.add(points);

  updateMaterialRadius();
  fitCameraToSphere(geometry.boundingSphere);

  statFile.textContent = fileName;
  statPoints.textContent = numberFormatter.format(geometry.getAttribute("position").count);
  statBounds.textContent = formatBounds(geometry.boundingBox);
  setStatus(`Loaded ${fileName}`);
}

async function readFile(file) {
  setStatus(`Loading ${file.name}...`);
  const buffer = await file.arrayBuffer();
  const geometry = loader.parse(buffer);
  loadGeometry(geometry, file.name);
}

async function readUrl(url) {
  setStatus(`Fetching ${url}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const geometry = loader.parse(await response.arrayBuffer());
  const fileName = url.split("/").pop() || "remote.ply";
  loadGeometry(geometry, fileName);
}

function animate() {
  requestAnimationFrame(animate);
  placeholder.rotation.y += 0.003;
  controls.update();
  renderer.render(scene, camera);
}

function updateOutputs() {
  radiusOutput.textContent = `${state.radiusMultiplier.toFixed(2)}x`;
  minSizeOutput.textContent = `${state.minSize.toFixed(1)} px`;
  maxSizeOutput.textContent = `${state.maxSize.toFixed(0)} px`;
}

function handleDroppedFiles(fileList) {
  const file = [...fileList].find((entry) => entry.name.toLowerCase().endsWith(".ply"));
  if (!file) {
    setStatus("Drop a .ply file.");
    return;
  }

  readFile(file).catch((error) => {
    console.error(error);
    setStatus(`Could not read ${file.name}: ${error.message}`);
  });
}

browseButton.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files?.length) {
    handleDroppedFiles(fileInput.files);
  }
});

for (const eventName of ["dragenter", "dragover"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragover");
  });
}

for (const eventName of ["dragleave", "dragend", "drop"]) {
  dropzone.addEventListener(eventName, () => {
    dropzone.classList.remove("is-dragover");
  });
}

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  if (event.dataTransfer?.files) {
    handleDroppedFiles(event.dataTransfer.files);
  }
});

resetViewButton.addEventListener("click", () => {
  if (state.cloud?.geometry.boundingSphere) {
    fitCameraToSphere(state.cloud.geometry.boundingSphere);
  }
});

radiusSlider.addEventListener("input", (event) => {
  state.radiusMultiplier = Number(event.target.value);
  updateOutputs();
  updateMaterialRadius();
});

minSizeSlider.addEventListener("input", (event) => {
  state.minSize = Number(event.target.value);
  updateOutputs();
  updateMaterialRadius();
});

maxSizeSlider.addEventListener("input", (event) => {
  state.maxSize = Number(event.target.value);
  updateOutputs();
  updateMaterialRadius();
});

themeToggle.addEventListener("change", (event) => {
  setTheme(event.target.checked ? "dark" : "light");
});

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "f" && state.cloud?.geometry.boundingSphere) {
    fitCameraToSphere(state.cloud.geometry.boundingSphere);
  }
});

const searchParams = new URLSearchParams(window.location.search);
const initialFile = searchParams.get("file");

updateOutputs();
setTheme("dark");
resize();
animate();

if (initialFile) {
  readUrl(initialFile).catch((error) => {
    console.error(error);
    setStatus(`Could not fetch ${initialFile}: ${error.message}`);
  });
}
