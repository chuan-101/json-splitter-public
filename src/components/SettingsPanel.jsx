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
  downloadSelected,
  downloadZip,
  selectedSize,
  t,
}) {
  return (
    <div className="settings-deck">
      <div className="deck-row">
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
        <div className="deck-actions">
          <button className="primary" disabled={!selectedSize} onClick={downloadSelected}>{t('downloadSel')}</button>
          <button className="primary" disabled={!selectedSize} onClick={downloadZip}>{t('downloadZip')}</button>
        </div>
      </div>
    </div>
  );
}
