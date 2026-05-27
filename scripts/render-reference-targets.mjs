export const referenceManifestFileName = "manifest.json";

export const nhClientCameraPresets = {
  isometric: {
    yaw: 256,
    pitch: 128,
    distance: 1968,
    focalHeightOffset: 75
  },
  north: {
    yaw: 0,
    pitch: 128,
    distance: 1968,
    focalHeightOffset: 75
  },
  south: {
    yaw: 1024,
    pitch: 128,
    distance: 1968,
    focalHeightOffset: 75
  },
  top: {
    yaw: 256,
    pitch: 383,
    distance: 3498,
    focalHeightOffset: 75
  }
};

export const renderReferenceTargets = [
  {
    id: "runtime-isometric-cycle-8",
    label: "Isometric Gmaul and melee switch frame",
    camera: "isometric",
    cameraPreset: nhClientCameraPresets.isometric,
    cycle: 8,
    fileName: "runtime-isometric-cycle-8.png",
    traceExpectations: {
      requiredCameraPreset: true,
      requiredTick: true
    },
    tolerance: {
      changedPixelThreshold: 24,
      maxChangedPixelRatio: 0.12,
      maxMeanAbsoluteError: 18
    }
  },
  {
    id: "runtime-north-cycle-18",
    label: "North camera projectile and overhead frame",
    camera: "north",
    cameraPreset: nhClientCameraPresets.north,
    cycle: 18,
    fileName: "runtime-north-cycle-18.png",
    traceExpectations: {
      requiredCameraPreset: true,
      requiredEventKinds: ["projectile"],
      requiredSourceAnchorIds: ["client-projectile-packet-lifecycle", "client-projectile-motion-contract"],
      requiredTick: true
    },
    tolerance: {
      changedPixelThreshold: 24,
      maxChangedPixelRatio: 0.12,
      maxMeanAbsoluteError: 18
    }
  },
  {
    id: "runtime-south-cycle-30",
    label: "South camera actor and overlay frame",
    camera: "south",
    cameraPreset: nhClientCameraPresets.south,
    cycle: 30,
    fileName: "runtime-south-cycle-30.png",
    traceExpectations: {
      requiredCameraPreset: true,
      requiredTick: true
    },
    tolerance: {
      changedPixelThreshold: 24,
      maxChangedPixelRatio: 0.12,
      maxMeanAbsoluteError: 18
    }
  },
  {
    id: "runtime-top-cycle-42",
    label: "Top camera tile and marker frame",
    camera: "top",
    cameraPreset: nhClientCameraPresets.top,
    cycle: 42,
    fileName: "runtime-top-cycle-42.png",
    traceExpectations: {
      requiredCameraPreset: true,
      requiredTick: true
    },
    tolerance: {
      changedPixelThreshold: 24,
      maxChangedPixelRatio: 0.12,
      maxMeanAbsoluteError: 18
    }
  }
];

export const nhClientCapturePlan = renderReferenceTargets
  .map((target) => `${target.fileName}:${target.cycle}:${target.camera}`)
  .join(",");
