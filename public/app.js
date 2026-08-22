import {
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  clampSettings,
  getLevel,
  getNextMode,
  getSessionSeconds,
  recordFocusSession,
  summarizeStats,
} from "/lib/pomodoro-core.js";

const state = loadState();
const elements = {
  timerDisplay: document.getElementById("timerDisplay"),
  modeLabel: document.getElementById("modeLabel"),
  sessionCount: document.getElementById("sessionCount"),
  levelValue: document.getElementById("levelValue"),
  xpValue: document.getElementById("xpValue"),
  xpBar: document.getElementById("xpBar"),
  statusText: document.getElementById("statusText"),
  encouragementText: document.getElementById("encouragementText"),
  todayStats: document.getElementById("todayStats"),
  weekStats: document.getElementById("weekStats"),
  allStats: document.getElementById("allStats"),
  bucketGrid: document.getElementById("bucketGrid"),
  insightText: document.getElementById("insightText"),
  focusMinutes: document.getElementById("focusMinutes"),
  shortBreakMinutes: document.getElementById("shortBreakMinutes"),
  longBreakMinutes: document.getElementById("longBreakMinutes"),
  settingsForm: document.getElementById("settingsForm"),
  startButton: document.getElementById("startButton"),
  pauseButton: document.getElementById("pauseButton"),
  resetButton: document.getElementById("resetButton"),
  skipButton: document.getElementById("skipButton"),
  noiseToggle: document.getElementById("noiseToggle"),
  noiseButtons: Array.from(document.querySelectorAll(".noise-option")),
};

let timerId = null;
let targetTimestamp = null;
let audioController = null;

syncSettingsForm();
render();

elements.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.isRunning = false;
  stopTicker();
  await stopNoise();
  state.settings = clampSettings({
    focusMinutes: elements.focusMinutes.value,
    shortBreakMinutes: elements.shortBreakMinutes.value,
    longBreakMinutes: elements.longBreakMinutes.value,
  });
  state.remainingSeconds = getSessionSeconds(state.mode, state.settings);
  state.statusText = "설정이 저장되었습니다.";
  persist();
  syncSettingsForm();
  render();
});

elements.startButton.addEventListener("click", async () => {
  state.isRunning = true;
  targetTimestamp = Date.now() + state.remainingSeconds * 1000;
  startTicker();
  await updateNoisePlayback();
  state.statusText = state.mode === "focus" ? "집중 중입니다. 흐름을 이어가 보세요." : "휴식 중입니다. 잠시 숨을 고르세요.";
  persist();
  render();
});

elements.pauseButton.addEventListener("click", async () => {
  state.isRunning = false;
  stopTicker();
  await stopNoise();
  state.statusText = "타이머가 일시정지되었습니다.";
  persist();
  render();
});

elements.resetButton.addEventListener("click", async () => {
  state.isRunning = false;
  stopTicker();
  state.remainingSeconds = getSessionSeconds(state.mode, state.settings);
  state.statusText = "현재 세션을 기본 시간으로 리셋했습니다.";
  await stopNoise();
  persist();
  render();
});

elements.skipButton.addEventListener("click", async () => {
  state.isRunning = false;
  stopTicker();
  await stopNoise();
  completeSession(true);
});

elements.noiseToggle.addEventListener("click", async () => {
  state.noiseEnabled = !state.noiseEnabled;
  await updateNoisePlayback();
  persist();
  render();
});

elements.noiseButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    state.noiseMode = button.dataset.noise;
    await updateNoisePlayback();
    persist();
    render();
  });
});

window.addEventListener("beforeunload", persist);

function loadState() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    stored = null;
  }
  const settings = clampSettings(stored?.settings || DEFAULT_SETTINGS);
  const mode = stored?.mode || "focus";

  return {
    settings,
    mode,
    remainingSeconds: stored?.remainingSeconds || getSessionSeconds(mode, settings),
    isRunning: false,
    completedPomodoros: Number(stored?.completedPomodoros) || 0,
    totalXp: Number(stored?.totalXp) || 0,
    encouragementText: stored?.encouragementText || "다음 레벨업 때 AI 격려 메시지가 여기에 표시됩니다.",
    aiInsight: stored?.aiInsight || "",
    history: Array.isArray(stored?.history) ? stored.history : [],
    noiseEnabled: Boolean(stored?.noiseEnabled),
    noiseMode: stored?.noiseMode || "rain",
    statusText: "집중 세션을 시작해 보세요.",
  };
}

function persist() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      settings: state.settings,
      mode: state.mode,
      remainingSeconds: state.remainingSeconds,
      completedPomodoros: state.completedPomodoros,
      totalXp: state.totalXp,
      encouragementText: state.encouragementText,
      aiInsight: state.aiInsight,
      history: state.history,
      noiseEnabled: state.noiseEnabled,
      noiseMode: state.noiseMode,
    }),
  );
}

function syncSettingsForm() {
  elements.focusMinutes.value = state.settings.focusMinutes;
  elements.shortBreakMinutes.value = state.settings.shortBreakMinutes;
  elements.longBreakMinutes.value = state.settings.longBreakMinutes;
}

function startTicker() {
  stopTicker();
  timerId = window.setInterval(async () => {
    const nextSeconds = Math.max(0, Math.ceil((targetTimestamp - Date.now()) / 1000));
    state.remainingSeconds = nextSeconds;
    render();

    if (nextSeconds === 0) {
      state.isRunning = false;
      stopTicker();
      await stopNoise();
      await completeSession(false);
    }
  }, 250);
}

function stopTicker() {
  if (timerId) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

async function completeSession(skipped) {
  const previousMode = state.mode;

  if (previousMode === "focus" && !skipped) {
    const beforeLevel = getLevel(state.totalXp).level;
    state.totalXp += 25;
    state.completedPomodoros += 1;
    state.history = recordFocusSession(state.history, new Date().toISOString(), state.settings.focusMinutes);
    const afterLevel = getLevel(state.totalXp).level;

    state.statusText = "포모도로를 완료했습니다. 잠시 쉬어도 좋아요.";

    if (afterLevel > beforeLevel) {
      await fetchEncouragement(afterLevel);
    }

    await refreshInsight();
  } else if (skipped) {
    state.statusText = "세션을 건너뛰고 다음 단계로 이동했습니다.";
  } else {
    state.statusText = "휴식이 끝났어요. 다시 집중해 볼까요?";
  }

  state.mode = getNextMode(previousMode, state.completedPomodoros);
  state.remainingSeconds = getSessionSeconds(state.mode, state.settings);
  persist();
  render();
}

async function fetchEncouragement(level) {
  try {
    const response = await fetch("/api/encouragement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level,
        totalXp: state.totalXp,
        completedPomodoros: state.completedPomodoros,
      }),
    });
    const payload = await response.json();
    if (payload?.message) {
      state.encouragementText = payload.message;
    }
  } catch {
    state.encouragementText = "레벨업! 꾸준한 집중이 결국 큰 차이를 만듭니다.";
  }
}

async function refreshInsight() {
  const stats = summarizeStats(state.history);
  const bestSlot = Object.entries(stats.timeBuckets).sort((a, b) => b[1] - a[1])[0]?.[0] || "오전";

  try {
    const response = await fetch("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        todaySessions: stats.today.sessions,
        todayMinutes: stats.today.minutes,
        weekSessions: stats.week.sessions,
        weekMinutes: stats.week.minutes,
        totalSessions: stats.all.sessions,
        totalMinutes: stats.all.minutes,
        bestSlot,
      }),
    });
    const payload = await response.json();
    if (payload?.message) {
      state.aiInsight = payload.message;
    }
  } catch {
    state.aiInsight = stats.insight;
  }
}

function render() {
  const levelInfo = getLevel(state.totalXp);
  const stats = summarizeStats(state.history);
  const totalSeconds = getSessionSeconds(state.mode, state.settings);
  const progress = totalSeconds === 0 ? 0 : ((state.totalXp % 100) / 100) * 100;

  elements.timerDisplay.textContent = formatTime(state.remainingSeconds);
  elements.modeLabel.textContent =
    state.mode === "focus" ? "집중 시간" : state.mode === "shortBreak" ? "짧은 휴식" : "긴 휴식";
  elements.sessionCount.textContent = String(state.completedPomodoros % 4 || (state.mode === "longBreak" ? 4 : 0));
  elements.levelValue.textContent = String(levelInfo.level);
  elements.xpValue.textContent = String(levelInfo.xpIntoLevel);
  elements.xpBar.style.width = `${progress}%`;
  elements.statusText.textContent = state.statusText;
  elements.encouragementText.textContent = state.encouragementText;
  elements.todayStats.textContent = `${stats.today.sessions}회 · ${stats.today.minutes}분`;
  elements.weekStats.textContent = `${stats.week.sessions}회 · ${stats.week.minutes}분`;
  elements.allStats.textContent = `${stats.all.sessions}회 · ${stats.all.minutes}분`;
  elements.insightText.textContent = `AI 인사이트: ${state.aiInsight || stats.insight}`;
  elements.noiseToggle.textContent = state.noiseEnabled ? "백색소음 끄기" : "백색소음 켜기";

  elements.noiseButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.noise === state.noiseMode);
  });

  elements.bucketGrid.innerHTML = Object.entries(stats.timeBuckets)
    .map(([label, count]) => `<div><span>${label}</span><strong>${count}회</strong></div>`)
    .join("");
}

function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

async function updateNoisePlayback() {
  if (!state.noiseEnabled || state.mode !== "focus" || !state.isRunning) {
    await stopNoise();
    return;
  }

  if (!audioController) {
    audioController = createNoiseController();
  }

  await audioController.start(state.noiseMode);
}

async function stopNoise() {
  if (audioController) {
    await audioController.stop();
  }
}

function createNoiseController() {
  let context = null;
  let nodes = [];
  let noiseBuffer = null;

  function ensureContext() {
    if (!context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      context = new AudioContextClass();
      noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let index = 0; index < output.length; index += 1) {
        output[index] = Math.random() * 2 - 1;
      }
    }
    return context;
  }

  function buildNoiseSource() {
    const activeContext = ensureContext();
    const source = activeContext.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    return source;
  }

  async function start(mode) {
    await stop();
    const activeContext = ensureContext();
    if (activeContext.state === "suspended") {
      await activeContext.resume();
    }

    const noise = buildNoiseSource();
    const gain = activeContext.createGain();
    const filter = activeContext.createBiquadFilter();

    filter.type = mode === "waves" ? "lowpass" : mode === "cafe" ? "bandpass" : mode === "forest" ? "highpass" : "lowpass";
    filter.frequency.value = mode === "waves" ? 350 : mode === "cafe" ? 900 : mode === "forest" ? 1400 : 800;
    gain.gain.value = mode === "cafe" ? 0.018 : 0.028;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(activeContext.destination);
    noise.start();
    nodes = [noise, filter, gain];

    if (mode === "waves" || mode === "forest") {
      const lfo = activeContext.createOscillator();
      const lfoGain = activeContext.createGain();
      lfo.frequency.value = mode === "waves" ? 0.12 : 0.3;
      lfoGain.gain.value = mode === "waves" ? 120 : 260;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();
      nodes.push(lfo, lfoGain);
    }

    if (mode === "cafe" || mode === "forest") {
      const tone = activeContext.createOscillator();
      const toneGain = activeContext.createGain();
      tone.type = "triangle";
      tone.frequency.value = mode === "cafe" ? 180 : 620;
      toneGain.gain.value = mode === "cafe" ? 0.004 : 0.0025;
      tone.connect(toneGain);
      toneGain.connect(activeContext.destination);
      tone.start();
      nodes.push(tone, toneGain);
    }
  }

  async function stop() {
    if (!nodes.length) {
      return;
    }

    for (const node of nodes) {
      if (typeof node.stop === "function") {
        try {
          node.stop();
        } catch {
          // no-op
        }
      }
      if (typeof node.disconnect === "function") {
        node.disconnect();
      }
    }
    nodes = [];
  }

  return { start, stop };
}

if (state.history.length > 0 && !state.aiInsight) {
  refreshInsight().then(() => {
    persist();
    render();
  });
}
