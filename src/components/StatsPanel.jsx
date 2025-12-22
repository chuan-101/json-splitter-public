import React from "react";

export default function StatsPanel({ stats, t, formatRange }) {
  if (!stats) return null;

  return (
    <details className="stats-panel" open>
      <summary className="stats-summary">{t('statsSummary')}</summary>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">{t('statConvos')}</div>
          <div className="stat-value">{stats.conversationCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t('statMessages')}</div>
          <div className="stat-value">{stats.messageCount}</div>
          <div className="stat-sub">{t('statAvgChars')}: {stats.avgChars}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t('statChars')}</div>
          <div className="stat-sub">{t('statUserChars')}: {stats.userCharCount}</div>
          <div className="stat-sub">{t('statAssistantChars')}: {stats.assistantCharCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t('statLongestStreak')}</div>
          <div className="stat-value">{stats.longestStreak} {t('days')}</div>
          {stats.longestStreakRange && (
            <div className="stat-sub">{formatRange(stats.longestStreakRange)}</div>
          )}
          {stats.currentStreak != null && (
            <div className="stat-sub">
              {t('statCurrentStreak')}: {stats.currentStreak} {t('days')}
              {stats.currentStreakRange ? ` (${formatRange(stats.currentStreakRange)})` : ""}
            </div>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-label">{t('statActiveDays')}</div>
          <div className="stat-value">{stats.activeDays}</div>
        </div>
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
  );
}
