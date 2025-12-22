import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./styles/base.css";
import "./styles/themes/cream.css";
import "./styles/themes/berry.css";
import "./styles/themes/basket.css";
import "./styles/themes/cloudy.css";
import zhTranslations from "./i18n/zh.json";
import enTranslations from "./i18n/en.json";
import { makeZip } from "./utils/zip";
import { safe, safeStringify } from "./utils/string";
import { fmtDate } from "./utils/date";
import { triggerDownload } from "./utils/download";

const translations = { zh: zhTranslations, en: enTranslations };

/**
 * Conversation Splitter – Public Edition
 * 公开版：中性可配置的角色名、中文/英文、主题切换、ZIP 打包、本地处理
 */

export default function JsonConvoSplitter() {
  // ---------- UI State ----------
  const [convos, setConvos] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [titleQuery, setTitleQuery] = useState("");
  const [contentQuery, setContentQuery] = useState("");
  const [globalSearch, setGlobalSearch] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(null);
  const [targetMessageIdx, setTargetMessageIdx] = useState(null);
  const [theme, setTheme] = useState("cream"); // cream | berry | basket | cloudy
  const [lang, setLang] = useState("zh");      // zh | en
  const previewScrollRef = useRef(null);
  const messageRefs = useRef(new Map());

  // Display name mapping（可自定义显示名）
  const [roleNameUser, setRoleNameUser] = useState("User");
  const [roleNameAssistant, setRoleNameAssistant] = useState("Assistant");
  const [roleNameSystem, setRoleNameSystem] = useState("System");

  // Filename controls
  const [filePrefix, setFilePrefix] = useState("");
  const [fileSuffix, setFileSuffix] = useState("");

  const t = (k) => (translations[lang]?.[k] ?? k);
  const untitledText = t('untitled');

  // ---------- Helpers ----------
  const extractMessageText = useCallback((message) => {
    const content = message?.content;
    const out = [];
    const seen = new Set();
    const collect = (val) => {
      if (val == null) return;
      if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
        out.push(String(val));
        return;
      }
      if (Array.isArray(val)) {
        val.forEach(collect);
        return;
      }
      if (typeof val === "object") {
        if (seen.has(val)) return;
        seen.add(val);
        let added = false;
        if (typeof val.text === "string") { out.push(val.text); added = true; }
        if (typeof val.content === "string") { out.push(val.content); added = true; }
        if (Array.isArray(val.content)) { val.content.forEach(collect); added = true; }
        if (Array.isArray(val.parts)) { val.parts.forEach(collect); added = true; }
        if (typeof val.parts === "string") { out.push(val.parts); added = true; }
        if (Array.isArray(val.messages)) { val.messages.forEach(collect); added = true; }
        if (typeof val.value === "string") { out.push(val.value); added = true; }
        if (typeof val.data === "string") { out.push(val.data); added = true; }
        if (!added) {
          const str = safeStringify(val);
          if (str && str !== "[object Object]") out.push(str);
        }
      }
    };
    collect(content);
    const text = out.join("\n").trim();
    if (!text || text === "[object Object]") return "";
    return text;
  }, [safeStringify]);

  const normalizeMessage = useCallback((msg) => {
    if (!msg) return "";
    if (typeof msg._text !== "string") {
      msg._text = extractMessageText(msg);
    }
    return msg._text;
  }, [extractMessageText]);

  const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const highlightMatches = useCallback((text) => {
    const q = contentQuery.trim();
    const source = text == null ? "" : String(text);
    if (!q) return source;
    const regex = new RegExp(`(${escapeRegExp(q)})`, "gi");
    return source
      .split(regex)
      .map((part, idx) =>
        idx % 2 === 1 ? <mark key={idx} className="highlight-match">{part}</mark> : part
      );
  }, [contentQuery]);

  const buildChain = useCallback((conv) => {
    const chain = [];
    let nid = conv.current_node;
    while (nid) {
      const node = conv.mapping?.[nid];
      if (!node) break;
      if (node.message) {
        normalizeMessage(node.message);
        chain.push(node.message);
      }
      nid = node.parent;
    }
    return chain.reverse();
  }, [normalizeMessage]);

  const extractModel = useCallback((message) => {
    const candidates = [
      message?.model,
      message?.model_slug,
      message?.metadata?.model,
      message?.metadata?.model_slug,
      message?.message?.metadata?.model,
      message?.message?.metadata?.model_slug,
    ];
    const model = candidates.find((m) => typeof m === "string" && m.trim());
    return model ? model.trim() : "Unknown";
  }, []);

  const roleDisplay = (role) => {
    const r = (role || "assistant").toLowerCase();
    if (r === "user") return roleNameUser;
    if (r === "system") return roleNameSystem;
    return roleNameAssistant; // assistant/tool/function 都归为助手侧显示
  };

  const formatRange = (range) => (range ? `${range.start} \u2192 ${range.end}` : "");

  const toMarkdown = (conv) => {
    const chain = buildChain(conv);
    return chain
      .map((m) => {
        const role = m.author?.role || "assistant";
        const text = normalizeMessage(m);
        const displayRole = roleDisplay(role);
        return `**${displayRole}**:\n${text}`;
      })
      .join("\n\n\n");
  };

  // ---------- Events ----------
  const onFile = async (file) => {
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (!Array.isArray(json)) throw new Error("Unexpected JSON format");
      setConvos(json);
      setSelected(new Set(json.map((_, i) => i)));
      setPreviewIdx(json.length ? 0 : null);
      setTitleQuery("");
      setContentQuery("");
      setGlobalSearch(false);
      setTargetMessageIdx(null);
    } catch (e) {
      alert((lang === 'zh' ? '无法解析 JSON：' : 'Cannot parse JSON: ') + e.message);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  const toggle = (idx) => {
    const next = new Set(selected);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    setSelected(next);
  };

  const highlight = (idx) => setPreviewIdx(idx);

  // visible list after filter
  const visible = useMemo(() => {
    const q = titleQuery.trim().toLowerCase();
    if (!q) return convos.map((c, idx) => ({ c, idx }));
    return convos
      .map((c, idx) => ({ c, idx }))
      .filter(({ c }) => String(c.title || "").toLowerCase().includes(q));
  }, [convos, titleQuery]);

  const selectAllVisible = () => { const n = new Set(selected); visible.forEach(({ idx }) => n.add(idx)); setSelected(n); };
  const deselectAllVisible = () => { const n = new Set(selected); visible.forEach(({ idx }) => n.delete(idx)); setSelected(n); };
  const invertVisible = () => { const n = new Set(selected); visible.forEach(({ idx }) => (n.has(idx) ? n.delete(idx) : n.add(idx))); setSelected(n); };

  const makeFileName = (conv) => {
    const { iso } = fmtDate(conv.create_time);
    const title = safe(conv.title);
    const prefix = filePrefix ? `${safe(filePrefix)}_` : "";
    const suffix = fileSuffix ? `_${safe(fileSuffix)}` : "";
    return `${prefix}${iso}_${title}${suffix}.md`;
  };

  const downloadOne = (idx) => {
    const conv = convos[idx];
    const filename = makeFileName(conv);
    const blob = new Blob([toMarkdown(conv)], { type: "text/markdown" });
    triggerDownload(blob, filename);
  };
  const downloadSelected = () => { if (!selected.size) return; [...selected].sort((a,b)=>a-b).forEach(downloadOne); };
  const downloadZip = async () => {
    if (!selected.size) return;
    const enc = new TextEncoder();
    const files = [...selected].sort((a,b)=>a-b).map(i => {
      const conv = convos[i];
      const name = makeFileName(conv);
      const data = enc.encode(toMarkdown(conv));
      return { name, data };
    });
    const zip = await makeZip(files);
    triggerDownload(zip, `conversations_${Date.now()}.zip`);
  };

  const previewConv = previewIdx != null ? convos[previewIdx] : null;
  const previewMsgs = useMemo(
    () => (previewConv ? buildChain(previewConv) : []),
    [buildChain, previewConv]
  );
  const previewMsgsWithModel = useMemo(
    () => previewMsgs.map((msg, idx) => ({ msg, model: extractModel(msg), idx })),
    [extractModel, previewMsgs]
  );
  const isPreviewMessageVisible = useCallback((msg) => {
    const role = (msg?.author?.role || "assistant").toLowerCase();
    if (role === "system" || role === "tool") return false;

    const text = (normalizeMessage(msg) || "").trimStart();

    // Hide empty messages
    if (!text) return false;

    // Hide JSON-formatted messages
    if (text.startsWith('{"')) return false;

    // Hide regeneration feedback instructions
    if (text.startsWith('The user provided feedback on a previous completion')) return false;

    // Hide code execution artifacts
    if (text.startsWith('from ') && text.includes('import ')) return false;
    if (text.startsWith('import ')) return false;
    if (text.startsWith('<<') && text.trimEnd().endsWith('>>')) return false;
    if (text.startsWith('display(')) return false;
    if (text.includes('/mnt/data/')) return false;

    // Hide pure tuple/list outputs like ((829, 1536), (794, 1537))
    if (/^\([\d\s,()]+\)$/.test(text.trim())) return false;

    return true;
  }, [normalizeMessage]);
  const nonSystemPreviewMsgsWithModel = useMemo(
    () =>
      previewMsgsWithModel.filter(({ msg }) => {
        return isPreviewMessageVisible(msg);
      }),
    [isPreviewMessageVisible, previewMsgsWithModel]
  );
  const filteredPreviewMsgsWithModel = useMemo(() => {
    const q = contentQuery.trim().toLowerCase();
    if (!q || globalSearch) return nonSystemPreviewMsgsWithModel;
    return nonSystemPreviewMsgsWithModel.filter(({ msg }) =>
      (normalizeMessage(msg) || "").toLowerCase().includes(q)
    );
  }, [contentQuery, globalSearch, nonSystemPreviewMsgsWithModel, normalizeMessage]);

  const globalMatches = useMemo(() => {
    const q = contentQuery.trim().toLowerCase();
    if (!globalSearch || !q) return [];
    const results = [];
    convos.forEach((conv, convIdx) => {
      const chain = buildChain(conv);
      chain.forEach((msg, msgIdx) => {
        const text = normalizeMessage(msg) || "";
        if (text.toLowerCase().includes(q)) {
          results.push({
            convIdx,
            msgIdx,
            title: conv.title || untitledText,
            snippet: text.slice(0, 140) + (text.length > 140 ? "…" : ""),
          });
        }
      });
    });
    return results.slice(0, 40);
  }, [buildChain, contentQuery, convos, globalSearch, normalizeMessage, untitledText]);

  const stats = useMemo(() => {
    if (!convos.length) return null;
    let messageCount = 0;
    let charCount = 0;
    let userCharCount = 0;
    let assistantCharCount = 0;
    const roleCounts = {};
    const assistantModelCounts = new Map();
    const daySet = new Set();
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const toDayKey = (sec) => {
      if (!Number.isFinite(sec)) return null;
      return new Date(sec * 1000).toLocaleDateString("en-CA");
    };
    const dateToKey = (date) => startOfDay(date).toLocaleDateString("en-CA");
    const dayKeyToDate = (key) => {
      const [y, m, d] = key.split("-").map(Number);
      return new Date(y, m - 1, d);
    };
    convos.forEach((conv) => {
      buildChain(conv).forEach((msg) => {
        if (!isPreviewMessageVisible(msg)) return;
        const text = normalizeMessage(msg) || "";
        messageCount += 1;
        charCount += text.length;
        const timestamp = toDayKey(Number(msg.create_time));
        if (timestamp) daySet.add(timestamp);
        const role = (msg.author?.role || "assistant").toLowerCase();
        if (role === "user") userCharCount += text.length;
        if (role === "assistant") assistantCharCount += text.length;
        roleCounts[role] = (roleCounts[role] || 0) + 1;
        if (role === "assistant") {
          const model = extractModel(msg);
          assistantModelCounts.set(model, (assistantModelCounts.get(model) || 0) + 1);
        }
      });
    });
    const sortedDays = Array.from(daySet).sort();
    let longestStreak = 0;
    let streak = 0;
    let streakStartKey = null;
    let prevDate = null;
    let longestStreakRange = null;
    sortedDays.forEach((key) => {
      const date = dayKeyToDate(key);
      if (prevDate) {
        const diffDays = Math.round((startOfDay(date) - startOfDay(prevDate)) / 86400000);
        if (diffDays === 1) {
          streak += 1;
        } else {
          streak = 1;
          streakStartKey = key;
        }
      } else {
        streak = 1;
        streakStartKey = key;
      }
      if (streak > longestStreak) {
        longestStreak = streak;
        longestStreakRange = { start: streakStartKey, end: key };
      }
      prevDate = date;
    });
    let currentStreak = null;
    let currentStreakRange = null;
    if (sortedDays.length) {
      const today = startOfDay(new Date());
      const todayKey = dateToKey(today);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = dateToKey(yesterday);
      const latestDate = dayKeyToDate(sortedDays[sortedDays.length - 1]);
      const diffFromToday = Math.round((today - startOfDay(latestDate)) / 86400000);
      const latestKey = dateToKey(latestDate);
      if ((diffFromToday === 0 && latestKey === todayKey) || (diffFromToday === 1 && latestKey === yesterdayKey)) {
        let count = 1;
        let startKey = latestKey;
        for (let i = sortedDays.length - 2; i >= 0; i -= 1) {
          const currentKey = sortedDays[i];
          const nextKey = sortedDays[i + 1];
          const currentDate = dayKeyToDate(currentKey);
          const nextDate = dayKeyToDate(nextKey);
          const diffDays = Math.round((startOfDay(nextDate) - startOfDay(currentDate)) / 86400000);
          if (diffDays === 1) {
            count += 1;
            startKey = currentKey;
          } else {
            break;
          }
        }
        currentStreak = count;
        currentStreakRange = { start: startKey, end: latestKey };
      }
    }
    const topModels = Array.from(assistantModelCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      conversationCount: convos.length,
      messageCount,
      charCount,
      userCharCount,
      assistantCharCount,
      avgChars: messageCount ? Math.round((charCount / messageCount) * 10) / 10 : 0,
      roleCounts,
      topModels,
      longestStreak,
      currentStreak,
      longestStreakRange,
      currentStreakRange,
      activeDays: daySet.size,
    };
  }, [buildChain, convos, extractModel, isPreviewMessageVisible, normalizeMessage]);

  useLayoutEffect(() => {
    const el = previewScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [previewIdx]);

  useLayoutEffect(() => {
    if (targetMessageIdx == null) return;
    const el = messageRefs.current.get(targetMessageIdx);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    setTargetMessageIdx(null);
  }, [targetMessageIdx]);

  return (
    <div className="outer" data-theme={theme}>
      <div className="wrap">
        <header className="hero">
          <h1>{t('title')}</h1>
          <p>{t('subtitle')}</p>
        </header>

        <section
          className={"dropzone" + (dragging ? " dragging" : "")}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input type="file" accept="application/json" onChange={(e) => onFile(e.target.files?.[0])} />
          <div className="hint"><strong>{t('clickOrDrag')}</strong> <code>conversations.json</code> {t('toHere')}</div>
        </section>

        <div className="toolbar">
          <div className="stats">{t('total')} <b>{convos.length}</b> · {t('shown')} <b>{visible.length}</b> · {t('selected')} <b>{selected.size}</b></div>
          <div className="actions">
            <select className="select" value={lang} onChange={(e)=>setLang(e.target.value)}>
              <option value="zh">简体中文</option>
              <option value="en">English</option>
            </select>
            <select className="select" value={theme} onChange={(e)=>setTheme(e.target.value)}>
              <option value="cream">{t('themeCream')}</option>
              <option value="berry">{t('themeBerry')}</option>
              <option value="basket">{t('themeBasket')}</option>
              <option value="cloudy">{t('themeCloudy')}</option>
            </select>
            <input className="search" placeholder={t('filterByTitle')} value={titleQuery} onChange={(e)=>setTitleQuery(e.target.value)} />
            <div className="search-group">
              <span className="search-label">{t('searchInMessages')}</span>
              <input
                className="search"
                placeholder={t('searchInMessages')}
                value={contentQuery}
                onChange={(e)=>setContentQuery(e.target.value)}
              />
              <label className="toggle">
                <input type="checkbox" checked={globalSearch} onChange={(e)=>setGlobalSearch(e.target.checked)} />
                <span>{t('searchAllConvos')}</span>
              </label>
            </div>
            <button onClick={selectAllVisible}>{t('selectAll')}</button>
            <button onClick={deselectAllVisible}>{t('deselectAll')}</button>
            <button onClick={invertVisible}>{t('invert')}</button>
          </div>
        </div>

        {stats && (
          <details className="stats-panel" open>
            <summary className="stats-summary">{t('statsSummary')}</summary>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">{t('statConvos')}</div>
                <div className="stat-value">{stats.conversationCount}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">{t('statMessages')}</div>
                <div className="stat-value">{stats.messageCount}</div>
                <div className="stat-sub">{t('statAvgChars')}: {stats.avgChars}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">{t('statChars')}</div>
                <div className="stat-sub">{t('statUserChars')}: {stats.userCharCount}</div>
                <div className="stat-sub">{t('statAssistantChars')}: {stats.assistantCharCount}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">{t('statLongestStreak')}</div>
                <div className="stat-value">{stats.longestStreak} {t('days')}</div>
                {stats.longestStreakRange && (
                  <div className="stat-sub">{formatRange(stats.longestStreakRange)}</div>
                )}
                {stats.currentStreak != null && (
                  <div className="stat-sub">
                    {t('statCurrentStreak')}: {stats.currentStreak} {t('days')}
                    {stats.currentStreakRange ? ` (${formatRange(stats.currentStreakRange)})` : ""}
                  </div>
                )}
              </div>
              <div className="stat-card">
                <div className="stat-label">{t('statActiveDays')}</div>
                <div className="stat-value">{stats.activeDays}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">{t('statRoles')}</div>
                <div className="bars">
                  {Object.entries(stats.roleCounts).map(([role, count]) => (
                    <div key={role} className="bar-row">
                      <span className="bar-label">{role}</span>
                      <div className="bar-track">
                        <span
                          className="bar-fill"
                          style={{ width: `${Math.min(100, (count / stats.messageCount) * 100)}%` }}
                          aria-hidden
                        />
                      </div>
                      <span className="bar-count">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">{t('statTopModels')}</div>
                <ul className="stat-list">
                  {stats.topModels.map(([model, count]) => (
                    <li key={model}>{model}: {count}</li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        )}

        {/* Role mapping + filename controls */}
        <div className="panel">
          <div className="group">
            <label>{t('roleUser')}</label>
            <input className="input" value={roleNameUser} onChange={(e)=>setRoleNameUser(e.target.value)} />
          </div>
          <div className="group">
            <label>{t('roleAssistant')}</label>
            <input className="input" value={roleNameAssistant} onChange={(e)=>setRoleNameAssistant(e.target.value)} />
          </div>
          <div className="group">
            <label>{t('roleSystem')}</label>
            <input className="input" value={roleNameSystem} onChange={(e)=>setRoleNameSystem(e.target.value)} />
          </div>
          <div className="group">
            <label>{t('filePrefix')}</label>
            <input className="input" value={filePrefix} onChange={(e)=>setFilePrefix(e.target.value)} placeholder={t('optional')} />
          </div>
          <div className="group">
            <label>{t('fileSuffix')}</label>
            <input className="input" value={fileSuffix} onChange={(e)=>setFileSuffix(e.target.value)} placeholder={t('optional')} />
          </div>
          <div className="group rowBtns">
            <button className="primary" disabled={!selected.size} onClick={downloadSelected}>{t('downloadSel')}</button>
            <button className="primary" disabled={!selected.size} onClick={downloadZip}>{t('downloadZip')}</button>
          </div>
        </div>

        {globalSearch && contentQuery.trim() && (
          <div className="global-results">
            <div className="gr-head">
              <div className="gr-title">{t('searchAcrossAll')}</div>
              <div className="gr-sub">{t('searchHint')}</div>
            </div>
            <div className="gr-list">
              {globalMatches.length ? globalMatches.map((hit) => (
                <button
                  key={`${hit.convIdx}-${hit.msgIdx}`}
                  className="gr-item"
                  onClick={() => {
                    setPreviewIdx(hit.convIdx);
                    setTargetMessageIdx(hit.msgIdx);
                  }}
                >
                  <div className="gr-line"><b>{hit.title}</b> · #{hit.msgIdx + 1}</div>
                  <div className="gr-snippet">{hit.snippet}</div>
                </button>
              )) : <div className="gr-empty">{t('searchNoResult')}</div>}
            </div>
          </div>
        )}

        {convos.length > 0 && (
          <div className="split">
            {/* left list */}
            <div className="list">
              {visible.map(({ c, idx }) => {
                const checked = selected.has(idx);
                const { d } = fmtDate(c.create_time);
                const date = d.toISOString().slice(0, 10);
                const msgCount = buildChain(c).filter(isPreviewMessageVisible).length;
                const active = previewIdx === idx;
                return (
                  <div
                    key={c.id || idx}
                    className={"row" + (active ? " active" : "")}
                    onClick={() => highlight(idx)}
                  >
                    <label className="chk">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => { e.stopPropagation(); toggle(idx); }}
                      />
                    </label>
                    <div className="meta">
                      <div className="title" title={c.title || "Untitled"}>{date}｜{c.title || "Untitled"}</div>
                      <div className="sub">{msgCount} {t('messages')}</div>
                    </div>
                    <div className="spacer" />
                    <button className="ghost" onClick={(e) => { e.stopPropagation(); downloadOne(idx); }}>{t('downloadOne')}</button>
                  </div>
                );
              })}
            </div>

            {/* right preview */}
            <div className="preview">
              {previewConv ? (
                <>
                  <div className="pv-head">
                    <div className="pv-title" title={previewConv.title || "Untitled"}>{previewConv.title || "Untitled"}</div>
                    <div className="pv-sub">{fmtDate(previewConv.create_time).d.toLocaleString()} · {nonSystemPreviewMsgsWithModel.length} {t('messages')}</div>
                  </div>
                  <div className="pv-body" ref={previewScrollRef}>
                    {filteredPreviewMsgsWithModel.map(({ msg, model, idx }) => {
                      const role = msg.author?.role || "assistant";
                      const text = normalizeMessage(msg);
                      const side = role === "assistant" ? "left" : "right";
                      const displayRole = roleDisplay(role);
                      return (
                        <div
                          key={idx}
                          className={`msg ${side}`}
                          ref={(el) => {
                            if (el) messageRefs.current.set(idx, el);
                            else messageRefs.current.delete(idx);
                          }}
                        >
                          <div className="bubble">
                            <div className="meta-line">
                              <div className="role">{displayRole}</div>
                              <span className="model-badge">{model}</span>
                            </div>
                            <div className="text">{highlightMatches(text)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="pv-empty">{t('pickOnLeft')}</div>
              )}
            </div>
          </div>
        )}

        <footer className="foot">
          <div>{t('privacyNote')}</div>
        </footer>
      </div>
    </div>
  );
}
