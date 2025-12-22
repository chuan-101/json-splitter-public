import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import Header from "./components/Header";
import Dropzone from "./components/Dropzone";
import Toolbar from "./components/Toolbar";
import StatsPanel from "./components/StatsPanel";
import SettingsPanel from "./components/SettingsPanel";
import ConversationList from "./components/ConversationList";
import PreviewPanel from "./components/PreviewPanel";
import GlobalSearchResults from "./components/GlobalSearchResults";
import "./styles/base.css";
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
  const [theme, setTheme] = useState("ceramic"); // ceramic | stealth | industrial | retro
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
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

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
        <Header t={t} />

        <Dropzone onFile={onFile} dragging={dragging} setDragging={setDragging} t={t} />

        <Toolbar
          lang={lang}
          setLang={setLang}
          theme={theme}
          setTheme={setTheme}
          titleQuery={titleQuery}
          setTitleQuery={setTitleQuery}
          contentQuery={contentQuery}
          setContentQuery={setContentQuery}
          globalSearch={globalSearch}
          setGlobalSearch={setGlobalSearch}
          selectAllVisible={selectAllVisible}
          deselectAllVisible={deselectAllVisible}
          invertVisible={invertVisible}
          convosCount={convos.length}
          visibleCount={visible.length}
          selectedCount={selected.size}
          t={t}
        />

        {stats && <StatsPanel stats={stats} t={t} formatRange={formatRange} />}

        <SettingsPanel
          roleNameUser={roleNameUser}
          setRoleNameUser={setRoleNameUser}
          roleNameAssistant={roleNameAssistant}
          setRoleNameAssistant={setRoleNameAssistant}
          roleNameSystem={roleNameSystem}
          setRoleNameSystem={setRoleNameSystem}
          filePrefix={filePrefix}
          setFilePrefix={setFilePrefix}
          fileSuffix={fileSuffix}
          setFileSuffix={setFileSuffix}
          downloadSelected={downloadSelected}
          downloadZip={downloadZip}
          selectedSize={selected.size}
          t={t}
        />

        {globalSearch && contentQuery.trim() && (
          <GlobalSearchResults
            globalMatches={globalMatches}
            setPreviewIdx={setPreviewIdx}
            setTargetMessageIdx={setTargetMessageIdx}
            t={t}
          />
        )}

        {convos.length > 0 && (
          <div className="split">
            <ConversationList
              visible={visible}
              selected={selected}
              toggle={toggle}
              highlight={highlight}
              previewIdx={previewIdx}
              downloadOne={downloadOne}
              buildChain={buildChain}
              fmtDate={fmtDate}
              isPreviewMessageVisible={isPreviewMessageVisible}
              t={t}
            />

            <PreviewPanel
              previewConv={previewConv}
              filteredMessages={filteredPreviewMsgsWithModel}
              highlightMatches={highlightMatches}
              roleDisplay={roleDisplay}
              fmtDate={fmtDate}
              messageRefs={messageRefs}
              previewScrollRef={previewScrollRef}
              nonSystemMessageCount={nonSystemPreviewMsgsWithModel.length}
              t={t}
            />
          </div>
        )}

        <footer className="foot">
          <div>{t('privacyNote')}</div>
        </footer>
      </div>
    </div>
  );
}
