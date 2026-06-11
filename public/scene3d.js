/* ai-mirror — "mirror of many minds" welcome scene.
   Lazy-loaded ESM module. Three.js arrives via the pinned CDN importmap in
   index.html (three@0.182.0). A central reflective mirror panel with one
   glowing orb per provider orbiting on tilted elliptical paths. Hover shows
   the provider label; clicking an orb selects that provider.

   Contract: createMirrorScene(opts) -> handle | throws.
   opts = {
     container: HTMLElement,            // sized box; canvas fills it
     providers: [{ id, label, color }], // brand color per provider
     activeId: string,
     hint: string,                      // i18n caption + aria label
     tooltipFor: (label) => string,     // i18n tooltip text
     onSelect: (id) => void,            // same code path as the pills
   }
   handle = { setActive(id), refreshTheme(), setHint(hint), resume(), dispose() }
*/

import * as THREE from "three";

const DEG = Math.PI / 180;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function currentTheme() {
  return {
    mode: document.documentElement.getAttribute("data-mode") === "dark" ? "dark" : "light",
    accent: cssVar("--accent") || "#10a37f",
  };
}

/* Small equirect gradient canvas used as scene.environment so the
   MeshPhysicalMaterial mirror has something elegant to reflect. Tinted with
   the active brand accent and flipped for light/dark mode. */
function makeEnvTexture(mode, accent) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const g = c.getContext("2d");
  const acc = new THREE.Color(accent);
  const accCss = (a) => `rgba(${Math.round(acc.r * 255)},${Math.round(acc.g * 255)},${Math.round(acc.b * 255)},${a})`;

  const sky = g.createLinearGradient(0, 0, 0, 64);
  if (mode === "dark") {
    sky.addColorStop(0, "#3c4150");
    sky.addColorStop(0.45, "#181c26");
    sky.addColorStop(0.55, "#0b0d13");
    sky.addColorStop(1, "#05060a");
  } else {
    sky.addColorStop(0, "#ffffff");
    sky.addColorStop(0.45, "#dfe5ee");
    sky.addColorStop(0.55, "#aab4c4");
    sky.addColorStop(1, "#6c7686");
  }
  g.fillStyle = sky;
  g.fillRect(0, 0, 128, 64);

  // Accent wash + a few horizontal light streaks for interesting reflections.
  g.fillStyle = accCss(mode === "dark" ? 0.28 : 0.2);
  g.fillRect(0, 18, 128, 14);
  g.fillStyle = mode === "dark" ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.85)";
  g.fillRect(0, 10, 128, 2.5);
  g.fillRect(0, 36, 128, 1.5);
  g.fillStyle = accCss(mode === "dark" ? 0.5 : 0.34);
  g.fillRect(0, 26, 128, 2);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* Soft radial sprite used as per-orb halo glow. */
function makeHaloTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,0.95)");
  grad.addColorStop(0.32, "rgba(255,255,255,0.42)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export function createMirrorScene(opts) {
  const { container, providers, onSelect } = opts;
  let activeId = opts.activeId;
  let disposed = false;
  let rafId = 0;
  let running = false;
  let elapsed = 0;
  let lastTs = 0;
  let theme = currentTheme();

  // ---------- renderer / scene / camera ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.className = "scene-canvas";
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", opts.hint || "");
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  let envTex = makeEnvTexture(theme.mode, theme.accent);
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(35, 2, 0.1, 50);
  camera.position.set(0, 0.45, 8.2);
  camera.lookAt(0, 0, 0);

  const ambient = new THREE.AmbientLight(0xffffff, theme.mode === "dark" ? 0.35 : 0.7);
  const keyLight = new THREE.DirectionalLight(0xffffff, theme.mode === "dark" ? 0.9 : 1.2);
  keyLight.position.set(3, 5, 6);
  const accentLight = new THREE.PointLight(new THREE.Color(theme.accent), 14, 0, 2);
  accentLight.position.set(-3.4, 2.2, 3.4);
  scene.add(ambient, keyLight, accentLight);

  // ---------- the mirror ----------
  const mirrorGroup = new THREE.Group();
  scene.add(mirrorGroup);

  const MW = 2.35, MH = 3.15, MR = 0.34;
  const faceGeo = new THREE.ExtrudeGeometry(roundedRectShape(MW, MH, MR), {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 3,
    curveSegments: 24,
  });
  faceGeo.translate(0, 0, -0.05);
  const faceMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 1,
    roughness: 0.07,
    envMapIntensity: 1.5,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  });
  const face = new THREE.Mesh(faceGeo, faceMat);

  const frameGeo = new THREE.ExtrudeGeometry(roundedRectShape(MW + 0.22, MH + 0.22, MR + 0.1), {
    depth: 0.08,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
    curveSegments: 24,
  });
  frameGeo.translate(0, 0, -0.13);
  const frameMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(theme.accent),
    metalness: 0.65,
    roughness: 0.35,
    emissive: new THREE.Color(theme.accent),
    emissiveIntensity: 0.22,
  });
  const frame = new THREE.Mesh(frameGeo, frameMat);
  mirrorGroup.add(frame, face);

  // ---------- orbs (one per provider) ----------
  const haloTex = makeHaloTexture();
  const orbGeo = new THREE.SphereGeometry(0.135, 28, 18);
  const orbs = [];
  const orbMeshes = [];

  providers.forEach((p, i) => {
    const n = providers.length;
    const color = new THREE.Color(p.color || "#888888");
    const pivot = new THREE.Group();
    // Tilted elliptical orbit: each pivot gets its own yaw + tilt so the
    // 11 paths weave a loose shell around the mirror.
    pivot.rotation.y = i * GOLDEN;
    pivot.rotation.z = (12 + (i % 5) * 9) * DEG * (i % 2 ? 1 : -1);
    pivot.rotation.x = ((i % 3) - 1) * 7 * DEG;
    scene.add(pivot);

    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.8,
      metalness: 0.25,
      roughness: 0.32,
    });
    const mesh = new THREE.Mesh(orbGeo, mat);
    mesh.userData.providerId = p.id;
    pivot.add(mesh);

    const haloMat = new THREE.SpriteMaterial({
      map: haloTex,
      color,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(0.78);
    pivot.add(halo);

    const orb = {
      id: p.id,
      label: p.label,
      pivot, mesh, halo, mat, haloMat,
      a: 2.55 + (i % 4) * 0.28,          // semi-major axis
      b: 1.35 + ((i * 7) % 5) * 0.16,    // semi-minor axis
      speed: (0.22 + ((i * 3) % 5) * 0.05) * (i % 2 ? 1 : -1),
      phase: (i / n) * Math.PI * 2 + i * 0.7,
      radius: 1, radiusTarget: 1,         // active orbs orbit closer
      glow: 0.8, glowTarget: 0.8,
      scale: 1, scaleTarget: 1,
      hovered: false,
    };
    orbs.push(orb);
    orbMeshes.push(mesh);
  });

  // ---------- HTML overlays (tooltip + hint) ----------
  const tooltip = document.createElement("div");
  tooltip.className = "scene-tooltip";
  tooltip.setAttribute("aria-hidden", "true");
  container.appendChild(tooltip);

  const hintEl = document.createElement("div");
  hintEl.className = "scene-hint";
  hintEl.textContent = opts.hint || "";
  container.appendChild(hintEl);

  // ---------- interaction ----------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-10, -10);
  const parallax = { x: 0, y: 0 };
  let hoveredOrb = null;
  let downAt = null;

  function pointerToNDC(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    return true;
  }

  function pickOrb() {
    raycaster.setFromCamera(pointer, camera);
    // Include the mirror face so orbs occluded behind it can't be picked.
    const hits = raycaster.intersectObjects([face, ...orbMeshes], false);
    if (!hits.length || hits[0].object === face) return null;
    const id = hits[0].object.userData.providerId;
    return orbs.find((o) => o.id === id) || null;
  }

  function setHover(orb) {
    if (hoveredOrb === orb) return;
    if (hoveredOrb) hoveredOrb.hovered = false;
    hoveredOrb = orb;
    if (orb) {
      orb.hovered = true;
      tooltip.textContent = opts.tooltipFor ? opts.tooltipFor(orb.label) : orb.label;
      tooltip.classList.add("show");
      renderer.domElement.style.cursor = "pointer";
    } else {
      tooltip.classList.remove("show");
      renderer.domElement.style.cursor = "";
    }
  }

  function onPointerMove(e) {
    if (!pointerToNDC(e)) return;
    parallax.x = pointer.x;
    parallax.y = pointer.y;
    setHover(pickOrb());
  }

  function onPointerLeave() {
    pointer.set(-10, -10);
    parallax.x = 0;
    parallax.y = 0;
    setHover(null);
  }

  function onPointerDown(e) {
    downAt = { x: e.clientX, y: e.clientY };
  }

  function onPointerUp(e) {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 8) return;
    if (!pointerToNDC(e)) return;
    const orb = pickOrb();
    if (orb && orb.id !== activeId && typeof onSelect === "function") {
      onSelect(orb.id);
    }
  }

  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerleave", onPointerLeave);
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointerup", onPointerUp);

  // ---------- sizing ----------
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // ---------- active provider emphasis ----------
  function applyActive() {
    for (const o of orbs) {
      const active = o.id === activeId;
      o.radiusTarget = active ? 0.74 : 1;
      o.glowTarget = active ? 1.7 : 0.8;
      o.scaleTarget = active ? 1.45 : 1;
    }
  }
  applyActive();

  // ---------- animation loop ----------
  const tipVec = new THREE.Vector3();

  function frameStep(ts) {
    rafId = requestAnimationFrame(frameStep);
    const dt = Math.min((ts - lastTs) / 1000 || 0.016, 0.05);
    lastTs = ts;
    elapsed += dt;
    const t = elapsed;

    // Mirror: gentle idle sway + pointer parallax.
    const targetRotY = Math.sin(t * 0.32) * 0.1 + parallax.x * 0.16;
    const targetRotX = Math.cos(t * 0.26) * 0.045 - parallax.y * 0.09;
    mirrorGroup.rotation.y += (targetRotY - mirrorGroup.rotation.y) * Math.min(1, dt * 3);
    mirrorGroup.rotation.x += (targetRotX - mirrorGroup.rotation.x) * Math.min(1, dt * 3);
    mirrorGroup.position.y = Math.sin(t * 0.55) * 0.06;

    for (const o of orbs) {
      const k = Math.min(1, dt * 4);
      o.radius += (o.radiusTarget - o.radius) * k;
      o.glow += (o.glowTarget - o.glow) * k;
      o.scale += ((o.hovered ? o.scaleTarget * 1.22 : o.scaleTarget) - o.scale) * Math.min(1, dt * 8);

      const th = o.phase + t * o.speed;
      const x = Math.cos(th) * o.a * o.radius;
      const z = Math.sin(th) * o.b * o.radius;
      o.mesh.position.set(x, 0, z);
      o.halo.position.copy(o.mesh.position);

      const pulse = 1 + 0.07 * Math.sin(t * 1.9 + o.phase * 3);
      o.mesh.scale.setScalar(o.scale * pulse);
      o.halo.scale.setScalar(0.78 * o.scale * (1 + 0.16 * Math.sin(t * 1.9 + o.phase * 3)));
      o.mat.emissiveIntensity = o.glow * (1 + 0.25 * Math.sin(t * 2.3 + o.phase * 2));
      o.haloMat.opacity = (theme.mode === "dark" ? 0.62 : 0.4) * Math.min(1.6, o.glow) * (o.hovered ? 1.25 : 1);
    }

    // Keep the tooltip pinned to the hovered orb.
    if (hoveredOrb) {
      hoveredOrb.mesh.getWorldPosition(tipVec).project(camera);
      const rect = renderer.domElement;
      const px = (tipVec.x * 0.5 + 0.5) * rect.clientWidth;
      const py = (-tipVec.y * 0.5 + 0.5) * rect.clientHeight;
      tooltip.style.transform = `translate(-50%, -130%) translate(${px}px, ${py}px)`;
    }

    renderer.render(scene, camera);
  }

  function start() {
    if (running || disposed) return;
    running = true;
    lastTs = performance.now();
    rafId = requestAnimationFrame(frameStep);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }
  document.addEventListener("visibilitychange", onVisibility);
  start();

  // ---------- public handle ----------
  return {
    setActive(id) {
      activeId = id;
      applyActive();
    },
    refreshTheme() {
      theme = currentTheme();
      const old = envTex;
      envTex = makeEnvTexture(theme.mode, theme.accent);
      scene.environment = envTex;
      old.dispose();
      const acc = new THREE.Color(theme.accent);
      frameMat.color.copy(acc);
      frameMat.emissive.copy(acc);
      accentLight.color.copy(acc);
      ambient.intensity = theme.mode === "dark" ? 0.35 : 0.7;
      keyLight.intensity = theme.mode === "dark" ? 0.9 : 1.2;
    },
    setHint(hint) {
      hintEl.textContent = hint || "";
      renderer.domElement.setAttribute("aria-label", hint || "");
    },
    resume() {
      resize();
      if (!document.hidden) start();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      ro.disconnect();
      faceGeo.dispose();
      frameGeo.dispose();
      orbGeo.dispose();
      faceMat.dispose();
      frameMat.dispose();
      for (const o of orbs) {
        o.mat.dispose();
        o.haloMat.dispose();
      }
      haloTex.dispose();
      envTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      tooltip.remove();
      hintEl.remove();
    },
  };
}
