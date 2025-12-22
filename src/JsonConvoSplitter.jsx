import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

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
  const [dragging, setDragging] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(null);
  const [theme, setTheme] = useState("cream"); // cream | berry | basket | cloudy
  const [lang, setLang] = useState("zh");      // zh | en
  const previewScrollRef = useRef(null);

  // Display name mapping（可自定义显示名）
  const [roleNameUser, setRoleNameUser] = useState("User");
  const [roleNameAssistant, setRoleNameAssistant] = useState("Assistant");
  const [roleNameSystem, setRoleNameSystem] = useState("System");

  // Filename controls
  const [filePrefix, setFilePrefix] = useState("");
  const [fileSuffix, setFileSuffix] = useState("");

  const t = (k) => (translations[lang]?.[k] ?? k);

  // ---------- Helpers ----------
  const safe = (s) =>
    (s || "Untitled")
      .replace(/[^0-9A-Za-z_\-\u4e00-\u9fa5]+/g, "_")
      .slice(0, 80);

  const safeStringify = useCallback((val) => {
    try {
      return typeof val === "string" ? val : JSON.stringify(val);
    } catch {
      return String(val ?? "");
    }
  }, []);

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

  const triggerDownload = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const fmtDate = (sec) => {
    const d = new Date((sec || Date.now() / 1000) * 1000);
    const iso = d.toISOString().slice(0, 16).replace(/[:T]/g, "-");
    return { d, iso };
  };

  // ---------- Minimal ZIP (store) ----------
  const crc32Table = useMemo(() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  }, []);
  const crc32 = (u8) => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = crc32Table[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const le16 = (n) => new Uint8Array([n & 255, (n >>> 8) & 255]);
  const le32 = (n) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
  const concatBytes = (parts) => {
    const size = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(size);
    let pos = 0;
    for (const p of parts) { out.set(p, pos); pos += p.length; }
    return out;
  };
  const makeZip = async (files) => {
    const chunks = [];
    const central = [];
    let offset = 0;
    const enc = new TextEncoder();
    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);
      const hdr = [
        le32(0x04034b50), le16(20), le16(0), le16(0), le16(0), le16(0),
        le32(crc), le32(data.length), le32(data.length), le16(nameBytes.length), le16(0)
      ];
      const local = concatBytes([...hdr, nameBytes, data]);
      chunks.push(local);
      const cenHdr = [
        le32(0x02014b50), le16(20), le16(20), le16(0), le16(0), le16(0), le16(0),
        le32(crc), le32(data.length), le32(data.length), le16(nameBytes.length), le16(0), le16(0), le16(0), le16(0),
        le32(offset)
      ];
      central.push(concatBytes([...cenHdr, nameBytes]));
      offset += local.length;
    }
    const centralDir = concatBytes(central);
    const end = concatBytes([le32(0x06054b50), le16(0), le16(0), le16(files.length), le16(files.length), le32(centralDir.length), le32(offset), le16(0)]);
    const zipBytes = concatBytes([...chunks, centralDir, end]);
    return new Blob([zipBytes], { type: 'application/zip' });
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
    () => previewMsgs.map((msg) => ({ msg, model: extractModel(msg) })),
    [extractModel, previewMsgs]
  );
  const filteredPreviewMsgsWithModel = useMemo(() => {
    const q = contentQuery.trim().toLowerCase();
    if (!q) return previewMsgsWithModel;
    return previewMsgsWithModel.filter(({ msg }) =>
      (normalizeMessage(msg) || "").toLowerCase().includes(q)
    );
  }, [contentQuery, normalizeMessage, previewMsgsWithModel]);

  const stats = useMemo(() => {
    if (!convos.length) return null;
    let messageCount = 0;
    let charCount = 0;
    const roleCounts = {};
    const modelCounts = new Map();
    convos.forEach((conv) => {
      buildChain(conv).forEach((msg) => {
        const text = normalizeMessage(msg) || "";
        messageCount += 1;
        charCount += text.length;
        const role = (msg.author?.role || "assistant").toLowerCase();
        roleCounts[role] = (roleCounts[role] || 0) + 1;
        const model = extractModel(msg);
        modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
      });
    });
    const topModels = Array.from(modelCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return {
      messageCount,
      charCount,
      avgChars: messageCount ? Math.round((charCount / messageCount) * 10) / 10 : 0,
      roleCounts,
      topModels,
    };
  }, [buildChain, convos, extractModel, normalizeMessage]);

  useLayoutEffect(() => {
    const el = previewScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [previewIdx]);

  // ---------- Theme CSS ----------
  const css = theme === 'cream' ? cssCream
    : theme === 'berry' ? cssBerry
    : theme === 'basket' ? cssBasket
    : theme === 'cloudy' ? cssCloudy
    : cssCream;

  return (
    <div className="outer">
      <style>{css}</style>
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
            </div>
            <button onClick={selectAllVisible}>{t('selectAll')}</button>
            <button onClick={deselectAllVisible}>{t('deselectAll')}</button>
            <button onClick={invertVisible}>{t('invert')}</button>
          </div>
        </div>

        {stats && (
          <div className="stats-panel">
            <div className="stat-card">
              <div className="stat-label">{t('statMessages')}</div>
              <div className="stat-value">{stats.messageCount}</div>
              <div className="stat-sub">{t('statAvgChars')}: {stats.avgChars}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t('statChars')}</div>
              <div className="stat-value">{stats.charCount}</div>
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
            <div className="stat-card">
              <div className="stat-label">{t('contentSearch')}</div>
              <div className="stat-sub">{t('contentSearchHint')}</div>
              <div className="stat-pill">{contentQuery ? `"${contentQuery}"` : t('contentSearchEmpty')}</div>
            </div>
          </div>
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

        {convos.length > 0 && (
          <div className="split">
            {/* left list */}
            <div className="list">
              {visible.map(({ c, idx }) => {
                const checked = selected.has(idx);
                const { d } = fmtDate(c.create_time);
                const date = d.toISOString().slice(0, 10);
                const msgCount = buildChain(c).length;
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
                    <div className="pv-sub">{fmtDate(previewConv.create_time).d.toLocaleString()} · {previewMsgs.length} {t('messages')}</div>
                  </div>
                  <div className="pv-body" ref={previewScrollRef}>
                    {filteredPreviewMsgsWithModel.map(({ msg, model }, i) => {
                      const role = msg.author?.role || "assistant";
                      const text = normalizeMessage(msg);
                      const side = role === "assistant" ? "left" : "right";
                      const displayRole = roleDisplay(role);
                      return (
                        <div
                          key={i}
                          className={`msg ${side}`}
                        >
                          <div className="bubble">
                            <div className="meta-line">
                              <div className="role">{displayRole}</div>
                              <span className="model-badge">{model}</span>
                            </div>
                            <div className="text">{text}</div>
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

/* ------------------- i18n ------------------- */
const translations = {
  zh: {
    title: "Conversation Splitter – 公共版",
    subtitle: "导入对话导出的 conversations.json，筛选预览并批量导出为 Markdown。",
    clickOrDrag: "点击或拖拽",
    toHere: "到此处上传",
    total: "共",
    shown: "显示",
    selected: "已选",
    themeCream: "奶油糊糊",
    themeBerry: "浆果啃啃",
    themeBasket: "花篮翻翻",
    themeCloudy: "云朵团团",
    filterByTitle: "按标题筛选…",
    searchInMessages: "内容搜索",
    statMessages: "总消息数",
    statChars: "总字符数",
    statAvgChars: "平均字符",
    statRoles: "角色分布",
    statTopModels: "模型 Top3",
    selectAll: "全选(当前筛选)",
    deselectAll: "取消全选",
    invert: "反选",
    roleUser: "用户名 (user)",
    roleAssistant: "助手名 (assistant)",
    roleSystem: "系统名 (system)",
    filePrefix: "文件名前缀",
    fileSuffix: "文件名后缀",
    optional: "可留空",
    downloadSel: "下载所选",
    downloadZip: "打包 ZIP",
    downloadOne: "单独下载",
    messages: "条消息",
    pickOnLeft: "选择左侧一条对话进行预览",
    privacyNote: "所有处理均在本地浏览器完成，不会上传到服务器。",
  },
  en: {
    title: "Conversation Splitter – Public Edition",
    subtitle: "Import conversations.json, filter/preview and export conversations to Markdown.",
    clickOrDrag: "Click or drag",
    toHere: "here to upload",
    total: "Total",
    shown: "Shown",
    selected: "Selected",
    themeCream: "Cream",
    themeBerry: "Berry",
    themeBasket: "Basket",
    themeCloudy: "Cloudy Puff",
    filterByTitle: "Filter by title…",
    searchInMessages: "Search in messages",
    statMessages: "Messages total",
    statChars: "Characters total",
    statAvgChars: "Avg chars",
    statRoles: "Role mix",
    statTopModels: "Top 3 models",
    selectAll: "Select All (filtered)",
    deselectAll: "Deselect All",
    invert: "Invert",
    roleUser: "User name (user)",
    roleAssistant: "Assistant name (assistant)",
    roleSystem: "System name (system)",
    filePrefix: "Filename prefix",
    fileSuffix: "Filename suffix",
    optional: "optional",
    downloadSel: "Download Selected",
    downloadZip: "ZIP Selected",
    downloadOne: "Download",
    messages: "messages",
    pickOnLeft: "Pick a conversation on the left to preview",
    privacyNote: "All processing happens locally in your browser; nothing is uploaded.",
  },
};

/* ------------------- Themes ------------------- */
const cssBase = `
:root{--bg:#F5E6D1;--card:#fff;--muted:#5E7B9B;--text:#2b2b2b;--accent:#B46C72;--accent-600:#6E2E34;--ring:#FFC8CB;--bubble-user:#fff;--bubble-assist:#FFECEF}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial}
.outer{min-height:100vh;display:flex;align-items:center;justify-content:center}
.wrap{max-width:1100px;margin:32px auto;padding:0 16px;color:var(--text)}
.hero{background:linear-gradient(135deg,rgba(255,200,203,.45),rgba(180,108,114,.15));border:1px solid rgba(180,108,114,.25);padding:18px 20px;border-radius:16px;box-shadow:0 8px 24px rgba(110,46,52,.12)}
.hero h1{margin:0 0 6px 0;font-size:22px;letter-spacing:.4px}
.hero p{margin:0;color:var(--muted)}
.dropzone{margin-top:14px;border:2px dashed rgba(180,108,114,.45);border-radius:14px;padding:18px;text-align:center;background:rgba(255,255,255,.6)}
.dropzone.dragging{background:rgba(255,200,203,.4);border-color:var(--ring)}
.dropzone input{display:block;margin:0 auto 8px}
.dropzone .hint{color:var(--muted)}
.toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:16px}
.toolbar .stats{color:#566}
.toolbar .actions{margin-left:auto;display:flex;gap:8px;align-items:center}
.select{height:34px;padding:0 8px;border-radius:10px;border:1px solid rgba(110,46,52,.25);background:#fff}
.search{height:34px;padding:6px 10px;border-radius:10px;border:1px solid rgba(110,46,52,.25);background:#fff;color:var(--text);min-width:180px;outline:none}
.search:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(255,200,203,.45)}
.search-group{display:flex;align-items:center;gap:6px;flex:1}
.search-label{font-size:12px;color:var(--muted);white-space:nowrap}
button{height:34px;padding:0 12px;border-radius:10px;border:1px solid rgba(110,46,52,.25);background:#fff;color:var(--text);cursor:pointer}
button:hover{border-color:var(--accent)}
button.primary{background:var(--accent);border-color:transparent;color:#fff}
button.primary:disabled{opacity:.55;cursor:not-allowed}
button.ghost{background:transparent;border-color:rgba(110,46,52,.25);color:var(--muted)}
.panel{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:12px}
.panel .group{display:flex;flex-direction:column;gap:6px}
.panel .group.rowBtns{grid-column:span 5;display:flex;flex-direction:row;gap:8px;align-items:center}
.input{height:34px;padding:6px 10px;border-radius:10px;border:1px solid rgba(110,46,52,.25);background:#fff}
.stats-panel{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:10px}
.stat-card{background:var(--card);border:1px solid rgba(110,46,52,.2);border-radius:12px;padding:12px;box-shadow:0 4px 12px rgba(0,0,0,.04);display:flex;flex-direction:column;gap:6px}
.stat-label{font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
.stat-value{font-size:22px;font-weight:700;color:var(--text)}
.stat-sub{font-size:12px;color:var(--muted)}
.stat-list{margin:0;padding-left:18px;color:var(--text);font-size:13px;line-height:1.6}
.bars{display:flex;flex-direction:column;gap:6px}
.bar-row{display:grid;grid-template-columns:auto 1fr auto;gap:6px;align-items:center;font-size:12px;color:var(--text)}
.bar-label{font-weight:600}
.bar-track{height:8px;background:rgba(110,46,52,.1);border-radius:999px;overflow:hidden;position:relative}
.bar-fill{display:block;height:100%;background:var(--accent);border-radius:999px}
.bar-count{color:var(--muted);font-variant-numeric:tabular-nums}
.stat-pill{display:inline-block;padding:6px 10px;border-radius:20px;background:rgba(110,46,52,.08);color:var(--text);font-size:12px;border:1px solid rgba(110,46,52,.15)}
.split{display:grid;grid-template-columns: 1fr 1fr;gap:12px;margin-top:12px}
.list{border:1px solid rgba(110,46,52,.25);border-radius:12px;overflow:hidden;background:var(--card);max-height:540px;overflow-y:auto}
.row{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(110,46,52,.15);background:#fff}
.row:hover{background:#fff6f7}
.row.active{background:#FFECEF}
.row:last-child{border-bottom:none}
.chk{display:flex;align-items:center}
.meta{min-width:0}
.title{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sub{font-size:12px;color:var(--muted)}
.spacer{flex:1}
.preview{border:1px solid rgba(110,46,52,.25);border-radius:12px;background:var(--card);display:flex;flex-direction:column;min-height:360px;max-height:540px;overflow:hidden}
.pv-head{padding:12px 14px;border-bottom:1px solid rgba(110,46,52,.15)}
.pv-title{font-weight:600}
.pv-sub{font-size:12px;color:var(--muted)}
.pv-results{padding:8px 12px;display:flex;flex-wrap:wrap;gap:6px;border-bottom:1px solid rgba(110,46,52,.08);background:rgba(255,255,255,.6)}
.pv-results .result-pill{border:1px solid rgba(110,46,52,.25);background:rgba(110,46,52,.06);color:var(--text);padding:4px 8px;border-radius:8px;cursor:pointer;font-size:12px;line-height:1}
.pv-results .result-pill:hover{border-color:var(--accent)}
.pv-body{padding:12px 10px;overflow:auto;background:#fff}
.msg{display:flex;margin:8px 0}
.msg.left{justify-content:flex-start}
.msg.right{justify-content:flex-end}
.msg .bubble{max-width:100%;padding:8px 10px;border-radius:10px;border:1px solid rgba(110,46,52,.2);background:var(--bubble-assist);box-shadow:0 2px 8px rgba(0,0,0,.04)}
.msg.right .bubble{background:var(--bubble-user)}
.msg.match .bubble{border-color:var(--accent);box-shadow:0 2px 10px rgba(110,46,52,.12)}
.msg.highlight .bubble{animation:flash 1s ease-in-out 2}
.msg .meta-line{display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap}
.msg .role{font-size:11px;color:#6E2E34;opacity:.8;margin-bottom:0}
.msg .model-badge{font-size:11px;color:var(--muted);padding:2px 6px;border-radius:6px;background:rgba(110,46,52,.06);border:1px solid rgba(110,46,52,.15)}
.msg .text{white-space:pre-wrap;word-break:break-word}
.msg.highlight .text{color:var(--accent-600)}
.pv-empty{padding:20px;color:var(--muted)}
@keyframes flash{0%{background:var(--bubble-assist)}50%{background:#fff6f7}100%{background:var(--bubble-assist)}}
.foot{margin:16px 0;color:var(--muted);font-size:12px;text-align:center}
@media (max-width: 1000px){.panel{grid-template-columns:repeat(2,1fr)}.panel .group.rowBtns{grid-column:span 2}}
@media (max-width: 900px){.split{grid-template-columns:1fr}}

/* ======== Mobile polish ======== */
.toolbar .actions{ flex-wrap: wrap; }
.toolbar .actions > *{ flex: 0 1 auto; }

@media (max-width: 1024px){
  .split{ grid-template-columns:1fr; }
}

@media (max-width: 720px){
  .wrap{ padding: 0 12px; }
  .toolbar{ gap: 8px; }
  .toolbar .actions{ width: 100%; margin-left: 0; gap: 8px; }
  .toolbar .actions .search{ min-width: 0; flex: 1 1 180px; }
  .toolbar .actions select,
  .toolbar .actions button{ flex: 1 1 48%; }
  .panel{ grid-template-columns: 1fr; }
  .panel .group.rowBtns{ grid-column: auto; }
}

@media (max-width: 420px){
  .hero h1{ font-size: 18px; }
  .title{ font-size: 13px; }
  .sub{ font-size: 11px; }
  .select, .search, .input, button{ height: 32px; }
  .pv-head{ padding: 10px 12px; }
  .pv-body{ padding: 10px 8px; }
}
`;

// Cream
const cssCream = cssBase;

// Berry
const cssBerry = cssBase
  .replaceAll('#F5E6D1', '#284139')
  .replaceAll('#fff', '#111A19')
  .replaceAll('#2b2b2b', '#F8D794')
  .replaceAll('#5E7B9B', '#BB6830')
  .replaceAll('#B46C72', '#BB6830')
  .replaceAll('#6E2E34', '#F8D794')
  .replaceAll('#FFECEF', '#2f5146');

// Basket
const cssBasket = cssBase
  .replaceAll('#F5E6D1', '#F3EAF7')
  .replaceAll('#5E7B9B', '#9C7CA5')
  .replaceAll('#2b2b2b', '#2E2435')
  .replaceAll('#B46C72', '#C89BCB')
  .replaceAll('#6E2E34', '#7A4E7E')
  .replaceAll('#FFECEF', '#F8F0FA');

// 云朵团团 (Cloudy Puff)
const cssCloudy = cssBase
  .replaceAll('#F5E6D1', '#C6D4EE') // 背景
  .replaceAll('#5E7B9B', '#5A97CA') // muted
  .replaceAll('#2b2b2b', '#264C9D') // 正文字色
  .replaceAll('#B46C72', '#0E246A') // accent
  .replaceAll('#6E2E34', '#264C9D') // accent-600
  .replaceAll('#FFECEF', '#C6D4EE'); // 气泡辅助色
