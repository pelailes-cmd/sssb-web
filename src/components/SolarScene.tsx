import { useEffect, useRef } from 'react';
import * as THREE from 'three';

type SolarSceneProps = {
  reducedMotion: boolean;
};

function createPanel(panelTexture: THREE.CanvasTexture, mobile: boolean) {
  const panel = new THREE.Group();
  const width = mobile ? 2.15 : 2.35;
  const depth = mobile ? 1.2 : 1.32;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.085, depth),
    new THREE.MeshPhysicalMaterial({
      map: panelTexture,
      color: 0xffffff,
      metalness: 0.42,
      roughness: 0.28,
      clearcoat: 0.9,
      clearcoatRoughness: 0.2,
    }),
  );
  body.castShadow = !mobile;
  body.receiveShadow = true;
  panel.add(body);

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0xaec7d5,
    metalness: 0.92,
    roughness: 0.28,
  });
  const railDepth = 0.055;
  const rails = [
    new THREE.Mesh(new THREE.BoxGeometry(width + 0.06, 0.105, railDepth), frameMaterial),
    new THREE.Mesh(new THREE.BoxGeometry(width + 0.06, 0.105, railDepth), frameMaterial),
    new THREE.Mesh(new THREE.BoxGeometry(railDepth, 0.105, depth), frameMaterial),
    new THREE.Mesh(new THREE.BoxGeometry(railDepth, 0.105, depth), frameMaterial),
  ];
  rails[0].position.z = depth / 2;
  rails[1].position.z = -depth / 2;
  rails[2].position.x = width / 2;
  rails[3].position.x = -width / 2;
  rails.forEach((rail) => {
    rail.position.y = 0.016;
    panel.add(rail);
  });

  panel.rotation.x = -0.26;
  return panel;
}

function createPanelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 216;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#092846');
  gradient.addColorStop(0.55, '#0d416b');
  gradient.addColorStop(1, '#061a30');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = 'rgba(126, 207, 236, 0.55)';
  context.lineWidth = 2;
  for (let x = 0; x <= canvas.width; x += canvas.width / 12) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }
  for (let y = 0; y <= canvas.height; y += canvas.height / 6) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }

  const sheen = context.createLinearGradient(0, 0, canvas.width, 0);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.45, 'rgba(164,231,247,0.14)');
  sheen.addColorStop(0.62, 'rgba(255,255,255,0)');
  context.fillStyle = sheen;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(128, 128, 5, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255, 252, 186, 1)');
    gradient.addColorStop(0.2, 'rgba(247, 231, 42, .9)');
    gradient.addColorStop(0.52, 'rgba(56, 189, 248, .18)');
    gradient.addColorStop(1, 'rgba(56, 189, 248, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export default function SolarScene({ reducedMotion }: SolarSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = document.getElementById('home');
    if (!canvas || !hero) return undefined;

    const mobile = window.matchMedia('(max-width: 720px)').matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !mobile,
        powerPreference: mobile ? 'low-power' : 'high-performance',
      });
    } catch {
      canvas.hidden = true;
      if (fallbackRef.current) fallbackRef.current.hidden = false;
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.15 : 1.7));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = !mobile;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x061a2e, mobile ? 0.055 : 0.043);
    const camera = new THREE.PerspectiveCamera(mobile ? 48 : 40, 1, 0.1, 70);
    camera.position.set(mobile ? 4.8 : 6.6, mobile ? 4.3 : 5.3, mobile ? 8.4 : 9.2);

    scene.add(new THREE.HemisphereLight(0x86dfff, 0x061421, mobile ? 1.25 : 1.55));
    const keyLight = new THREE.DirectionalLight(0xfff4b8, mobile ? 2.1 : 3.2);
    keyLight.position.set(-5, 8, 3);
    keyLight.castShadow = !mobile;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);

    const world = new THREE.Group();
    scene.add(world);

    const panelTexture = createPanelTexture();
    const array = new THREE.Group();
    const columns = mobile ? 3 : 4;
    const rows = mobile ? 2 : 3;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const panel = createPanel(panelTexture, mobile);
        panel.position.set(
          (column - (columns - 1) / 2) * (mobile ? 2.35 : 2.56),
          row * 0.29,
          (row - (rows - 1) / 2) * (mobile ? 1.33 : 1.47),
        );
        array.add(panel);
      }
    }
    array.position.set(mobile ? 1.6 : 1.2, mobile ? -0.7 : -0.55, mobile ? -1.2 : -0.5);
    array.rotation.y = mobile ? -0.3 : -0.42;
    world.add(array);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(mobile ? 10 : 15, 64),
      new THREE.MeshStandardMaterial({
        color: 0x082944,
        metalness: 0.15,
        roughness: 0.88,
        transparent: true,
        opacity: 0.32,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.9;
    ground.receiveShadow = !mobile;
    scene.add(ground);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(mobile ? 6 : 8.5, mobile ? 6.04 : 8.56, 96),
      new THREE.MeshBasicMaterial({ color: 0x4dc6e8, transparent: true, opacity: 0.24 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.87;
    scene.add(ring);

    const glowTexture = createGlowTexture();
    const sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xffffff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    sunGlow.position.set(mobile ? -3.1 : -4.8, mobile ? 3.9 : 4.8, mobile ? -3.8 : -5.2);
    sunGlow.scale.setScalar(mobile ? 4.8 : 6.8);
    world.add(sunGlow);

    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(mobile ? 0.38 : 0.5, mobile ? 20 : 32, mobile ? 16 : 24),
      new THREE.MeshBasicMaterial({ color: 0xf9ee31 }),
    );
    sun.position.copy(sunGlow.position);
    world.add(sun);

    const energyMaterials: THREE.MeshBasicMaterial[] = [];
    const arcCount = mobile ? 1 : 3;
    for (let index = 0; index < arcCount; index += 1) {
      const curve = new THREE.CubicBezierCurve3(
        new THREE.Vector3(-4.2 + index * 0.2, 4.2, -4.6),
        new THREE.Vector3(-2.4 + index * 0.6, 3.8 + index * 0.22, -1.5),
        new THREE.Vector3(-1 + index * 0.8, 1.8 + index * 0.16, 0.2),
        new THREE.Vector3(index * 1.05, 0.25, 0.3 + index * 0.65),
      );
      const geometry = new THREE.TubeGeometry(
        curve,
        mobile ? 28 : 54,
        mobile ? 0.015 : 0.024,
        5,
        false,
      );
      const material = new THREE.MeshBasicMaterial({
        color: index === 1 ? 0x61d7ed : 0xf4e52c,
        transparent: true,
        opacity: mobile ? 0.28 : 0.42 - index * 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      energyMaterials.push(material);
      world.add(new THREE.Mesh(geometry, material));
    }

    if (!mobile) {
      const count = 64;
      const points = new Float32Array(count * 3);
      for (let index = 0; index < count; index += 1) {
        points[index * 3] = (Math.random() - 0.5) * 18;
        points[index * 3 + 1] = Math.random() * 6 - 0.6;
        points[index * 3 + 2] = (Math.random() - 0.5) * 11 - 1;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
      const material = new THREE.PointsMaterial({
        color: 0x94e8f5,
        size: 0.045,
        transparent: true,
        opacity: 0.46,
        depthWrite: false,
      });
      world.add(new THREE.Points(geometry, material));
    }

    let visible = true;
    let targetProgress = 0;
    let currentProgress = 0;
    let pointerX = 0;
    let pointerY = 0;
    let currentPointerX = 0;
    let currentPointerY = 0;
    let animationFrame = 0;
    let settleFrames = 0;

    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      settleFrames = 12;
      scheduleRender();
    };

    const updateProgress = () => {
      const rect = hero.getBoundingClientRect();
      const distance = Math.max(1, rect.height - window.innerHeight);
      targetProgress = reducedMotion ? 0.16 : Math.min(1, Math.max(0, -rect.top / distance));
      settleFrames = reducedMotion ? 1 : 48;
      scheduleRender();
    };

    const renderFrame = () => {
      animationFrame = 0;
      if (!visible || document.hidden) return;

      currentProgress += (targetProgress - currentProgress) * (reducedMotion ? 1 : 0.085);
      currentPointerX += (pointerX - currentPointerX) * 0.07;
      currentPointerY += (pointerY - currentPointerY) * 0.07;

      array.rotation.y = (mobile ? -0.3 : -0.42) + currentProgress * 0.38 + currentPointerX * 0.04;
      array.position.z = (mobile ? -1.2 : -0.5) + currentProgress * 1.1;
      world.rotation.y = currentPointerX * 0.025;
      world.rotation.x = currentPointerY * 0.012;
      camera.position.x = (mobile ? 4.8 : 6.6) - currentProgress * (mobile ? 1.3 : 3.1);
      camera.position.y = (mobile ? 4.3 : 5.3) - currentProgress * (mobile ? 0.6 : 1.7);
      camera.position.z = (mobile ? 8.4 : 9.2) - currentProgress * (mobile ? 0.9 : 2.2);
      camera.lookAt(0.25, -0.15, currentProgress * 0.45);
      energyMaterials.forEach((material, index) => {
        material.opacity = (mobile ? 0.22 : 0.3) + currentProgress * 0.32 - index * 0.045;
      });
      sunGlow.material.rotation = currentProgress * 0.15;
      renderer.render(scene, camera);

      settleFrames -= 1;
      const unsettled =
        Math.abs(targetProgress - currentProgress) > 0.001 ||
        Math.abs(pointerX - currentPointerX) > 0.001 ||
        Math.abs(pointerY - currentPointerY) > 0.001;
      if (settleFrames > 0 || unsettled) scheduleRender();
    };

    function scheduleRender() {
      if (!animationFrame && visible && !document.hidden) {
        animationFrame = window.requestAnimationFrame(renderFrame);
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (mobile || reducedMotion) return;
      pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
      pointerY = (event.clientY / window.innerHeight - 0.5) * 2;
      settleFrames = 28;
      scheduleRender();
    };

    const onVisibilityChange = () => {
      if (document.hidden && animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      } else {
        settleFrames = 2;
        scheduleRender();
      }
    };

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (!visible && animationFrame) {
          window.cancelAnimationFrame(animationFrame);
          animationFrame = 0;
        } else if (visible) {
          settleFrames = 3;
          scheduleRender();
        }
      },
      { rootMargin: '120px 0px' },
    );
    intersectionObserver.observe(canvas);

    resize();
    updateProgress();
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      intersectionObserver.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', updateProgress);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibilityChange);

      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          geometries.add(object.geometry);
          const objectMaterials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          objectMaterials.forEach((material) => materials.add(material));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      panelTexture.dispose();
      glowTexture.dispose();
      renderer.dispose();
    };
  }, [reducedMotion]);

  return (
    <>
      <div
        ref={fallbackRef}
        className="hero-fallback"
        role="img"
        aria-label="Stylized solar panel array beneath a rising sun"
        hidden
      >
        <div className="hero-fallback__sun" />
        <div className="hero-fallback__panel hero-fallback__panel--one" />
        <div className="hero-fallback__panel hero-fallback__panel--two" />
        <div className="hero-fallback__panel hero-fallback__panel--three" />
      </div>
      <canvas ref={canvasRef} className="hero-scene" aria-hidden="true" />
    </>
  );
}
