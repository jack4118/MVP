# 最简上线指南（Cloudflare FE + Render BE/DB）

目标架构：
- 前端：Cloudflare Pages（不是 Browser Rendering）
- 后端：Render Web Service
- 数据库：Render PostgreSQL

预计时间：15-25 分钟

## 0. 先准备

你需要有：
- GitHub 账号（代码已在仓库）
- Render 账号
- Cloudflare 账号

## 1. 先部署后端和数据库（Render）

1. 打开 Render：`New +` -> `Blueprint`
2. 选择你的 GitHub 仓库：`jack4118/MVP`
3. Render 会读取 `render.yaml`，自动创建：
- `mvp-postgres`（数据库）
- `mvp-backend`（后端服务）
4. 等待构建完成后，进入 `mvp-backend` -> `Environment`，补这几个变量：
- `FRONTEND_URL`：先临时填 `https://example.com`（后面改成真实前端地址）
- `OPENAI_API_KEY`：你的 OpenAI Key
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`：你自定义一串随机字符（如 `my_whatsapp_verify_2026`）

5. 保存并等待自动重启完成。

## 2. 部署前端（Cloudflare Pages）

注意：你截图里进的是 **Browser Rendering**，这个不是部署网页用的。
正确入口是：`Workers & Pages` -> `Create` -> `Pages` -> `Connect to Git`

按下面填：
- Repository：`jack4118/MVP`
- Framework preset：`Vite`
- Root directory：`frontend`
- Build command：`npm run build`
- Build output directory：`dist`

环境变量（非常重要）：
- `VITE_API_URL` = 你的 Render 后端地址  
  例：`https://mvp-backend-xxxx.onrender.com`

点击 Deploy。

## 3. 回填后端 CORS（Render）

Cloudflare 部署好后，你会拿到：
- `https://xxxx.pages.dev`

回到 Render 的 `mvp-backend` -> `Environment`：
- 把 `FRONTEND_URL` 改成上面的 `https://xxxx.pages.dev`

保存，等待后端重启。

## 4. 验证是否上线成功

1. 打开后端健康检查：
- `https://你的-backend.onrender.com/health`
- 看到成功 JSON 就对了

2. 打开前端：
- `https://你的-pages.pages.dev`
- 能注册/登录
- 打开浏览器 Network，API 请求应打到 Render 域名，不是 localhost

## 5. 常见报错（直接对照）

- 前端报 CORS：
  - 90% 是 `FRONTEND_URL` 没填对，必须完整带 `https://`

- 前端请求 localhost:
  - `VITE_API_URL` 没设或设错，去 Cloudflare Pages 项目里改环境变量并重新部署

- Render 启动失败（数据库）：
  - 等数据库先创建完成，再重试后端部署

- AI 不工作：
  - 检查 `OPENAI_API_KEY` 是否有效
  - 如果 key 泄露过，先去 OpenAI 旋转新 key

## 6. 你只要记住这 3 个地址

- 前端地址（Cloudflare）：`https://xxxx.pages.dev`
- 后端地址（Render）：`https://xxxx.onrender.com`
- 后端健康检查：`https://xxxx.onrender.com/health`

