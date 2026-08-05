"""Write a rollout with this rig, read it back with the trainer's own loader.

This is the test that matters most. If it passes, the trainer cannot tell the
difference between a file this simulator produced and one the Java server
produced - which is the whole contract of the project.

It deliberately uses nh_rollout.py from the trainer directory rather than a copy,
including its strict validate_factored_exploration_batch, so the moment the Java
schema moves this test fails instead of silently producing junk data.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import (engine, nhrl_writer, policy, reward_events,
                     schema)  # noqa: E402
from fastsim.paths import trainer_dir  # noqa: E402

sys.path.insert(0, str(trainer_dir()))
import nh_rollout as R  # noqa: E402
import nh_reward_events as E  # noqa: E402


class VengeanceHoldPolicy:
    input_size = schema.INPUT_SIZE

    def score(self, inputs):
        rows = len(inputs)
        scores = np.zeros(
            (rows, schema.ACTION_COUNT), dtype=np.float32)
        scores[
            :, schema.COMBAT_BASE + schema.COMBAT_NO_ATTACK] = 100.0
        scores[
            :, schema.COMBAT_BASE + schema.COMBAT_SPEC_NONE] = 100.0
        scores[
            :, schema.DEFENCE_BASE + schema.PRAY_PROTECT_MELEE] = 100.0
        scores[
            :, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 100.0
        scores[
            :, schema.SUPPLY_BASE + schema.SUPPLY_NONE] = 100.0
        scores[
            :,
            schema.SUPPLY_BASE + schema.SUPPLY_VENGEANCE_TRINKET,
        ] = 200.0
        return scores, np.zeros(rows, dtype=np.float32)


def _scalar_action_labels(chosen, causal_actual, required_weapon):
    """The former row-at-a-time writer logic, retained as a test oracle."""
    labels_out = np.full(
        (chosen.shape[0], nhrl_writer.ACTION_LABEL_SLOTS),
        -1,
        dtype=np.int32)
    counts = np.zeros(chosen.shape[0], dtype=np.int32)
    for row in range(chosen.shape[0]):
        labels = list(chosen[row])
        gear_labels = []
        for action in causal_actual[row, schema.CHANNEL_GEAR_BASE:]:
            action = int(action)
            if action >= 0 and action not in labels:
                gear_labels.append(action)
        weapon = int(required_weapon[row])
        if weapon >= 0 and weapon not in labels:
            gear_labels.append(weapon)
        labels.extend(sorted(set(gear_labels)))
        counts[row] = len(labels)
        labels_out[row, :len(labels)] = labels
    return labels_out, counts


def test_vectorized_writer_helpers_match_scalar_oracles() -> None:
    rng = np.random.default_rng(20260727)
    rows = 4096
    chosen = rng.integers(
        0, schema.ACTION_COUNT, size=(rows, 4), dtype=np.int32)
    causal_actual = rng.integers(
        -1,
        schema.ACTION_COUNT,
        size=(rows, schema.CAUSAL_UNIT_COUNT),
        dtype=np.int32)
    required_weapon = rng.integers(
        -1, schema.ACTION_COUNT, size=rows, dtype=np.int32)

    expected_labels, expected_counts = _scalar_action_labels(
        chosen, causal_actual, required_weapon)
    actual_labels, actual_counts = nhrl_writer._compose_action_labels(
        chosen, causal_actual, required_weapon)
    assert np.array_equal(actual_counts, expected_counts)
    assert np.array_equal(actual_labels, expected_labels)

    for action_count, byte_count in (
            (1, 1), (8, 1), (9, 2),
            (schema.ACTION_COUNT, schema.LEGAL_MASK_BYTES)):
        mask = rng.integers(
            0, 2, size=(rows, action_count), dtype=np.uint8).astype(bool)
        padded = np.zeros((rows, byte_count * 8), dtype=np.uint8)
        padded[:, :action_count] = mask
        expected = np.packbits(
            padded, axis=-1, bitorder="little")
        actual = nhrl_writer.pack_legal_mask(mask, byte_count)
        assert np.array_equal(actual, expected)


def test_roundtrip(tmp_path: Path) -> None:
    out = tmp_path / "nh-rollout-fastsim-test-loop1-world1.nhrl"

    eng = engine.Engine(n_fights=16, policy=policy.RandomPolicy(seed=3),
                        seed=11, epsilon=0.22, max_ticks=40)
    # End one lane immediately while the other fifteen continue. Fixed-size
    # batching still advances that array row internally, but neither NHRL nor
    # NHEV may emit phantom post-terminal data for it.
    eng.state.pending_damage[0, 0, 0] = 200
    eng.state.pending_style_of_hit[0, 0, 0] = schema.STYLE_MAGIC
    action_ids = schema.CURRENT_ACTION_IDS

    with nhrl_writer.RolloutWriter(out, action_ids, exploration_rate=0.22) as writer:
        events = reward_events.RewardEventWriter(
            out,
            rollout_created_millis=writer.created_millis,
            action_ids_fingerprint=writer.action_ids_fingerprint)
        try:
            for _ in range(40):
                record = eng.step()
                if record is not None:
                    writer.write(record)
                    events.write(record)
            final = eng.flush()
            writer.write(final)
            events.write(final)
        finally:
            events.close()
        rows = writer.rows_written

    assert rows > 0

    header = R.read_header(out)
    assert header.version == schema.NHRL_VERSION
    assert header.input_size == schema.INPUT_SIZE
    assert header.action_count == schema.ACTION_COUNT
    assert header.legal_mask_bytes == schema.LEGAL_MASK_BYTES
    assert header.rows == rows
    assert header.remainder == 0, "trailing partial record - the writer is misaligned"

    raw = R.RolloutFile(out).records
    terminal = raw["done"] != 0
    assert (raw["transition_tick"][terminal]
            == raw["decision_tick"][terminal]).all()
    assert (raw["transition_tick"][~terminal]
            == raw["decision_tick"][~terminal] + 1).all()

    corpus = R.RolloutCorpus([out])
    R.validate_action_ids_fingerprint(corpus, action_ids)
    R.require_corrected_training_schema(corpus)
    reward_summary = E.attach_nonterminal_reward_credit(corpus)
    assert reward_summary[0]["episodeSummaries"] == 32
    assert reward_summary[0]["completeFights"] == 32
    assert abs(reward_summary[0]["massResidual"]) < 1.0e-9

    batch = corpus.sample_batch(batch_size=min(512, rows),
                                rng=np.random.default_rng(0))
    R.validate_factored_exploration_batch(
        batch, action_count=schema.ACTION_COUNT, configured_exploration_rate=0.22)

    assert np.isfinite(batch["input"]).all()
    assert np.isfinite(batch["next_input"]).all()
    assert batch["input"].shape[1] == schema.INPUT_SIZE
    channel = batch["channel_action_labels"]
    assert ((channel[:, 0] >= schema.COMBAT_BASE)
            & (channel[:, 0] < schema.COMBAT_SPEC_NONE)).all()
    assert ((channel[:, 1] >= schema.COMBAT_SPEC_NONE)
            & (channel[:, 1] < schema.COMBAT_BASE + schema.COMBAT_COUNT)).all()
    assert ((channel[:, 2] >= schema.DEFENCE_BASE)
            & (channel[:, 2] < schema.DEFENCE_BASE + schema.DEFENCE_COUNT)).all()
    assert ((channel[:, 3] >= schema.MOVEMENT_BASE)
            & (channel[:, 3] < schema.MOVEMENT_BASE + schema.MOVEMENT_COUNT)).all()
    assert ((channel[:, 4] >= schema.SUPPLY_BASE)
            & (channel[:, 4] < schema.SUPPLY_BASE + schema.SUPPLY_COUNT)).all()


def test_defence_only_exploration_roundtrip(tmp_path: Path) -> None:
    out = tmp_path / "nh-rollout-fastsim-defence-exploration.nhrl"
    eng = engine.Engine(
        n_fights=16,
        policy=policy.RandomPolicy(seed=3),
        opponent_policy=policy.RandomPolicy(seed=4),
        seed=20260731,
        epsilon=1.0,
        max_ticks=8,
        exploration_units=(schema.CHANNEL_DEFENCE,),
        exploration_policy_side=0)

    with nhrl_writer.RolloutWriter(
            out,
            schema.CURRENT_ACTION_IDS,
            exploration_rate=1.0) as writer:
        while eng.has_work():
            record = eng.step()
            if record is not None:
                writer.write(record)
        final = eng.flush()
        if final is not None:
            writer.write(final)

    corpus = R.RolloutCorpus([out])
    batch = corpus.sample_batch(
        batch_size=len(corpus.files[0].records),
        rng=np.random.default_rng(0))
    R.validate_factored_exploration_batch(
        batch,
        action_count=schema.ACTION_COUNT,
        configured_exploration_rate=1.0)

    main_rows = (batch["bot_index"] & 1) == 1
    opponent_rows = ~main_rows
    eligible = R.unpack_causal_unit_masks(
        batch["causal_unit_eligible_mask"])
    attempted = R.unpack_causal_unit_masks(
        batch["exploration_attempted_mask"])
    assert main_rows.any() and opponent_rows.any()
    assert eligible[
        main_rows, schema.CHANNEL_DEFENCE].all()
    assert (eligible[main_rows].sum(axis=1) == 1).all()
    assert not eligible[opponent_rows].any()
    assert attempted[
        main_rows, schema.CHANNEL_DEFENCE].all()
    assert not attempted[opponent_rows].any()


def test_second_episode_vengeance_credit_targets_global_decision(
        tmp_path: Path) -> None:
    out = tmp_path / "nh-rollout-fastsim-vengeance-clock.nhrl"
    eng = engine.Engine(
        n_fights=1,
        policy=VengeanceHoldPolicy(),
        seed=31,
        epsilon=0.0,
        max_ticks=10,
        episodes_per_lane=2,
        start_distance_min=2,
        start_distance_max=2)
    # Suppress the first episode's cast. A fresh-fight reset restores both
    # charges, so episode two exercises a cast after world and episode clocks
    # have diverged.
    eng.state.veng_trinket_count[:] = 0
    injected = False
    cast_tick = -1

    with nhrl_writer.RolloutWriter(
            out, schema.CURRENT_ACTION_IDS,
            exploration_rate=0.0) as writer:
        events = reward_events.RewardEventWriter(
            out,
            rollout_created_millis=writer.created_millis,
            action_ids_fingerprint=writer.action_ids_fingerprint)
        try:
            while eng.has_work():
                record = eng.step()
                if record is not None:
                    writer.write(record)
                    events.write(record)
                if (
                    not injected
                    and int(eng.state.episode_id[0, 0]) == 2
                    and int(eng.state.tick[0]) == 2
                ):
                    cast_tick = eng.world_tick - 1
                    assert (
                        eng.state.veng_trinket_last_cast_tick[0, 0]
                        == cast_tick)
                    # Feed one real styled hit into side zero. It consumes the
                    # just-cast Vengeance and produces rolling-DPS credit whose
                    # supply contributor must resolve to this episode's cast.
                    eng.state.pending_damage[0, 0, 0] = 20
                    eng.state.pending_style_of_hit[
                        0, 0, 0] = schema.STYLE_MAGIC
                    eng.state.pending_source_tick[0, 0, 0] = cast_tick
                    eng.state.pending_hit_damage[0, 0, 0, 0] = 20
                    eng.state.pending_hit_styles[
                        0, 0, 0, 0] = schema.STYLE_MAGIC
                    eng.state.pending_hit_source_ticks[
                        0, 0, 0, 0] = cast_tick
                    eng.state.pending_hit_count[0, 0, 0] = 1
                    injected = True
            final = eng.flush()
            if final is not None:
                writer.write(final)
                events.write(final)
        finally:
            events.close()

    assert injected
    corpus = R.RolloutCorpus([out])
    summaries = E.attach_nonterminal_reward_credit(corpus)
    assert summaries[0]["episodeSummaries"] == 4

    sidecar = E.RewardEventFile(out.with_suffix(".nhev"))
    allocations = sidecar.records
    reflected_dps = (
        (allocations["episode_id"] == 2)
        & (allocations["event_type"] == reward_events.EVENT_ROLLING_DPS)
        & (allocations["causal_unit"] == reward_events.UNIT_SUPPLY)
        & (allocations["target_decision_tick"] == cast_tick)
    )
    assert reflected_dps.any()


def test_snapshot_provenance_roundtrip(tmp_path: Path) -> None:
    out = tmp_path / "nh-rollout-fastsim-snapshot-loop1-world1.nhrl"
    eng = engine.Engine(
        n_fights=2,
        policy=policy.RandomPolicy(seed=5),
        seed=13,
        epsilon=0.22,
        max_ticks=3)
    record = None
    while record is None:
        record = eng.step()

    with nhrl_writer.RolloutWriter(
            out,
            schema.CURRENT_ACTION_IDS,
            exploration_rate=0.22) as writer:
        writer.write(
            record,
            source_pair_mode=schema.PAIR_MODE_SNAPSHOT,
            opponent_snapshot_id=7)

    raw = R.RolloutFile(out).records
    assert raw.shape[0] > 0
    assert np.all(
        raw["source_pair_mode_code"] == schema.PAIR_MODE_SNAPSHOT)
    assert np.all(raw["opponent_snapshot_id"] == 7)


if __name__ == "__main__":
    import tempfile

    test_vectorized_writer_helpers_match_scalar_oracles()
    # ignore_cleanup_errors: the trainer's loader keeps the file mapped, and
    # Windows will not delete a mapped file. That is a teardown detail, not a
    # test result.
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as td:
        root = Path(td)
        test_roundtrip(root)
        test_second_episode_vengeance_credit_targets_global_decision(root)
        test_snapshot_provenance_roundtrip(root)
    print("roundtrip OK: the trainer's own loader accepted the file")
