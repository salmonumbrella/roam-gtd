const VELOCITY_DASHBOARD_STYLE_ID = "gtd-velocity-dashboard-style";

const VELOCITY_DASHBOARD_STYLE = `
  .gtd-velocity-dashboard {
    color: var(--roam-gtd-text);
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 4px 2px 2px;
  }
  .gtd-velocity-dashboard__header {
    align-items: baseline;
    display: flex;
    justify-content: space-between;
  }
  .gtd-velocity-dashboard__date-range {
    color: #7f849c;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.2;
  }
  .gtd-velocity-dashboard__week-label {
    color: #7f849c;
    font-size: 12px;
    line-height: 1.2;
  }
  .gtd-velocity-dashboard__metric-grid {
    display: grid;
    gap: 12px;
  }
  .gtd-velocity-dashboard__metric-grid--two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .gtd-velocity-dashboard__metric-grid--three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .gtd-velocity-dashboard__metric-card {
    align-items: flex-start;
    appearance: none;
    background: var(--roam-gtd-surface);
    border: 1px solid #373737;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    font: inherit;
    gap: 8px;
    min-height: 92px;
    padding: 14px;
    text-align: left;
    transition:
      background-color 140ms ease,
      border-color 140ms ease,
      transform 140ms ease;
    width: 100%;
  }
  .gtd-velocity-dashboard__metric-card-label {
    color: var(--roam-gtd-text-muted);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    line-height: 1.15;
    text-transform: uppercase;
  }
  .gtd-velocity-dashboard__metric-card-value {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .gtd-velocity-dashboard__metric-card-subtext {
    color: #7f849c;
    font-size: 12px;
    line-height: 1.35;
    margin-top: auto;
  }
  .gtd-velocity-dashboard__skeleton-text {
    border-radius: var(--roam-gtd-skeleton-radius);
    height: 11px;
  }
  @media (max-width: 780px) {
    .gtd-velocity-dashboard__metric-grid--three {
      grid-template-columns: 1fr;
    }
    .gtd-velocity-dashboard__metric-grid--two {
      grid-template-columns: 1fr;
    }
  }
`;

export function ensureVelocityDashboardStyle(): void {
  if (document.getElementById(VELOCITY_DASHBOARD_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = VELOCITY_DASHBOARD_STYLE_ID;
  style.textContent = VELOCITY_DASHBOARD_STYLE;
  document.head.append(style);
}
