# 레벨업 포모도로 앱 웹

Express 기반 포모도로 웹앱입니다. 기본 25분 집중 / 5분 휴식 / 4회 후 15분 긴 휴식을 제공하고, 사용자 정의 시간, XP/레벨, AI 격려 메시지, 학습 통계, 집중 전용 백색소음을 지원합니다.

## 실행 방법

```bash
npm install
npm start
```

브라우저에서 `http://localhost:3000` 을 열면 됩니다.

## Azure 배포 메모

- Azure App Service(Node)에서 바로 실행할 수 있도록 `npm start` 진입점을 제공합니다.
- 환경 변수 `OPENAI_API_KEY` 를 설정하면 레벨업 시 OpenAI GPT 기반 한국어 격려 메시지를 생성합니다.
- 선택 환경 변수 `OPENAI_MODEL` 로 모델명을 바꿀 수 있습니다.

## 테스트

```bash
npm test
```
