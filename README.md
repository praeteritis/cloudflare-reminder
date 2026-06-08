# Personal Mail Reminder

Personal Mail Reminder 是一个部署在 Cloudflare Workers 上的个人邮件提醒工具。它会按计划发送提醒邮件，在任务未完成时继续追提醒；当收件人直接回复邮件并在正文第一行写 `1`，系统会自动把这次提醒标记为完成。

## 简介

这个项目适合用来给自己或小范围用户发送可回复的邮件提醒，例如喝水、复盘、定期检查事项、每日任务等。

核心能力：

- 通过网页管理台创建、查看、暂停、恢复和取消提醒。
- 支持普通用户注册和登录；普通用户最多可创建 5 个任务。
- 支持 Linux.do OAuth 登录、注册开关、邀请码、公告、用户管理和最近 30 天日志。
- 支持一次性提醒和按间隔重复提醒。
- 支持未完成追提醒。
- 支持通过回复邮件完成提醒。
- 支持完成后发送确认邮件。

技术组成：

- Cloudflare Workers：运行管理台、管理 API、定时任务和入站邮件处理。
- Cloudflare D1：保存提醒任务、提醒轮次和发信记录。
- Resend：发送提醒邮件。
- Cloudflare Email Routing：接收回复邮件并投递给 Worker。

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

如果是从旧版本升级，同样运行这条迁移命令；`0002_users.sql` 会新增用户表和任务归属字段。

### 3. 配置 Worker 变量和域名

公开仓库不要提交真实域名、邮箱或 D1 id。当前 `wrangler.toml` 设置了 `keep_vars = true`，因此生产环境的 Worker Variables 可以在 Cloudflare Dashboard 中维护，并在 `wrangler deploy` 时保留。

在 Worker 的 Variables 中配置：

- `TIMEZONE`：例如 `Asia/Shanghai`。
- `FROM_EMAIL`：例如 `个人提醒助手 <reminder@your-domain.com>`。
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

Cron 每次成功跑完后会主动请求这个 URL。建议外部监控设置为超过 5 到 10 分钟未收到 ping 就报警。

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

## 使用说明

打开页面后可以选择：

- 用户登录：使用已注册的邮箱和密码进入自己的提醒列表。
- 注册：普通用户可以直接用邮箱和密码注册，或使用 Linux.do OAuth 登录。注册后最多创建 5 个任务。
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
src/index.ts              Worker 入口、定时任务、管理 API、回信处理
src/admin-page.ts         管理台页面
migrations/0001_init.sql  D1 数据库结构
scripts/                  配置、检查和测试数据脚本
wrangler.toml             Cloudflare Worker 配置
```

## 许可证

MIT。详见 [LICENSE](./LICENSE)。
