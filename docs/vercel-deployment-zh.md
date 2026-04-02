# Vercel 部署与 Google / AI 配置

## 1. 把项目发到 Vercel

1. 将代码推送到 GitHub（本仓库已可连接）。
2. 打开 [Vercel Dashboard](https://vercel.com/dashboard) → **Add New…** → **Project**，导入该仓库。
3. **Framework Preset** 选 Next.js；**Root Directory** 保持仓库根目录（除非你把前端放在子目录）。
4. **Build Command**：本仓库在 `vercel.json` 里已设为 **`npm run build:vercel`**（`prisma generate && next build`），避免在 Vercel 构建机上跑 `prisma migrate deploy`（Supabase **直连** `db.*.supabase.co:5432` 在 Vercel 上常因 **IPv4/IPv6** 无法连通）。**改表结构**后，在能连上生产库的环境执行：`npx prisma migrate deploy`。
5. 在 **Environment Variables** 中先填入下方「必配」变量（至少 `DATABASE_URL`、`NEXTAUTH_URL`、`NEXTAUTH_SECRET`），再点 **Deploy**。

### Supabase：线上 `DATABASE_URL` 建议用 Pooler

Vercel 上若仍用 **Direct** 主机 `db.xxx.supabase.co:5432`，运行时可能 **连不上库**（接口 500）。在 Supabase 点 **Connect**，复制 **Session pooler**（或标注 **IPv4** 的 Postgres URI），粘贴到 Vercel 的 `DATABASE_URL`（保留 `sslmode=require`；与 Prisma 的细节见 [Supabase Prisma 文档](https://supabase.com/docs/guides/database/prisma)）。本地可继续用直连。

部署成功后，把 **Production 域名**（例如 `https://xxx.vercel.app`）记下来，用于下面 Google OAuth 与 `NEXTAUTH_URL`。

---

## 2. Google 登录（OAuth）

1. [Google Cloud Console](https://console.cloud.google.com/) → 创建或选择项目 → **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**。
2. Application type 选 **Web application**。
3. **Authorized JavaScript origins** 添加：
   - `https://你的项目.vercel.app`（以及自定义域名，若有）
4. **Authorized redirect URIs** 添加（NextAuth 固定路径）：
   - `https://你的项目.vercel.app/api/auth/callback/google`
5. 复制 **Client ID** / **Client Secret**，在 Vercel → Project → **Settings** → **Environment Variables** 中新增：
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
6. 在 Vercel 中设置（或更新）：
   - `NEXTAUTH_URL` = `https://你的项目.vercel.app`（与浏览器访问地址一致，勿带尾部 `/`）
   - `NEXTAUTH_SECRET` = 本地可用 `openssl rand -base64 32` 生成，生产请单独设强随机值

重新部署一次使环境变量生效。

> 若未配置 Google 的 ID/Secret，应用仍可部署；此时仅 **邮箱密码登录** 可用，Google 按钮不会出现（由代码按环境变量自动处理）。

---

## 3. Oracle / AI 各厂商密钥（在 Vercel 中逐项添加）

面板与路由会读取 `src/lib/llm-providers.ts`。在 Vercel **Environment Variables** 中为你要启用的厂商填写对应 key（未填的厂商在 UI 里会显示为未配置，无法选用）。

| 面板名称 | 环境变量 |
|----------|----------|
| Anthropic (Claude) | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Google AI (Gemini) | `GOOGLE_AI_API_KEY`（在 [Google AI Studio](https://aistudio.google.com/apikey) 创建，与 OAuth 客户端无关） |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_BASE_URL` + 可选 `AZURE_OPENAI_API_VERSION` |
| Groq | `GROQ_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| xAI (Grok) | `XAI_API_KEY` |
| Together AI | `TOGETHER_API_KEY` |
| Fireworks | `FIREWORKS_API_KEY` |

可选：

- `ORACLE_DEFAULT_PROVIDER`：定时任务/自动裁决未指定厂商时的默认 `id`（如 `anthropic`），见 `.env.example`。

---

## 4. 定时任务（Cron）

`vercel.json` 已配置在 **UTC 每天 08:00** 请求一次 `/api/cron/challenge-judgment`（适配 Vercel **Hobby** 计划：免费档 Cron 每天最多一次）。若升级到 **Pro**，可把 `schedule` 改为更频繁（例如 `*/5 * * * *`）。

在 Vercel 设置：

- `CRON_SECRET`：随机字符串；Vercel Cron 会以 `Authorization: Bearer <CRON_SECRET>` 调用该路由。

若未设置 `CRON_SECRET`，该接口会返回 503（避免未授权调用）。

---

## 5. 其他可选环境变量

链上、S3 直传、证据域名白名单等见仓库根目录 **`.env.example`** 与 **`docs/oracle-instructions.md`**。

---

## 6. 部署后自检

- 打开生产 URL，用邮箱注册/登录或 Google 登录。
- 在 Oracle 设置里切换已配置 key 的厂商，发起一次裁决测试。
- 若使用 Cron，在 Vercel **Cron Jobs** 中确认任务存在，并查看该次调用的日志是否 200。
