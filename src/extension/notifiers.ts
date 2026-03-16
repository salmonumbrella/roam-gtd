import type { GtdSettings } from "../settings";
import type { createGtdStore } from "../store";

const REVIEW_CHECK_INTERVAL_MS = 60_000;

export function createReviewNotifier(
  getSettingsFn: () => GtdSettings,
  onClickOpen: () => void,
): { start: () => void; stop: () => void } {
  let intervalId: number | undefined;
  let lastNotifiedDate = "";

  const check = (): void => {
    const settings = getSettingsFn();
    if (!settings.weeklyReviewNotify) {
      return;
    }

    const now = new Date();
    if (now.getDay() !== settings.weeklyReviewDay) {
      return;
    }

    const [hours, minutes] = settings.weeklyReviewTime.split(":").map(Number);
    if (now.getHours() < hours || (now.getHours() === hours && now.getMinutes() < minutes)) {
      return;
    }

    const todayKey = now.toISOString().slice(0, 10);
    if (lastNotifiedDate === todayKey) {
      return;
    }
    lastNotifiedDate = todayKey;

    if (!("Notification" in window) || Notification.permission !== "granted") {
      return;
    }

    const notification = new Notification("GTD", {
      body: "Time for your weekly review. Click to start.",
    });
    notification.onclick = () => {
      window.focus();
      onClickOpen();
    };
  };

  return {
    start: () => {
      check();
      if (typeof window.setInterval === "function") {
        intervalId = window.setInterval(check, REVIEW_CHECK_INTERVAL_MS);
      }
    },
    stop: () => {
      if (intervalId !== undefined && typeof window.clearInterval === "function") {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    },
  };
}

export function createDailyReviewNotifier(
  getSettingsFn: () => GtdSettings,
  getStoreFn: () => ReturnType<typeof createGtdStore>,
  onClickOpen: () => void,
): { start: () => void; stop: () => void } {
  let intervalId: number | undefined;
  let lastNotifiedDate = "";

  const check = (): void => {
    const settings = getSettingsFn();
    if (!settings.dailyReviewNotify) {
      return;
    }

    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    if (lastNotifiedDate === todayKey) {
      return;
    }

    const snapshot = getStoreFn().getSnapshot();
    if (snapshot.loading || snapshot.inbox.length === 0) {
      return;
    }

    const hasStaleItems = snapshot.inbox.some(
      (item) => item.ageDays >= settings.dailyReviewStaleDays,
    );
    if (!hasStaleItems) {
      return;
    }

    lastNotifiedDate = todayKey;

    if (!("Notification" in window) || Notification.permission !== "granted") {
      return;
    }

    const notification = new Notification("GTD", {
      body: "You have inbox items waiting. Click to triage.",
    });
    notification.onclick = () => {
      window.focus();
      onClickOpen();
    };
  };

  return {
    start: () => {
      check();
      if (typeof window.setInterval === "function") {
        intervalId = window.setInterval(check, REVIEW_CHECK_INTERVAL_MS);
      }
    },
    stop: () => {
      if (intervalId !== undefined && typeof window.clearInterval === "function") {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    },
  };
}
