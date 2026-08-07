import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { sceneDefinitions, type SceneVariant } from './sectionScenes';

type SectionSceneCanvasProps = {
  variant: SceneVariant;
  reducedMotion: boolean;
};

/** The still pose used when the visitor prefers reduced motion. */
const STATIC_PROGRESS = 0.42;

function disposeSceneGraph(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  root.traverse((object) => {
    const candidate = object as Partial<THREE.Mesh>;
    if (candidate.geometry) geometries.add(candidate.geometry);
    if (candidate.material) {
      const list = Array.isArray(candidate.material) ? candidate.material : [candidate.material];
      list.forEach((material) => materials.add(material));
    }
  });

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

export default function SectionSceneCanvas({ variant, reducedMotion }: SectionSceneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.closest('section') ?? canvas?.parentElement;
    if (!canvas || !host) return undefined;

    const definition = sceneDefinitions[variant];
    const mobile = window.matchMedia('(max-width: 720px)').matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !mobile,
        powerPreference: 'low-power',
      });
    } catch {
      // Sections read correctly without the backdrop, so a missing context stays silent.
      canvas.hidden = true;
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.1 : 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(definition.camera.fov, 1, 0.1, 100);
    const instance = definition.build(mobile);
    // The scenes drive their own transforms, so fitting is applied on a wrapper group.
    const fitGroup = new THREE.Group();
    fitGroup.add(instance.group);
    scene.add(fitGroup);

    const cameraFrom = new THREE.Vector3(...definition.camera.from);
    const cameraTo = new THREE.Vector3(...definition.camera.to);
    const cameraTarget = new THREE.Vector3(...definition.camera.lookAt);

    let visible = true;
    let targetProgress = reducedMotion ? STATIC_PROGRESS : 0;
    let currentProgress = targetProgress;
    let pointerX = 0;
    let pointerY = 0;
    let currentPointerX = 0;
    let currentPointerY = 0;
    let animationFrame = 0;
    let settleFrames = 0;

    function scheduleRender() {
      if (!animationFrame && visible && !document.hidden) {
        animationFrame = window.requestAnimationFrame(renderFrame);
      }
    }

    const renderFrame = () => {
      animationFrame = 0;
      if (!visible || document.hidden) return;

      const damping = reducedMotion ? 1 : 0.09;
      currentProgress += (targetProgress - currentProgress) * damping;
      currentPointerX += (pointerX - currentPointerX) * 0.07;
      currentPointerY += (pointerY - currentPointerY) * 0.07;

      camera.position.lerpVectors(cameraFrom, cameraTo, currentProgress);
      camera.lookAt(cameraTarget);
      instance.update(currentProgress, currentPointerX, currentPointerY);
      renderer.render(scene, camera);

      settleFrames -= 1;
      const unsettled =
        Math.abs(targetProgress - currentProgress) > 0.0008 ||
        Math.abs(pointerX - currentPointerX) > 0.001 ||
        Math.abs(pointerY - currentPointerY) > 0.001;
      if (settleFrames > 0 || unsettled) scheduleRender();
    };

    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      // Shrink the composition until it fits the narrower of the two frustum dimensions.
      const distance = (cameraFrom.length() + cameraTo.length()) / 2;
      const halfHeight = distance * Math.tan(THREE.MathUtils.degToRad(definition.camera.fov) / 2);
      const halfWidth = halfHeight * camera.aspect;
      fitGroup.scale.setScalar(Math.min(1, Math.min(halfHeight, halfWidth) / definition.fitRadius));

      settleFrames = 6;
      scheduleRender();
    };

    /** 0 as the section enters from below, 1 once it has fully cleared the top. */
    const updateProgress = () => {
      const rect = host.getBoundingClientRect();
      const travel = Math.max(1, rect.height + window.innerHeight);
      targetProgress = Math.min(1, Math.max(0, (window.innerHeight - rect.top) / travel));
      settleFrames = 42;
      scheduleRender();
    };

    const onPointerMove = (event: PointerEvent) => {
      pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
      pointerY = (event.clientY / window.innerHeight - 0.5) * 2;
      settleFrames = 24;
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
      { rootMargin: '140px 0px' },
    );
    intersectionObserver.observe(canvas);

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibilityChange);

    if (reducedMotion) {
      settleFrames = 2;
      scheduleRender();
    } else {
      updateProgress();
      window.addEventListener('scroll', updateProgress, { passive: true });
      if (!mobile) window.addEventListener('pointermove', onPointerMove, { passive: true });
    }

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      intersectionObserver.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', updateProgress);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibilityChange);

      disposeSceneGraph(scene);
      instance.textures?.forEach((texture) => texture.dispose());
      renderer.dispose();
    };
  }, [reducedMotion, variant]);

  return <canvas ref={canvasRef} className="section-scene__canvas" aria-hidden="true" />;
}
