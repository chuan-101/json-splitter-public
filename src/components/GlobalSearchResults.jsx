import React from "react";

export default function GlobalSearchResults({ globalMatches, setPreviewIdx, setTargetMessageIdx, t }) {
  if (!globalMatches) return null;

  return (
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
  );
}
