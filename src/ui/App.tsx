import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import {
  parseNhNeuralPolicyJson,
  parseNhPolicyTsv,
  type NhRuntimePolicy
} from "../bot";
import type { DefaultPolicyReadResult } from "../client/bridge";
import { NhAimTrainer } from "./NhAimTrainer";
import "./styles.css";

const RuntimeSceneViewer = lazy(() =>
  import("./RuntimeSceneViewer").then((module) => ({ default: module.RuntimeSceneViewer }))
);

type BotDifficulty = "hard" | "test";

type BotPolicyLoadState =
  | { readonly status: "loading"; readonly label: string }
  | { readonly status: "loaded"; readonly label: string }
  | { readonly status: "error"; readonly label: string };

type BotPolicyAssetFormat = "tsv" | "neural-json";
type BotPolicyAsset = {
  readonly label: string;
  readonly staticUrl: string;
  readonly format: BotPolicyAssetFormat;
};

const DMM_HARD_POLICY: BotPolicyAsset = {
  label: "DMM Hard",
  staticUrl: "./ai/nh-neural-policy-dmm-candidate.json",
  format: "neural-json"
};
const BOT_DIFFICULTY_STORAGE_KEY = "nh-trainer.bot-difficulty";
const BOT_DIFFICULTY_POLICIES: Record<BotDifficulty, BotPolicyAsset> = {
  hard: {
    label: "Hard",
    staticUrl: "./ai/nh-neural-policy-hard.json",
    format: "neural-json"
  },
  test: {
    label: "Test",
    staticUrl: "./ai/nh-neural-policy-test.json",
    format: "neural-json"
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
  const [loadedPolicy, setLoadedPolicy] = useState<NhRuntimePolicy | null>(null);
  const [loadedDmmHardPolicy, setLoadedDmmHardPolicy] = useState<NhRuntimePolicy | null>(null);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>(() => readStoredBotDifficulty());
  const [policyLoadState, setPolicyLoadState] = useState<BotPolicyLoadState>({
    status: "loading",
    label: BOT_DIFFICULTY_POLICIES[botDifficulty].label
  });
  const policyCacheRef = useRef(new Map<BotDifficulty, NhRuntimePolicy>());

  useEffect(() => {
    let cancelled = false;
    void readStaticPolicyUrl(DMM_HARD_POLICY.staticUrl)
      .then((result) => {
        if (!cancelled) {
          setLoadedDmmHardPolicy(parseDifficultyPolicy(result, DMM_HARD_POLICY));
        }
      })
      .catch((error: unknown) => {
        console.warn(error instanceof Error ? error.message : `Could not load DMM hard policy.`);
        if (!cancelled) {
          setLoadedDmmHardPolicy(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const policyInfo = BOT_DIFFICULTY_POLICIES[botDifficulty];
    window.localStorage?.setItem(BOT_DIFFICULTY_STORAGE_KEY, botDifficulty);

    const cached = policyCacheRef.current.get(botDifficulty);
    if (cached) {
      setLoadedPolicy(cached);
      setPolicyLoadState({ status: "loaded", label: policyInfo.label });
      return () => {
        cancelled = true;
      };
    }

    setLoadedPolicy(null);
    setPolicyLoadState({ status: "loading", label: policyInfo.label });
    void loadDifficultyPolicy(botDifficulty)
      .then((result) => {
        if (cancelled) {
          return;
        }
        const parsed = parseDifficultyPolicy(result, policyInfo);
        policyCacheRef.current.set(botDifficulty, parsed);
        setLoadedPolicy(parsed);
        setPolicyLoadState({ status: "loaded", label: policyInfo.label });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : `Could not load the ${policyInfo.label} NH policy.`;
        console.warn(message);
        if (!cancelled) {
          setPolicyLoadState({ status: "error", label: policyInfo.label });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [botDifficulty]);

  return (
    <main
      className="shell clientOnlyShell"
      data-default-policy-loaded={loadedPolicy ? "true" : "false"}
      data-bot-difficulty={botDifficulty}
      data-bot-policy-status={policyLoadState.status}
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
          <div className="nhSiteUpdates" aria-label="Recent updates">
            <section className="nhSiteUpdateCard" aria-label="Updates - June 10, 2026">
              <span>Updates - June 10, 2026</span>
              <ul>
                <li>Public opponents now use one Hard option, with separate neural models for NH stake and DMM setups.</li>
                <li>NH stake Hard uses the expanded continuation model: 11,604,230 parameters, three 256-unit hidden layers, and 44,550 action outputs.</li>
                <li>DMM Hard uses the restored pre-trinket re-equip checkpoint: 3,332,394 parameters, two 64-unit hidden layers, and 51,114 action outputs.</li>
              </ul>
            </section>
            <section className="nhSiteUpdateCard" aria-label="Updates - June 5, 2026">
              <span>Updates - June 5, 2026</span>
              <ul>
                <li>DMM setup added with the captured inventory, new gear, and its own hard-mode policy.</li>
                <li>Noxious halberd, Voidwaker, VLS, Zaryte crossbow, trinket of vengeance, and bolt procs are wired in.</li>
                <li>Game sounds, continuous audio sliders, aim training, camera zoom, right-click timing, and combat animation parity were tightened.</li>
              </ul>
            </section>
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
          onBotDifficultyChange={setBotDifficulty}
        />
      </Suspense>
      <div className="nhAimTrainerScrollHint">Scroll down to try the aim trainer</div>
      <NhAimTrainer />
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
  if (typeof window === "undefined") {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("watchPanel") === "1" && (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "::1"
  );
}

async function loadDifficultyPolicy(difficulty: BotDifficulty): Promise<DefaultPolicyReadResult> {
  return readStaticDifficultyPolicy(difficulty);
}

async function readStaticDifficultyPolicy(difficulty: BotDifficulty): Promise<DefaultPolicyReadResult> {
  const policyInfo = BOT_DIFFICULTY_POLICIES[difficulty];
  return readStaticPolicyUrl(policyInfo.staticUrl);
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

function parseDifficultyPolicy(result: DefaultPolicyReadResult, policyInfo: BotPolicyAsset): NhRuntimePolicy {
  const sourceLabel = formatPolicySourceLabel(result);
  return policyInfo.format === "neural-json"
    ? parseNhNeuralPolicyJson(result.text, sourceLabel)
    : parseNhPolicyTsv(result.text, sourceLabel);
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
