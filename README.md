# Personal Mail Reminder

一个运行在 Cloudflare Workers 上的个人邮件提醒服务。它会按计划发送提醒邮件，未完成时自动追提醒；收件人回复邮件且正文第一行写 `1` 后，系统会把本次提醒标记完成，并发送完成确认。

当前项目使用：

- Cloudflare Workers 承载管理页面、管理 API、Cron 和入站邮件处理。
- Cloudflare D1 保存任务、提醒轮次和发信日志。
- Resend 负责发送提醒邮件和完成确认邮件。
- Cloudflare Email Routing 负责接收回信并投递给 Worker。

## 访问入口

线上管理台：

```text
https://reminder.yang-cc.cc.cd/
```

健康检查：

```text
https://reminder.yang-cc.cc.cd/health
```

管理台使用 `ADMIN_TOKEN` 登录。登录成功后，Worker 会设置 HttpOnly 会话 cookie。

## 工作方式

1. 在管理台或管理 API 创建提醒任务。
2. Cron 每分钟检查一次到期任务。
3. 到期后系统创建一条 `reminder_runs` 记录，并通过 Resend 发出提醒邮件。
4. 邮件主题包含 `[R:run_xxxxx]`，用于把回信关联到对应的提醒轮次。
5. 收件人直接回复该邮件，正文第一行只写 `1`。
6. Cloudflare Email Routing 将回信投递到 Worker 的 `email()` handler。
7. Worker 解析回信，标记本次提醒完成；一次性任务结束，重复任务计算下一次提醒时间。

重复任务支持两种锚点：

- `scheduled_time`：按原计划时间滚动，错过的时间段会自动跳过。
- `completion_time`：按实际完成时间往后计算下一次提醒。

## 本地开发

安装依赖：

```bash
npm install
```

复制本地变量文件：

```bash
cp .dev.vars.example .dev.vars
```

默认 `.dev.vars.example` 使用 `EMAIL_DELIVERY=log`，本地不会调用 Resend，只会把发信结果写入 `send_logs`，方便验证任务状态流转。

初始化本地 D1：

```bash
npm run d1:migrate:local
```

启动开发服务器：

```bash
npm run dev
```

常用检查：

```bash
npm test
npm run typecheck
npx wrangler deploy --dry-run
```

## 配置部署

### D1 数据库

创建远程 D1 数据库：

```bash
npm run d1:create
```

把输出的 `database_id` 写入 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "personal-reminder"
database_id = "你的 database_id"
```

应用远程 migration：

```bash
npm run d1:migrate:remote
```

### 域名和路由

Worker 自定义域名在 `wrangler.toml` 中配置：

```toml
routes = [
  { pattern = "reminder.yang-cc.cc.cd", custom_domain = true },
]
```

发信和回信地址也在 `wrangler.toml` 中配置：

```toml
[vars]
TIMEZONE = "Asia/Shanghai"
FROM_EMAIL = "个人提醒助手 <reminder@yang-cc.cc.cd>"
REPLY_EMAIL = "reminder@yang-cc.cc.cd"
```

可以用脚本批量更新邮件地址：

```bash
npm run config:email -- --domain yang-cc.cc.cd
```

只预览不写入文件：

```bash
npm run config:email -- --domain yang-cc.cc.cd --dry-run
```

### Secrets

远程 Worker 需要两个 secrets：

```bash
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put RESEND_API_KEY
```

`ADMIN_TOKEN` 用于管理台和管理 API 鉴权；`RESEND_API_KEY` 用于调用 Resend 发信。不要把 secret 写入 `wrangler.toml` 或源码。

### 邮件发送和回信接收

Resend 只负责发送邮件。需要在 Resend 中验证发信域名，并确保 `FROM_EMAIL` 使用已验证域名。

回信接收由 Cloudflare Email Routing 负责。需要启用域名的 Email Routing，并把 `REPLY_EMAIL` 路由到 Worker：

```bash
npx wrangler email routing enable yang-cc.cc.cd
npx wrangler email routing rules create yang-cc.cc.cd \
  --name "Route reminder replies to Worker" \
  --match-type literal \
  --match-field to \
  --match-value reminder@yang-cc.cc.cd \
  --action-type worker \
  --action-value personal-mail-reminder \
  --priority 0
```

查看当前 Email Routing 规则：

```bash
npx wrangler email routing rules list yang-cc.cc.cd
```

### 部署

部署 Worker、Cron 和自定义域名路由：

```bash
npm run deploy
```

部署前可以运行就绪检查：

```bash
npm run check:readiness
```

## 管理 API

管理 API 支持 Bearer token 鉴权：

```text
Authorization: Bearer <ADMIN_TOKEN>
```

### 手动触发到期检查

```bash
curl -X POST https://reminder.yang-cc.cc.cd/admin/process-due \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

返回示例：

```json
{
  "ok": true,
  "createdRuns": 1,
  "nagReminders": 0
}
```

### 创建一次性任务

```bash
curl -X POST https://reminder.yang-cc.cc.cd/admin/tasks \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "recipientEmail": "you@example.com",
    "title": "喝水",
    "body": "站起来活动一下，然后喝水。",
    "minutesFromNow": 15,
    "nagIntervalMinutes": 30
  }'
```

### 创建重复任务

```bash
curl -X POST https://reminder.yang-cc.cc.cd/admin/tasks \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "recipientEmail": "you@example.com",
    "title": "每日复盘",
    "body": "写下今天完成的 3 件事。",
    "dueAt": "2026-06-07 20:00",
    "nagIntervalMinutes": 60,
    "recurrence": {
      "type": "interval",
      "intervalMinutes": 1440,
      "anchor": "scheduled_time"
    }
  }'
```

`dueAt` 不带时区时按 `Asia/Shanghai` 解析；也可以传 ISO 时间并显式带上 `Z` 或时区偏移。

### 查看任务

```bash
curl "https://reminder.yang-cc.cc.cd/admin/tasks?status=all&limit=20" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

`status` 可选：`active`、`done`、`paused`、`cancelled`、`all`。

### 暂停、恢复、取消任务

```bash
curl -X POST https://reminder.yang-cc.cc.cd/admin/tasks/<task_id>/pause \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

curl -X POST https://reminder.yang-cc.cc.cd/admin/tasks/<task_id>/resume \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

curl -X POST https://reminder.yang-cc.cc.cd/admin/tasks/<task_id>/cancel \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

暂停或取消后，任务不会继续发送追提醒。

## 测试任务

可以用脚本生成测试 SQL，再写入远程 D1。

生成 2 分钟后到期的一次性任务：

```bash
npm --silent run seed:make -- --email you@example.com --minutes-from-now 2
```

生成每天重复任务：

```bash
npm --silent run seed:make -- --email you@example.com --repeat-minutes 1440 --title "每日测试提醒"
```

写入远程 D1：

```bash
npm --silent run seed:make -- --email you@example.com --minutes-from-now 2 > /tmp/reminder-seed.sql
npx wrangler d1 execute personal-reminder --remote --file=/tmp/reminder-seed.sql
```

## 运维查询

查看任务：

```bash
npx wrangler d1 execute personal-reminder --remote --command "SELECT id, status, next_due_at_utc, current_run_id FROM tasks ORDER BY next_due_at_utc ASC;"
```

查看提醒轮次：

```bash
npx wrangler d1 execute personal-reminder --remote --command "SELECT id, task_id, status, sent_count, next_nag_at_utc, completed_at_utc FROM reminder_runs ORDER BY created_at_utc DESC LIMIT 20;"
```

查看发信日志：

```bash
npx wrangler d1 execute personal-reminder --remote --command "SELECT type, recipient_email, subject, provider, success, error_message, created_at_utc FROM send_logs ORDER BY id DESC LIMIT 20;"
```

查看实时 Worker 日志：

```bash
npm run tail
```

## 项目结构

```text
src/index.ts              Worker 入口、Cron、管理 API、邮件回信处理
src/admin-page.ts         管理台 HTML、样式和前端脚本
migrations/0001_init.sql  D1 表结构
scripts/check-readiness.mjs
scripts/configure-email.mjs
scripts/make-seed.mjs
wrangler.toml             Worker、D1、Cron、自定义域名和变量配置
```

## 许可证

MIT。详见 [LICENSE](./LICENSE)。
