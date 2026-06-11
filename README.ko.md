<div align="center">

# ✦ AI Mirror

**누구나 쓰는 무료 멀티모델 AI 채팅 — 중국 본토 사용자도.**

ChatGPT · Gemini · Claude · DeepSeek · Qwen · GLM · Kimi · MiniMax · Doubao · ERNIE
— 모두 하나의 웹 앱에, 각 모델마다 해당 브랜드 전용 미학.

[English](README.md) · [中文](README.zh.md) · [日本語](README.ja.md) · 🌐 **한국어**

[![Vercel로 배포](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/appleweiping/ai-mirror)

</div>

---

## 무엇인가

10개 이상의 첨단 모델과 누구나 대화하고 즉시 전환할 수 있는 깔끔한 웹 UI. 모델을 고르면
**인터페이스 전체가 해당 브랜드의 실제 비주얼 언어로 바뀝니다** — OpenAI 그린,
Gemini 의 블루→퍼플 오로라, Claude 의 따뜻한 클레이, DeepSeek 의 딥 블루 등.

**전적으로 Vercel 에서 동작**합니다(정적 프론트엔드 + 엣지 함수). **별도 서버 불필요** —
가장 안정적인 배포 방식이며 따로 호스팅·유지보수할 것이 없습니다.

## "무료"의 작동 방식 (필독)

진정 무료인 *ChatGPT API* 는 없습니다 — OpenAI 는 무료 등급을 없앴고 모든 호출에 비용이
듭니다. 그래서 AI Mirror 는 세 가지 정직한 경로를 제공하며, 제공업체별로 혼용 가능합니다:

| 방식 | 의미 | 비용 |
|------|------|------|
| **BYOK(기본)** | 사용자가 설정에 본인 API 키를 붙여넣음. 브라우저 localStorage 에만 저장, 업로드 안 함, 요청 시 제공업체로 직접 전달. | 호스팅 무료, 사용자가 제공업체에 지불 |
| **무료 등급** | Gemini, Qwen, GLM(`glm-4-flash`), ERNIE(`ernie-speed`)는 공식 무료 등급 보유, UI 에 🆓 표시. | 진짜 무료 |
| **운영자 키 / 릴레이** | Vercel 환경변수에 제공업체 키(또는 OpenAI 호환 릴레이 URL 하나)를 설정하면 해당 모델이 키 없이 방문자에게 동작. | 당신 또는 릴레이가 지불 |

**Gemini 가 "진짜 무료 ChatGPT 경험"에 가장 가깝습니다** — Google 이 무료 등급을 제공하기
때문입니다. 릴레이 방식은 "무료 ChatGPT"에 근접하지만 제공업체 ToS 위반 가능성이 있고
불안정 — 본인 책임으로.

## 기능

- **10개 제공업체, 1개 UI** — 거의 모두 OpenAI 호환 프로토콜. Claude 의 `/v1/messages`
  는 투명하게 변환되어 브라우저는 한 가지 형식만 다룹니다.
- **브랜드별 테마** — 모델 전환 시 라이트/다크 전체 테마가 바뀝니다.
- **토큰 단위 스트리밍**(SSE).
- **BYOK, 프라이빗** — 키는 브라우저에만 저장. 프록시는 한 번의 업스트림 호출에만 사용하며 기록·저장하지 않습니다.
- **4개 언어** — 中文 / English / 日本語 / 한국어, 자동 감지·전환 가능.
- **모델별 채팅 기록**을 로컬 보관.

## Vercel 배포 (서버 불필요)

1. **이 저장소를 GitHub 에 푸시**(`appleweiping/ai-mirror` 에 생성됨).
2. [vercel.com/new](https://vercel.com/new) 에서 저장소를 **Import**. Vercel 이
   `vercel.json` 자동 감지, 설정 변경 불필요, **Deploy** 클릭.
3. *(선택)* **Project → Settings → Environment Variables** 에서
   [`.env.example`](.env.example) 의 키를 추가하면 해당 모델이 키 없이 동작. 모두 선택 —
   아무것도 설정하지 않아도 순수 BYOK 모드로 동작합니다.

끝. 이후 `git push` 마다 자동 재배포. 자세한 가이드: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## 아키텍처

```
public/            정적 프론트엔드(프레임워크·빌드 없음)
  index.html       셸
  app.js           상태, SSE 스트리밍, 테마 전환
  styles.css       레이아웃·컴포넌트(CSS 변수 기반)
  themes.css       10개 브랜드 테마 × 라이트/다크
  i18n.js          중 / 영 / 일 / 한 문자열
api/               Vercel 엣지 함수
  _providers.js    제공업체 레지스트리 + 인증 해석(BYOK→env→릴레이)
  chat.js          스트리밍 프록시; OpenAI + Anthropic → 통합 SSE
  models.js        카탈로그 + 제공업체별 가용성
build.js           에셋 점검(정적, 컴파일 불필요)
vercel.json        framework=null, 엣지 런타임
```

**인증 해석**(요청마다, `_providers.js`): 사용자 BYOK 키 → 운영자 env 키 → 선택적 릴레이.
서버 키나 릴레이가 설정되면 "준비됨", 공식 무료 등급이 있으면 "무료", 그 외 "키 필요".

## 보안

- BYOK 키는 `localStorage` 에 저장되고 `X-User-Key` 헤더로만 엣지 함수에 전송되어 HTTPS 로
  제공업체에 전달됩니다. 기록·영속화하지 않습니다.
- 채팅 엔드포인트는 공개 프록시입니다. 운영자 키를 설정하면 **URL 을 찾은 누구나 소비할 수
  있습니다** — 공개 배포는 BYOK + 무료 등급을 권장하거나, 운영자 키 공개 전에 자체
  레이트 리밋/인증을 추가하세요.

## 라이선스

MIT — [LICENSE](LICENSE) 참조.
