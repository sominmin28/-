export const STORAGE_KEY = "levelup-pomodoro-state";
export const DEFAULT_SETTINGS = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
};

export function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || min, min), max);
}

export function clampSettings(settings = {}) {
  const focusMinutes = clamp(settings.focusMinutes, 15, 60);
  const shortBreakMinutes = clamp(settings.shortBreakMinutes, 1, 15);
  const longBreakMinutes = clamp(settings.longBreakMinutes, 10, 30);

  return {
    focusMinutes,
    shortBreakMinutes,
    longBreakMinutes,
  };
}

export function getSessionSeconds(mode, settings) {
  const safeSettings = clampSettings(settings);
  if (mode === "shortBreak") {
    return safeSettings.shortBreakMinutes * 60;
  }
  if (mode === "longBreak") {
    return safeSettings.longBreakMinutes * 60;
  }
  return safeSettings.focusMinutes * 60;
}

export function getLevel(totalXp = 0) {
  const safeXp = Math.max(Number(totalXp) || 0, 0);
  const xpIntoLevel = safeXp % 100;
  return {
    level: Math.floor(safeXp / 100) + 1,
    xpIntoLevel,
    xpForNextLevel: xpIntoLevel === 0 ? 100 : 100 - xpIntoLevel,
  };
}

export function getNextMode(currentMode, completedFocusSessions) {
  if (currentMode === "focus") {
    return completedFocusSessions % 4 === 0 ? "longBreak" : "shortBreak";
  }
  return "focus";
}

export function recordFocusSession(history, completedAt, focusMinutes) {
  return [
    ...(Array.isArray(history) ? history : []),
    {
      completedAt,
      focusMinutes,
      xpEarned: 25,
    },
  ];
}

export function summarizeStats(history = [], now = new Date()) {
  const current = new Date(now);
  const startOfDay = new Date(current);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  const buckets = {
    새벽: 0,
    오전: 0,
    오후: 0,
    밤: 0,
  };

  let todaySessions = 0;
  let todayMinutes = 0;
  let weekSessions = 0;
  let weekMinutes = 0;
  let totalMinutes = 0;

  for (const entry of history) {
    const completedAt = new Date(entry.completedAt);
    if (Number.isNaN(completedAt.getTime())) {
      continue;
    }

    const minutes = Number(entry.focusMinutes) || 0;
    totalMinutes += minutes;

    if (completedAt >= startOfDay) {
      todaySessions += 1;
      todayMinutes += minutes;
    }

    if (completedAt >= startOfWeek) {
      weekSessions += 1;
      weekMinutes += minutes;
    }

    const hour = completedAt.getHours();
    if (hour < 6) {
      buckets.새벽 += 1;
    } else if (hour < 12) {
      buckets.오전 += 1;
    } else if (hour < 18) {
      buckets.오후 += 1;
    } else {
      buckets.밤 += 1;
    }
  }

  const bestSlot = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]?.[0] || "오전";
  const totalSessions = history.length;

  return {
    today: { sessions: todaySessions, minutes: todayMinutes },
    week: { sessions: weekSessions, minutes: weekMinutes },
    all: { sessions: totalSessions, minutes: totalMinutes },
    timeBuckets: buckets,
    insight:
      totalSessions === 0
        ? "첫 포모도로를 시작하면 AI 인사이트가 여기에 표시됩니다."
        : `${bestSlot} 시간대에 가장 자주 집중하고 있어요. ${
            todaySessions > 0 ? "오늘도 흐름을 이어 가세요." : "다음 집중 세션으로 리듬을 되찾아 보세요."
          }`,
  };
}
