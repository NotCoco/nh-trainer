from fastsim import replay


def test_keyed_draw_is_stable_and_keyed():
    values = [
        replay.unit(424242, 0, 0, 0, replay.DRAW_ONYX),
        replay.unit(424242, 0, 0, 0, replay.DRAW_DAMAGE),
        replay.unit(424242, 0, 0, 0, replay.DRAW_ACCURACY),
        replay.unit(424242, 17, 1, 2, replay.DRAW_DAMAGE),
    ]
    assert values == [
        0.3722374188237384,
        0.07081511393386841,
        0.3654756978123681,
        0.5614821260078289,
    ]
    assert len(set(values)) == len(values)


if __name__ == "__main__":
    test_keyed_draw_is_stable_and_keyed()
    print("replay RNG tests passed")
