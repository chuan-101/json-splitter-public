import React from "react";

export default function Toolbar({
  lang,
  setLang,
  theme,
  setTheme,
  titleQuery,
  setTitleQuery,
  contentQuery,
  setContentQuery,
  globalSearch,
  setGlobalSearch,
  selectAllVisible,
  deselectAllVisible,
  invertVisible,
  convosCount,
  visibleCount,
  selectedCount,
  t,
}) {
  const toggleTheme = () => setTheme(theme === "ceramic" ? "stealth" : "ceramic");
  const themeIsLight = theme === "ceramic";

  return (
    <div className="toolbar">
      <div className="stats">{t('total')} <b>{convosCount}</b> · {t('shown')} <b>{visibleCount}</b> · {t('selected')} <b>{selectedCount}</b></div>
      <div className="actions">
        <select className="select" value={lang} onChange={(e)=>setLang(e.target.value)}>
          <option value="zh">简体中文</option>
          <option value="en">English</option>
        </select>
        <button
          type="button"
          className="icon-btn"
          onClick={toggleTheme}
          aria-label={`${t('toggleTheme')}: ${themeIsLight ? t('themeCeramic') : t('themeStealth')}`}
          title={`${t('toggleTheme')}: ${themeIsLight ? t('themeCeramic') : t('themeStealth')}`}
        >
          <span className="icon-circle" aria-hidden="true">
            {themeIsLight ? "🌞" : "🌜"}
          </span>
          <span className="icon-label">{themeIsLight ? t('themeCeramic') : t('themeStealth')}</span>
        </button>
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
  );
}
