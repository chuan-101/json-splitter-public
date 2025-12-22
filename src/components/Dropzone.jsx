import React from "react";

export default function Dropzone({ onFile, dragging, setDragging, t }) {
  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <section
      className={"dropzone" + (dragging ? " dragging" : "")}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input type="file" accept="application/json" onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="hint"><strong>{t('clickOrDrag')}</strong> <code>conversations.json</code> {t('toHere')}</div>
    </section>
  );
}
