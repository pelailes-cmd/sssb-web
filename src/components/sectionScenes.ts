import * as THREE from 'three';

export const sceneVariants = [
  'overview',
  'services',
  'products',
  'promotions',
  'documentation',
  'portfolio',
  'contact',
  'about',
] as const;

export type SceneVariant = (typeof sceneVariants)[number];

export type SceneInstance = {
  group: THREE.Group;
  /** Called with damped scroll progress (0–1) and damped pointer offsets (−1–1). */
  update: (progress: number, pointerX: number, pointerY: number) => void;
  textures?: THREE.Texture[];
};

export type SceneDefinition = {
  camera: {
    fov: number;
    from: [number, number, number];
    to: [number, number, number];
    lookAt: [number, number, number];
  };
  /** World radius the composition occupies; the renderer scales it down to fit narrow frames. */
  fitRadius: number;
  build: (mobile: boolean) => SceneInstance;
};

/** Colors mirror the palette custom properties declared at the top of styles.css. */
const palette = {
  blue700: 0x0768b2,
  blue500: 0x18a2e3,
  cyan300: 0x78d9e9,
  cyan100: 0xdff7fb,
  solar: 0xf1e92e,
  leaf: 0xa8cd3a,
};

/** Seeded so every visitor sees the same composition instead of a per-load reshuffle. */
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Smoothstep easing keeps the scroll-linked motion from starting or stopping abruptly. */
const ease = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

/** Staggers a shared progress value so grouped objects animate in sequence. */
const stagger = (progress: number, index: number, count: number, overlap = 0.55) => {
  const span = 1 / Math.max(1, count - 1 + overlap);
  return ease((progress - index * span * (1 - overlap)) / (span + overlap * span));
};

function createRadialTexture(stops: Array<[number, string]>) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 64);
    stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const basic = (color: number, opacity: number, additive = false) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });

const line = (color: number, opacity: number) =>
  new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

/**
 * Overview — an energy lattice of nodes and links that opens outward while it turns.
 */
function buildOverview(mobile: boolean): SceneInstance {
  const group = new THREE.Group();
  const random = seededRandom(0x5501);
  const nodeCount = mobile ? 26 : 46;
  const linkDistance = mobile ? 2.5 : 2.2;

  const nodes: THREE.Vector3[] = [];
  for (let index = 0; index < nodeCount; index += 1) {
    nodes.push(
      new THREE.Vector3((random() - 0.5) * 11, (random() - 0.5) * 6.2, (random() - 0.5) * 7.5),
    );
  }

  const linkPoints: number[] = [];
  for (let a = 0; a < nodes.length; a += 1) {
    for (let b = a + 1; b < nodes.length; b += 1) {
      if (nodes[a].distanceTo(nodes[b]) > linkDistance) continue;
      linkPoints.push(nodes[a].x, nodes[a].y, nodes[a].z, nodes[b].x, nodes[b].y, nodes[b].z);
    }
  }

  const linkGeometry = new THREE.BufferGeometry();
  linkGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linkPoints, 3));
  const linkMaterial = line(palette.blue700, 0.3);
  group.add(new THREE.LineSegments(linkGeometry, linkMaterial));

  const nodeGeometry = new THREE.BufferGeometry().setFromPoints(nodes);
  const nodeTexture = createRadialTexture([
    [0, 'rgba(255,255,255,1)'],
    [0.35, 'rgba(24,162,227,0.85)'],
    [1, 'rgba(24,162,227,0)'],
  ]);
  const nodeMaterial = new THREE.PointsMaterial({
    color: palette.blue500,
    map: nodeTexture,
    size: mobile ? 0.42 : 0.34,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    sizeAttenuation: true,
  });
  group.add(new THREE.Points(nodeGeometry, nodeMaterial));

  return {
    group,
    textures: [nodeTexture],
    update: (progress, pointerX, pointerY) => {
      const eased = ease(progress);
      group.rotation.y = -0.45 + eased * 0.9 + pointerX * 0.08;
      group.rotation.x = 0.12 + eased * 0.16 + pointerY * 0.05;
      group.scale.setScalar(0.86 + eased * 0.26);
      linkMaterial.opacity = 0.1 + eased * 0.3;
      nodeMaterial.opacity = 0.35 + eased * 0.5;
    },
  };
}

/**
 * Services — a wireframe core inside counter-rotating orbital rings.
 */
function buildServices(mobile: boolean): SceneInstance {
  const group = new THREE.Group();

  const coreGeometry = new THREE.IcosahedronGeometry(mobile ? 1.5 : 1.85, 1);
  const coreMaterial = line(palette.cyan300, 0.32);
  const core = new THREE.LineSegments(new THREE.WireframeGeometry(coreGeometry), coreMaterial);
  coreGeometry.dispose();
  group.add(core);

  const glowTexture = createRadialTexture([
    [0, 'rgba(255,252,186,0.95)'],
    [0.3, 'rgba(241,233,46,0.35)'],
    [1, 'rgba(24,162,227,0)'],
  ]);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.scale.setScalar(mobile ? 5.4 : 6.8);
  group.add(glow);

  const ringGeometry = new THREE.TorusGeometry(1, 0.008, 3, mobile ? 72 : 128);
  const rings = [
    { radius: mobile ? 2.6 : 3.2, tilt: [1.15, 0.2, 0.4], color: palette.blue500, speed: 1 },
    { radius: mobile ? 3.3 : 4.1, tilt: [0.5, 0.9, -0.3], color: palette.cyan300, speed: -0.72 },
    { radius: mobile ? 4.0 : 5.0, tilt: [1.5, -0.4, 0.9], color: palette.solar, speed: 0.46 },
  ].map((config) => {
    const material = basic(config.color, 0.4);
    const mesh = new THREE.Mesh(ringGeometry, material);
    mesh.scale.setScalar(config.radius);
    mesh.rotation.set(config.tilt[0], config.tilt[1], config.tilt[2]);
    group.add(mesh);
    return { mesh, material, config };
  });

  return {
    group,
    textures: [glowTexture],
    update: (progress, pointerX, pointerY) => {
      const eased = ease(progress);
      group.rotation.y = pointerX * 0.12 - eased * 0.35;
      group.rotation.x = pointerY * 0.08;
      core.rotation.y = eased * 1.8;
      core.rotation.x = 0.3 + eased * 0.9;
      coreMaterial.opacity = 0.16 + eased * 0.3;
      glow.material.opacity = 0.22 + eased * 0.34;
      rings.forEach(({ mesh, material, config }, index) => {
        mesh.rotation.z = config.tilt[2] + eased * Math.PI * config.speed;
        mesh.rotation.x = config.tilt[0] + eased * 0.4 * config.speed;
        material.opacity = 0.14 + stagger(progress, index, rings.length) * 0.4;
      });
    },
  };
}

/**
 * Products — a staggered array of panels that lifts and fans as the catalog scrolls past.
 */
function buildProducts(mobile: boolean): SceneInstance {
  const group = new THREE.Group();
  const columns = mobile ? 3 : 5;
  const rows = mobile ? 3 : 4;
  const panelGeometry = new THREE.BoxGeometry(1.5, 0.05, 0.92);
  const edgeGeometry = new THREE.EdgesGeometry(panelGeometry);

  const panels: Array<{
    pivot: THREE.Group;
    material: THREE.MeshBasicMaterial;
    edgeMaterial: THREE.LineBasicMaterial;
    baseY: number;
    index: number;
  }> = [];

  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const pivot = new THREE.Group();
      const material = basic(palette.blue500, 0.12);
      const edgeMaterial = line(palette.blue700, 0.3);
      pivot.add(new THREE.Mesh(panelGeometry, material));
      pivot.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));

      const baseY = (row - (rows - 1) / 2) * 0.34;
      pivot.position.set((column - (columns - 1) / 2) * 1.85, baseY, (row - (rows - 1) / 2) * 1.35);
      group.add(pivot);
      panels.push({ pivot, material, edgeMaterial, baseY, index });
      index += 1;
    }
  }

  return {
    group,
    update: (progress, pointerX, pointerY) => {
      const eased = ease(progress);
      group.rotation.y = -0.5 + eased * 0.55 + pointerX * 0.06;
      group.rotation.x = 0.18 + pointerY * 0.04;
      panels.forEach((panel) => {
        const local = stagger(progress, panel.index, panels.length, 0.82);
        panel.pivot.position.y = panel.baseY + local * 0.8;
        panel.pivot.rotation.x = -0.32 + local * 0.34;
        panel.pivot.rotation.z = (1 - local) * 0.16;
        panel.material.opacity = 0.03 + local * 0.12;
        panel.edgeMaterial.opacity = 0.06 + local * 0.26;
      });
    },
  };
}

/**
 * Promotions — the sun of the solar offer with cool crystal shards drifting past it.
 */
function buildPromotions(mobile: boolean): SceneInstance {
  const group = new THREE.Group();
  const random = seededRandom(0x9317);

  const glowTexture = createRadialTexture([
    [0, 'rgba(255,255,235,1)'],
    [0.22, 'rgba(241,233,46,0.7)'],
    [0.6, 'rgba(168,205,58,0.12)'],
    [1, 'rgba(168,205,58,0)'],
  ]);
  const sun = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  sun.position.set(mobile ? -1.6 : -3.4, 1.5, -1.2);
  group.add(sun);

  const rayGeometry = new THREE.PlaneGeometry(0.05, mobile ? 3.4 : 4.6);
  const rayMaterial = basic(palette.solar, 0.22, true);
  const rays = new THREE.Group();
  rays.position.copy(sun.position);
  const rayCount = mobile ? 6 : 10;
  for (let index = 0; index < rayCount; index += 1) {
    const ray = new THREE.Mesh(rayGeometry, rayMaterial);
    ray.rotation.z = (index / rayCount) * Math.PI * 2;
    ray.position.set(
      Math.cos((index / rayCount) * Math.PI * 2 + Math.PI / 2) * 1.4,
      Math.sin((index / rayCount) * Math.PI * 2 + Math.PI / 2) * 1.4,
      0,
    );
    rays.add(ray);
  }
  group.add(rays);

  const shardGeometry = new THREE.OctahedronGeometry(0.38, 0);
  const shardEdges = new THREE.EdgesGeometry(shardGeometry);
  const shards: Array<{
    mesh: THREE.LineSegments;
    material: THREE.LineBasicMaterial;
    origin: THREE.Vector3;
    spin: number;
    drift: number;
  }> = [];
  const shardCount = mobile ? 7 : 14;
  for (let index = 0; index < shardCount; index += 1) {
    const material = line(index % 3 === 0 ? palette.blue500 : palette.cyan300, 0.4);
    const mesh = new THREE.LineSegments(shardEdges, material);
    const origin = new THREE.Vector3(
      (random() - 0.5) * 12,
      2.6 + random() * 3.4,
      (random() - 0.5) * 5,
    );
    mesh.position.copy(origin);
    mesh.scale.setScalar(0.6 + random() * 0.9);
    group.add(mesh);
    shards.push({ mesh, material, origin, spin: random() * 2 - 1, drift: 3.6 + random() * 3.4 });
  }
  shardGeometry.dispose();

  return {
    group,
    textures: [glowTexture],
    update: (progress, pointerX, pointerY) => {
      const eased = ease(progress);
      group.rotation.y = pointerX * 0.07;
      group.rotation.x = pointerY * 0.04;
      sun.scale.setScalar((mobile ? 5.2 : 7.2) * (0.82 + eased * 0.3));
      sun.material.opacity = 0.3 + eased * 0.35;
      rays.rotation.z = eased * 0.7;
      rayMaterial.opacity = 0.05 + eased * 0.2;
      shards.forEach((shard, index) => {
        const local = stagger(progress, index, shards.length, 0.9);
        shard.mesh.position.y = shard.origin.y - local * shard.drift;
        shard.mesh.position.x = shard.origin.x + Math.sin(local * Math.PI) * 0.7 * shard.spin;
        shard.mesh.rotation.y = local * Math.PI * 1.6 * shard.spin;
        shard.mesh.rotation.x = local * Math.PI * 1.1;
        shard.material.opacity = Math.sin(clamp01(local) * Math.PI) * 0.42;
      });
    },
  };
}

/**
 * Documentation — a stack of sheets that fans into a helix, standing in for the future library.
 */
function buildDocumentation(mobile: boolean): SceneInstance {
  const group = new THREE.Group();
  const sheetGeometry = new THREE.PlaneGeometry(2.4, 3.2);
  const sheetEdges = new THREE.EdgesGeometry(sheetGeometry);
  const count = mobile ? 7 : 12;

  const sheets = Array.from({ length: count }, (_, index) => {
    const pivot = new THREE.Group();
    const material = basic(palette.cyan100, 0.16);
    const edgeMaterial = line(palette.blue700, 0.34);
    pivot.add(new THREE.Mesh(sheetGeometry, material));
    pivot.add(new THREE.LineSegments(sheetEdges, edgeMaterial));
    pivot.position.y = (index - (count - 1) / 2) * 0.12;
    group.add(pivot);
    return { pivot, material, edgeMaterial, index };
  });

  return {
    group,
    update: (progress, pointerX, pointerY) => {
      const eased = ease(progress);
      group.rotation.y = -0.35 + eased * 0.5 + pointerX * 0.07;
      group.rotation.x = 0.14 + pointerY * 0.04;
      sheets.forEach((sheet) => {
        const local = stagger(progress, sheet.index, sheets.length, 0.75);
        const angle = local * Math.PI * 0.85 + sheet.index * 0.16;
        sheet.pivot.position.x = Math.sin(angle) * local * (mobile ? 2.4 : 3.6);
        sheet.pivot.position.z = Math.cos(angle) * local * (mobile ? 1.4 : 2.2) - local * 1.2;
        sheet.pivot.position.y = (sheet.index - (sheets.length - 1) / 2) * (0.12 + local * 0.34);
        sheet.pivot.rotation.y = angle;
        sheet.pivot.rotation.z = (1 - local) * 0.1;
        sheet.material.opacity = 0.04 + local * 0.14;
        sheet.edgeMaterial.opacity = 0.08 + local * 0.28;
      });
    },
  };
}

/**
 * Portfolio — a wireframe rooftop grid that rises out of the plane, ready for real projects.
 */
function buildPortfolio(mobile: boolean): SceneInstance {
  const group = new THREE.Group();
  const random = seededRandom(0x2f70);
  const columns = mobile ? 4 : 7;
  const rows = mobile ? 4 : 6;
  const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
  const blockEdges = new THREE.WireframeGeometry(blockGeometry);
  blockGeometry.dispose();

  const blocks: Array<{
    mesh: THREE.LineSegments;
    material: THREE.LineBasicMaterial;
    height: number;
    index: number;
  }> = [];

  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const material = line(random() > 0.78 ? palette.solar : palette.cyan300, 0.3);
      const mesh = new THREE.LineSegments(blockEdges, material);
      const height = 0.6 + random() * 2.6;
      mesh.position.set((column - (columns - 1) / 2) * 1.28, 0, (row - (rows - 1) / 2) * 1.28);
      mesh.scale.set(0.9, 0.02, 0.9);
      group.add(mesh);
      blocks.push({ mesh, material, height, index });
      index += 1;
    }
  }

  const sweepGeometry = new THREE.PlaneGeometry(mobile ? 8 : 13, mobile ? 8 : 11);
  const sweepMaterial = basic(palette.blue500, 0.1, true);
  const sweep = new THREE.Mesh(sweepGeometry, sweepMaterial);
  sweep.rotation.x = -Math.PI / 2;
  group.add(sweep);

  return {
    group,
    update: (progress, pointerX, pointerY) => {
      const eased = ease(progress);
      group.rotation.y = -0.62 + eased * 0.7 + pointerX * 0.07;
      group.rotation.x = 0.05 + pointerY * 0.03;
      sweep.position.y = eased * 3.4;
      sweepMaterial.opacity = 0.14 * Math.sin(eased * Math.PI);
      blocks.forEach((block) => {
        const local = stagger(progress, block.index, blocks.length, 0.88);
        const height = Math.max(0.02, local * block.height);
        block.mesh.scale.y = height;
        block.mesh.position.y = height / 2;
        block.material.opacity = 0.08 + local * 0.34;
      });
    },
  };
}

/**
 * Contact — pulses expanding from a beacon, echoing the "reach the local team" message.
 */
function buildContact(mobile: boolean): SceneInstance {
  const group = new THREE.Group();
  // Tilted only slightly, so the pulses read as wide rings sweeping past the contact cards.
  group.rotation.x = -Math.PI / 3.8;

  const ringGeometry = new THREE.RingGeometry(0.975, 1, mobile ? 64 : 128);
  const pulseCount = mobile ? 4 : 6;
  const pulses = Array.from({ length: pulseCount }, (_, index) => {
    const material = basic(index % 2 === 0 ? palette.blue500 : palette.cyan300, 0.3);
    const mesh = new THREE.Mesh(ringGeometry, material);
    group.add(mesh);
    return { mesh, material, offset: index / pulseCount };
  });

  const beaconGeometry = new THREE.SphereGeometry(0.24, 18, 14);
  const beaconMaterial = basic(palette.blue700, 0.5);
  const beacon = new THREE.Mesh(beaconGeometry, beaconMaterial);
  group.add(beacon);

  const glowTexture = createRadialTexture([
    [0, 'rgba(120,217,233,0.9)'],
    [0.4, 'rgba(11,131,212,0.28)'],
    [1, 'rgba(11,131,212,0)'],
  ]);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.scale.setScalar(mobile ? 3.6 : 5);
  group.add(glow);

  const maxRadius = mobile ? 4.4 : 6.4;

  return {
    group,
    textures: [glowTexture],
    update: (progress, pointerX, pointerY) => {
      const eased = ease(progress);
      group.rotation.z = eased * 0.4 + pointerX * 0.06;
      group.rotation.x = -Math.PI / 3.8 + pointerY * 0.05;
      beacon.scale.setScalar(0.8 + eased * 0.5);
      beaconMaterial.opacity = 0.28 + eased * 0.34;
      glow.material.opacity = 0.24 + eased * 0.36;
      pulses.forEach((pulse) => {
        // Each ring restarts as it reaches the edge, so scrolling drives a continuous ripple.
        const phase = (eased * 1.6 + pulse.offset) % 1;
        pulse.mesh.scale.setScalar(0.35 + phase * maxRadius);
        pulse.material.opacity = (1 - phase) * 0.62 * (0.45 + eased * 0.55);
      });
    },
  };
}

/**
 * About — three interlocking rings around a solar core for the commitment statement.
 */
function buildAbout(mobile: boolean): SceneInstance {
  const group = new THREE.Group();
  const ringGeometry = new THREE.TorusGeometry(mobile ? 1.8 : 2.3, 0.035, 8, mobile ? 72 : 132);

  const rings = [
    { color: palette.blue500, tilt: [0, 0, 0] },
    { color: palette.cyan300, tilt: [Math.PI / 2.6, 0.5, 0] },
    { color: palette.leaf, tilt: [-Math.PI / 2.6, -0.5, 0] },
  ].map((config, index) => {
    const material = basic(config.color, 0.34);
    const mesh = new THREE.Mesh(ringGeometry, material);
    mesh.rotation.set(config.tilt[0], config.tilt[1], config.tilt[2]);
    group.add(mesh);
    return { mesh, material, tilt: config.tilt, index };
  });

  const coreTexture = createRadialTexture([
    [0, 'rgba(255,249,183,1)'],
    [0.35, 'rgba(241,233,46,0.5)'],
    [1, 'rgba(241,233,46,0)'],
  ]);
  const core = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: coreTexture,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  core.scale.setScalar(mobile ? 2.6 : 3.4);
  group.add(core);

  return {
    group,
    textures: [coreTexture],
    update: (progress, pointerX, pointerY) => {
      const eased = ease(progress);
      group.rotation.y = -0.3 + eased * 0.8 + pointerX * 0.09;
      group.rotation.x = 0.15 + pointerY * 0.05;
      core.material.opacity = 0.18 + eased * 0.3;
      rings.forEach((ring) => {
        const direction = ring.index % 2 === 0 ? 1 : -1;
        ring.mesh.rotation.x = ring.tilt[0] + eased * 0.9 * direction;
        ring.mesh.rotation.y = ring.tilt[1] + eased * 1.3 * direction;
        ring.material.opacity = 0.1 + stagger(progress, ring.index, rings.length) * 0.32;
      });
    },
  };
}

export const sceneDefinitions: Record<SceneVariant, SceneDefinition> = {
  overview: {
    camera: { fov: 42, from: [0, 1.2, 12], to: [1.4, -0.6, 8.6], lookAt: [0, 0, 0] },
    fitRadius: 4,
    build: buildOverview,
  },
  services: {
    camera: { fov: 45, from: [0, 1.8, 11.5], to: [-1.6, -0.4, 8.2], lookAt: [0, 0, 0] },
    fitRadius: 5.2,
    build: buildServices,
  },
  products: {
    camera: { fov: 40, from: [0.5, 3.6, 11], to: [-1.2, 1.4, 8.4], lookAt: [0, 0.2, 0] },
    fitRadius: 4.6,
    build: buildProducts,
  },
  promotions: {
    camera: { fov: 44, from: [0, 0.6, 10.5], to: [0.8, -0.8, 8.8], lookAt: [0, 0.2, 0] },
    fitRadius: 5.2,
    build: buildPromotions,
  },
  documentation: {
    camera: { fov: 42, from: [0, 0.8, 11.5], to: [1.8, -0.5, 8.6], lookAt: [0, 0, 0] },
    fitRadius: 4.9,
    build: buildDocumentation,
  },
  portfolio: {
    camera: { fov: 42, from: [0, 5.2, 12.5], to: [-1.8, 2.4, 9], lookAt: [0, 0.8, 0] },
    fitRadius: 4.4,
    build: buildPortfolio,
  },
  contact: {
    camera: { fov: 44, from: [0, 1.4, 11], to: [0, 0.4, 9], lookAt: [0, 0, 0] },
    fitRadius: 3.6,
    build: buildContact,
  },
  about: {
    camera: { fov: 42, from: [0, 0.9, 11], to: [1.2, -0.5, 8.8], lookAt: [0, 0, 0] },
    fitRadius: 3.2,
    build: buildAbout,
  },
};
