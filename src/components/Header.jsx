import React from "react";

export default function Header({ t }) {
  return (
    <header className="hero">
      <h1>{t('title')}</h1>
      <p>{t('subtitle')}</p>
    </header>
  );
}
