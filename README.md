# Mailbell 邮件铃

Mailbell 邮件铃是一个部署在 Cloudflare Workers 上的个人邮件提醒工具。它会按计划把提醒送到邮箱，在任务未完成时继续追提醒；收件人直接回复邮件并在正文第一行写 `1`，系统会自动把这次提醒标记为完成。

## 简介

这个项目适合给自己或小范围用户发送可回复的邮件提醒，例如喝水、复盘、定期检查事项、每日任务、定期续费和团队内轻量提醒等。它不是一个复杂的协作系统，更像一个放在邮箱里的小铃铛：到点来信，没完成就再敲一下，完成后回一封 `1` 即可。

核心能力：

- 通过网页界面创建、查看、编辑、暂停、恢复、取消和删除提醒。
- 支持相对时间和指定时间两种创建方式。
- 支持一次性提醒，以及按固定间隔重复提醒。
- 支持两种重复锚点：按计划时间滚动，或按实际完成时间重新计算。
- 支持未完成追提醒，可为每个任务单独设置追提醒间隔。
- 支持通过回复邮件完成提醒，正文第一行写 `1` 即可。
- 支持完成确认邮件，让收件人知道系统已经收到回复。
- 支持普通用户注册和登录；普通用户默认最多可创建 5 个任务。
- 支持 Linux.do OAuth 登录。
- 支持关闭注册、开启邀请码、批量生成邀请码和设置邀请码过期时间。
- 支持公告、用户管理、封禁/解封用户、删除用户及其数据。
- 支持最近 30 天发送日志，便于排查邮件投递和任务执行问题。
- 支持 Cron 运行 heartbeat，方便接入外部监控。
- 支持本地开发时只记录邮件日志，不实际发信。

技术组成：

- Cloudflare Workers：运行管理台、管理 API、定时任务和入站邮件处理。
- Cloudflare Queues：缓冲提醒邮件发送、批量消费、自动重试失败投递，并把最终失败消息送入 DLQ。
- Cloudflare D1：保存提醒任务、提醒轮次和发信记录。
- Resend：发送提醒邮件。
- Cloudflare Email Routing：接收回复邮件并投递给 Worker。

## 调度可靠性

提醒发送按“先生成投递作业，再由队列发信”的方式运行：

- Cron 每分钟扫描到期任务和到期追提醒；单次最多连续处理 6 批，每批 250 条，能覆盖约 1500 个同一分钟到期的任务。
- 每封提醒都有稳定的 `delivery_key`，重复入队或 Queue 至少一次投递不会造成同一轮提醒重复发送。
- 到期提醒先写入 `email_delivery_jobs`，再批量写入 Cloudflare Queues；队列消费端负责调用 Resend 发信。
- Queue consumer 每批最多处理 10 封，批等待时间 2 秒，失败最多重试 10 次，仍失败会进入死信队列。
- Cron 会巡检卡住的投递作业：`queued` 超过 5 分钟、`sending` 超过 2 分钟、`retrying` 超过 30 分钟会自动恢复为 `pending` 并重新入队。
- 每次发送尝试都会写入 `send_logs`；失败会记录 provider、错误信息、任务、提醒轮次和 `delivery_key`，管理员可在日志页筛选失败记录。
- Cron heartbeat 会带上本轮 `createdRuns`、`nagReminders`、`recoveredDeliveries`、`queuedDeliveries`、`cleanupDeletedRows` 和 `backlog`，方便接入外部监控。

Cloudflare Cron 本身是分钟级触发，因此这个项目的“按时”精度按分钟计算；队列和邮件服务短暂抖动时，系统会通过重试和恢复机制尽快补发。

## 界面预览

![](https://young-pic.cc.cd/img/2026/06/7750467f02ab480c8ec76532b2c54c98.jpg)

![](https://young-pic.cc.cd/img/2026/06/fdab11fecff3436a873835b98b000c98.jpg)

## 部署

### 1. 安装依赖

```bash
npm install
```

### 2. 创建 D1 数据库

```bash
npm run d1:create
```

`wrangler.toml` 只提交公开安全的 D1 绑定名和数据库名，不提交真实 `database_id`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "personal-reminder"
```

复制本地私有部署配置，并把 D1 创建命令输出的 `database_id` 写入 `wrangler.local.toml`。这个文件已被 git 忽略，不会进入公开仓库：

```bash
cp wrangler.local.toml.example wrangler.local.toml
```

应用数据库结构：

```bash
npm run d1:migrate:remote
```

如果是从旧版本升级，同样运行这条迁移命令；迁移会保留现有任务，并新增队列投递作业表。

### 2.1 创建邮件投递队列

提醒邮件通过 Cloudflare Queues 异步发送，需要创建主队列和死信队列：

```bash
npx wrangler queues create personal-mail-reminder-delivery
npx wrangler queues create personal-mail-reminder-delivery-dlq
```

`wrangler.toml` 和 `wrangler.local.toml.example` 已绑定：

- `REMINDER_QUEUE`：Cron 把到期提醒写入这个队列。
- `personal-mail-reminder-delivery` consumer：批量发信并自动重试，积压时由 Cloudflare 自动扩展 consumer 并发。
- `personal-mail-reminder-delivery-dlq` consumer：记录多次失败后的死信状态。

### 3. 配置 Worker 变量和域名

公开仓库不要提交真实域名、邮箱或 D1 id。当前 `wrangler.toml` 设置了 `keep_vars = true`，因此生产环境的 Worker Variables 可以在 Cloudflare Dashboard 中维护，并在 `wrangler deploy` 时保留。

在 Worker 的 Variables 中配置：

- `TIMEZONE`：例如 `Asia/Shanghai`。
- `FROM_EMAIL`：例如 `邮件铃 <reminder@your-domain.com>`。
- `REPLY_EMAIL`：例如 `reminder@your-domain.com`。
- `EMAIL_DELIVERY`：生产环境可设为 `resend`，本地开发默认是 `log`。
- `LINUXDO_CLIENT_ID`：Linux.do OAuth 应用的 client id。

在 Worker 的 Settings/Triggers 或 Custom Domains 中配置访问域名。仓库中的 `wrangler.toml` 不提交 `routes`，避免暴露个人域名。

本地开发可以用脚本快速写入被 git 忽略的 `.dev.vars`：

```bash
npm run config:email -- --domain your-domain.com
```

### 4. 配置 secrets

```bash
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put LINUXDO_CLIENT_SECRET
```

`ADMIN_TOKEN` 用于登录管理台；`RESEND_API_KEY` 用于调用 Resend 发信；`LINUXDO_CLIENT_SECRET` 用于 Linux.do OAuth。不要把它们写进源码或 `wrangler.toml`。

如果需要监控 Cron 是否持续运行，可以在 Healthchecks.io、UptimeRobot 或 Better Stack 创建一个 heartbeat/ping 监控，并把 ping URL 设置为 Worker secret：

```bash
npx wrangler secret put HEARTBEAT_URL
```

Cron 每次成功跑完后会主动请求这个 URL。建议外部监控设置为超过 5 到 10 分钟未收到 ping 就报警；如果 heartbeat 参数里 `backlog=1`，说明本轮扫描达到批处理上限，也建议告警。

### 5. 配置邮件服务

在 Resend 中验证发信域名，确保 `FROM_EMAIL` 使用已验证的域名。

在 Cloudflare Email Routing 中启用回信域名，并把 `REPLY_EMAIL` 路由到这个 Worker。示例：

```bash
npx wrangler email routing enable your-domain.com
npx wrangler email routing rules create your-domain.com \
  --name "Route reminder replies to Worker" \
  --match-type literal \
  --match-field to \
  --match-value reminder@your-domain.com \
  --action-type worker \
  --action-value personal-mail-reminder \
  --priority 0
```

### 6. 部署 Worker

```bash
npm run deploy
```

`npm run deploy` 使用本地私有的 `wrangler.local.toml`，因此可以绑定远程 D1，但不会把 `database_id` 提交到仓库。部署后访问你在 Cloudflare Dashboard 中绑定的 Worker 域名或自定义域名。

### 7. 发布版本

项目使用 `package.json` 的 patch 版本号管理发布。推送正式变更时使用：

```bash
npm run release:push
```

这个命令会依次执行：

- 自动递增 patch 版本号，并更新 `package-lock.json`。
- 创建 `chore: bump version to vX.Y.Z` 版本提交。
- 推送当前分支到 `origin`。
- 推送成功后运行 `npm run deploy` 部署 Worker。

安装依赖时会自动配置 Git hook。直接运行 `git push` 会被 `pre-push` 拦截，避免漏掉版本提交；确实需要绕过时可临时设置 `MAILBELL_ALLOW_DIRECT_PUSH=1`。

## 使用说明

打开页面后可以选择：

- 用户登录：使用已注册的邮箱和密码进入自己的提醒列表。
- 注册：普通用户可以直接用邮箱和密码注册，也可以使用 Linux.do OAuth 登录。注册后最多创建 5 个任务。
- 管理员：使用 `ADMIN_TOKEN` 进入管理台，可查看和管理全部任务、用户、注册开关、邀请码、公告和最近 30 天日志，并手动触发到期检查。

管理员可以在“设置”里关闭注册、开启一次性邀请码、批量生成邀请码、设置邀请码过期时间、维护公告。邀请码一人一码，使用后不能重复使用，过期后也不能使用。封禁用户后，该用户不能登录，现有提醒任务会全部失效；删除用户会清理该用户的任务、提醒轮次、发送记录和用户侧日志。

创建提醒时需要填写：

- 收件邮箱：接收提醒邮件的地址。
- 标题：邮件标题，也是任务名称。
- 正文：提醒邮件正文。
- 到期时间：可以选择“多久后”或指定具体时间。
- 追提醒间隔：任务未完成时，多久再次发送提醒。
- 重复提醒：可选。开启后会按固定间隔生成下一次提醒。

收到提醒邮件后，直接回复该邮件，正文第一行只写：

```text
1
```

系统会把本次提醒标记为完成，并发送完成确认邮件。

重复提醒有两种计算方式：

- 计划时间：按原定计划持续滚动，适合每天固定时间这类提醒。
- 完成时间：从实际回复完成的时间重新计算，适合完成后再间隔一段时间提醒。

## 开发

复制本地变量文件：

```bash
cp .dev.vars.example .dev.vars
```

本地默认使用 `EMAIL_DELIVERY=log`，不会调用 Resend 发信，只会记录发信结果。

初始化本地 D1：

```bash
npm run d1:migrate:local
```

启动本地开发服务：

```bash
npm run dev
```

常用命令：

```bash
npm test
npm run typecheck
npm run check:readiness
npm run tail
```

项目结构：

```text
src/index.ts              Worker 入口、管理 API、定时任务和回信处理
src/index.test.ts         Worker 逻辑和 OAuth 流程测试
client/src/App.tsx        React 前端界面
client/src/styles.css     前端样式
migrations/               D1 数据库迁移
scripts/                  配置、检查和测试数据脚本
wrangler.toml             公开安全的 Cloudflare Worker 配置
wrangler.local.toml       本地私有部署配置，不提交到仓库
```

## 友情支持

[Linuxdo社区](https://linux.do)

## 许可证

MIT。详见 [LICENSE](./LICENSE)。
