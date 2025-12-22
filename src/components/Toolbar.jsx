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
  return (
    <div className="toolbar">
      <div className="stats">{t('total')} <b>{convosCount}</b> · {t('shown')} <b>{visibleCount}</b> · {t('selected')} <b>{selectedCount}</b></div>
      <div className="actions">
        <select className="select" value={lang} onChange={(e)=>setLang(e.target.value)}>
          <option value="zh">简体中文</option>
          <option value="en">English</option>
        </select>
        <select className="select" value={theme} onChange={(e)=>setTheme(e.target.value)}>
          <option value="ceramic">{t('themeCeramic')}</option>
          <option value="stealth">{t('themeStealth')}</option>
          <option value="industrial">{t('themeIndustrial')}</option>
          <option value="retro">{t('themeRetro')}</option>
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
  );
}
