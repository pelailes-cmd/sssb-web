import { useEffect, useId, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

type ModelStatus = 'loading' | 'ready' | 'error';

type ProductModelCanvasProps = {
  src: string;
  label: string;
  compact?: boolean;
  collection?: boolean;
  reducedMotion: boolean;
  onStatus: (status: ModelStatus, diagnostic?: string) => void;
};

function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) value.dispose();
      });
      material.dispose();
    });
  });
}

export default function ProductModelCanvas({
  src,
  label,
  compact = false,
  collection = false,
  reducedMotion,
  onStatus,
}: ProductModelCanvasProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instructionsId = useId();

  useEffect(() => {
    const shell = shellRef.current;
    const canvas = canvasRef.current;
    if (!shell || !canvas) return undefined;

    let disposed = false;
    let animationFrame = 0;
    let previousTime = performance.now();
    let renderer: THREE.WebGLRenderer;

    onStatus('loading');

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !compact,
        powerPreference: compact ? 'low-power' : 'high-performance',
      });
    } catch (error) {
      onStatus('error', error instanceof Error ? error.message : 'WebGL renderer creation failed.');
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.6));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !compact;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const startingDistance = collection ? 6.2 : 5.65;
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
    camera.position.set(0, 0.2, startingDistance);
    camera.lookAt(0, 0, 0);

    const pivot = new THREE.Group();
    scene.add(pivot);

    const hemisphere = new THREE.HemisphereLight(0xeafaff, 0x17354d, 2.1);
    scene.add(hemisphere);

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.6);
    keyLight.position.set(4.5, 6, 5);
    keyLight.castShadow = !compact;
    keyLight.shadow.mapSize.set(compact ? 512 : 1024, compact ? 512 : 1024);
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 18;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x5bc8ff, 1.35);
    fillLight.position.set(-4, 2, -3);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xf5ee36, 1.1);
    rimLight.position.set(1, 4, -5);
    scene.add(rimLight);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(3.5, 64),
      new THREE.ShadowMaterial({ color: 0x0a2b46, opacity: compact ? 0.08 : 0.16 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.visible = false;
    scene.add(ground);

    const motion = {
      yaw: -0.52,
      pitch: -0.06,
      targetYaw: -0.52,
      targetPitch: -0.06,
      distance: startingDistance,
      targetDistance: startingDistance,
      dragging: false,
      pointerId: -1,
      pointerX: 0,
      pointerY: 0,
      lastInteraction: performance.now(),
      modelReady: false,
    };

    const renderFrame = (time: number) => {
      animationFrame = 0;
      if (disposed || document.hidden || !motion.modelReady) return;

      const delta = Math.min(0.05, Math.max(0, (time - previousTime) / 1000));
      previousTime = time;
      if (!reducedMotion && !motion.dragging && time - motion.lastInteraction > 1200) {
        motion.targetYaw += delta * 0.22;
      }

      motion.yaw += (motion.targetYaw - motion.yaw) * 0.12;
      motion.pitch += (motion.targetPitch - motion.pitch) * 0.12;
      motion.distance += (motion.targetDistance - motion.distance) * 0.12;
      pivot.rotation.set(motion.pitch, motion.yaw, 0);
      camera.position.z = motion.distance;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);

      const settling =
        Math.abs(motion.targetYaw - motion.yaw) > 0.001 ||
        Math.abs(motion.targetPitch - motion.pitch) > 0.001 ||
        Math.abs(motion.targetDistance - motion.distance) > 0.001;
      if (!reducedMotion || settling) animationFrame = window.requestAnimationFrame(renderFrame);
    };

    const requestRender = () => {
      if (!animationFrame && !disposed && !document.hidden) {
        previousTime = performance.now();
        animationFrame = window.requestAnimationFrame(renderFrame);
      }
    };

    const resize = () => {
      const { width, height } = shell.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      requestRender();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(shell);
    resize();

    const loader = new GLTFLoader();
    loader.load(
      src,
      (gltf) => {
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }

        const model = gltf.scene;
        const initialBox = new THREE.Box3().setFromObject(model);
        const initialSize = initialBox.getSize(new THREE.Vector3());
        const largestDimension = Math.max(initialSize.x, initialSize.y, initialSize.z);
        if (!Number.isFinite(largestDimension) || largestDimension <= 0) {
          disposeObject(model);
          onStatus('error', 'The model has no measurable geometry bounds.');
          return;
        }

        const targetSize = collection ? 2.35 : compact ? 2.65 : 3.05;
        model.scale.multiplyScalar(targetSize / largestDimension);
        const fittedBox = new THREE.Box3().setFromObject(model);
        const fittedCenter = fittedBox.getCenter(new THREE.Vector3());
        model.position.sub(fittedCenter);
        model.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = !compact;
          object.receiveShadow = true;
        });
        pivot.add(model);

        const centeredBox = new THREE.Box3().setFromObject(model);
        ground.position.y = centeredBox.min.y - 0.12;
        ground.visible = true;
        motion.modelReady = true;
        onStatus('ready');
        requestRender();
      },
      undefined,
      (error) => {
        if (!disposed) {
          onStatus(
            'error',
            error instanceof Error ? error.message : 'The GLB model could not be loaded.',
          );
        }
      },
    );

    const onPointerDown = (event: PointerEvent) => {
      motion.dragging = true;
      motion.pointerId = event.pointerId;
      motion.pointerX = event.clientX;
      motion.pointerY = event.clientY;
      motion.lastInteraction = performance.now();
      shell.setPointerCapture(event.pointerId);
      shell.classList.add('is-dragging');
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!motion.dragging || event.pointerId !== motion.pointerId) return;
      const deltaX = event.clientX - motion.pointerX;
      const deltaY = event.clientY - motion.pointerY;
      motion.pointerX = event.clientX;
      motion.pointerY = event.clientY;
      motion.targetYaw += deltaX * 0.012;
      motion.targetPitch = THREE.MathUtils.clamp(motion.targetPitch + deltaY * 0.006, -0.48, 0.48);
      motion.lastInteraction = performance.now();
      requestRender();
    };

    const stopDragging = (event: PointerEvent) => {
      if (event.pointerId !== motion.pointerId) return;
      motion.dragging = false;
      motion.pointerId = -1;
      motion.lastInteraction = performance.now();
      shell.classList.remove('is-dragging');
      if (shell.hasPointerCapture(event.pointerId)) shell.releasePointerCapture(event.pointerId);
      requestRender();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      let handled = true;
      switch (event.key) {
        case 'ArrowLeft':
          motion.targetYaw -= 0.22;
          break;
        case 'ArrowRight':
          motion.targetYaw += 0.22;
          break;
        case 'ArrowUp':
          motion.targetPitch = Math.max(-0.48, motion.targetPitch - 0.12);
          break;
        case 'ArrowDown':
          motion.targetPitch = Math.min(0.48, motion.targetPitch + 0.12);
          break;
        case '+':
        case '=':
          motion.targetDistance = Math.max(4.25, motion.targetDistance - 0.35);
          break;
        case '-':
        case '_':
          motion.targetDistance = Math.min(7.8, motion.targetDistance + 0.35);
          break;
        case 'Home':
          motion.targetYaw = -0.52;
          motion.targetPitch = -0.06;
          motion.targetDistance = startingDistance;
          break;
        default:
          handled = false;
      }
      if (!handled) return;
      event.preventDefault();
      motion.lastInteraction = performance.now();
      requestRender();
    };

    const onVisibilityChange = () => {
      if (document.hidden && animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      } else {
        requestRender();
      }
    };

    const onContextLost = (event: Event) => {
      event.preventDefault();
      if (!disposed) onStatus('error', 'The WebGL context was lost.');
    };

    shell.addEventListener('pointerdown', onPointerDown);
    shell.addEventListener('pointermove', onPointerMove);
    shell.addEventListener('pointerup', stopDragging);
    shell.addEventListener('pointercancel', stopDragging);
    shell.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('webglcontextlost', onContextLost);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      shell.removeEventListener('pointerdown', onPointerDown);
      shell.removeEventListener('pointermove', onPointerMove);
      shell.removeEventListener('pointerup', stopDragging);
      shell.removeEventListener('pointercancel', stopDragging);
      shell.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      disposeObject(scene);
      renderer.dispose();
      if (!canvas.isConnected) renderer.forceContextLoss();
    };
  }, [collection, compact, onStatus, reducedMotion, src]);

  return (
    <div
      ref={shellRef}
      className="model-canvas"
      role="group"
      tabIndex={0}
      aria-label={`Interactive 3D preview of ${label}`}
      aria-describedby={instructionsId}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <span id={instructionsId} className="sr-only">
        Drag horizontally to rotate. Use arrow keys to rotate, plus and minus to zoom, and Home to
        reset the view.
      </span>
    </div>
  );
}
