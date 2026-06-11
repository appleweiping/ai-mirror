<div align="center">

# ✦ AI Mirror

**誰でも使える無料マルチモデル AI チャット — 中国本土のユーザーにも。**

ChatGPT · Gemini · Claude · DeepSeek · Qwen · GLM · Kimi · MiniMax · Doubao · ERNIE
— すべてを 1 つの Web アプリに、各モデルにそのブランド専用の美学。

[English](README.md) · [中文](README.zh.md) · 🌐 **日本語** · [한국어](README.ko.md)

[![Vercel でデプロイ](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/appleweiping/ai-mirror)

</div>

---

## これは何か

10 以上の最先端モデルと誰でもチャットでき、瞬時に切り替えられるシンプルな Web UI。
モデルを選ぶと**インターフェース全体がそのブランドの実際のビジュアル言語に変わります** —
OpenAI のグリーン、Gemini の青→紫オーロラ、Claude の暖かいクレイ、DeepSeek の深いブルーなど。

**完全に Vercel 上で動作**（静的フロントエンド + エッジ関数）。**別途サーバー不要** —
最も信頼性の高いデプロイ方法であり、他にホスト・保守するものがありません。

## 「無料」の仕組み（必読）

真に無料の *ChatGPT API* は存在しません — OpenAI は無料枠を廃止し、すべての呼び出しに
費用がかかります。そこで AI Mirror は 3 つの正直な選択肢を、プロバイダごとに混在可能で提供します：

| 方式 | 意味 | コスト |
|------|------|--------|
| **BYOK（既定）** | ユーザーが設定に自分の API キーを貼り付け。ブラウザの localStorage のみに保存、アップロードせず、リクエスト時にプロバイダへ直接転送。 | ホスト無料、ユーザーがプロバイダに支払い |
| **無料枠** | Gemini、Qwen、GLM（`glm-4-flash`）、ERNIE（`ernie-speed`）には公式の無料枠があり、UI で 🆓 表示。 | 本当に無料 |
| **運営者キー / リレー** | Vercel 環境変数にプロバイダキー（または 1 つの OpenAI 互換リレー URL）を設定すると、それらのモデルはキー不要で訪問者に動作。 | あなた、またはリレーが支払い |

**Gemini が「真の無料 ChatGPT 体験」に最も近い**です。Google が無料枠を提供しているため。
リレー方式は「無料 ChatGPT」に近づけますが、プロバイダの ToS 違反の可能性があり不安定 — 自己責任で。

## 機能

- **10 プロバイダ、1 UI** — ほぼすべてが OpenAI 互換プロトコル。Claude の `/v1/messages`
  は透過的に変換され、ブラウザは 1 つの形式だけを扱います。
- **ブランド別テーマ** — モデル切替でライト/ダークの全テーマが切り替わります。
- **トークン単位のストリーミング**（SSE）。
- **BYOK、プライベート** — キーはブラウザのみに保存。プロキシは 1 回の上流呼び出しに使うだけで、記録も保存もしません。
- **4 言語** — 中文 / English / 日本語 / 한국어、自動検出・切替可能。
- **モデルごとのチャット履歴**をローカル保持。

## Vercel へデプロイ（サーバー不要）

1. **このリポジトリを GitHub にプッシュ**（`appleweiping/ai-mirror` に作成済み）。
2. [vercel.com/new](https://vercel.com/new) でリポジトリを **Import**。Vercel が
   `vercel.json` を自動検出、設定変更不要、**Deploy** をクリック。
3. *（任意）* **Project → Settings → Environment Variables** で
   [`.env.example`](.env.example) のキーを追加すると、対応モデルがキー不要で動作。すべて任意 —
   何も設定しなくても純粋な BYOK モードで動きます。

以上。以降は `git push` ごとに自動再デプロイ。詳細は [`docs/DEPLOY.md`](docs/DEPLOY.md)。

## アーキテクチャ

```
public/            静的フロントエンド（フレームワーク・ビルド不要）
  index.html       シェル
  app.js           状態、SSE ストリーミング、テーマ切替
  styles.css       レイアウト・コンポーネント（CSS 変数駆動）
  themes.css       10 ブランドテーマ × ライト/ダーク
  i18n.js          中 / 英 / 日 / 韓 文字列
api/               Vercel エッジ関数
  _providers.js    プロバイダ登録 + 認証解決（BYOK→env→リレー）
  chat.js          ストリーミングプロキシ；OpenAI + Anthropic → 統一 SSE
  models.js        カタログ + プロバイダ別の利用可否
build.js           アセット検査（静的、コンパイル不要）
vercel.json        framework=null、エッジランタイム
```

**認証解決**（リクエストごと、`_providers.js`）：ユーザーの BYOK キー → 運営者の env キー →
任意のリレー。サーバーキーかリレーが設定済みなら「準備完了」、公式無料枠があれば「無料」、それ以外は「キー必要」。

## セキュリティ

- BYOK キーは `localStorage` に保存され、`X-User-Key` ヘッダーでのみエッジ関数に送られ、
  HTTPS でプロバイダへ転送されます。記録も永続化もしません。
- チャットエンドポイントは公開プロキシです。運営者キーを設定すると、**URL を見つけた誰もが
  それを消費できます** — 公開デプロイは BYOK + 無料枠を推奨、または運営者キー公開前に
  独自のレート制限/認証を追加してください。

## ライセンス

MIT — [LICENSE](LICENSE) を参照。
