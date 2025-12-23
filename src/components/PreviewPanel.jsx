import React from "react";

export default function PreviewPanel({
  previewConv,
  filteredMessages,
  highlightMatches,
  roleDisplay,
  fmtDate,
  messageRefs,
  previewScrollRef,
  nonSystemMessageCount,
  t,
}) {
  return (
    <div className="preview">
      {previewConv ? (
        <>
          <div className="pv-head">
            <div className="pv-title" title={previewConv.title || "Untitled"}>{previewConv.title || "Untitled"}</div>
            <div className="pv-sub">{fmtDate(previewConv.create_time).d.toLocaleString()} · {nonSystemMessageCount} {t('messages')}</div>
          </div>
          <div className="pv-body" ref={previewScrollRef}>
            {filteredMessages.map(({ msg, model, idx }) => {
              const role = (msg.author?.role || "assistant").toLowerCase();
              const text = msg._text ?? msg.content; // normalizeMessage already called upstream
              const side = role === "assistant" ? "left" : "right";
              const kind = role === "assistant" ? "assistant" : "user";
              const displayRole = roleDisplay(role);
              return (
                <div
                  key={idx}
                  className={`msg ${side} ${kind}`}
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
  );
}
