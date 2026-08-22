import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function buildFallbackEncouragement({ level = 1 } = {}) {
  const messages = [
    "좋아요. 작은 집중이 쌓이면 큰 성장으로 이어져요.",
    "지금의 꾸준함이 내일의 실력을 만듭니다.",
    "한 번의 완벽함보다 계속 이어가는 힘이 더 강합니다.",
    "레벨업했어요! 오늘의 집중이 분명한 성장을 만들고 있어요.",
  ];

  return `${messages[level % messages.length]} 현재 레벨 ${level}, 이 흐름을 그대로 이어가 보세요.`;
}

export function buildEncouragementPrompt({ level = 1, totalXp = 0, completedPomodoros = 0 } = {}) {
  return [
    "당신은 학습용 포모도로 앱의 한국어 응원 코치입니다.",
    "짧은 한국어 격려 메시지 2~3문장만 작성하세요.",
    "반드시 레벨업을 축하하고, 명언처럼 기억에 남는 한 문장을 포함하세요.",
    `현재 레벨: ${level}`,
    `누적 XP: ${totalXp}`,
    `완료한 포모도로 수: ${completedPomodoros}`,
  ].join("\n");
}

export function buildFallbackInsight({ bestSlot = "오전", todaySessions = 0, weekSessions = 0 } = {}) {
  return `${bestSlot} 시간대 집중 빈도가 가장 높습니다. 오늘 ${todaySessions}회, 이번 주 ${weekSessions}회 집중했으니 같은 리듬을 계속 이어가 보세요.`;
}

export function buildInsightPrompt({
  todaySessions = 0,
  todayMinutes = 0,
  weekSessions = 0,
  weekMinutes = 0,
  totalSessions = 0,
  totalMinutes = 0,
  bestSlot = "오전",
} = {}) {
  return [
    "당신은 학습 통계를 분석하는 한국어 코치입니다.",
    "사용자에게 2문장 이내의 짧은 한국어 인사이트를 제공하세요.",
    "구체적인 시간대 패턴과 다음 행동 제안을 포함하세요.",
    `오늘: ${todaySessions}회, ${todayMinutes}분`,
    `이번 주: ${weekSessions}회, ${weekMinutes}분`,
    `전체: ${totalSessions}회, ${totalMinutes}분`,
    `가장 많이 집중한 시간대: ${bestSlot}`,
  ].join("\n");
}

export function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const text = payload?.output
    ?.flatMap((item) => item?.content ?? [])
    ?.map((item) => item?.text?.value ?? item?.text ?? "")
    ?.filter(Boolean)
    ?.join(" ")
    ?.trim();

  return text || "";
}

export function createApp({ fetchImpl = globalThis.fetch, env = process.env } = {}) {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, "public")));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/encouragement", async (req, res) => {
    const stats = req.body ?? {};
    const level = Number(stats.level) || 1;
    const totalXp = Number(stats.totalXp) || 0;
    const completedPomodoros = Number(stats.completedPomodoros) || 0;
    const fallback = buildFallbackEncouragement({ level });

    if (!env.OPENAI_API_KEY || typeof fetchImpl !== "function") {
      return res.json({ message: fallback, source: "fallback" });
    }

    try {
      const authToken = ["Bearer", env.OPENAI_API_KEY].join(" ");
      const response = await fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authToken,
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || "gpt-4.1-mini",
          input: buildEncouragementPrompt({ level, totalXp, completedPomodoros }),
          max_output_tokens: 120,
        }),
      });

      if (!response.ok) {
        return res.json({ message: fallback, source: "fallback" });
      }

      const payload = await response.json();
      const message = extractOutputText(payload) || fallback;

      return res.json({
        message,
        source: message === fallback ? "fallback" : "openai",
      });
    } catch {
      return res.json({ message: fallback, source: "fallback" });
    }
  });

  app.post("/api/insights", async (req, res) => {
    const stats = req.body ?? {};
    const bestSlot = stats.bestSlot || "오전";
    const fallback = buildFallbackInsight({
      bestSlot,
      todaySessions: Number(stats.todaySessions) || 0,
      weekSessions: Number(stats.weekSessions) || 0,
    });

    if (!env.OPENAI_API_KEY || typeof fetchImpl !== "function") {
      return res.json({ message: fallback, source: "fallback" });
    }

    try {
      const authToken = ["Bearer", env.OPENAI_API_KEY].join(" ");
      const response = await fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authToken,
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || "gpt-4.1-mini",
          input: buildInsightPrompt({
            todaySessions: Number(stats.todaySessions) || 0,
            todayMinutes: Number(stats.todayMinutes) || 0,
            weekSessions: Number(stats.weekSessions) || 0,
            weekMinutes: Number(stats.weekMinutes) || 0,
            totalSessions: Number(stats.totalSessions) || 0,
            totalMinutes: Number(stats.totalMinutes) || 0,
            bestSlot,
          }),
          max_output_tokens: 120,
        }),
      });

      if (!response.ok) {
        return res.json({ message: fallback, source: "fallback" });
      }

      const payload = await response.json();
      const message = extractOutputText(payload) || fallback;

      return res.json({
        message,
        source: message === fallback ? "fallback" : "openai",
      });
    } catch {
      return res.json({ message: fallback, source: "fallback" });
    }
  });

  app.use((_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

  return app;
}

if (process.argv[1] === __filename) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => {
    console.log(`Pomodoro app listening on ${port}`);
  });
}
