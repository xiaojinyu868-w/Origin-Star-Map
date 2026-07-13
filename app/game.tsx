"use client";

import { useEffect, useRef, useState } from "react";

type Spark = {
  id: string;
  name: string;
  field: string;
  note: string;
};

type SaveData = {
  version: 1;
  completed: boolean;
  expeditions: number;
  sparks: Spark[];
};

type AiAnswer = {
  reply: string;
  counter_question: string;
  discovered_concepts: string[];
  source?: "dashscope" | "offline";
};

const STORAGE_KEY = "spark-atlas-save-v1";

const INITIAL_SAVE: SaveData = {
  version: 1,
  completed: false,
  expeditions: 0,
  sparks: [
    {
      id: "curiosity",
      name: "好奇心",
      field: "起点",
      note: "承认自己尚不知道，是一切探索的第一步。",
    },
  ],
};

const CITY_SPARKS: Spark[] = [
  {
    id: "scarcity",
    name: "稀缺性",
    field: "经济学",
    note: "资源有限时，选择本身就意味着代价。",
  },
  {
    id: "information",
    name: "信息",
    field: "复杂系统",
    note: "一个系统不仅要分配资源，还要知道需求在哪里。",
  },
  {
    id: "incentive",
    name: "激励",
    field: "行为科学",
    note: "规则改变之后，人的行为也会随之改变。",
  },
  {
    id: "gift-economy",
    name: "礼物经济",
    field: "人类学",
    note: "交换未必依赖价格，也可能建立在关系、声望与互惠上。",
  },
];

const SIGNALS = [
  { id: "priceless", name: "无价之城", code: "EC-01", state: "active", pos: "signal-city" },
  { id: "swarm", name: "无首蜂群", code: "CX-17", state: "next", pos: "signal-swarm" },
  { id: "probability", name: "概率风暴", code: "PR-08", state: "next", pos: "signal-probability" },
  { id: "ship", name: "忒修斯港", code: "PH-04", state: "locked", pos: "signal-ship" },
  { id: "language", name: "失语文明", code: "LN-21", state: "locked", pos: "signal-language" },
  { id: "evolution", name: "艳羽荒原", code: "EV-12", state: "locked", pos: "signal-evolution" },
] as const;

const OFFLINE_ANSWERS: Array<{ pattern: RegExp; answer: AiAnswer }> = [
  {
    pattern: /货币|钱|价格|买|卖/,
    answer: {
      reply:
        "货币不是合作的前提，它更像一种压缩信息的工具：把‘谁需要什么、什么有多稀缺’浓缩成价格。小型共同体可以靠熟人关系和声望运转，但规模扩大后，信息传递会变成真正的难题。",
      counter_question: "如果所有东西都免费，人们会怎样表达某样东西特别稀缺？",
      discovered_concepts: ["价格信号", "礼物经济"],
      source: "offline",
    },
  },
  {
    pattern: /劳动|懒|动力|工作|激励/,
    answer: {
      reply:
        "人并不只被金钱驱动。归属感、声望、使命感和互惠都能产生动力。但这些动力并不自动稳定：当贡献难以被看见，或者索取者不必承担代价，合作就可能被侵蚀。",
      counter_question: "你会如何奖励那些重要、却没人愿意做的工作？",
      discovered_concepts: ["内在动机", "搭便车问题"],
      source: "offline",
    },
  },
  {
    pattern: /人口|一亿|扩大|规模|陌生人/,
    answer: {
      reply:
        "规模会改变规则。在几十人的群体里，记忆和声誉就是账本；在一亿人的社会里，没有人能认识所有人。制度的作用，正是让陌生人之间也能交换信息、建立预期并约束行为。",
      counter_question: "一种在村庄里有效的规则，为什么到了城市可能失灵？",
      discovered_concepts: ["规模效应", "制度"],
      source: "offline",
    },
  },
];

function offlineAnswer(question: string): AiAnswer {
  const match = OFFLINE_ANSWERS.find(({ pattern }) => pattern.test(question));
  return (
    match?.answer ?? {
      reply:
        "这个问题已经碰到无价之城的核心：分配不只是‘把东西发出去’，还要同时解决信息、激励与公平。改变其中任何一项，另外两项都会跟着变化。",
      counter_question: "如果由你设计规则，你最担心它被人怎样利用？",
      discovered_concepts: ["机制设计"],
      source: "offline",
    }
  );
}

export function CuriosityGame() {
  const [save, setSave] = useState<SaveData>(INITIAL_SAVE);
  const [welcomeOpen, setWelcomeOpen] = useState(true);
  const [missionOpen, setMissionOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [missionStep, setMissionStep] = useState(0);
  const [narrative, setNarrative] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [toast, setToast] = useState("");
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SaveData;
        if (parsed.version === 1) {
          setSave(parsed);
          setWelcomeOpen(false);
        }
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      hydrated.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  }, [save]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function beginMission() {
    setMissionStep(0);
    setNarrative("");
    setQuestion("");
    setAnswer(null);
    setMissionOpen(true);
  }

  function inspectLocked(name: string, state: string) {
    if (state === "next" && save.completed) {
      setToast(`${name} 已收到坐标，将在下一次远征开放`);
      return;
    }
    setToast(save.completed ? "这片星域仍被认知迷雾覆盖" : "完成无价之城，才能校准更远的信号");
  }

  function choose(text: string, response: string, nextStep: number) {
    setNarrative(`你选择了「${text}」。${response}`);
    setMissionStep(nextStep);
  }

  async function askGuide(suggested?: string) {
    const finalQuestion = (suggested ?? question).trim();
    if (!finalQuestion || asking) return;
    setQuestion(finalQuestion);
    setAsking(true);

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      const response = await fetch("/api/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: finalQuestion,
          context: "无价之城：一个没有货币，依靠公共仓库和贡献记录运转的社会",
        }),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      if (!response.ok) throw new Error("offline");
      const data = (await response.json()) as AiAnswer;
      setAnswer({ ...data, source: "dashscope" });
    } catch {
      setAnswer(offlineAnswer(finalQuestion));
    } finally {
      setAsking(false);
      setMissionStep(4);
    }
  }

  function finishMission() {
    setSave((current) => ({
      ...current,
      completed: true,
      expeditions: current.completed ? current.expeditions : current.expeditions + 1,
      sparks: current.completed ? current.sparks : [...current.sparks, ...CITY_SPARKS],
    }));
    setMissionOpen(false);
    setToast("远征完成：三条新航路已经显现");
  }

  function resetSave() {
    setSave(INITIAL_SAVE);
    setArchiveOpen(false);
    setWelcomeOpen(true);
    window.localStorage.removeItem(STORAGE_KEY);
  }

  const progress = save.completed ? 18 : 4;

  return (
    <main className="game-shell">
      <div className="space-noise" aria-hidden="true" />
      <div className="nebula nebula-one" aria-hidden="true" />
      <div className="nebula nebula-two" aria-hidden="true" />

      <header className="topbar">
        <button className="brand" type="button" onClick={() => setWelcomeOpen(true)} aria-label="打开任务简介">
          <span className="brand-mark">✦</span>
          <span>
            <b>星火档案</b>
            <small>CURIOSITY EXPEDITION</small>
          </span>
        </button>

        <div className="ship-status" aria-label="飞船状态">
          <span className="status-dot" />
          火种号 · 航行正常
        </div>

        <nav className="top-actions" aria-label="游戏菜单">
          <button type="button" onClick={() => setArchiveOpen(true)}>
            档案库 <span>{save.sparks.length}</span>
          </button>
          <button className="sound-button" type="button" onClick={() => setToast("环境音将在正式版开放")} aria-label="声音设置">
            ◖))
          </button>
        </nav>
      </header>

      <section className="universe-layout">
        <aside className="mission-rail">
          <p className="eyebrow">CURRENT TRANSMISSION</p>
          <div className="mission-code">01</div>
          <h1>收到一个<br />不合常理的信号</h1>
          <p className="mission-copy">
            在编号 EC-01 的行星上，没有货币、价格与私人商店——但城市已经稳定运行了 217 年。
          </p>
          <div className="objective">
            <span>本次目标</span>
            <p>{save.completed ? "已确认四枚知识火种" : "找出这座城市如何分配稀缺资源"}</p>
          </div>
          <button className="primary-action" type="button" onClick={beginMission}>
            <span>{save.completed ? "重新勘探" : "开始登陆"}</span>
            <b>→</b>
          </button>
          <p className="time-hint">预计探索 6 分钟 · 任何答案都能继续</p>
        </aside>

        <section className="star-map" aria-label="可探索的知识宇宙">
          <div className="map-caption">
            <span>SECTOR 7 / UNKNOWN SPACE</span>
            <b>{save.completed ? "航路已扩展" : "正在解析异常信号"}</b>
          </div>

          <div className="orbit orbit-a" aria-hidden="true" />
          <div className="orbit orbit-b" aria-hidden="true" />
          <div className="orbit orbit-c" aria-hidden="true" />
          <div className="route route-a" aria-hidden="true" />
          <div className="route route-b" aria-hidden="true" />
          <div className="route route-c" aria-hidden="true" />

          <button className="ship-node" type="button" onClick={() => setToast("这里是你的移动知识基地：火种号")}>
            <span className="ship-core">✦</span>
            <span className="ship-ring" />
            <b>火种号</b>
            <small>YOU ARE HERE</small>
          </button>

          {SIGNALS.map((signal) => {
            const available = signal.state === "active";
            const revealed = available || (save.completed && signal.state === "next");
            return (
              <button
                key={signal.id}
                type="button"
                className={`signal ${signal.pos} ${available ? "is-active" : ""} ${revealed ? "is-revealed" : "is-locked"}`}
                onClick={available ? beginMission : () => inspectLocked(signal.name, signal.state)}
                aria-label={`${signal.name}，${available ? "可以探索" : "尚未开放"}`}
              >
                <span className="signal-pulse" />
                <span className="signal-core" />
                <span className="signal-label">
                  <small>{signal.code}</small>
                  <b>{revealed ? signal.name : "未知信号"}</b>
                </span>
              </button>
            );
          })}

          <div className="map-legend">
            <span><i className="legend-live" /> 可登陆</span>
            <span><i className="legend-seen" /> 已定位</span>
            <span><i /> 未解析</span>
          </div>
        </section>

        <aside className="knowledge-rail">
          <div className="rail-heading">
            <span>你的知识星图</span>
            <b>{progress}%</b>
          </div>
          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
          <p>不是掌握了多少，而是你已经拥有多少个继续提问的起点。</p>

          <div className="spark-stack">
            {save.sparks.slice(-4).map((spark, index) => (
              <button key={spark.id} type="button" onClick={() => setArchiveOpen(true)} className="spark-card">
                <span className={`spark-gem gem-${index % 4}`}>✦</span>
                <span>
                  <small>{spark.field}</small>
                  <b>{spark.name}</b>
                </span>
                <i>↗</i>
              </button>
            ))}
            {!save.completed ? (
              <div className="spark-placeholder">
                <span>?</span>
                <p>完成远征<br />发现新的知识火种</p>
              </div>
            ) : null}
          </div>

          <div className="curiosity-profile">
            <span>好奇心倾向</span>
            <b>{save.completed ? "系统与规则" : "尚在观测"}</b>
            <p>{save.completed ? "你会追问一个系统为何能够运转，以及规则改变后会发生什么。" : "每一次选择都会让飞船更了解你的好奇心。"}</p>
          </div>
        </aside>
      </section>

      <footer className="coordinates">
        <span>POS 31.2 / −08.4</span>
        <span>认知迷雾覆盖率 96%</span>
        <span>远征记录 {save.expeditions.toString().padStart(2, "0")}</span>
      </footer>

      {welcomeOpen ? (
        <div className="overlay welcome-overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
          <div className="welcome-card">
            <button className="close-button" type="button" onClick={() => setWelcomeOpen(false)} aria-label="关闭">×</button>
            <span className="welcome-sigil">✦</span>
            <p className="eyebrow">THE UNIVERSE IS LARGER THAN YOUR QUESTIONS</p>
            <h2 id="welcome-title">世界上还有很多问题，<br />你甚至还不知道如何问起。</h2>
            <p className="welcome-lead">
              所以我们造了一艘飞船。你不需要考试，也不需要选专业。只需要跟随异常信号，看看什么会让你忍不住继续追问。
            </p>
            <div className="welcome-rules">
              <span><b>01</b>观察不合常理的现象</span>
              <span><b>02</b>提出属于你的问题</span>
              <span><b>03</b>把知识连成自己的星图</span>
            </div>
            <button className="primary-action welcome-action" type="button" onClick={() => setWelcomeOpen(false)}>
              <span>登上火种号</span><b>→</b>
            </button>
          </div>
        </div>
      ) : null}

      {missionOpen ? (
        <div className="overlay mission-overlay" role="dialog" aria-modal="true" aria-labelledby="mission-title">
          <section className="mission-panel">
            <header className="mission-header">
              <div>
                <span className="eyebrow">EXPEDITION EC-01</span>
                <h2 id="mission-title">无价之城</h2>
              </div>
              <div className="step-meter" aria-label={`探索进度 ${Math.min(missionStep + 1, 5)}/5`}>
                {[0, 1, 2, 3, 4].map((step) => <i key={step} className={missionStep >= step ? "done" : ""} />)}
              </div>
              <button className="close-button" type="button" onClick={() => setMissionOpen(false)} aria-label="离开星球">×</button>
            </header>

            <div className="mission-scene">
              <div className="planet-vista" aria-hidden="true">
                <div className="planet-halo" />
                <div className="planet-disc"><span /></div>
                <div className="city-lights" />
                <p>LOCAL TIME 04:17 · POPULATION 38,441</p>
              </div>

              <article className="story-console">
                {missionStep === 0 ? (
                  <>
                    <span className="speaker">飞船 AI / 阿卡</span>
                    <h3>这里没有价格。</h3>
                    <p>你在城市里走了两个小时。面包店没有收银台，住宅没有房东，公共仓库允许任何人领取物资。</p>
                    <p>但仓库管理员拒绝了一个孩子的请求：最后三块恒温电池，必须留给医院。</p>
                    <blockquote>“既然没有钱，究竟是谁决定什么更重要？”</blockquote>
                    <div className="story-actions">
                      <button type="button" onClick={() => choose("检查公共仓库", "管理员没有查看价格，而是在读取全城的需求记录。屏幕上不断跳动着库存、申请理由和紧急程度。", 1)}>检查公共仓库 <span>→</span></button>
                      <button type="button" onClick={() => choose("跟踪一位居民", "她上午维修供水管，下午从仓库拿走食物。没有工资单，但每一次贡献都被邻里看见。", 1)}>跟踪一位居民 <span>→</span></button>
                      <button type="button" onClick={() => choose("质疑管理员", "管理员笑了：‘当然有人会撒谎。你们使用货币的世界里，难道没有人操纵规则吗？’", 1)}>质疑管理员 <span>→</span></button>
                    </div>
                  </>
                ) : null}

                {missionStep === 1 ? (
                  <>
                    <span className="speaker">调查记录 / 01</span>
                    <h3>分配的背后，是信息。</h3>
                    <p>{narrative}</p>
                    <p>城市的中央系统知道“谁提出了需求”，却无法直接知道需求是否真实。现在，三份申请同时抵达。</p>
                    <div className="request-grid">
                      <div><small>医院</small><b>3 块</b><p>维持早产儿恒温舱</p></div>
                      <div><small>天文台</small><b>2 块</b><p>追踪可能撞击城市的小行星</p></div>
                      <div><small>住宅区</small><b>3 块</b><p>供暖系统将在今晚停机</p></div>
                    </div>
                    <p className="decision-label">仓库里只剩 5 块电池。你会先依据什么分配？</p>
                    <div className="story-actions compact">
                      <button type="button" onClick={() => choose("谁最紧急", "你保住了眼前的生命，但天文台警告：忽略低概率的大灾难，也可能让所有选择失去意义。", 2)}>谁最紧急</button>
                      <button type="button" onClick={() => choose("谁影响的人最多", "人数让选择看似客观，但少数人的生命是否因此总是排在后面？", 2)}>谁影响的人最多</button>
                      <button type="button" onClick={() => choose("让居民投票", "投票提供了正当性，却没有自动提供真相：多数人并不了解医疗和天文风险。", 2)}>让居民投票</button>
                    </div>
                  </>
                ) : null}

                {missionStep === 2 ? (
                  <>
                    <span className="speaker">飞船 AI / 阿卡</span>
                    <h3>公平不是一道算术题。</h3>
                    <p>{narrative}</p>
                    <p>你刚刚遇到的是所有社会都要回答的问题：资源有限时，如何把分散的信息变成共同选择。</p>
                    <div className="concept-reveal">
                      <span>新概念靠近</span>
                      <b>稀缺性 · 信息 · 激励</b>
                    </div>
                    <p>现在轮到你提问。不要猜“标准答案”，问一个你真的想知道的问题。</p>
                    <div className="suggestion-chips">
                      {["没有钱，人为什么还愿意劳动？", "城市扩大到一亿人还能运转吗？", "货币究竟解决了什么问题？"].map((item) => (
                        <button key={item} type="button" onClick={() => askGuide(item)}>{item}</button>
                      ))}
                    </div>
                    <div className="question-box">
                      <input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") askGuide(); }} placeholder="或者，写下你的问题……" maxLength={220} />
                      <button type="button" onClick={() => askGuide()} disabled={asking || !question.trim()}>{asking ? "解析中" : "发射"}</button>
                    </div>
                  </>
                ) : null}

                {missionStep === 4 && answer ? (
                  <>
                    <span className="speaker">{answer.source === "dashscope" ? "阿卡 / 实时推演" : "阿卡 / 舰载知识库"}</span>
                    <h3>你的问题打开了一条航路。</h3>
                    <div className="player-question">“{question}”</div>
                    <p>{answer.reply}</p>
                    <div className="mini-concepts">
                      {answer.discovered_concepts.map((concept) => <span key={concept}>✦ {concept}</span>)}
                    </div>
                    <blockquote>{answer.counter_question}</blockquote>
                    <p className="decision-label">最后一次推演：如果你必须让这套制度服务一亿个陌生人，你首先会增加什么？</p>
                    <div className="story-actions compact">
                      <button type="button" onClick={() => choose("公开透明的需求记录", "透明让造假付出声誉代价，却也带来隐私问题。每一种答案，都会制造新的问题。", 5)}>公开的需求记录</button>
                      <button type="button" onClick={() => choose("可以交换的贡献凭证", "当凭证能够储存、交换和计量价值时，你几乎重新发明了货币。", 5)}>贡献凭证</button>
                      <button type="button" onClick={() => choose("随机抽签与轮换", "随机机制避免权力固化，却无法保证最懂问题的人做决定。", 5)}>随机抽签与轮换</button>
                    </div>
                  </>
                ) : null}

                {missionStep === 5 ? (
                  <div className="mission-complete">
                    <span className="completion-star">✦</span>
                    <p className="eyebrow">EXPEDITION COMPLETE</p>
                    <h3>你没有找到标准答案。<br />你找到了四个更好的问题。</h3>
                    <p>{narrative}</p>
                    <div className="earned-sparks">
                      {CITY_SPARKS.map((spark) => <span key={spark.id}><i>✦</i>{spark.name}<small>{spark.field}</small></span>)}
                    </div>
                    <button className="primary-action" type="button" onClick={finishMission}><span>带着火种返航</span><b>→</b></button>
                  </div>
                ) : null}
              </article>
            </div>
          </section>
        </div>
      ) : null}

      {archiveOpen ? (
        <div className="overlay archive-overlay" role="dialog" aria-modal="true" aria-labelledby="archive-title">
          <section className="archive-panel">
            <header>
              <div><p className="eyebrow">PERSONAL CONSTELLATION</p><h2 id="archive-title">你的知识火种</h2></div>
              <button className="close-button" type="button" onClick={() => setArchiveOpen(false)} aria-label="关闭档案库">×</button>
            </header>
            <p className="archive-intro">它们不是你已经精通的答案，而是下次遇见未知时，可以用来提问的起点。</p>
            <div className="archive-grid">
              {save.sparks.map((spark, index) => (
                <article key={spark.id}>
                  <span className={`archive-gem gem-${index % 4}`}>✦</span>
                  <small>{spark.field}</small>
                  <h3>{spark.name}</h3>
                  <p>{spark.note}</p>
                </article>
              ))}
            </div>
            <div className="archive-footer">
              <p><b>{save.expeditions}</b> 次远征 · <b>{save.sparks.length}</b> 枚火种 · 下一阶段需要 8 枚</p>
              <button type="button" onClick={resetSave}>重新开始旅程</button>
            </div>
          </section>
        </div>
      ) : null}

      {toast ? <div className="toast" role="status"><span>✦</span>{toast}</div> : null}
    </main>
  );
}
