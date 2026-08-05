import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import {
  assertNhNeuralPolicyHasCurrentDmmActionSurface,
  assertNhNeuralPolicyHasExplicitSpecActions,
  parseNhNeuralPolicyJson,
  type ParsedNhNeuralPolicy
} from "../bot";
import type { DefaultPolicyReadResult } from "../client/bridge";
import type { NhSpecIntent } from "../sim";
import "./styles.css";

const RuntimeSceneViewer = lazy(() =>
  import("./RuntimeSceneViewer").then((module) => ({ default: module.RuntimeSceneViewer }))
);

type BotDifficulty = "hard" | "test";

type BotPolicyLoadState =
  | { readonly status: "idle"; readonly label: string }
  | { readonly status: "loading"; readonly label: string }
  | { readonly status: "loaded"; readonly label: string }
  | { readonly status: "error"; readonly label: string };

type BotPolicyAsset = {
  readonly label: string;
  readonly staticUrl?: string;
  readonly staticUrls?: readonly string[];
  readonly requiredExplicitSpecIntents?: readonly NhSpecIntent[];
  readonly requireDmmDirectGearActions?: boolean;
};

const BOT_POLICY_LOAD_TIMEOUT_MS = 180_000;

const DMM_CURRENT_POLICY_URL = "./ai/nh-neural-policy-dmm-current.json";
const DMM_REQUIRED_EXPLICIT_SPEC_INTENTS = [
  "spec_granite_maul",
  "spec_granite_maul_double",
  "spec_armadyl_godsword",
  "spec_voidwaker",
  "spec_vesta_longsword"
] as const;

const DMM_HARD_POLICY: BotPolicyAsset = {
  label: "DMM",
  requireDmmDirectGearActions: true,
  requiredExplicitSpecIntents: DMM_REQUIRED_EXPLICIT_SPEC_INTENTS,
  staticUrl: DMM_CURRENT_POLICY_URL
};

const BOT_DIFFICULTY_STORAGE_KEY = "nh-trainer.bot-difficulty";
const BOT_DIFFICULTY_POLICIES: Record<BotDifficulty, BotPolicyAsset> = {
  hard: {
    // The deployed NH stake model is the 90-input/44,550-action checkpoint, which predates the
    // explicit per-weapon spec actions. Requiring them here rejects the model the site ships.
    label: "Hard",
    staticUrl: "./ai/nh-neural-policy-hard.json",
    staticUrls: [
      "./ai/nh-neural-policy-hard.json.part-001",
      "./ai/nh-neural-policy-hard.json.part-002",
      "./ai/nh-neural-policy-hard.json.part-003"
    ]
  },
  test: {
    label: "Test",
    staticUrl: "./ai/nh-neural-policy-test.json"
  }
};

function RuntimeSceneViewerFallback(): JSX.Element {
  return (
    <section className="workbenchSection runtimeClientSection" aria-labelledby="runtime-scene">
      <div className="sectionHeader">
        <p className="eyebrow">Runtime scene</p>
        <h2 id="runtime-scene">NH render scene</h2>
      </div>
      <div className="runtimeScene">
        <div className="runtimeViewport">
          <div className="glbStatus glbStatus-loading">Loading runtime scene module.</div>
        </div>
        <div className="runtimePanel">
          <p>Preparing scene controls.</p>
        </div>
      </div>
    </section>
  );
}

export function App(): JSX.Element {
  const [loadedPolicy, setLoadedPolicy] = useState<ParsedNhNeuralPolicy | null>(null);
  const [loadedDmmHardPolicy, setLoadedDmmHardPolicy] = useState<ParsedNhNeuralPolicy | null>(null);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>(() => readStoredBotDifficulty());
  const [policyLoadState, setPolicyLoadState] = useState<BotPolicyLoadState>({
    status: "idle",
    label: BOT_DIFFICULTY_POLICIES[botDifficulty].label
  });
  const [dmmHardPolicyLoadState, setDmmHardPolicyLoadState] = useState<BotPolicyLoadState>({
    status: "idle",
    label: DMM_HARD_POLICY.label
  });
  const policyCacheRef = useRef(new Map<BotDifficulty, ParsedNhNeuralPolicy>());
  const policyLoadPromiseRef = useRef(new Map<BotDifficulty, Promise<void>>());
  const botDifficultyRef = useRef<BotDifficulty>(botDifficulty);
  const dmmHardPolicyRef = useRef<ParsedNhNeuralPolicy | null>(null);
  const dmmHardPolicyLoadPromiseRef = useRef<Promise<void> | null>(null);
  const appMountedRef = useRef(true);

  useEffect(() => {
    appMountedRef.current = true;
    return () => {
      appMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    botDifficultyRef.current = botDifficulty;
    window.localStorage?.setItem(BOT_DIFFICULTY_STORAGE_KEY, botDifficulty);
    const policyInfo = BOT_DIFFICULTY_POLICIES[botDifficulty];
    const cached = policyCacheRef.current.get(botDifficulty);
    if (cached) {
      setLoadedPolicy(cached);
      setPolicyLoadState({ status: "loaded", label: policyInfo.label });
      return;
    }
    setLoadedPolicy(null);
    setPolicyLoadState({
      status: policyLoadPromiseRef.current.has(botDifficulty) ? "loading" : "idle",
      label: policyInfo.label
    });
  }, [botDifficulty]);

  const ensureBotPolicyLoaded = useCallback((difficulty: BotDifficulty = botDifficultyRef.current): void => {
    const policyInfo = BOT_DIFFICULTY_POLICIES[difficulty];
    const cached = policyCacheRef.current.get(difficulty);
    if (cached) {
      if (botDifficultyRef.current === difficulty && appMountedRef.current) {
        setLoadedPolicy(cached);
        setPolicyLoadState({ status: "loaded", label: policyInfo.label });
      }
      return;
    }

    const existing = policyLoadPromiseRef.current.get(difficulty);
    if (existing) {
      if (botDifficultyRef.current === difficulty && appMountedRef.current) {
        setPolicyLoadState({ status: "loading", label: policyInfo.label });
      }
      return;
    }

    if (botDifficultyRef.current === difficulty && appMountedRef.current) {
      setLoadedPolicy(null);
      setPolicyLoadState({ status: "loading", label: policyInfo.label });
    }
    const loadPromise = withPolicyLoadTimeout(readStaticPolicyAsset(policyInfo), policyInfo.label)
      .then((result) => {
        const parsed = parseDifficultyPolicy(result, policyInfo);
        policyCacheRef.current.set(difficulty, parsed);
        if (botDifficultyRef.current === difficulty && appMountedRef.current) {
          setLoadedPolicy(parsed);
          setPolicyLoadState({ status: "loaded", label: policyInfo.label });
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : `Could not load the ${policyInfo.label} NH policy.`;
        console.warn(message);
        if (botDifficultyRef.current === difficulty && appMountedRef.current) {
          setLoadedPolicy(null);
          setPolicyLoadState({ status: "error", label: policyInfo.label });
        }
      })
      .finally(() => {
        policyLoadPromiseRef.current.delete(difficulty);
      });
    policyLoadPromiseRef.current.set(difficulty, loadPromise);
    void loadPromise;
  }, []);

  const selectBotDifficulty = useCallback((difficulty: BotDifficulty): void => {
    botDifficultyRef.current = difficulty;
    setBotDifficulty(difficulty);
    const policyInfo = BOT_DIFFICULTY_POLICIES[difficulty];
    const cached = policyCacheRef.current.get(difficulty);
    if (cached) {
      setLoadedPolicy(cached);
      setPolicyLoadState({ status: "loaded", label: policyInfo.label });
      return;
    }
    setLoadedPolicy(null);
    setPolicyLoadState({
      status: policyLoadPromiseRef.current.has(difficulty) ? "loading" : "idle",
      label: policyInfo.label
    });
  }, []);

  const ensureDmmHardPolicyLoaded = useCallback((): void => {
    if (dmmHardPolicyRef.current || dmmHardPolicyLoadPromiseRef.current) {
      return;
    }

    setDmmHardPolicyLoadState({ status: "loading", label: DMM_HARD_POLICY.label });
    const loadPromise = withPolicyLoadTimeout(readStaticPolicyAsset(DMM_HARD_POLICY), DMM_HARD_POLICY.label)
      .then((result) => {
        const parsed = parseDifficultyPolicy(result, DMM_HARD_POLICY);
        dmmHardPolicyRef.current = parsed;
        if (appMountedRef.current) {
          setLoadedDmmHardPolicy(parsed);
          setDmmHardPolicyLoadState({ status: "loaded", label: DMM_HARD_POLICY.label });
        }
      })
      .catch((error: unknown) => {
        console.warn(error instanceof Error ? error.message : `Could not load DMM hard policy.`);
        if (appMountedRef.current) {
          setLoadedDmmHardPolicy(null);
          setDmmHardPolicyLoadState({ status: "error", label: DMM_HARD_POLICY.label });
        }
      })
      .finally(() => {
        dmmHardPolicyLoadPromiseRef.current = null;
      });
    dmmHardPolicyLoadPromiseRef.current = loadPromise;
    void loadPromise;
  }, []);

  return (
    <main
      className="shell clientOnlyShell"
      data-default-policy-loaded={loadedPolicy ? "true" : "false"}
      data-bot-difficulty={botDifficulty}
      data-bot-policy-status={policyLoadState.status}
      data-dmm-hard-policy-status={dmmHardPolicyLoadState.status}
    >
      <div className="nhSiteBackdrop" aria-label="NH Trainer project information">
        <section className="nhSiteIntro" aria-labelledby="nh-site-title">
          <h1 id="nh-site-title" className="nhSiteWordmark" aria-label="NH Trainer">
            <span className="nhSiteWordmarkMark" aria-hidden="true">NH</span>
            <span className="nhSiteWordmarkText" aria-hidden="true">
              <span>Trainer</span>
            </span>
          </h1>
          <p className="nhSiteIntroStatement">
            An open-source browser practice client for getting real NH reps against an AI opponent.
            It is playable now, still being tightened, and built around one honest goal: make
            switches, prayers, pathing, supplies, and pressure feel useful enough to practice.
          </p>
          <p className="nhSiteSourceLine">
            <a href="https://github.com/NotCoco/nh-trainer" target="_blank" rel="noreferrer">
              View source on GitHub
            </a>
            <span aria-hidden="true"> / </span>
            <a href="/blog/">
              Training blog
            </a>
          </p>
          <div className="nhSiteIntroDetails" aria-label="Project focus and browser profile">
            <div>
              <span>Focus</span>
              <strong>Client feel, combat timing, and movement</strong>
            </div>
            <div>
              <span>Profile</span>
              <strong>Settings and setup save in this browser</strong>
            </div>
          </div>
          <div className="nhSiteUpdates" aria-label="Update history">
            <details className="nhSiteUpdatesDropdown" open>
              <summary>
                <span>Latest update</span>
                <strong>August 5, 2026</strong>
              </summary>
              <div className="nhSiteUpdateHistory">
                <section className="nhSiteUpdateCard" aria-label="Updates - August 5, 2026">
                  <span>Updates - August 5, 2026</span>
                  <ul>
                    <li>DMM opponent upgraded to teacher165, the v26 ranged multi-gear prayer checkpoint: the best prayer reading of the top Elo league finishers, a balanced magic/ranged/melee mix, and strong expected damage per fight.</li>
                    <li>Added the Elo league: every compatible checkpoint and scripted opponent played one full fight against every other entrant (313 entrants, 48,828 fights). teacher165 was picked as the deployed model because it was the most balanced of the top three - the leader was a no-opponent-prayer ablation and second place had noticeably weaker prayer reading.</li>
                    <li>Deployed model parity is now gate-checked against the Java checkpoint: defence-prayer and policy-boundary replay gates pass within 1e-5 score tolerance.</li>
                    <li>Fixed the resizable-mode minimap mask so it uses the real source mask sprite and scales with the client frame instead of assuming a fixed 145x151 mask.</li>
                    <li>Fixed same-tick combat resolution order (PID): an attack now resolves against the defender's pre-movement tile when the defender already moved earlier in the same tick, matching Java's player-processing order.</li>
                    <li>Removed the old aim trainer section; the site is now the NH practice client with NH stake and DMM setups.</li>
                  </ul>
                </section>
                <section className="nhSiteUpdateCard" aria-label="Updates - June 15, 2026">
                  <span>Updates - June 15, 2026</span>
                  <ul>
                    <li>Hard mode now uses neural models for both NH stake and DMM setups.</li>
                    <li>DMM Hard is using the direct-gear Java DMM checkpoint with explicit action IDs matched to the Java/TypeScript action bridge.</li>
                    <li>Both large neural hard-mode models now load through deployable chunks.</li>
                    <li>PID and vengeance trinket overlays are Alt-draggable and no longer overlap by default; fight deaths reset back to setup selection.</li>
                  </ul>
                </section>
                <section className="nhSiteUpdateCard" aria-label="Updates - June 10, 2026">
                  <span>Updates - June 10, 2026</span>
                  <ul>
                    <li>Public opponents were simplified to one Hard option, with the selected setup choosing the model.</li>
                    <li>NH stake Hard uses the expanded continuation model: 11,604,230 parameters, three 256-unit hidden layers, and 44,550 action outputs.</li>
                    <li>The large NH stake model is served through deployable chunks so the hosted build can load it reliably.</li>
                  </ul>
                </section>
                <section className="nhSiteUpdateCard" aria-label="Updates - June 6, 2026">
                  <span>Updates - June 6, 2026</span>
                  <ul>
                    <li>Camera zoom, fixed-client framing, context-menu anchoring, and menu close timing were tightened against source behavior.</li>
                    <li>VLS regular attacks, spell/combat sounds, and sequence playback received parity fixes.</li>
                    <li>Main-client mouse-wheel zoom now stays inside the client instead of scrolling the page.</li>
                  </ul>
                </section>
                <section className="nhSiteUpdateCard" aria-label="Updates - June 5, 2026">
                  <span>Updates - June 5, 2026</span>
                  <ul>
                    <li>DMM setup added with the captured inventory, new gear, and its own hard-mode policy path.</li>
                    <li>Noxious halberd, Voidwaker, VLS, Zaryte crossbow, trinket of vengeance, and bolt procs are wired in.</li>
                    <li>Game sounds, continuous audio sliders, camera zoom, right-click timing, and combat animation parity were tightened.</li>
                  </ul>
                </section>
                <section className="nhSiteUpdateCard" aria-label="Updates - June 4, 2026">
                  <span>Updates - June 4, 2026</span>
                  <ul>
                    <li>Hard-mode policy evaluation gained runtime head-to-head and cohort checks.</li>
                    <li>The public shell was simplified around the playable trainer instead of internal workbench controls.</li>
                  </ul>
                </section>
                <section className="nhSiteUpdateCard" aria-label="Updates - June 1, 2026">
                  <span>Updates - June 1, 2026</span>
                  <ul>
                    <li>Hard policy and camera framing were refreshed.</li>
                    <li>Overlay projection and camera-wheel checks were expanded to catch fixed-client framing regressions.</li>
                  </ul>
                </section>
              </div>
            </details>
          </div>
          <details className="nhSiteMoreInfo">
            <summary>More info</summary>
            <p>
              The opponent is a trained NH bot, not a scripted rotation. It uses the current fight
              setup and learned policy to choose gear, prayers, supplies, movement, and attacks. More
              detailed information is available in the GitHub repo.
            </p>
          </details>
          <p className="nhSiteNotice">
            Free unofficial fan/practice project. Created using intellectual property belonging to
            Jagex Limited under the terms of Jagex&apos;s Fan Content Policy. This content is not
            endorsed by or affiliated with Jagex.
          </p>
        </section>
      </div>
      <Suspense fallback={<RuntimeSceneViewerFallback />}>
        <RuntimeSceneViewer
          policy={loadedPolicy}
          dmmHardPolicy={loadedDmmHardPolicy}
          botDifficulty={botDifficulty}
          botPolicyLoadState={policyLoadState.status}
          dmmHardPolicyLoadState={dmmHardPolicyLoadState.status}
          onBotDifficultyChange={selectBotDifficulty}
          onBotPolicyNeeded={ensureBotPolicyLoaded}
          onDmmHardPolicyNeeded={ensureDmmHardPolicyLoaded}
        />
      </Suspense>
      <Analytics />
    </main>
  );
}

function readStoredBotDifficulty(): BotDifficulty {
  if (typeof window === "undefined") {
    return "hard";
  }
  const params = new URLSearchParams(window.location.search);
  const queryDifficulty = params.get("bot") ?? params.get("difficulty");
  if (isBotDifficulty(queryDifficulty)) {
    return queryDifficulty;
  }
  const stored = window.localStorage?.getItem(BOT_DIFFICULTY_STORAGE_KEY);
  return isBotDifficulty(stored) ? stored : "hard";
}

function isBotDifficulty(value: unknown): value is BotDifficulty {
  if (value === "test") {
    return isLocalNhTrainerDevSurface();
  }
  return value === "hard";
}

function isLocalNhTrainerDevSurface(): boolean {
  if (!isLocalNhTrainerHost()) {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("watchPanel") === "1";
}

function isLocalNhTrainerHost(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "::1"
  );
}

async function readStaticPolicyAsset(policyInfo: BotPolicyAsset): Promise<DefaultPolicyReadResult> {
  if (policyInfo.staticUrls?.length) {
    const chunks = await Promise.all(policyInfo.staticUrls.map((url) => readStaticPolicyUrl(url)));
    return {
      path: policyInfo.staticUrl ?? chunks.map((chunk) => chunk.path).join("+"),
      text: chunks.map((chunk) => chunk.text).join(""),
      source: "static-chunked",
      bytes: chunks.reduce((sum, chunk) => sum + (chunk.bytes ?? 0), 0)
    };
  }
  if (!policyInfo.staticUrl) {
    throw new Error(`No static URL configured for ${policyInfo.label}.`);
  }
  return readStaticPolicyUrl(policyInfo.staticUrl);
}

function withPolicyLoadTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} model did not finish loading within ${BOT_POLICY_LOAD_TIMEOUT_MS / 1000} seconds.`));
    }, BOT_POLICY_LOAD_TIMEOUT_MS);
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

async function readStaticPolicyUrl(url: string): Promise<DefaultPolicyReadResult> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load NH policy from ${url}.`);
  }
  const text = await response.text();
  return {
    path: url,
    text,
    source: "static-fallback",
    bytes: new TextEncoder().encode(text).length
  };
}

function parseDifficultyPolicy(result: DefaultPolicyReadResult, policyInfo: BotPolicyAsset): ParsedNhNeuralPolicy {
  const sourceLabel = formatPolicySourceLabel(result);
  const policy = parseNhNeuralPolicyJson(result.text, sourceLabel);
  assertNhNeuralPolicyHasExplicitSpecActions(policy, policyInfo.requiredExplicitSpecIntents ?? [], policyInfo.label);
  if (policyInfo.requireDmmDirectGearActions) {
    assertNhNeuralPolicyHasCurrentDmmActionSurface(policy, policyInfo.label);
  }
  return policy;
}

function formatPolicySourceLabel(result: DefaultPolicyReadResult): string {
  const metadata: string[] = [result.source];
  if (result.bytes !== undefined) {
    metadata.push(`${result.bytes.toLocaleString()} bytes`);
  }
  if (result.mtimeMs !== undefined) {
    metadata.push(`mtime ${new Date(result.mtimeMs).toLocaleString()}`);
  }
  return `${result.path} (${metadata.join(", ")})`;
}
