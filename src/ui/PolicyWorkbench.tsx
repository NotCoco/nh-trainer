import { useEffect, useMemo, useState } from "react";
import { parseNhPolicyTsv, summarizeNhPolicy, type ParsedNhPolicy } from "../bot";
import type { DefaultPolicyReadResult } from "../client/bridge";

const DEFAULT_STATIC_POLICY_URL = "./ai/nhstaker-selfplay-policy-nhstake-ags.tsv";

type PolicyLoadState =
  | { readonly kind: "empty"; readonly message: string }
  | { readonly kind: "ready"; readonly message: string; readonly policy: ParsedNhPolicy }
  | { readonly kind: "error"; readonly message: string };

interface PolicyWorkbenchProps {
  readonly onPolicyLoad?: (policy: ParsedNhPolicy) => void;
}

export function PolicyWorkbench({ onPolicyLoad }: PolicyWorkbenchProps): JSX.Element {
  const [state, setState] = useState<PolicyLoadState>({
    kind: "empty",
    message: "Load an NH self-play policy TSV."
  });
  const summary = useMemo(() => (state.kind === "ready" ? summarizeNhPolicy(state.policy, 6) : null), [state]);

  useEffect(() => {
    let canceled = false;

    void loadDefaultPolicy()
      .then((result) => {
        if (!canceled) {
          const sourceLabel = formatPolicySourceLabel(result);
          const policy = parseNhPolicyTsv(result.text, sourceLabel);
          setState({
            kind: "ready",
            message: `Loaded ${sourceLabel}`,
            policy
          });
          onPolicyLoad?.(policy);
        }
      })
      .catch((error: unknown) => {
        if (canceled) {
          return;
        }
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "Could not load the default NH policy."
        });
      });

    return () => {
      canceled = true;
    };
  }, [onPolicyLoad]);

  return (
    <section className="workbenchSection" aria-labelledby="policy-workbench">
      <div className="sectionHeader">
        <p className="eyebrow">Bot policy</p>
        <h2 id="policy-workbench">NH policy artifact bridge</h2>
      </div>
      <div className="policyWorkbench">
        <div className="policyLoader">
          <label htmlFor="policy-file">Policy TSV</label>
          <input
            id="policy-file"
            type="file"
            accept=".tsv,text/tab-separated-values,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              void file
                .text()
                .then((text) => {
                  const policy = parseNhPolicyTsv(text, file.name);
                  setState({
                    kind: "ready",
                    message: `Loaded ${file.name}`,
                    policy
                  });
                  onPolicyLoad?.(policy);
                })
                .catch(() =>
                  setState({
                    kind: "error",
                    message: `Could not read ${file.name}.`
                  })
                );
            }}
          />
          <p className={`policyStatus policyStatus-${state.kind}`}>{state.message}</p>
        </div>
        {summary ? (
          <div className="policySummary">
            <article>
              <span>{summary.counters.decisions.toLocaleString()}</span>
              decisions
            </article>
            <article>
              <span>{summary.counters.samples.toLocaleString()}</span>
              samples
            </article>
            <article>
              <span>{summary.weightEntryCount.toLocaleString()}</span>
              weights
            </article>
            <article>
              <span>{summary.actionsWithVisits.toLocaleString()}</span>
              visited actions
            </article>
          </div>
        ) : null}
      </div>
      {summary ? (
        <div className="policyTopActions">
          {summary.topActions.map((action) => (
            <article key={action.action}>
              <h3>Action {action.action}</h3>
              <code>{action.visits.toLocaleString()} visits</code>
              <p>
                {action.decoded.offenceStyle} / {action.decoded.defencePrayer} / {action.decoded.movementIntent} /{" "}
                {action.decoded.supplyIntent} / {action.decoded.specIntent}
              </p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

async function loadDefaultPolicy(): Promise<DefaultPolicyReadResult> {
  const bridge = window.kronosTrainer;
  if (bridge?.readDefaultPolicy) {
    try {
      return await bridge.readDefaultPolicy();
    } catch (error) {
      const fallback = await readStaticDefaultPolicy();
      return {
        ...fallback,
        path: `${fallback.path} (bridge failed: ${error instanceof Error ? error.message : "unknown error"})`
      };
    }
  }

  return readStaticDefaultPolicy();
}

async function readStaticDefaultPolicy(): Promise<DefaultPolicyReadResult> {
  const response = await fetch(DEFAULT_STATIC_POLICY_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `Could not load default NH policy from ${DEFAULT_STATIC_POLICY_URL}; sync it with npm run sync:policy or use the file picker.`
    );
  }
  const text = await response.text();
  return {
    path: DEFAULT_STATIC_POLICY_URL,
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
