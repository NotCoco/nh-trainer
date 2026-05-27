import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { parseNhPolicyTsv, type ParsedNhPolicy } from "../bot";
import type { DefaultPolicyReadResult } from "../client/bridge";
import "./styles.css";

const RuntimeSceneViewer = lazy(() =>
  import("./RuntimeSceneViewer").then((module) => ({ default: module.RuntimeSceneViewer }))
);

type BotDifficulty = "easy" | "medium" | "hard";

type BotPolicyLoadState =
  | { readonly status: "loading"; readonly label: string }
  | { readonly status: "loaded"; readonly label: string }
  | { readonly status: "error"; readonly label: string };

const DEFAULT_STATIC_POLICY_URL = "./ai/nhstaker-selfplay-policy-nhstake-ags.tsv";
const BOT_DIFFICULTY_STORAGE_KEY = "nh-trainer.bot-difficulty";
const BOT_DIFFICULTY_POLICIES: Record<BotDifficulty, { readonly label: string; readonly staticUrl: string }> = {
  easy: {
    label: "Easy",
    staticUrl: "./ai/nhstaker-selfplay-policy-easy.tsv"
  },
  medium: {
    label: "Medium",
    staticUrl: "./ai/nhstaker-selfplay-policy-medium.tsv"
  },
  hard: {
    label: "Hard",
    staticUrl: "./ai/nhstaker-selfplay-policy-hard.tsv"
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
  const [loadedPolicy, setLoadedPolicy] = useState<ParsedNhPolicy | null>(null);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>(() => readStoredBotDifficulty());
  const [policyLoadState, setPolicyLoadState] = useState<BotPolicyLoadState>({
    status: "loading",
    label: BOT_DIFFICULTY_POLICIES[botDifficulty].label
  });
  const policyCacheRef = useRef(new Map<BotDifficulty, ParsedNhPolicy>());

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
        const parsed = parseNhPolicyTsv(result.text, formatPolicySourceLabel(result));
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
            A browser practice client for getting real NH reps against an AI opponent. It is playable
            now, still being tightened, and built around one honest goal: make switches, prayers,
            pathing, supplies, and pressure feel useful enough to practice.
          </p>
          <div className="nhSiteIntroDetails" aria-label="Current bot difficulty modes">
            <div>
              <span>Current</span>
              <strong>Easy, Medium, and Hard AI modes</strong>
            </div>
            <div>
              <span>Focus</span>
              <strong>Client feel, combat timing, and movement</strong>
            </div>
            <div>
              <span>Profile</span>
              <strong>Settings and setup save in this browser</strong>
            </div>
          </div>
          <details className="nhSiteMoreInfo">
            <summary>More info</summary>
            <p>
              The opponent is a trained NH bot, not a scripted rotation. It uses the current fight
              setup and learned policy to choose gear, prayers, supplies, movement, and attacks. More
              detailed information will be on the GitHub soon.
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
          botDifficulty={botDifficulty}
          botPolicyLoadState={policyLoadState.status}
          onBotDifficultyChange={setBotDifficulty}
        />
      </Suspense>
      <Analytics />
    </main>
  );
}

function readStoredBotDifficulty(): BotDifficulty {
  if (typeof window === "undefined") {
    return "medium";
  }
  const stored = window.localStorage?.getItem(BOT_DIFFICULTY_STORAGE_KEY);
  return stored === "easy" || stored === "hard" ? stored : "medium";
}

async function loadDifficultyPolicy(difficulty: BotDifficulty): Promise<DefaultPolicyReadResult> {
  if (difficulty === "medium") {
    const bridge = window.nhTrainer;
    if (bridge?.readDefaultPolicy) {
      try {
        return {
          ...(await bridge.readDefaultPolicy()),
          path: BOT_DIFFICULTY_POLICIES.medium.staticUrl
        };
      } catch (error) {
        const fallback = await readStaticDifficultyPolicy(difficulty);
        return {
          ...fallback,
          path: `${fallback.path} (bridge failed: ${error instanceof Error ? error.message : "unknown error"})`
        };
      }
    }
  }

  return readStaticDifficultyPolicy(difficulty);
}

async function readStaticDifficultyPolicy(difficulty: BotDifficulty): Promise<DefaultPolicyReadResult> {
  const policyInfo = BOT_DIFFICULTY_POLICIES[difficulty];
  try {
    return await readStaticPolicyUrl(policyInfo.staticUrl);
  } catch (error) {
    if (difficulty === "medium") {
      const fallback = await readStaticDefaultPolicy();
      return {
        ...fallback,
        path: `${fallback.path} (${policyInfo.staticUrl} failed: ${
          error instanceof Error ? error.message : "unknown error"
        })`
      };
    }
    throw error;
  }
}

async function readStaticDefaultPolicy(): Promise<DefaultPolicyReadResult> {
  return readStaticPolicyUrl(DEFAULT_STATIC_POLICY_URL);
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
