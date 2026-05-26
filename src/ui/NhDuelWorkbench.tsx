import { useCallback, useEffect, useMemo, useState } from "react";
import { createNhPolicyController, type NhPolicyRuntimeController, type ParsedNhPolicy } from "../bot";
import {
  createNhDuelControllerContext,
  createInitialNhDuelState,
  encodeNhPolicyInput,
  nhDefencePrayers,
  nhMovementIntents,
  nhOffenceStyles,
  nhSpecIntents,
  nhSupplyIntents,
  nhDuelStateToClientViewTrace,
  scriptedNhController,
  summarizeNhDuelState,
  tickNhDuel,
  type ClientViewTrace,
  type NhDuelController,
  type NhDuelState,
  type NhMovementIntent,
  type NhOffenceStyle,
  type NhPolicyAction,
  type NhSpecIntent,
  type NhSupplyIntent,
  type PrayerId
} from "../sim";

interface NhDuelWorkbenchProps {
  readonly policy?: ParsedNhPolicy | null;
  readonly onTraceChange?: (trace: ClientViewTrace) => void;
}

const defaultManualAction: NhPolicyAction = {
  offenceStyle: "ranged",
  defencePrayer: "protect_from_magic",
  movementIntent: "pressure",
  supplyIntent: "none",
  specIntent: "none",
  extendedSupplyAction: false
};

function formatPolicyAction(action: NhPolicyAction): string {
  const spec = action.specIntent === "none" ? "" : `, ${action.specIntent}`;
  return `${action.offenceStyle}, ${action.defencePrayer}, ${action.movementIntent}, ${action.supplyIntent}${spec}`;
}

function formatPolicyScore(score: number): string {
  if (!Number.isFinite(score)) {
    return "n/a";
  }
  return score.toFixed(3);
}

function formatEv(score: number | undefined): string {
  if (score === undefined || !Number.isFinite(score)) {
    return "0.00";
  }
  return score.toFixed(2);
}

function manualController(action: NhPolicyAction): NhDuelController {
  return {
    id: "manual-policy-shaped-controller",
    chooseAction: () => action
  };
}

function labelAction(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buttonPressed<T extends string>(current: T, value: T): boolean {
  return current === value;
}

function actorHpPercent(current: number, fixed: number): string {
  const safeFixed = Math.max(1, fixed);
  return `${Math.max(0, Math.min(100, Math.round((current / safeFixed) * 100)))}%`;
}

export function NhDuelWorkbench({ policy, onTraceChange }: NhDuelWorkbenchProps): JSX.Element {
  const [state, setState] = useState<NhDuelState>(() => createInitialNhDuelState(0x4e484d));
  const [action, setAction] = useState<NhPolicyAction>(defaultManualAction);
  const [autoTicking, setAutoTicking] = useState(false);
  const summary = useMemo(() => summarizeNhDuelState(state), [state]);
  const policyController = useMemo<NhPolicyRuntimeController | null>(
    () => (policy ? createNhPolicyController(policy) : null),
    [policy]
  );
  const botController = policyController ?? scriptedNhController;
  const botContext = useMemo(
    () => createNhDuelControllerContext(state.tick, state.actors.opponent, state.actors.self),
    [state]
  );
  const self = state.actors.self;
  const opponent = state.actors.opponent;
  const botPolicyInput = useMemo(() => encodeNhPolicyInput(botContext), [botContext]);
  const policyRankings = policyController?.getLastRankings() ?? [];
  const topPolicyAction = policyRankings[0];
  const lastTick = state.history[state.history.length - 1];
  const fightStatus =
    summary.winner === "self"
      ? "Won"
      : summary.winner === "opponent"
        ? "Lost"
        : summary.winner === "draw"
          ? "Draw"
          : autoTicking
            ? "Live"
            : "Paused";

  const advanceTick = useCallback(() => {
    setState((current) => tickNhDuel(current, manualController(action), botController));
    setAction((current) =>
      current.supplyIntent === "none" && current.specIntent === "none"
        ? current
        : { ...current, supplyIntent: "none", specIntent: "none" }
    );
  }, [action, botController]);

  const updateAction = useCallback(<K extends keyof NhPolicyAction>(key: K, value: NhPolicyAction[K]) => {
    setAction((current) => ({ ...current, [key]: value }));
  }, []);

  useEffect(() => {
    if (!autoTicking) {
      return;
    }
    if (summary.finished) {
      setAutoTicking(false);
      return;
    }

    const interval = window.setInterval(advanceTick, 650);
    return () => window.clearInterval(interval);
  }, [advanceTick, autoTicking, summary.finished]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "SELECT" || target?.tagName === "TEXTAREA") {
        return;
      }

      if (event.key === "1") {
        updateAction("offenceStyle", "magic");
      } else if (event.key === "2") {
        updateAction("offenceStyle", "ranged");
      } else if (event.key === "3") {
        updateAction("offenceStyle", "melee");
      } else if (event.key.toLowerCase() === "q") {
        updateAction("defencePrayer", "protect_from_magic");
      } else if (event.key.toLowerCase() === "w") {
        updateAction("defencePrayer", "protect_from_missiles");
      } else if (event.key.toLowerCase() === "e") {
        updateAction("defencePrayer", "protect_from_melee");
      } else if (event.key === " ") {
        event.preventDefault();
        advanceTick();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [advanceTick, updateAction]);

  useEffect(() => {
    onTraceChange?.(nhDuelStateToClientViewTrace(state, "live-manual-nh-duel-v1"));
  }, [onTraceChange, state]);

  return (
    <section className="workbenchSection" aria-labelledby="nh-duel-core">
      <div className="sectionHeader">
        <p className="eyebrow">Playable core</p>
        <h2 id="nh-duel-core">Browser-side NH duel loop</h2>
      </div>
      <div className="duelHud" aria-label="Playable duel state">
        <div className="fighterHud">
          <div>
            <strong>{self.label}</strong>
            <span>{self.loadoutId}</span>
          </div>
          <div className="hpBar" aria-label="Local hitpoints">
            <span style={{ width: actorHpPercent(self.stats.hitpoints.current, self.stats.hitpoints.fixed) }} />
          </div>
          <code>{self.stats.hitpoints.current}/{self.stats.hitpoints.fixed} HP</code>
        </div>
        <div className="fightClock">
          <span>{fightStatus}</span>
          <strong>{summary.ticks}</strong>
          <small>ticks</small>
        </div>
        <div className="fighterHud fighterHud-opponent">
          <div>
            <strong>{opponent.label}</strong>
            <span>{opponent.loadoutId}</span>
          </div>
          <div className="hpBar" aria-label="Opponent hitpoints">
            <span style={{ width: actorHpPercent(opponent.stats.hitpoints.current, opponent.stats.hitpoints.fixed) }} />
          </div>
          <code>{opponent.stats.hitpoints.current}/{opponent.stats.hitpoints.fixed} HP</code>
        </div>
      </div>
      <div className="duelActionSurface">
        <div className="duelActionPanel">
          <h3>Attack</h3>
          <div className="segmentedButtons">
            {nhOffenceStyles.map((style) => (
              <button
                key={style}
                type="button"
                aria-pressed={buttonPressed(action.offenceStyle, style)}
                onClick={() => updateAction("offenceStyle", style as NhOffenceStyle)}
              >
                {labelAction(style)}
              </button>
            ))}
          </div>
        </div>
        <div className="duelActionPanel">
          <h3>Protect</h3>
          <div className="segmentedButtons">
            {nhDefencePrayers.slice(0, 3).map((prayer) => (
              <button
                key={prayer}
                type="button"
                aria-pressed={buttonPressed(action.defencePrayer, prayer)}
                onClick={() => updateAction("defencePrayer", prayer as PrayerId)}
              >
                {labelAction(prayer.replace("protect_from_", ""))}
              </button>
            ))}
          </div>
        </div>
        <div className="duelActionPanel">
          <h3>Move</h3>
          <div className="segmentedButtons segmentedButtons-wide">
            {(["pressure", "stand_under", "step_out"] as const).map((movement) => (
              <button
                key={movement}
                type="button"
                aria-pressed={buttonPressed(action.movementIntent, movement)}
                onClick={() => updateAction("movementIntent", movement)}
              >
                {labelAction(movement)}
              </button>
            ))}
          </div>
          <select
            aria-label="Detailed movement"
            value={action.movementIntent}
            onChange={(event) => updateAction("movementIntent", event.target.value as NhMovementIntent)}
          >
            {nhMovementIntents.map((movement) => (
              <option key={movement} value={movement}>
                {labelAction(movement)}
              </option>
            ))}
          </select>
        </div>
        <div className="duelActionPanel">
          <h3>Supply</h3>
          <div className="segmentedButtons segmentedButtons-wide">
            {nhSupplyIntents.map((supply) => (
              <button
                key={supply}
                type="button"
                aria-pressed={buttonPressed(action.supplyIntent, supply)}
                onClick={() => updateAction("supplyIntent", supply as NhSupplyIntent)}
              >
                {labelAction(supply)}
              </button>
            ))}
          </div>
        </div>
        <div className="duelActionPanel">
          <h3>Spec</h3>
          <div className="segmentedButtons">
            {nhSpecIntents.map((spec) => (
              <button
                key={spec}
                type="button"
                aria-pressed={buttonPressed(action.specIntent, spec)}
                onClick={() => updateAction("specIntent", spec as NhSpecIntent)}
              >
                {labelAction(spec)}
              </button>
            ))}
          </div>
          <code>{self.gmaul.specialEnergy}% energy</code>
        </div>
        <div className="duelButtons">
          <button type="button" onClick={advanceTick}>
            Tick
          </button>
          <button type="button" onClick={() => setAutoTicking((current) => !current)}>
            {autoTicking ? "Pause" : "Auto"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAutoTicking(false);
              setState(createInitialNhDuelState(0x4e484d));
            }}
          >
            Reset
          </button>
        </div>
        <div className="inventoryStrip" aria-label="Local supplies">
          {Object.entries(self.supplies).map(([item, count]) => (
            <code key={item}>
              {labelAction(item)} {count}
            </code>
          ))}
        </div>
      </div>
      <div className="duelSummaryGrid">
        <article>
          <span>{summary.ticks}</span>
          ticks simulated
        </article>
        <article>
          <span>{summary.events}</span>
          client-visible events
        </article>
        <article>
          <span>{summary.gmaulSpecEvents}</span>
          Gmaul specs
        </article>
        <article>
          <span>{summary.supplyActions}</span>
          supply decisions
        </article>
      </div>
      <div className="duelDetailGrid">
        <article>
          <h3>Damage and healing</h3>
          <code>self dealt {summary.damage.opponent}, healed {summary.healing.self}, HP {summary.finalHp.self}</code>
          <code>bot dealt {summary.damage.self}, healed {summary.healing.opponent}, HP {summary.finalHp.opponent}</code>
        </article>
        <article>
          <h3>Controller bridge</h3>
          <code>{manualController(action).id} vs {botController.id}</code>
          <p>
            The local side consumes the same policy-shaped action object that a loaded policy will emit, while the
            opponent uses the loaded NH policy when one is available.
          </p>
        </article>
        <article>
          <h3>Bot policy now</h3>
          {topPolicyAction ? (
            <>
              <code>#{topPolicyAction.action} score {formatPolicyScore(topPolicyAction.score)}</code>
              <code>{formatPolicyAction(topPolicyAction.decoded)}</code>
            </>
          ) : (
            <code>scripted fallback controller</code>
          )}
        </article>
        <article>
          <h3>Last tick</h3>
          <code>self {lastTick?.selfAction.offenceStyle ?? "none"} / {lastTick?.selfAction.defencePrayer ?? "none"}</code>
          <code>bot {lastTick?.opponentAction.offenceStyle ?? "none"} / {lastTick?.opponentAction.defencePrayer ?? "none"}</code>
        </article>
        <article>
          <h3>Bot observation</h3>
          <code>
            move {botContext.self.lastMoveDx},{botContext.self.lastMoveDy} hit {botContext.self.lastDealtHit}/
            {botContext.self.lastTakenHit}
          </code>
          <code>
            reward {botContext.self.rewardDelta.toFixed(2)} total {botContext.self.rewardTotal.toFixed(2)}
          </code>
          <code>
            EV mage {formatEv(botContext.visibleStyleEvs.find((entry) => entry.style === "magic")?.expectedDamage)} /
            range {formatEv(botContext.visibleStyleEvs.find((entry) => entry.style === "ranged")?.expectedDamage)} /
            melee {formatEv(botContext.visibleStyleEvs.find((entry) => entry.style === "slash")?.expectedDamage)}
          </code>
          <code>
            reach {botContext.meleeReach.relation} edge {botContext.meleeAdvantage.toFixed(2)}
          </code>
          <code>
            stripped {botContext.self.strippedEquipmentSlots.length > 0 ? botContext.self.strippedEquipmentSlots.join(",") : "none"}
          </code>
          <p data-policy-input-sentinel={botPolicyInput.slice(18, 31).some((value) => Math.abs(value) > 0.001) ? "active" : "empty"}>
            Observation slots 18-30 mirror recent food, potion, reward, hit, and movement signals.
          </p>
          <p data-visible-ev-sentinel={botContext.visibleStyleEvs.length >= 3 ? "active" : "empty"}>
            Visible EV is calculated from exported equipment bonuses and current boosted or drained stats.
          </p>
        </article>
      </div>
      {policyRankings.length > 0 ? (
        <div className="policyDecisionList" aria-label="Current bot policy rankings">
          {policyRankings.map((entry) => (
            <article key={entry.action}>
              <div>
                <span>#{entry.action}</span>
                <strong>{formatPolicyScore(entry.score)}</strong>
              </div>
              <code>{formatPolicyAction(entry.decoded)}</code>
              <small>{entry.visits.toLocaleString()} visits</small>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
