"""Focused checks for mechanically real scripted Vengeance opponents."""

from fastsim import engine, scripted_policy


def test_scripted_vengeance_uses_a_legal_charge() -> None:
    policy = scripted_policy.ScriptedPolicy(
        "fixed-ranged",
        use_vengeance=True,
    )
    simulation = engine.Engine(
        n_fights=2,
        policy=policy,
        seed=1,
        max_ticks=20,
    )

    simulation.step()

    assert (simulation.state.veng_trinket_casts == 1).all()
    assert (simulation.state.veng_trinket_count == 1).all()


def test_scripted_vengeance_does_not_replace_an_urgent_eat() -> None:
    policy = scripted_policy.ScriptedPolicy(
        "fixed-ranged",
        use_vengeance=True,
    )
    simulation = engine.Engine(
        n_fights=1,
        policy=policy,
        seed=2,
        max_ticks=20,
    )
    simulation.state.hp[:] = 40

    simulation.step()

    assert (simulation.state.veng_trinket_casts == 0).all()
    assert (simulation.state.hp > 40).all()


if __name__ == "__main__":
    test_scripted_vengeance_uses_a_legal_charge()
    test_scripted_vengeance_does_not_replace_an_urgent_eat()
    print("scripted Vengeance policy: OK")
