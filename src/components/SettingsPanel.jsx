import React from "react";

export default function SettingsPanel({
  roleNameUser,
  setRoleNameUser,
  roleNameAssistant,
  setRoleNameAssistant,
  roleNameSystem,
  setRoleNameSystem,
  filePrefix,
  setFilePrefix,
  fileSuffix,
  setFileSuffix,
  hideSystemExport,
  setHideSystemExport,
  plainTextExport,
  setPlainTextExport,
  downloadSelected,
  downloadZip,
  selectAllVisible,
  deselectAllVisible,
  invertVisible,
  selectedSize,
  t,
}) {
  return (
    <div className="settings-deck">
      <div className="deck-row">
        <div className="settings-row settings-row-inputs">
          <div className="group inline">
            <label>{t('roleUser')}</label>
            <input className="input" value={roleNameUser} onChange={(e)=>setRoleNameUser(e.target.value)} />
          </div>
          <div className="group inline">
            <label>{t('roleAssistant')}</label>
            <input className="input" value={roleNameAssistant} onChange={(e)=>setRoleNameAssistant(e.target.value)} />
          </div>
          <div className="group inline">
            <label>{t('roleSystem')}</label>
            <input className="input" value={roleNameSystem} onChange={(e)=>setRoleNameSystem(e.target.value)} />
          </div>
          <div className="group inline slim">
            <label>{t('filePrefix')}</label>
            <input className="input" value={filePrefix} onChange={(e)=>setFilePrefix(e.target.value)} placeholder={t('optional')} />
          </div>
          <div className="group inline slim">
            <label>{t('fileSuffix')}</label>
            <input className="input" value={fileSuffix} onChange={(e)=>setFileSuffix(e.target.value)} placeholder={t('optional')} />
          </div>
        </div>
        <div className="settings-row settings-row-actions">
          <div className="export-options">
            <label className="export-option">
              <input
                type="checkbox"
                checked={hideSystemExport}
                onChange={(e) => setHideSystemExport(e.target.checked)}
              />
              <span>{t('exportHideSystem')}</span>
            </label>
            <label className="export-option">
              <input
                type="checkbox"
                checked={plainTextExport}
                onChange={(e) => setPlainTextExport(e.target.checked)}
              />
              <span>{t('exportPlainText')}</span>
            </label>
          </div>
          <div className="deck-actions">
            <button className="ghost" onClick={selectAllVisible}>{t('selectAll')}</button>
            <button className="ghost" onClick={deselectAllVisible}>{t('deselectAll')}</button>
            <button className="ghost" onClick={invertVisible}>{t('invert')}</button>
            <button className="primary" disabled={!selectedSize} onClick={downloadSelected}>{t('downloadSel')}</button>
            <button className="primary" disabled={!selectedSize} onClick={downloadZip}>{t('downloadZip')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
