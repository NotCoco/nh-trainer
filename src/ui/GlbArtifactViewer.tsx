import { useEffect, useMemo, useRef, useState } from "react";
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  Object3D,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { assetCatalog } from "../assets";
import { getRenderGlbArtifacts, type RenderGlbArtifact } from "../render/glbArtifacts";
import { renderWorkbench } from "../render/workbench";

type GlbLoadStatus =
  | { readonly kind: "idle"; readonly message: string }
  | { readonly kind: "checking"; readonly message: string }
  | { readonly kind: "missing"; readonly message: string }
  | { readonly kind: "loading"; readonly message: string }
  | { readonly kind: "ready"; readonly message: string }
  | { readonly kind: "error"; readonly message: string };

interface ThreeBoundary {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly modelRoot: Group;
}

function disposeObject(object: Object3D): void {
  object.traverse((node) => {
    const disposableNode = node as Object3D & {
      geometry?: { dispose: () => void };
      material?: { dispose: () => void } | Array<{ dispose: () => void }>;
    };

    disposableNode.geometry?.dispose();

    if (Array.isArray(disposableNode.material)) {
      for (const material of disposableNode.material) {
        material.dispose();
      }
      return;
    }

    disposableNode.material?.dispose();
  });
}

function createBoundary(canvas: HTMLCanvasElement): ThreeBoundary {
  const scene = new Scene();
  scene.background = new Color(0x101418);

  const camera = new PerspectiveCamera(42, 1, 0.1, 10000);
  camera.position.set(0, 2, 6);

  const renderer = new WebGLRenderer({ antialias: true, canvas, preserveDrawingBuffer: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const modelRoot = new Group();
  scene.add(modelRoot);
  scene.add(new AmbientLight(0xffffff, 1.8));

  const keyLight = new DirectionalLight(0xffffff, 2.6);
  keyLight.position.set(4, 8, 6);
  scene.add(keyLight);

  return { scene, camera, renderer, modelRoot };
}

function resizeBoundary(boundary: ThreeBoundary, canvas: HTMLCanvasElement): void {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);

  boundary.renderer.setSize(width, height, false);
  boundary.camera.aspect = width / height;
  boundary.camera.updateProjectionMatrix();
}

function frameModel(boundary: ThreeBoundary, model: Object3D): void {
  const bounds = new Box3().setFromObject(model);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const largestSide = Math.max(size.x, size.y, size.z, 1);

  boundary.modelRoot.position.set(-center.x, -center.y, -center.z);
  boundary.camera.position.set(0, largestSide * 0.35, largestSide * 1.8);
  boundary.camera.near = Math.max(0.01, largestSide / 100);
  boundary.camera.far = Math.max(100, largestSide * 10);
  boundary.camera.lookAt(0, 0, 0);
  boundary.camera.updateProjectionMatrix();
}

async function artifactExists(artifact: RenderGlbArtifact): Promise<boolean | "unknown"> {
  try {
    const response = await fetch(artifact.url, { method: "HEAD" });
    const contentType = response.headers.get("content-type") ?? "";

    if (response.status === 404) {
      return false;
    }

    if (!response.ok) {
      return "unknown";
    }

    return contentType.includes("model/gltf-binary") ||
      contentType.includes("application/octet-stream")
      ? true
      : false;
  } catch {
    return "unknown";
  }
}

function loadGlb(artifact: RenderGlbArtifact): Promise<GLTF> {
  const loader = new GLTFLoader();

  return new Promise((resolve, reject) => {
    loader.load(artifact.url, resolve, undefined, reject);
  });
}

function pickInitialArtifact(artifacts: readonly RenderGlbArtifact[]): string {
  return (
    artifacts.find((artifact) => artifact.path.startsWith("fixtures/render/player-loadouts/"))?.path ??
    artifacts.find(
      (artifact) =>
        artifact.path.startsWith("fixtures/assets/models/") &&
        !artifact.path.includes("/spotanims/")
    )?.path ??
    artifacts[0]?.path ??
    ""
  );
}

export function GlbArtifactViewer(): JSX.Element {
  const artifacts = useMemo(
    () =>
      getRenderGlbArtifacts([
        ...assetCatalog.map((asset) => ({
          id: `asset:${asset.id}`,
          requiredArtifacts: asset.requiredArtifacts
        })),
        ...renderWorkbench.targets.map((target) => ({
          id: `render:${target.id}`,
          requiredArtifacts: target.requiredArtifacts
        }))
      ]),
    []
  );
  const [selectedPath, setSelectedPath] = useState(() => pickInitialArtifact(artifacts));
  const selectedArtifact = artifacts.find((artifact) => artifact.path === selectedPath) ?? artifacts[0];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boundaryRef = useRef<ThreeBoundary | null>(null);
  const [status, setStatus] = useState<GlbLoadStatus>({
    kind: "idle",
    message: "Select a cache-exported GLB artifact."
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const boundary = createBoundary(canvas);
    boundaryRef.current = boundary;

    const resizeObserver = new ResizeObserver(() => resizeBoundary(boundary, canvas));
    resizeObserver.observe(canvas);
    resizeBoundary(boundary, canvas);

    let animationFrame = 0;
    const renderFrame = (): void => {
      boundary.renderer.render(boundary.scene, boundary.camera);
      animationFrame = requestAnimationFrame(renderFrame);
    };
    renderFrame();

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      disposeObject(boundary.modelRoot);
      boundary.renderer.dispose();
      boundaryRef.current = null;
    };
  }, []);

  useEffect(() => {
    const boundary = boundaryRef.current;
    if (!boundary || !selectedArtifact) {
      return;
    }

    let canceled = false;
    const previousChildren = [...boundary.modelRoot.children];

    for (const child of previousChildren) {
      boundary.modelRoot.remove(child);
      disposeObject(child);
    }

    setStatus({ kind: "checking", message: `Checking ${selectedArtifact.path}` });

    void artifactExists(selectedArtifact).then(async (presence) => {
      if (canceled) {
        return;
      }

      if (presence === false) {
        setStatus({
          kind: "missing",
          message: `Missing artifact: ${selectedArtifact.path}`
        });
        return;
      }

      setStatus({ kind: "loading", message: `Loading ${selectedArtifact.path}` });

      try {
        const gltf = await loadGlb(selectedArtifact);

        if (canceled) {
          disposeObject(gltf.scene);
          return;
        }

        boundary.modelRoot.add(gltf.scene);
        frameModel(boundary, gltf.scene);
        setStatus({
          kind: "ready",
          message: `Loaded ${selectedArtifact.path}`
        });
      } catch {
        if (!canceled) {
          setStatus({
            kind: presence === "unknown" ? "missing" : "error",
            message:
              presence === "unknown"
                ? `Artifact is not reachable from the renderer: ${selectedArtifact.path}`
                : `Could not parse GLB artifact: ${selectedArtifact.path}`
          });
        }
      }
    });

    return () => {
      canceled = true;
    };
  }, [selectedArtifact]);

  return (
    <section className="workbenchSection" aria-labelledby="glb-artifact-viewer">
      <div className="sectionHeader">
        <p className="eyebrow">Three.js boundary</p>
        <h2 id="glb-artifact-viewer">Real cache GLB viewer</h2>
      </div>
      <div className="glbViewer">
        <div className="glbViewport">
          <canvas ref={canvasRef} aria-label="Three.js GLB artifact viewport" />
          <div className={`glbStatus glbStatus-${status.kind}`}>{status.message}</div>
        </div>
        <div className="glbPanel">
          <label htmlFor="glb-artifact-select">Artifact</label>
          <select
            id="glb-artifact-select"
            value={selectedArtifact?.path ?? ""}
            onChange={(event) => setSelectedPath(event.target.value)}
          >
            {artifacts.map((artifact) => (
              <option key={artifact.path} value={artifact.path}>
                {artifact.path}
              </option>
            ))}
          </select>
          <div className="glbMeta">
            <span>Targets</span>
            <code>{selectedArtifact?.targetIds.join(", ") ?? "none"}</code>
          </div>
          <p>
            This boundary loads exported GLB files as render assets only. Combat,
            movement, and observation state stay in the simulation contracts, not
            on Three.js objects.
          </p>
        </div>
      </div>
    </section>
  );
}
