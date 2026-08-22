import test from "node:test";
import assert from "node:assert/strict";

import {
  clampSettings,
  getLevel,
  getNextMode,
  summarizeStats,
} from "../public/lib/pomodoro-core.js";

test("clampSettings keeps values within supported ranges", () => {
  assert.deepEqual(
    clampSettings({
      focusMinutes: 99,
      shortBreakMinutes: 0,
      longBreakMinutes: 2,
    }),
    {
      focusMinutes: 60,
      shortBreakMinutes: 1,
      longBreakMinutes: 10,
    },
  );
});

test("getLevel returns expected level progression", () => {
  assert.deepEqual(getLevel(0), {
    level: 1,
    xpIntoLevel: 0,
    xpForNextLevel: 100,
  });
  assert.deepEqual(getLevel(125), {
    level: 2,
    xpIntoLevel: 25,
    xpForNextLevel: 75,
  });
});

test("getNextMode switches to long break every fourth focus session", () => {
  assert.equal(getNextMode("focus", 1), "shortBreak");
  assert.equal(getNextMode("focus", 4), "longBreak");
  assert.equal(getNextMode("shortBreak", 4), "focus");
});

test("summarizeStats groups activity by time range and period", () => {
  const now = new Date("2026-08-22T15:00:00.000Z");
  const history = [
    { completedAt: "2026-08-22T09:00:00.000Z", focusMinutes: 25 },
    { completedAt: "2026-08-21T19:00:00.000Z", focusMinutes: 30 },
    { completedAt: "2026-08-17T03:00:00.000Z", focusMinutes: 20 },
  ];
  const summary = summarizeStats(history, now);

  assert.deepEqual(summary.today, { sessions: 1, minutes: 25 });
  assert.deepEqual(summary.week, { sessions: 3, minutes: 75 });
  assert.deepEqual(summary.all, { sessions: 3, minutes: 75 });
  assert.equal(summary.timeBuckets.오전, 1);
  assert.equal(summary.timeBuckets.밤, 1);
  assert.equal(summary.timeBuckets.새벽, 1);
  assert.match(summary.insight, /시간대/);
});
