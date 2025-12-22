import React from "react";

export default function ConversationList({
  visible,
  selected,
  toggle,
  highlight,
  previewIdx,
  downloadOne,
  buildChain,
  fmtDate,
  isPreviewMessageVisible,
  t,
}) {
  return (
    <div className="list">
      {visible.map(({ c, idx }) => {
        const checked = selected.has(idx);
        const { d } = fmtDate(c.create_time);
        const date = d.toISOString().slice(0, 10);
        const msgCount = buildChain(c).filter(isPreviewMessageVisible).length;
        const active = previewIdx === idx;
        const title = c.title || "Untitled";
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
              <div className="title" title={title}>{date}｜{title}</div>
              <div className="sub">{msgCount} {t('messages')}</div>
            </div>
            <div className="spacer" />
            <button className="ghost" onClick={(e) => { e.stopPropagation(); downloadOne(idx); }}>{t('downloadOne')}</button>
          </div>
        );
      })}
    </div>
  );
}
