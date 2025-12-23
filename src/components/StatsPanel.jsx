import React from "react";

export default function StatsPanel({ stats, t, formatRange }) {
  if (!stats) return null;

  return (
    <div className="stats-panel device-panel">
      <div className="primary-screens">
        <div className="primary-display deep">
          <div className="display-label">Window Count</div>
          <div className="display-value pixel">{stats.conversationCount}</div>
          <div className="display-sub">{t('statConvos')}</div>
        </div>
        <div className="primary-display deep">
          <div className="display-label">{t('statMessages')}</div>
          <div className="display-value pixel">{stats.messageCount}</div>
          <div className="display-sub">{t('statAvgChars')}: {stats.avgChars}</div>
        </div>
      </div>

      <div className="secondary-strip light">
        <div className="secondary-item">
          <div className="display-label">{t('statCurrentStreak')}</div>
          <div className="display-value slim">{stats.currentStreak ?? stats.longestStreak} {t('days')}</div>
          <div className="display-sub">{formatRange(stats.currentStreakRange || stats.longestStreakRange)}</div>
        </div>
        <div className="secondary-item">
          <div className="display-label">{t('statActiveDays')}</div>
          <div className="display-value slim">{stats.activeDays}</div>
          <div className="display-sub">{t('statChars')}: {stats.charCount}</div>
        </div>
      </div>

      <details className="advanced-drawer">
        <summary className="stats-summary">Advanced</summary>
        <div className="advanced-grid">
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
        </div>
      </details>
    </div>
  );
}
