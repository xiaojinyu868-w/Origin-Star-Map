"use client";

import { useEffect, useState } from "react";

type Phase = "landing" | "generating" | "playing" | "judging" | "complete";
type EngineState = "checking" | "ready" | "offline";
type WorldObject = { name: string; detail: string };
type World = {
  title: string;
  subtitle: string;
  arrival: string;
  scene: string;
  objects: WorldObject[];
  first_anomaly: string;
};
type Evidence = { title: string; detail: string; relevance: number };
type Turn = { action: string; observation: string };
type Result = {
  score: number;
  verdict: "hit" | "close" | "miss";
  feedback: string;
  curiosity_signature: string;
  reveal: string;
  rule_explanation: string;
  domain: string;
};

const MAX_TURNS = 6;
const GENERATION_LINES = [
  "正在写下第一条物理规律",
  "正在让城市居民忘记它的存在",
  "正在埋下三个可以被发现的破绽",
  "正在确认这个世界不会自相矛盾",
];

async function expeditionRequest(body: Record<string, unknown>) {
  const response = await fetch("/api/expedition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "AI世界引擎没有回应");
  return data;
}

export function CuriosityGame() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [engine, setEngine] = useState<EngineState>("checking");
  const [curiosity, setCuriosity] = useState("");
  const [world, setWorld] = useState<World | null>(null);
  const [token, setToken] = useState("");
  const [action, setAction] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [turnsUsed, setTurnsUsed] = useState(0);
  const [latestObservation, setLatestObservation] = useState("");
  const [consequence, setConsequence] = useState("");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showHypothesis, setShowHypothesis] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [generationLine, setGenerationLine] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/expedition")
      .then((response) => response.json())
      .then((data) => { if (active) setEngine(data.connected ? "ready" : "offline"); })
      .catch(() => { if (active) setEngine("offline"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (phase !== "generating") return;
    const timer = window.setInterval(() => {
      setGenerationLine((line) => (line + 1) % GENERATION_LINES.length);
    }, 1700);
    return () => window.clearInterval(timer);
  }, [phase]);

  async function createWorld() {
    if (engine !== "ready") {
      setError("这不是离线也能玩的演示。AI世界引擎连接后，星球才会真正诞生。请先配置新的 DashScope Key。 ");
      return;
    }

    setError("");
    setPhase("generating");
    setEvidence([]);
    setTurns([]);
    setTurnsUsed(0);
    setResult(null);
    setShowHypothesis(false);

    try {
      const data = await expeditionRequest({ mode: "start", curiosity });
      setWorld(data.world);
      setToken(data.token);
      setLatestObservation(data.world.first_anomaly);
      setConsequence("世界已经生成。它的规律此刻存在于AI的秘密状态中。 ");
      setPhase("playing");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "星球生成失败");
      setPhase("landing");
    }
  }

  async function performAction(suggested?: string) {
    const finalAction = (suggested ?? action).trim();
    if (!finalAction || phase !== "playing") return;
    setError("");
    setAction("");
    setPhase("judging");

    try {
      const data = await expeditionRequest({ mode: "act", token, action: finalAction });
      setToken(data.token);
      setTurnsUsed(data.turns_used);
      setLatestObservation(data.observation);
      setConsequence(data.consequence);
      setSuggestions(data.suggested_actions || []);
      setEvidence((current) => [...current, data.evidence]);
      setTurns((current) => [...current, { action: finalAction, observation: data.observation }]);
      setShowHypothesis(Boolean(data.must_guess));
      setPhase("playing");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "实验没有得到回应");
      setAction(finalAction);
      setPhase("playing");
    }
  }

  async function submitHypothesis() {
    const finalHypothesis = hypothesis.trim();
    if (!finalHypothesis || phase !== "playing") return;
    setError("");
    setPhase("judging");

    try {
      const data = await expeditionRequest({ mode: "judge", token, hypothesis: finalHypothesis });
      setTurnsUsed(data.turns_used);
      if (data.ended) {
        setResult(data as Result);
        setPhase("complete");
        return;
      }

      setToken(data.token);
      setLatestObservation(data.feedback);
      setConsequence(`裁判置信度 ${data.score}%。这个假说还不能解释所有现象。`);
      setHypothesis("");
      setShowHypothesis(false);
      setPhase("playing");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "AI裁判没有回应");
      setPhase("playing");
    }
  }

  function useObject(object: WorldObject) {
    setAction(`我仔细检查${object.name}，并尝试改变它的一个条件做对照实验。`);
  }

  function resetExpedition() {
    setPhase("landing");
    setWorld(null);
    setToken("");
    setAction("");
    setHypothesis("");
    setLatestObservation("");
    setConsequence("");
    setEvidence([]);
    setTurns([]);
    setTurnsUsed(0);
    setSuggestions([]);
    setShowHypothesis(false);
    setResult(null);
    setError("");
  }

  if (phase === "generating") {
    return (
      <main className="generation-screen">
        <div className="star-field" aria-hidden="true" />
        <div className="forming-world" aria-hidden="true"><span /></div>
        <p>AI WORLD ENGINE</p>
        <h1>{GENERATION_LINES[generationLine]}<span>…</span></h1>
        <small>这通常需要十几秒。它正在生成规律，而不只是在写一段故事。</small>
      </main>
    );
  }

  if (phase === "landing") {
    return (
      <main className="landing-screen">
        <div className="star-field" aria-hidden="true" />
        <header className="minimal-header">
          <div className="wordmark"><i>✦</i><span>星火档案</span></div>
          <div className={`engine-state ${engine}`}><i />{engine === "checking" ? "连接世界引擎" : engine === "ready" ? "AI世界引擎在线" : "AI世界引擎未连接"}</div>
        </header>

        <section className="landing-content">
          <p className="overline">每次远征，都是第一次</p>
          <h1>告诉我一种最近<br />让你有点好奇的东西。</h1>
          <p className="landing-copy">AI会据此创造一颗此前不存在的星球，并暗中写下一条规律。你有六次行动，找出它。</p>

          <div className="curiosity-input">
            <textarea
              value={curiosity}
              onChange={(event) => setCuriosity(event.target.value)}
              placeholder="比如：为什么人会相信谣言 / 蘑菇 / 时间 / 我也不知道……"
              maxLength={180}
              aria-label="最近好奇的事情"
            />
            <button type="button" onClick={createWorld} disabled={engine === "checking"}>
              生成一颗不存在的星球 <span>→</span>
            </button>
          </div>
          {error ? <div className="engine-error" role="alert">{error}</div> : null}

          <div className="how-it-works" aria-label="玩法说明">
            <div><b>01</b><span>AI暗中生成<br />一条世界规律</span></div>
            <div><b>02</b><span>你可以进行<br />任何自由实验</span></div>
            <div><b>03</b><span>用六次行动<br />证明你的假说</span></div>
          </div>
        </section>

        <footer className="landing-footer">没有题库 · 没有固定选项 · 没有预制答案</footer>
      </main>
    );
  }

  if (phase === "complete" && world && result) {
    const success = result.verdict === "hit";
    return (
      <main className="result-screen">
        <div className="star-field" aria-hidden="true" />
        <section className="result-card">
          <p className="overline">EXPEDITION COMPLETE · {world.title}</p>
          <div className={`result-score ${success ? "success" : "revealed"}`}>{result.score}<small>%</small></div>
          <h1>{success ? "你抓住了这个世界的规律。" : "世界在能量耗尽时揭开了答案。"}</h1>
          <p className="result-feedback">{result.feedback}</p>

          <div className="reveal-card">
            <span>隐藏规律</span>
            <h2>{result.reveal}</h2>
            <p>{result.rule_explanation}</p>
            <small>它连接到真实世界的「{result.domain}」</small>
          </div>

          <div className="thinking-signature">
            <span>这次远征中的你</span>
            <b>{result.curiosity_signature}</b>
          </div>
          <button className="new-world-button" type="button" onClick={resetExpedition}>让AI再生成一颗星球 <span>→</span></button>
        </section>
      </main>
    );
  }

  if (!world) return null;

  const mustGuess = turnsUsed >= MAX_TURNS;
  const busy = phase === "judging";

  return (
    <main className="expedition-screen">
      <header className="expedition-header">
        <button className="wordmark" type="button" onClick={resetExpedition}><i>✦</i><span>星火档案</span></button>
        <div className="world-name"><span>当前星球</span><b>{world.title}</b></div>
        <div className="turn-counter" aria-label={`已经使用${turnsUsed}次行动，共${MAX_TURNS}次`}>
          <span>探测能量</span>
          <div>{Array.from({ length: MAX_TURNS }, (_, index) => <i key={index} className={index < turnsUsed ? "used" : ""} />)}</div>
          <b>{MAX_TURNS - turnsUsed}</b>
        </div>
      </header>

      <div className="expedition-layout">
        <section className="world-stage">
          <div className="world-orb" aria-hidden="true"><span /></div>
          <p className="overline">{world.subtitle}</p>
          <h1>{world.title}</h1>

          {turns.length === 0 ? (
            <div className="arrival-text">
              <p>{world.arrival}</p>
              <p>{world.scene}</p>
            </div>
          ) : null}

          <article className="observation-card">
            <span>{turns.length === 0 ? "最初的异常" : `第 ${turnsUsed} 次观测`}</span>
            <p>{busy ? "世界正在计算你的行动会造成什么后果……" : latestObservation}</p>
            {!busy && consequence ? <small>{consequence}</small> : null}
          </article>

          {!mustGuess && !showHypothesis ? (
            <section className="action-console">
              <label htmlFor="action-input">你要做什么？</label>
              <p>描述行动，而不是向AI索要答案。越像实验，得到的证据越好。</p>
              <textarea
                id="action-input"
                value={action}
                onChange={(event) => setAction(event.target.value)}
                onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") performAction(); }}
                placeholder="例如：我把两只相同的杯子分别交给本地人和机器人，观察它们的变化……"
                maxLength={320}
                disabled={busy}
              />
              <div className="console-actions">
                <button className="hypothesis-link" type="button" onClick={() => setShowHypothesis(true)}>我已经发现规律</button>
                <button className="perform-button" type="button" onClick={() => performAction()} disabled={busy || !action.trim()}>{busy ? "世界演算中…" : "执行实验"}<span>→</span></button>
              </div>
            </section>
          ) : (
            <section className="hypothesis-console">
              <p className="overline">{mustGuess ? "能量耗尽 · 最后一次判断" : "SUBMIT A THEORY"}</p>
              <label htmlFor="hypothesis-input">这个世界真正的规律是什么？</label>
              <textarea
                id="hypothesis-input"
                value={hypothesis}
                onChange={(event) => setHypothesis(event.target.value)}
                placeholder="我的假说是……它能够解释……"
                maxLength={320}
                disabled={busy}
              />
              <div className="console-actions">
                {!mustGuess ? <button className="hypothesis-link" type="button" onClick={() => setShowHypothesis(false)}>再做一次实验</button> : <span />}
                <button className="perform-button" type="button" onClick={submitHypothesis} disabled={busy || !hypothesis.trim()}>{busy ? "AI裁判正在比对证据…" : "提交假说"}<span>→</span></button>
              </div>
            </section>
          )}

          {error ? <div className="play-error" role="alert">{error}</div> : null}

          {!showHypothesis && !mustGuess ? (
            <div className="experiment-prompts">
              {(suggestions.length ? suggestions : world.objects.map((object) => `检查${object.name}`)).slice(0, 3).map((suggestion, index) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => suggestions.length ? setAction(suggestion) : useObject(world.objects[index])}
                >
                  <span>{suggestion}</span><i>↗</i>
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <aside className="evidence-board">
          <header><span>证据板</span><b>{evidence.length}</b></header>
          {evidence.length === 0 ? (
            <div className="empty-evidence">
              <i>?</i>
              <p>实验之后，AI会从世界反应中提取客观证据。</p>
            </div>
          ) : (
            <div className="evidence-list">
              {evidence.map((item, index) => (
                <article key={`${item.title}-${index}`}>
                  <div><span>证据 {String(index + 1).padStart(2, "0")}</span><b>{item.relevance}%</b></div>
                  <h2>{item.title}</h2>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          )}
          {turns.length ? (
            <details className="action-history">
              <summary>查看你的行动记录</summary>
              {turns.map((turn, index) => <p key={`${turn.action}-${index}`}><b>{index + 1}</b>{turn.action}</p>)}
            </details>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
