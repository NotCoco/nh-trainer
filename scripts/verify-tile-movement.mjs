import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const { PerspectiveCamera, Vector3 } = require("three");

function loadTsModule(relativePath) {
  const sourcePath = path.resolve(projectRoot, relativePath);
  return loadAbsoluteTsModule(sourcePath);
}

function loadAbsoluteTsModule(sourcePath) {
  const resolved = path.normalize(sourcePath);
  const cached = moduleCache.get(resolved);
  if (cached) {
    return cached.exports;
  }

  const source = readFileSync(resolved, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      strict: true
    },
    fileName: resolved
  }).outputText;

  const module = { exports: {} };
  moduleCache.set(resolved, module);
  const localRequire = (request) => {
    if (request.startsWith(".")) {
      return loadAbsoluteTsModule(resolveRelativeTsModule(resolved, request));
    }
    return require(request);
  };
  vm.runInNewContext(
    transpiled,
    { module, exports: module.exports, require: localRequire, console },
    { filename: resolved }
  );
  return module.exports;
}

function resolveRelativeTsModule(parentPath, request) {
  const requested = path.resolve(path.dirname(parentPath), request);
  if (requested.endsWith(".ts")) {
    return requested;
  }
  return `${requested}.ts`;
}

const {
  buildKronosSceneCollision,
  KRONOS_FLOOR_DECORATION_MASK,
  KRONOS_OBJECT_MASK,
  KRONOS_PROJECTILE_MASK,
  KRONOS_WEST_MASK,
  KRONOS_EAST_MASK
} = loadTsModule("src/render/kronosSceneCollision.ts");
const {
  findKronosObjectRouteWaypoints,
  findKronosTargetRouteWaypoints,
  findKronosTileRouteWaypoints,
  kronosSceneObjectRouteReached,
  kronosSceneProjectileRouteClear,
  kronosSceneTargetRouteReached,
  KRONOS_TILE_WORLD_UNITS
} = loadTsModule("src/render/kronosTileMovement.ts");
const {
  kronosContainsSourceTriangle,
  kronosPickSceneTileFromViewportPoint
} = loadTsModule("src/render/kronosSceneTilePicking.ts");

const serverRoot = path.resolve(
  projectRoot,
  "..",
  "kronos-osrs-184-master",
  "kronos-osrs-184-master",
  "Kronos-master",
  "kronos-server",
  "src",
  "main",
  "java",
  "io",
  "ruin"
);
const routeFinderSource = readFileSync(path.join(serverRoot, "model", "map", "route", "RouteFinder.java"), "utf8");
const projectileRouteSource = readFileSync(path.join(serverRoot, "model", "map", "route", "routes", "ProjectileRoute.java"), "utf8");
const targetRouteSource = readFileSync(path.join(serverRoot, "model", "map", "route", "routes", "TargetRoute.java"), "utf8");
const movementSource = readFileSync(path.join(serverRoot, "model", "entity", "shared", "Movement.java"), "utf8");
const playerMovementSource = readFileSync(path.join(serverRoot, "model", "entity", "player", "PlayerMovement.java"), "utf8");
const sceneSource = readFileSync(
  path.resolve(projectRoot, "..", "Kronos184-Client", "runelite-client", "src", "main", "java", "net", "runelite", "standalone", "Scene.java"),
  "utf8"
);
const clientActorMovementSource = readFileSync(
  path.resolve(projectRoot, "..", "Kronos184-Client", "runelite-client", "src", "main", "java", "net", "runelite", "standalone", "class329.java"),
  "utf8"
);
const clientPlayerSource = readFileSync(
  path.resolve(projectRoot, "..", "Kronos184-Client", "runelite-client", "src", "main", "java", "net", "runelite", "standalone", "Player.java"),
  "utf8"
);
const clientLoginPacketSource = readFileSync(
  path.resolve(projectRoot, "..", "Kronos184-Client", "runelite-client", "src", "main", "java", "net", "runelite", "standalone", "LoginPacket.java"),
  "utf8"
);
const runtimeSceneViewerSource = readFileSync(path.resolve(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");

const WEST = 3200;
const SOUTH = 3400;
const PLANE = 0;

function makeArena(width, height) {
  const tiles = [];
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      tiles.push({
        x: WEST + x,
        y: SOUTH + y,
        plane: PLANE,
        height: 0,
        heights: {
          southWest: 0,
          southEast: 0,
          northEast: 0,
          northWest: 0
        }
      });
    }
  }

  return {
    bounds: {
      west: WEST,
      south: SOUTH,
      east: WEST + width - 1,
      north: SOUTH + height - 1,
      plane: PLANE
    },
    tiles
  };
}

function buildCollision(objects = [], width = 9, height = 9) {
  return buildKronosSceneCollision(makeArena(width, height), objects, { x: 0, y: 0, z: 0 });
}

function objectPlacement(overrides) {
  return {
    id: 1,
    name: "test object",
    type: 10,
    orientation: 0,
    x: WEST,
    y: SOUTH,
    plane: PLANE,
    sizeX: 1,
    sizeY: 1,
    interactType: 1,
    blocksProjectile: false,
    ...overrides
  };
}

function worldTile(x, y) {
  return { x: WEST + x, y: SOUTH + y, plane: PLANE };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertSame(name, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name} mismatch\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`);
  }
}

function expandWaypointPath(name, collision, start, path) {
  const expanded = [];
  let current = start;
  for (const [waypointIndex, waypoint] of path.entries()) {
    let guard = 0;
    while (!sameTile(current, waypoint)) {
      const next = stepTowardWaypoint(current, waypoint);
      const dx = Math.abs(next.x - current.x);
      const dz = Math.abs(next.z - current.z);
      assert(dx <= KRONOS_TILE_WORLD_UNITS && dz <= KRONOS_TILE_WORLD_UNITS, `${name} waypoint ${waypointIndex} step is not adjacent`);
      assert(dx > 0 || dz > 0, `${name} waypoint ${waypointIndex} step did not move`);
      assert(collision.canStep(current, next), `${name} waypoint ${waypointIndex} step is blocked`);
      expanded.push(next);
      current = next;
      guard += 1;
      assert(guard < 128, `${name} waypoint ${waypointIndex} did not converge`);
    }
  }
  return expanded;
}

function stepTowardWaypoint(fromTile, waypoint) {
  const deltaX = Math.sign(Math.round((waypoint.x - fromTile.x) / KRONOS_TILE_WORLD_UNITS));
  const deltaZ = Math.sign(Math.round((waypoint.z - fromTile.z) / KRONOS_TILE_WORLD_UNITS));
  return {
    x: fromTile.x + deltaX * KRONOS_TILE_WORLD_UNITS,
    z: fromTile.z + deltaZ * KRONOS_TILE_WORLD_UNITS
  };
}

function projectToViewport(camera, viewport, point) {
  const projected = new Vector3(point.x, point.y, point.z).project(camera);
  return {
    x: Math.trunc(((projected.x + 1) * viewport.rect.width) / 2),
    y: Math.trunc(((1 - projected.y) * viewport.rect.height) / 2)
  };
}

function assertWorldRoundTrip(collision, x, y) {
  const world = worldTile(x, y);
  const scene = collision.worldToSceneTile(world);
  assertSame(`world/scene round trip ${x},${y}`, collision.sceneToWorldTile(scene), world);
  assertSame(`snap tile ${x},${y}`, collision.snapTile(scene), scene);
}

const openCollision = buildCollision();
assertWorldRoundTrip(openCollision, 0, 0);
assertWorldRoundTrip(openCollision, 4, 4);
assertWorldRoundTrip(openCollision, 8, 8);

const openStart = openCollision.worldToSceneTile(worldTile(1, 1));
const openDestination = openCollision.worldToSceneTile(worldTile(4, 4));
const openWaypoints = findKronosTileRouteWaypoints(openStart, openDestination, openCollision);
assert(openWaypoints.length === 1, `expected one compressed diagonal waypoint, got ${openWaypoints.length}`);
assertSame("open diagonal destination", openWaypoints.at(-1), openDestination);
const openSteps = expandWaypointPath("open diagonal", openCollision, openStart, openWaypoints);
assert(openSteps.length === 3, `expected three Movement.step diagonal advances, got ${openSteps.length}`);
assertSame("open diagonal movement destination", openSteps.at(-1), openDestination);
for (const [label, destinationWorld] of [
  ["east adjacent", worldTile(2, 1)],
  ["west adjacent", worldTile(0, 1)],
  ["north adjacent", worldTile(1, 2)],
  ["south adjacent", worldTile(1, 0)]
]) {
  const adjacentDestination = openCollision.worldToSceneTile(destinationWorld);
  const adjacentWaypoints = findKronosTileRouteWaypoints(openStart, adjacentDestination, openCollision);
  assert(adjacentWaypoints.length === 1, `${label} should produce one direct waypoint, got ${adjacentWaypoints.length}`);
  assertSame(`${label} direct destination`, adjacentWaypoints[0], adjacentDestination);
  const adjacentSteps = expandWaypointPath(label, openCollision, openStart, adjacentWaypoints);
  assert(adjacentSteps.length === 1, `${label} should expand to one Movement.step advance, got ${adjacentSteps.length}`);
  assertSame(`${label} movement destination`, adjacentSteps[0], adjacentDestination);
}

const targetCollision = buildCollision([], 13, 5);
const targetStart = targetCollision.worldToSceneTile(worldTile(1, 1));
const meleeTarget = targetCollision.worldToSceneTile(worldTile(4, 1));
const meleeTargetWaypoints = findKronosTargetRouteWaypoints(targetStart, meleeTarget, 1, targetCollision);
const meleeTargetSteps = expandWaypointPath("melee target route", targetCollision, targetStart, meleeTargetWaypoints);
const meleeRouteEnd = meleeTargetSteps.at(-1) ?? targetStart;
assert(!sameTile(meleeRouteEnd, meleeTarget), "TargetRoute-style melee routing should not walk onto the target tile");
assert(
  kronosSceneTargetRouteReached(meleeRouteEnd, meleeTarget, 1, targetCollision),
  `TargetRoute-style melee routing should stop cardinal-adjacent: ${JSON.stringify({ meleeRouteEnd, meleeTarget })}`
);
const sameTileTargetWaypoints = findKronosTargetRouteWaypoints(meleeTarget, meleeTarget, 1, targetCollision);
const sameTileTargetSteps = expandWaypointPath("same-tile target route", targetCollision, meleeTarget, sameTileTargetWaypoints);
const sameTileRouteEnd = sameTileTargetSteps.at(-1) ?? meleeTarget;
assert(!sameTile(sameTileRouteEnd, meleeTarget), "TargetRoute-style same-tile routing should step out instead of staying stacked");
assert(
  kronosSceneTargetRouteReached(sameTileRouteEnd, meleeTarget, 1, targetCollision),
  `TargetRoute-style same-tile routing should end on an adjacent attack tile: ${JSON.stringify({ sameTileRouteEnd, meleeTarget })}`
);
const rangedTarget = targetCollision.worldToSceneTile(worldTile(11, 1));
const rangedTargetWaypoints = findKronosTargetRouteWaypoints(targetStart, rangedTarget, 8, targetCollision);
const rangedTargetSteps = expandWaypointPath("ranged target route", targetCollision, targetStart, rangedTargetWaypoints);
const rangedRouteEnd = rangedTargetSteps.at(-1) ?? targetStart;
assert(!sameTile(rangedRouteEnd, rangedTarget), "TargetRoute-style ranged routing should not walk onto the target tile");
assert(
  kronosSceneTargetRouteReached(rangedRouteEnd, rangedTarget, 8, targetCollision),
  `TargetRoute-style ranged routing should stop once the target is in range: ${JSON.stringify({ rangedRouteEnd, rangedTarget })}`
);

const sourceTriangle = {
  a: { x: 10, y: 10 },
  b: { x: 10, y: 100 },
  c: { x: 100, y: 100 }
};
assert(
  kronosContainsSourceTriangle({ x: 20, y: 90 }, sourceTriangle.a, sourceTriangle.b, sourceTriangle.c),
  "source containsBounds port should accept points inside a projected tile triangle"
);
assert(
  !kronosContainsSourceTriangle({ x: 90, y: 20 }, sourceTriangle.a, sourceTriangle.b, sourceTriangle.c),
  "source containsBounds port should reject points outside a projected tile triangle"
);

const pickArena = makeArena(3, 3);
const pickViewport = { rect: { x: 4, y: 4, width: 512, height: 334 }, zoom: 256 };
const pickCamera = new PerspectiveCamera(66.23633715063609, pickViewport.rect.width / pickViewport.rect.height, 0.1, 100);
pickCamera.position.set(1.2, 3, 4);
pickCamera.lookAt(0.75, 0, 0.75);
pickCamera.updateProjectionMatrix();
pickCamera.updateMatrixWorld(true);
const pickedWorldCenter = { x: 0.75, y: 0, z: 0.75 };
const pickedTile = kronosPickSceneTileFromViewportPoint({
  camera: pickCamera,
  viewport: pickViewport,
  arena: pickArena,
  sceneOffset: { x: 0, y: 0, z: 0 },
  point: projectToViewport(pickCamera, pickViewport, pickedWorldCenter)
});
assertSame("source scene tile pick", pickedTile, { x: 0.75, z: 0.75 });

const blockedCollision = buildCollision([
  objectPlacement({
    x: WEST + 4,
    y: SOUTH + 4,
    sizeX: 1,
    sizeY: 1,
    type: 10
  })
]);
const blockedDestination = blockedCollision.worldToSceneTile(worldTile(4, 4));
assert(!blockedCollision.canStand(blockedDestination), "blocked rectangle destination should not be standable");
assert((blockedCollision.getFlagWorld(WEST + 4, SOUTH + 4) & KRONOS_OBJECT_MASK) !== 0, "blocked rectangle mask missing");
const fallbackWaypoints = findKronosTileRouteWaypoints(openStart, blockedDestination, blockedCollision);
assert(fallbackWaypoints.length > 0, "blocked destination should route to nearest reachable fallback");
const fallbackEnd = fallbackWaypoints.at(-1);
assert(!sameTile(fallbackEnd, blockedDestination), "blocked destination path ended on the blocked tile");
assert(blockedCollision.canStand(fallbackEnd), "blocked destination fallback is not standable");
const fallbackSteps = expandWaypointPath("blocked fallback", blockedCollision, openStart, fallbackWaypoints);
const fallbackWorld = blockedCollision.sceneToWorldTile(fallbackEnd);
assert(
  Math.abs(fallbackWorld.x - (WEST + 4)) <= 1 && Math.abs(fallbackWorld.y - (SOUTH + 4)) <= 1,
  `fallback should stop adjacent to blocked tile, got ${JSON.stringify(fallbackWorld)}`
);

const objectRoutePlacement = objectPlacement({
  id: 3,
  name: "object route target",
  x: WEST + 4,
  y: SOUTH + 4,
  sizeX: 2,
  sizeY: 2,
  type: 10
});
const objectRouteCollision = buildCollision([objectRoutePlacement], 9, 9);
const objectRouteStart = objectRouteCollision.worldToSceneTile(worldTile(1, 4));
const objectRouteWaypoints = findKronosObjectRouteWaypoints(objectRouteStart, objectRoutePlacement, objectRouteCollision);
assert(objectRouteWaypoints.length > 0, "object route should find a reachable footprint edge");
const objectRouteEnd = objectRouteWaypoints.at(-1);
const objectRouteEndWorld = objectRouteCollision.sceneToWorldTile(objectRouteEnd);
assert(
  objectRouteEndWorld.x === WEST + 3 && objectRouteEndWorld.y >= SOUTH + 4 && objectRouteEndWorld.y <= SOUTH + 5,
  `object route should stop on the west footprint edge, got ${JSON.stringify(objectRouteEndWorld)}`
);
assert(
  kronosSceneObjectRouteReached(objectRouteEnd, objectRoutePlacement, objectRouteCollision),
  "object route endpoint should satisfy the source route-object reach check"
);
assert(!objectRouteCollision.canStand(objectRouteCollision.worldToSceneTile(worldTile(4, 4))), "object center should remain blocked");
assert(
  findKronosObjectRouteWaypoints(objectRouteEnd, objectRoutePlacement, objectRouteCollision).length === 0,
  "already-reached object route should not enqueue movement"
);
assert(
  kronosSceneObjectRouteReached(objectRouteEnd, objectRoutePlacement, objectRouteCollision),
  "already-reached object route should still report successful reach"
);

const westBlockedObject = { ...objectRoutePlacement, accessBlockMask: 0x8 };
const westBlockedObjectRoute = findKronosObjectRouteWaypoints(
  objectRouteStart,
  westBlockedObject,
  objectRouteCollision
);
assert(westBlockedObjectRoute.length > 0, "object route should find another edge when west access is blocked");
const westBlockedEndWorld = objectRouteCollision.sceneToWorldTile(westBlockedObjectRoute.at(-1));
assert(
  westBlockedEndWorld.x !== WEST + 3,
  `object access mask should prevent using the west footprint edge: ${JSON.stringify(westBlockedEndWorld)}`
);
assert(
  kronosSceneObjectRouteReached(westBlockedObjectRoute.at(-1), westBlockedObject, objectRouteCollision),
  "access-mask object route endpoint should satisfy object reach"
);

const wallCollision = buildCollision([
  objectPlacement({
    id: 2,
    name: "test west wall",
    type: 0,
    orientation: 0,
    x: WEST + 4,
    y: SOUTH + 4
  })
]);
const wallWest = wallCollision.worldToSceneTile(worldTile(3, 4));
const wallEast = wallCollision.worldToSceneTile(worldTile(4, 4));
assert(!wallCollision.canStep(wallWest, wallEast), "type 0 west wall should block west-to-east entry");
assert(!wallCollision.canStep(wallEast, wallWest), "type 0 west wall should block east-to-west exit");
assert((wallCollision.getFlagWorld(WEST + 3, SOUTH + 4) & KRONOS_WEST_MASK) !== 0, "west-side wall mask missing");
assert((wallCollision.getFlagWorld(WEST + 4, SOUTH + 4) & KRONOS_EAST_MASK) !== 0, "east-side wall mask missing");
const wallWaypoints = findKronosTileRouteWaypoints(wallWest, wallCollision.worldToSceneTile(worldTile(5, 4)), wallCollision);
assert(wallWaypoints.length > 0, "wall route should find an alternate path");
const wallSteps = expandWaypointPath("wall alternate", wallCollision, wallWest, wallWaypoints);
assertSame("wall alternate destination", wallWaypoints.at(-1), wallCollision.worldToSceneTile(worldTile(5, 4)));
assert(
  !wallSteps.some((tile, index) => {
    const previous = index === 0 ? wallWest : wallSteps[index - 1];
    return sameTile(previous, wallWest) && sameTile(tile, wallEast);
  }),
  "wall route crossed the blocked wall edge"
);

const edgeCollision = buildCollision([], 3, 3);
const edgeStart = edgeCollision.worldToSceneTile(worldTile(0, 0));
const outsideDestination = edgeCollision.worldToSceneTile(worldTile(5, 5));
assert(findKronosTileRouteWaypoints(edgeStart, outsideDestination, edgeCollision).length > 0, "near outside click should fallback");
const blockedStartCollision = buildCollision([
  objectPlacement({
    x: WEST,
    y: SOUTH,
    sizeX: 1,
    sizeY: 1,
    type: 10
  })
]);
assert(
  findKronosTileRouteWaypoints(blockedStartCollision.worldToSceneTile(worldTile(0, 0)), openDestination, blockedStartCollision)
    .length === 0,
  "blocked start tile should not route"
);

const floorDecorationCollision = buildCollision([
  objectPlacement({
    type: 22,
    interactType: 1,
    x: WEST + 2,
    y: SOUTH + 2
  })
]);
const floorDecorationTile = floorDecorationCollision.worldToSceneTile(worldTile(2, 2));
assert(!floorDecorationCollision.canStand(floorDecorationTile), "type 22 clipped decoration should block standing");
assert(
  (floorDecorationCollision.getFlagWorld(WEST + 2, SOUTH + 2) & KRONOS_FLOOR_DECORATION_MASK) !== 0,
  "type 22 clipped decoration mask missing"
);

const inertDecorationCollision = buildCollision([
  objectPlacement({
    type: 22,
    interactType: 0,
    x: WEST + 2,
    y: SOUTH + 2
  })
]);
assert(
  inertDecorationCollision.canStand(inertDecorationCollision.worldToSceneTile(worldTile(2, 2))),
  "type 22 non-interactable decoration should not block standing"
);

const rotatedRectangleCollision = buildCollision([
  objectPlacement({
    type: 10,
    orientation: 1,
    x: WEST + 2,
    y: SOUTH + 2,
    sizeX: 1,
    sizeY: 3
  })
]);
assert((rotatedRectangleCollision.getFlagWorld(WEST + 2, SOUTH + 2) & KRONOS_OBJECT_MASK) !== 0, "rotated rectangle west tile missing object mask");
assert((rotatedRectangleCollision.getFlagWorld(WEST + 3, SOUTH + 2) & KRONOS_OBJECT_MASK) !== 0, "rotated rectangle center tile missing object mask");
assert((rotatedRectangleCollision.getFlagWorld(WEST + 4, SOUTH + 2) & KRONOS_OBJECT_MASK) !== 0, "rotated rectangle east tile missing object mask");
assert((rotatedRectangleCollision.getFlagWorld(WEST + 2, SOUTH + 3) & KRONOS_OBJECT_MASK) === 0, "rotated rectangle did not swap footprint by orientation");

const projectileRectangleCollision = buildCollision([
  objectPlacement({
    type: 10,
    x: WEST + 6,
    y: SOUTH + 6,
    blocksProjectile: true
  })
]);
assert(
  (projectileRectangleCollision.getFlagWorld(WEST + 6, SOUTH + 6) & KRONOS_PROJECTILE_MASK) !== 0,
  "solid rectangle should preserve the source projectile mask"
);
assert(
  (projectileRectangleCollision.getProjectileFlagWorld(WEST + 6, SOUTH + 6) & KRONOS_PROJECTILE_MASK) !== 0,
  "solid rectangle should be present in projectile clipping"
);

const projectileBlockedCollision = buildCollision(
  [
    objectPlacement({
      type: 10,
      x: WEST + 4,
      y: SOUTH + 1,
      blocksProjectile: true
    })
  ],
  10,
  5
);
const projectileSourceTile = projectileBlockedCollision.worldToSceneTile(worldTile(1, 1));
const projectileTargetTile = projectileBlockedCollision.worldToSceneTile(worldTile(7, 1));
assert(
  !kronosSceneProjectileRouteClear(projectileSourceTile, projectileTargetTile, projectileBlockedCollision),
  "ProjectileRoute parity should block a straight cast through a tall object"
);
assert(
  !kronosSceneTargetRouteReached(projectileSourceTile, projectileTargetTile, 10, projectileBlockedCollision),
  "TargetRoute parity should not mark ranged/magic in-range when projectile clipping blocks line of sight"
);
const projectileRoute = findKronosTargetRouteWaypoints(
  projectileSourceTile,
  projectileTargetTile,
  10,
  projectileBlockedCollision
);
const projectileRouteEnd = projectileRoute.length === 0 ? projectileSourceTile : projectileRoute[projectileRoute.length - 1];
assert(projectileRoute.length > 0, "blocked projectile target route should path to a tile with line of sight");
assert(
  kronosSceneTargetRouteReached(projectileRouteEnd, projectileTargetTile, 10, projectileBlockedCollision),
  "blocked projectile target route should stop only when range and projectile line of sight are both satisfied"
);

const movementOnlyCollision = buildCollision(
  [
    objectPlacement({
      type: 10,
      x: WEST + 4,
      y: SOUTH + 1,
      blocksProjectile: false
    })
  ],
  10,
  5
);
assert(
  !movementOnlyCollision.canStand(movementOnlyCollision.worldToSceneTile(worldTile(4, 1))),
  "movement-only object should still block standing"
);
assert(
  kronosSceneProjectileRouteClear(
    movementOnlyCollision.worldToSceneTile(worldTile(1, 1)),
    movementOnlyCollision.worldToSceneTile(worldTile(7, 1)),
    movementOnlyCollision
  ),
  "movement-only object should not block projectile line of sight"
);

const diagonalWallCollision = buildCollision([
  objectPlacement({
    type: 1,
    orientation: 0,
    x: WEST + 4,
    y: SOUTH + 4,
    blocksProjectile: true
  })
]);
const diagonalSouthEast = diagonalWallCollision.worldToSceneTile(worldTile(4, 4));
const diagonalNorthWest = diagonalWallCollision.worldToSceneTile(worldTile(3, 5));
assert(!diagonalWallCollision.canStep(diagonalNorthWest, diagonalSouthEast), "type 1 diagonal wall should block southeast entry");
assert(!diagonalWallCollision.canStep(diagonalSouthEast, diagonalNorthWest), "type 1 diagonal wall should block northwest exit");
assert((diagonalWallCollision.getFlagWorld(WEST + 4, SOUTH + 4) & 1) !== 0, "type 1 diagonal wall primary mask missing");
assert((diagonalWallCollision.getFlagWorld(WEST + 3, SOUTH + 5) & 16) !== 0, "type 1 diagonal wall paired mask missing");
assert((diagonalWallCollision.getFlagWorld(WEST + 4, SOUTH + 4) & 512) !== 0, "solid diagonal wall projectile primary mask missing");
assert((diagonalWallCollision.getFlagWorld(WEST + 3, SOUTH + 5) & 8192) !== 0, "solid diagonal wall projectile paired mask missing");
assert(
  (diagonalWallCollision.getProjectileFlagWorld(WEST + 4, SOUTH + 4) & 512) !== 0,
  "solid diagonal wall projectile primary mask should be present in projectile clipping"
);
assert(
  projectileRouteSource.includes("return tile == null ? 0 : tile.projectileClipping;") &&
    projectileRouteSource.includes("targetX = targetX * 2 + targetSize - 1;") &&
    projectileRouteSource.includes("if((targetX & 0x1) != 0)") &&
    projectileRouteSource.includes("allowEntrance(oldX, oldY, z, (absX - oldX), (absY - oldY))"),
  "ProjectileRoute source no longer matches projectile-clipping line-of-sight assumptions"
);
assert(
  targetRouteSource.includes("ProjectileRoute.allow(absX, absY, entity.getHeight(), size, targetX, targetY, targetSize)") &&
    targetRouteSource.includes("ProjectileRoute.allow(stepX, stepY, entity.getHeight(), size, targetX, targetY, targetSize)"),
  "TargetRoute source no longer matches ranged/magic target-route line-of-sight assumptions"
);

assert(
  routeFinderSource.includes("if(lastWrittenDirection != direction)") &&
    routeFinderSource.includes("stepsX[stepCount] = clipUtils.baseX + queueX[writeOffset];"),
  "RouteFinder source no longer matches compressed waypoint reconstruction assumptions"
);
for (const snippet of [
  "public RouteObject routeObject(GameObject gameObject) {",
  "routeObject.set(gameObject.x, gameObject.y, xLength, yLength, ObjectType.values()[gameObject.type], gameObject.direction, someDirection);",
  "public void routeObject(GameObject gameObject, Runnable successAction) {",
  "if(route.finished(entity.getPosition()))",
  "if(route.reachable)"
]) {
  assert(routeFinderSource.includes(snippet), `RouteFinder source no longer matches object-route assumption: ${snippet}`);
}
const clipUtilsSource = readFileSync(path.join(serverRoot, "model", "map", "ClipUtils.java"), "utf8");
for (const snippet of [
  "public boolean method3066(int x, int y, int size, int destX, int destY, int xLength, int yLength, int objectDirectionClip)",
  "if(x == destX - 1 && y >= destY && y <= yAndLength",
  "if(xAndLength + 1 == x && y >= destY && y <= yAndLength",
  "if(destY - 1 == y && x >= destX && x <= xAndLength",
  "if(y == 1 + yAndLength && x >= destX && x <= xAndLength"
]) {
  assert(clipUtilsSource.includes(snippet), `ClipUtils source no longer matches object-reach assumption: ${snippet}`);
}
assert(
  movementSource.includes("int diffX = stepX - absX") &&
    movementSource.includes("position.set(newX, newY);"),
  "Movement source no longer matches one-tile step toward waypoint assumptions"
);
assert(
  playerMovementSource.includes("boolean ran = (forceRun || (isRunning() && stepType != StepType.FORCE_WALK)) && step(player);") &&
    playerMovementSource.includes("runDirection = getRunDirection(diffX, diffY);") &&
    playerMovementSource.includes("private static int getRunDirection(int diffX, int diffY)"),
  "PlayerMovement source no longer matches two-step run movement assumptions"
);
assert(
  sceneSource.includes("Scene_selectedScreenX = var10 - ViewportMouse.client.getViewportXOffset();") &&
    sceneSource.includes("if(checkClick && containsBounds(Scene_selectedScreenX, Scene_selectedScreenY") &&
    sceneSource.includes("Scene_selectedX = var7;") &&
    sceneSource.includes("Scene_selectedY = var8;"),
  "Scene source no longer matches viewport-relative tile-picking assumptions"
);
assert(
  runtimeSceneViewerSource.includes("kronosPickSceneTileFromViewportPoint") &&
    runtimeSceneViewerSource.includes("boundary.sceneTilePicker") &&
    !runtimeSceneViewerSource.includes("runtimeGroundPlane"),
  "RuntimeSceneViewer should pick world clicks from source-shaped terrain triangles instead of a flat ground plane"
);
assert(
  runtimeSceneViewerSource.includes("kronosSceneProjectileRouteClear") &&
    runtimeSceneViewerSource.includes("runtimeCombatProjectileLineOfSight") &&
    runtimeSceneViewerSource.includes("projectileLineOfSight: collisionMap") &&
    !runtimeSceneViewerSource.includes("if (!profile.melee) {\n    return input.actor;\n  }"),
  "RuntimeSceneViewer should route ranged/magic pre-attacks through ProjectileRoute line-of-sight instead of melee-only routing"
);
assert(
    runtimeSceneViewerSource.includes("renderTile: manualActor.renderTile") &&
    runtimeSceneViewerSource.includes("snapManualActorToCollision") &&
    runtimeSceneViewerSource.includes("renderTile: tile") &&
    runtimeSceneViewerSource.includes("expandKronosManualRoutePath(startTile, routeSegment, collision)") &&
    runtimeSceneViewerSource.includes("setKronosManualServerRoutePath(routePath)") &&
    runtimeSceneViewerSource.includes("manualActorRouteClientPosition(actor, startTile)") &&
    runtimeSceneViewerSource.includes("actor.clientPosition ?? kronosClientPositionFromRuntimeTile(actor.renderTile ?? startTile)") &&
    runtimeSceneViewerSource.includes("Entity.freeze() calls Movement.reset(), which clears queued steps without rewriting Position") &&
    runtimeSceneViewerSource.includes("const clientPosition = actor.clientPosition ?? kronosClientPositionFromRuntimeTile(actor.renderTile)") &&
    !runtimeSceneViewerSource.includes("const clientPosition = kronosClientPositionFromRuntimeTile(actor.tile)") &&
    !runtimeSceneViewerSource.includes("actor: advanceManualActorServerRouteTick({") &&
    runtimeSceneViewerSource.includes("stopManualActorMovementIfMovementGated") &&
    runtimeSceneViewerSource.includes("clearManualActorMovementRoute") &&
    runtimeSceneViewerSource.includes('nextCombatState.actors["local-player"].locks') &&
    runtimeSceneViewerSource.includes("lastTileCommandBlockedByMovementGate") &&
    runtimeSceneViewerSource.includes("lastRuntimeCombatRouteBlockedReason") &&
    runtimeSceneViewerSource.includes("advanceManualActorServerRouteTick") &&
    runtimeSceneViewerSource.includes("let local = advanceManualActorServerRouteTick(localBeforeMovement)") &&
    runtimeSceneViewerSource.includes("let opponent = advanceManualActorServerRouteTick(opponentBeforeMovement)") &&
    runtimeSceneViewerSource.includes("actor.running && actor.serverRouteWaypoints.length > 1 ? 2 : 1") &&
    runtimeSceneViewerSource.includes("const enqueuedWaypoints = actor.serverRouteWaypoints.slice(0, enqueueCount)") &&
    runtimeSceneViewerSource.includes("enqueueManualActorClientPathSteps(actor.routeWaypoints, enqueuedWaypoints)") &&
    runtimeSceneViewerSource.includes("queued = queued.slice(1)") &&
    runtimeSceneViewerSource.includes("tile: enqueuedWaypoints[enqueuedWaypoints.length - 1] ?? actor.tile") &&
    runtimeSceneViewerSource.includes("const traversalMode = sourceTickStepCount > 1 ? 2 : 1") &&
    runtimeSceneViewerSource.includes("serverRouteWaypoints") &&
    runtimeSceneViewerSource.includes("routeTraversalModes") &&
    runtimeSceneViewerSource.includes("lastMovementClientCycle") &&
    runtimeSceneViewerSource.includes("movementStallTicks: actor.movementStallTicks") &&
    runtimeSceneViewerSource.includes("movementFrameCycle > frameLength") &&
    runtimeSceneViewerSource.includes("movementFrameCycle = 1") &&
    runtimeSceneViewerSource.includes("movementFrame = 0") &&
    runtimeSceneViewerSource.includes("kronosMovementFrameCursor(actor)") &&
    runtimeSceneViewerSource.includes("movementBlockedBySequence") &&
    runtimeSceneViewerSource.includes("advanceManualActorClientCycle") &&
    runtimeSceneViewerSource.includes("kronosMoveClientAxis(clientPosition.x, targetPosition.x, speed)") &&
    runtimeSceneViewerSource.includes("kronosMovementSequenceNameForSpeed(speed, initialMovementSequenceName)") &&
    runtimeSceneViewerSource.includes("rotateManualActorTowardKronosOrientation") &&
    runtimeSceneViewerSource.includes("rotationUnits += KRONOS_ACTOR_TURN_SPEED_UNITS") &&
    runtimeSceneViewerSource.includes("KRONOS_ACTOR_TURN_ANIMATION_DELAY_TICKS") &&
    runtimeSceneViewerSource.includes("KRONOS_CLIENT_MAX_CYCLES_PER_RENDER_FRAME") &&
    runtimeSceneViewerSource.includes("animationCycle - targetMovementCycle > maxCycleCatchUp ? animationCycle : targetMovementCycle") &&
    runtimeSceneViewerSource.includes("kronosTurnSequenceForReadyMovement(actor.sequenceName, turnTicks, stillTurning)") &&
    runtimeSceneViewerSource.includes('return sequenceName === "idle" || runtimeSequenceIsWeaponReady(sequenceName);') &&
    runtimeSceneViewerSource.includes("tile: actor.tile") &&
    runtimeSceneViewerSource.includes("renderTile: runtimeTileFromKronosClientPosition(clientPosition)") &&
    runtimeSceneViewerSource.includes('hitActor?.actorId === "local-player" ? null : hitActor') &&
    runtimeSceneViewerSource.includes("advanceManualActorsForRenderFrame(now)") &&
    runtimeSceneViewerSource.includes("clientCycle <= localActor.lastMovementClientCycle") &&
    runtimeSceneViewerSource.includes("animationCycle: clientCycle + frameCycleOffset") &&
    !runtimeSceneViewerSource.includes("runtimeAnimationSmoothingManualActorFramePose") &&
    !runtimeSceneViewerSource.includes("renderTile: runtimeTileFromKronosClientPosition(smoothedPosition)") &&
    !runtimeSceneViewerSource.includes("KRONOS_RENDER_MAX_CLIENT_CYCLE_CATCH_UP") &&
    !runtimeSceneViewerSource.includes("window.setInterval(() => {\n      const combatState = manualCombatStateRef.current") &&
    !runtimeSceneViewerSource.includes("manualActorFacingTarget(clearManualActorRoutes(localActorSource), opponentActorSource)") &&
    !runtimeSceneViewerSource.includes("kronosManualQueuedRouteEndTile(actor, startTile)") &&
    !runtimeSceneViewerSource.includes("appendKronosManualRoutePath(actor, routePath)") &&
    !runtimeSceneViewerSource.includes("facingDegrees: kronosFacingDegrees(startTile, routeWaypoints[0])") &&
    !runtimeSceneViewerSource.includes("facingDegrees: kronosFacingDegrees(startTile, movement.finalTile)") &&
    !runtimeSceneViewerSource.includes("tile: interpolateKronosTile") &&
    !runtimeSceneViewerSource.includes("tile: collision.snapTile(renderTile)") &&
    !runtimeSceneViewerSource.includes("tile: nextLogicalTile") &&
    !runtimeSceneViewerSource.includes("collision.snapTile(actor.stepTo ?? actor.tile)"),
  "RuntimeSceneViewer should keep logical tiles snapped, face the active visual movement segment, and avoid spam-click step acceleration"
);
assert(
  /const nextCombatState = resetRuntimePlayerCombatActorTarget\(manualScene\.combatState, "local-player"\);\s+const movementStatus = movementGate\(/.test(runtimeSceneViewerSource) &&
    /if \(movementStatus\.blocked\) \{[\s\S]*manualCombatStateRef\.current = nextCombatState;[\s\S]*setManualCombatState\(nextCombatState\);[\s\S]*showClickCross\(position, color\);[\s\S]*lastTileCommandBlockedByMovementGate/.test(runtimeSceneViewerSource),
  "blocked tile commands should reset combat actions like Kronos WalkHandler and preserve the client-side command click-cross color"
);
assert(
  clientActorMovementSource.includes("var4 = var0.pathX[var0.pathLength - 1] * 128 + var0.size * 64;") &&
    clientActorMovementSource.includes("int var5 = var0.pathY[var0.pathLength - 1] * 128 + var0.size * 64;") &&
    clientActorMovementSource.includes("if(var0.field687 > 0 && var0.pathLength > 1)") &&
    clientActorMovementSource.includes("var9 = 8;") &&
    clientActorMovementSource.includes("--var0.field687;") &&
    clientActorMovementSource.includes("if(var6 == 2)") &&
    clientActorMovementSource.includes("var9 <<= 1;") &&
    clientActorMovementSource.includes("var0.orientation = 1280;") &&
    clientActorMovementSource.includes("var0.orientation = 1792;") &&
    clientActorMovementSource.includes("var0.orientation = 1536;") &&
    clientActorMovementSource.includes("if(var0.readySequence == var0.movementSequence && (var0.field719 > 25 || var14))") &&
    clientActorMovementSource.includes("if(var11 != var4 || var12 != var5)"),
  "Kronos client actor movement source no longer matches next-path-tile facing and catch-up assumptions"
);
assert(
  clientPlayerSource.includes("if(super.pathLength < 9)") &&
    clientPlayerSource.includes("super.pathX[var4] = super.pathX[var4 - 1];") &&
    clientPlayerSource.includes("super.pathY[var4] = super.pathY[var4 - 1];") &&
    clientPlayerSource.includes("super.pathTraversed[var4] = super.pathTraversed[var4 - 1];") &&
    clientPlayerSource.includes("super.pathX[0] = var1;") &&
    clientPlayerSource.includes("super.pathY[0] = var2;") &&
    clientPlayerSource.includes("super.pathTraversed[0] = var3;"),
  "Kronos Player.method1100 source no longer matches path queue insertion assumptions"
);
assert(
  clientLoginPacketSource.includes("var0.sequence = var1;") &&
    clientLoginPacketSource.includes("var0.sequenceDelay = var2;") &&
    clientLoginPacketSource.includes("var0.field726 = var0.pathLength;"),
  "Kronos LoginPacket.method3722 source no longer matches action-sequence path-length snapshot assumptions"
);

function sameTile(left, right) {
  return left.x === right.x && left.z === right.z;
}

console.log(
  JSON.stringify(
    {
      ok: true,
      routeGrid: "128x128",
      openWaypointCount: openWaypoints.length,
      openStepCount: openSteps.length,
      pickedTile,
      logicalTileSplit: true,
      runMovement: "PlayerMovement two-step run contract",
      fallbackWaypointCount: fallbackWaypoints.length,
      fallbackStepCount: fallbackSteps.length,
      fallbackEnd: blockedCollision.sceneToWorldTile(fallbackEnd),
      objectRouteEnd: objectRouteEndWorld,
      westBlockedObjectRouteEnd: westBlockedEndWorld,
      wallWaypointCount: wallWaypoints.length,
      wallStepCount: wallSteps.length
    },
    null,
    2
  )
);
