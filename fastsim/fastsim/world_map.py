"""The small cache-derived map rectangle used by Java self-play lanes."""

from __future__ import annotations

import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from . import schema

ASSET = Path(__file__).with_name("assets") / "edgeville_teacher90_map.bin"

WEST_MASK = 0x1240108
EAST_MASK = 0x1240180
SOUTH_MASK = 0x1240102
NORTH_MASK = 0x1240120
SOUTH_WEST_MASK = 0x124010E
NORTH_WEST_MASK = 0x1240138
SOUTH_EAST_MASK = 0x1240183
NORTH_EAST_MASK = 0x12401E0
DIRECT_ROUTE_COUNT = schema.MOVEMENT_COUNT - schema.MOVE_OFFSET_BASE
EXACT_DISTANCE_FIGHT_MARGIN = 13
DIRECT_ROUTE_BITS = np.left_shift(
    np.uint32(1), np.arange(DIRECT_ROUTE_COUNT, dtype=np.uint32))
ALL_DIRECT_ROUTES = np.uint32((1 << DIRECT_ROUTE_COUNT) - 1)
_DIRECTION_RULES = (
    (-1, 0, WEST_MASK, ()),
    (1, 0, EAST_MASK, ()),
    (0, -1, SOUTH_MASK, ()),
    (0, 1, NORTH_MASK, ()),
    (-1, -1, SOUTH_WEST_MASK,
     ((-1, 0, WEST_MASK), (0, -1, SOUTH_MASK))),
    (1, -1, SOUTH_EAST_MASK,
     ((1, 0, EAST_MASK), (0, -1, SOUTH_MASK))),
    (-1, 1, NORTH_WEST_MASK,
     ((-1, 0, WEST_MASK), (0, 1, NORTH_MASK))),
    (1, 1, NORTH_EAST_MASK,
     ((1, 0, EAST_MASK), (0, 1, NORTH_MASK))),
)
_DIRECTION_INDEX = {
    (dx, dy): index
    for index, (dx, dy, _destination_mask, _side_rules)
    in enumerate(_DIRECTION_RULES)
}
_DIRECTION_BY_DELTA = np.full((3, 3), -1, dtype=np.int8)
for _direction_delta, _direction_index in _DIRECTION_INDEX.items():
    _direction_dx, _direction_dy = _direction_delta
    _DIRECTION_BY_DELTA[
        _direction_dy + 1, _direction_dx + 1] = _direction_index


@dataclass(frozen=True)
class LanePlan:
    x: np.ndarray
    y: np.ndarray
    distance: np.ndarray


class SelfPlayMap:
    def __init__(self, path: Path):
        payload = path.read_bytes()
        magic, version, self.min_x, self.min_y, self.width, self.height, plans = (
            struct.unpack_from(">7i", payload, 0))
        if magic != 0x4E484D50 or version != 1:
            raise ValueError(f"unsupported FastSim map asset {path}")

        count = self.width * self.height
        cell_dtype = np.dtype([("clip", ">i4"), ("wilderness", "u1")])
        cells = np.frombuffer(
            payload, dtype=cell_dtype, count=count, offset=28)
        self.clipping = cells["clip"].astype(np.int32).reshape(
            self.height, self.width)
        self.wilderness = cells["wilderness"].astype(bool).reshape(
            self.height, self.width)

        offset = 28 + count * cell_dtype.itemsize
        self.plans: dict[tuple[int, int, int], LanePlan] = {}
        for _ in range(plans):
            world_id, minimum, maximum, lane_count = struct.unpack_from(
                ">4i", payload, offset)
            offset += 16
            lanes = np.frombuffer(
                payload, dtype=">i4", count=lane_count * 3,
                offset=offset).astype(np.int32).reshape(lane_count, 3)
            offset += lane_count * 12
            self.plans[(world_id, minimum, maximum)] = LanePlan(
                x=lanes[:, 0],
                y=lanes[:, 1],
                distance=lanes[:, 2])
        if offset != len(payload):
            raise ValueError(f"trailing bytes in FastSim map asset {path}")

        # Collision and wilderness do not change in the self-play lanes. Build
        # the complete two-step route answer once for every absolute map tile
        # instead of repeating DumbRoute's clipping work for 24 destinations
        # on every fighter decision.
        self._static_route_masks = self._build_static_route_masks()

    def initial_lanes(
        self, world_id: int, minimum: int, maximum: int, count: int
    ) -> LanePlan | None:
        plan = self.plans.get((world_id, minimum, maximum))
        if plan is None and int(minimum) == int(maximum):
            # Java's anchor evaluator uses exact close/normal distances. The
            # asset stores the same clear lanes under its configured ranges,
            # so derive an exact-distance view by selecting only those
            # source-backed lanes instead of inventing obstacle-free origins.
            for key in (
                    (int(world_id), 1, 8),
                    (int(world_id), 4, 8)):
                source = self.plans.get(key)
                if source is None:
                    continue
                west = source.x - EXACT_DISTANCE_FIGHT_MARGIN
                east = (
                    source.x + source.distance
                    + EXACT_DISTANCE_FIGHT_MARGIN)
                south = source.y - EXACT_DISTANCE_FIGHT_MARGIN
                north = source.y + EXACT_DISTANCE_FIGHT_MARGIN
                selected = (
                    (source.distance == int(minimum))
                    & self._inside(west, south)
                    & self._inside(east, north))
                if selected.any():
                    plan = LanePlan(
                        x=source.x[selected],
                        y=source.y[selected],
                        distance=source.distance[selected])
                    break
        if plan is None:
            return None
        indices = np.arange(count, dtype=np.int64) % len(plan.x)
        return LanePlan(
            x=plan.x[indices],
            y=plan.y[indices],
            distance=plan.distance[indices])

    def has_plan(self, world_id: int, minimum: int, maximum: int) -> bool:
        if (int(world_id), int(minimum), int(maximum)) in self.plans:
            return True
        if int(minimum) != int(maximum):
            return False
        exact = int(minimum)
        return any(
            plan is not None and bool(np.any(
                (plan.distance == exact)
                & self._inside(
                    plan.x - EXACT_DISTANCE_FIGHT_MARGIN,
                    plan.y - EXACT_DISTANCE_FIGHT_MARGIN)
                & self._inside(
                    plan.x + plan.distance
                    + EXACT_DISTANCE_FIGHT_MARGIN,
                    plan.y + EXACT_DISTANCE_FIGHT_MARGIN)))
            for plan in (
                self.plans.get((int(world_id), 1, 8)),
                self.plans.get((int(world_id), 4, 8)),
            ))

    def _inside(self, x, y):
        return (
            (x >= self.min_x)
            & (x < self.min_x + self.width)
            & (y >= self.min_y)
            & (y < self.min_y + self.height))

    def _clip(self, x, y):
        x = np.asarray(x, dtype=np.int32)
        y = np.asarray(y, dtype=np.int32)
        inside = self._inside(x, y)
        safe_x = np.clip(x - self.min_x, 0, self.width - 1)
        safe_y = np.clip(y - self.min_y, 0, self.height - 1)
        return np.where(inside, self.clipping[safe_y, safe_x], 0)

    def _wilderness(self, x, y):
        x = np.asarray(x, dtype=np.int32)
        y = np.asarray(y, dtype=np.int32)
        inside = self._inside(x, y)
        safe_x = np.clip(x - self.min_x, 0, self.width - 1)
        safe_y = np.clip(y - self.min_y, 0, self.height - 1)
        # Relative-coordinate unit tests deliberately live outside the asset.
        return np.where(inside, self.wilderness[safe_y, safe_x], True)

    def step_allowed(self, x, y, target_x, target_y):
        """Vectorized DumbRoute.getDirection/allowEntrance for size-one bots."""
        x = np.asarray(x, dtype=np.int32)
        y = np.asarray(y, dtype=np.int32)
        target_x = np.asarray(target_x, dtype=np.int32)
        target_y = np.asarray(target_y, dtype=np.int32)
        dx = target_x - x
        dy = target_y - y
        result = self._wilderness(target_x, target_y)

        west = (dx == -1) & (dy == 0)
        east = (dx == 1) & (dy == 0)
        south = (dx == 0) & (dy == -1)
        north = (dx == 0) & (dy == 1)
        south_west = (dx == -1) & (dy == -1)
        south_east = (dx == 1) & (dy == -1)
        north_west = (dx == -1) & (dy == 1)
        north_east = (dx == 1) & (dy == 1)

        allowed = np.zeros(np.broadcast_shapes(
            x.shape, y.shape, target_x.shape, target_y.shape), dtype=bool)
        allowed |= west & ((self._clip(x - 1, y) & WEST_MASK) == 0)
        allowed |= east & ((self._clip(x + 1, y) & EAST_MASK) == 0)
        allowed |= south & ((self._clip(x, y - 1) & SOUTH_MASK) == 0)
        allowed |= north & ((self._clip(x, y + 1) & NORTH_MASK) == 0)
        allowed |= south_west & (
            ((self._clip(x - 1, y - 1) & SOUTH_WEST_MASK) == 0)
            & ((self._clip(x - 1, y) & WEST_MASK) == 0)
            & ((self._clip(x, y - 1) & SOUTH_MASK) == 0))
        allowed |= south_east & (
            ((self._clip(x + 1, y - 1) & SOUTH_EAST_MASK) == 0)
            & ((self._clip(x + 1, y) & EAST_MASK) == 0)
            & ((self._clip(x, y - 1) & SOUTH_MASK) == 0))
        allowed |= north_west & (
            ((self._clip(x - 1, y + 1) & NORTH_WEST_MASK) == 0)
            & ((self._clip(x - 1, y) & WEST_MASK) == 0)
            & ((self._clip(x, y + 1) & NORTH_MASK) == 0))
        allowed |= north_east & (
            ((self._clip(x + 1, y + 1) & NORTH_EAST_MASK) == 0)
            & ((self._clip(x + 1, y) & EAST_MASK) == 0)
            & ((self._clip(x, y + 1) & NORTH_MASK) == 0))
        return result & allowed

    def _build_static_route_masks(self):
        """Pack all 24 complete direct-movement routes into one uint32/tile."""
        # Build each of the eight one-tile direction answers once on a one-cell
        # border around the asset. A two-tile route is then two bit lookups.
        # The former construction called the general eight-direction
        # step_allowed routine for every route and substep, repeating the same
        # clipping-array work hundreds of times during every worker import.
        grid_y, grid_x = np.indices(
            (self.height + 2, self.width + 2), dtype=np.int32)
        start_x = grid_x + self.min_x - 1
        start_y = grid_y + self.min_y - 1
        step_masks = np.zeros(start_x.shape, dtype=np.uint8)
        for direction, (dx, dy, destination_mask, side_rules) in enumerate(
                _DIRECTION_RULES):
            target_x = start_x + dx
            target_y = start_y + dy
            allowed = (
                self._wilderness(target_x, target_y)
                & ((self._clip(target_x, target_y)
                    & destination_mask) == 0))
            for side_dx, side_dy, side_mask in side_rules:
                allowed &= (
                    (self._clip(start_x + side_dx, start_y + side_dy)
                     & side_mask) == 0)
            step_masks |= (
                allowed.astype(np.uint8) << np.uint8(direction))

        route_masks = np.zeros(
            (self.height, self.width), dtype=np.uint32)
        origin_steps = step_masks[1:1 + self.height, 1:1 + self.width]
        self._static_step_masks = origin_steps.copy()
        for bit, (dx, dy) in enumerate(
                schema.MOVEMENT_OFFSETS[schema.MOVE_OFFSET_BASE:]):
            dx = int(dx)
            dy = int(dy)
            first_dx = int(np.sign(dx))
            first_dy = int(np.sign(dy))
            first_direction = _DIRECTION_INDEX[(first_dx, first_dy)]
            allowed = (
                origin_steps & (np.uint8(1) << np.uint8(first_direction))
            ) != 0

            remaining_dx = dx - first_dx
            remaining_dy = dy - first_dy
            if remaining_dx != 0 or remaining_dy != 0:
                second_dx = int(np.sign(remaining_dx))
                second_dy = int(np.sign(remaining_dy))
                second_direction = _DIRECTION_INDEX[(second_dx, second_dy)]
                next_steps = step_masks[
                    1 + first_dy:1 + first_dy + self.height,
                    1 + first_dx:1 + first_dx + self.width]
                allowed &= (
                    next_steps
                    & (np.uint8(1) << np.uint8(second_direction))
                ) != 0
            route_masks |= (
                allowed.astype(np.uint32) << np.uint32(bit))
        return route_masks

    def static_route_mask(self, x, y):
        """Return the packed 24-route collision mask for each start tile.

        Relative-coordinate unit tests intentionally operate outside the
        exported Edgeville rectangle. That path was historically treated as
        clear ground by ``step_allowed`` and remains so here.
        """
        x = np.asarray(x, dtype=np.int32)
        y = np.asarray(y, dtype=np.int32)
        inside = self._inside(x, y)
        safe_x = np.clip(x - self.min_x, 0, self.width - 1)
        safe_y = np.clip(y - self.min_y, 0, self.height - 1)
        return np.where(
            inside, self._static_route_masks[safe_y, safe_x],
            ALL_DIRECT_ROUTES)

    def static_routes_allowed(self, x, y):
        """Return the 24 unpacked static route answers for each start tile."""
        route_mask = self.static_route_mask(x, y)
        return (route_mask[..., None] & DIRECT_ROUTE_BITS) != 0

    def cached_step_allowed(self, x, y, target_x, target_y):
        """One-tile DumbRoute answer from the immutable per-tile step cache.

        Runtime self-play stays inside the exported map, so the common path is
        one uint8 lookup. Relative-coordinate tests and any future out-of-asset
        caller retain the exact general collision implementation as a fallback.
        """
        x, y, target_x, target_y = np.broadcast_arrays(
            np.asarray(x, dtype=np.int32),
            np.asarray(y, dtype=np.int32),
            np.asarray(target_x, dtype=np.int32),
            np.asarray(target_y, dtype=np.int32))
        dx = target_x - x
        dy = target_y - y
        valid_direction = (
            (dx >= -1) & (dx <= 1)
            & (dy >= -1) & (dy <= 1)
            & ((dx != 0) | (dy != 0)))
        direction = _DIRECTION_BY_DELTA[
            np.clip(dy, -1, 1) + 1,
            np.clip(dx, -1, 1) + 1]
        direction_bit = np.left_shift(
            np.uint8(1),
            np.maximum(direction, 0).astype(np.uint8))

        inside = self._inside(x, y)
        safe_x = np.clip(x - self.min_x, 0, self.width - 1)
        safe_y = np.clip(y - self.min_y, 0, self.height - 1)
        cached = (
            valid_direction
            & ((self._static_step_masks[safe_y, safe_x]
                & direction_bit) != 0))
        if bool(np.all(inside)):
            return cached

        result = np.array(cached, copy=True)
        outside = ~inside
        result[outside] = self.step_allowed(
            x[outside], y[outside],
            target_x[outside], target_y[outside])
        return result


SELF_PLAY_MAP = SelfPlayMap(ASSET)
