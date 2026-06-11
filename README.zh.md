<div align="center">

# ✦ AI Mirror

**人人可用的免费多模型 AI 聊天 —— 国内用户也能直接用。**

ChatGPT · Gemini · Claude · DeepSeek · 通义千问 · 智谱GLM · Kimi · MiniMax · 豆包 · 文心
—— 全部集成在一个网页里，每个模型配它专属的品牌美学。

[English](README.md) · 🌐 **中文** · [日本語](README.ja.md) · [한국어](README.ko.md)

[![用 Vercel 部署](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/appleweiping/ai-mirror)

</div>

---

## 这是什么

一个干净的网页界面，让任何人都能和 10+ 主流大模型聊天，并随时一键切换。选中某个模型，
**整个界面会换上该品牌真实的视觉语言** —— OpenAI 的绿、Gemini 的蓝紫极光、Claude 的暖陶土、
DeepSeek 的深海蓝，等等。

它**完全跑在 Vercel 上**（静态前端 + 边缘函数），**不需要任何额外服务器** —— 这让它成为
最稳的部署方式，也意味着没有别的东西需要托管或维护。

## "免费"到底怎么实现（务必读）

世界上没有真正免费的 *ChatGPT API* —— OpenAI 取消了免费层，每次调用都要花钱。所以
AI Mirror 给你三条诚实的路，可按模型混用：

| 方式 | 含义 | 成本 |
|------|------|------|
| **自带 Key（默认）** | 用户在设置里填自己的 API Key，只存在浏览器本地，绝不上传，仅在请求时直接转发给服务商。 | 托管零成本，用户付费给服务商 |
| **官方免费层** | Gemini、通义千问、智谱（`glm-4-flash`）、文心（`ernie-speed`）有真正的官方免费额度，界面里标 🆓。 | 真免费 |
| **运营方 Key / 中转** | 你在 Vercel 环境变量里配置服务商 Key（或一个 OpenAI 兼容的中转地址），这些模型就对所有访客免填 Key 可用。 | 你付费，或中转付费 |

**Gemini 最接近"真正免费的 ChatGPT 体验"**，因为 Google 仍提供免费层。中转方式能逼近
"免费 ChatGPT"，但可能违反服务商条款且不稳定 —— 风险自负。

## 功能

- **10 个模型，一个界面** —— 几乎全部走 OpenAI 兼容协议；Claude 的 `/v1/messages`
  被透明转换，浏览器只需处理一种格式。
- **品牌专属皮肤** —— 切换模型即切换整套明/暗主题。
- **逐字流式输出**（SSE）。
- **自带 Key，隐私安全** —— Key 只存在你浏览器里；代理只用它发起一次上游调用，绝不记录或存储。
- **四种语言** —— 中文 / English / 日本語 / 한국어，自动识别，可切换。
- **每个模型独立的本地聊天记录**。

## 部署到 Vercel（无需服务器）

1. **把本仓库推到 GitHub**（已在 `appleweiping/ai-mirror`）。
2. 打开 [vercel.com/new](https://vercel.com/new)，**Import** 该仓库。Vercel 自动识别
   `vercel.json`，无需任何设置，点 **Deploy**。
3. *（可选）* 在 **Project → Settings → Environment Variables** 里，按
   [`.env.example`](.env.example) 添加 Key，让对应模型对访客免填 Key 可用。全部可选 —— 一个都
   不填也能跑（纯自带 Key 模式）。

完成。之后每次 `git push` 自动重新部署。完整指南见 [`docs/DEPLOY.md`](docs/DEPLOY.md)。

## 架构

```
public/            静态前端（无框架、无打包）
  index.html       页面骨架
  app.js           状态、SSE 流式客户端、主题切换
  styles.css       布局与组件（CSS 变量驱动）
  themes.css       10 套品牌主题 × 明/暗
  i18n.js          中 / 英 / 日 / 韩 文案
api/               Vercel 边缘函数
  _providers.js    模型注册表 + 鉴权解析（自带Key→环境变量→中转）
  chat.js          流式代理；OpenAI + Anthropic 协议 → 统一 SSE
  models.js        模型目录 + 各模型可用性（供前端显示徽章）
build.js           资源完整性检查（静态，无需编译）
vercel.json        framework=null，边缘运行时
```

**鉴权解析顺序**（每次请求，在 `_providers.js`）：用户自带 Key → 运营方环境变量 Key →
可选中转。配置了服务端 Key 或中转的模型显示"已就绪"，有官方免费层的显示"免费"，否则"需自带Key"。

## 安全说明

- 自带 Key 存在 `localStorage`，仅通过 `X-User-Key` 请求头发给边缘函数，由它经 HTTPS
  转发给服务商，绝不记录或留存。
- 聊天接口本质是公开代理。如果你配置了运营方 Key，**任何拿到你网址的人都能消耗这些额度** ——
  公开部署建议优先用「自带 Key + 免费层」，或在暴露运营方 Key 前自行加限流/鉴权。

## 许可证

MIT —— 见 [LICENSE](LICENSE)。
