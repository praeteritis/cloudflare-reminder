# Personal Mail Reminder

Personal Mail Reminder 是一个部署在 Cloudflare Workers 上的个人邮件提醒工具。它会按计划发送提醒邮件，在任务未完成时继续追提醒；当收件人直接回复邮件并在正文第一行写 `1`，系统会自动把这次提醒标记为完成。

## 简介

这个项目适合用来给自己或小范围用户发送可回复的邮件提醒，例如喝水、复盘、定期检查事项、每日任务等。

核心能力：

- 通过网页管理台创建、查看、暂停、恢复和取消提醒。
- 支持一次性提醒和按间隔重复提醒。
- 支持未完成追提醒。
- 支持通过回复邮件完成提醒。
- 支持完成后发送确认邮件。

技术组成：

- Cloudflare Workers：运行管理台、管理 API、定时任务和入站邮件处理。
- Cloudflare D1：保存提醒任务、提醒轮次和发信记录。
- Resend：发送提醒邮件。
- Cloudflare Email Routing：接收回复邮件并投递给 Worker。

## 部署

### 1. 安装依赖

```bash
npm install
```

### 2. 创建 D1 数据库

```bash
npm run d1:create
```

把命令输出的 `database_id` 写入 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "personal-reminder"
database_id = "你的 database_id"
```

应用数据库结构：

```bash
npm run d1:migrate:remote
```

### 3. 配置域名和邮件地址

在 `wrangler.toml` 中配置管理台域名、发信地址和回信地址：

```toml
routes = [
  { pattern = "reminder.your-domain.com", custom_domain = true },
]

[vars]
TIMEZONE = "Asia/Shanghai"
FROM_EMAIL = "个人提醒助手 <reminder@your-domain.com>"
REPLY_EMAIL = "reminder@your-domain.com"
```

也可以用脚本快速设置邮件地址：

```bash
npm run config:email -- --domain your-domain.com
```

### 4. 配置 secrets

```bash
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put RESEND_API_KEY
```

`ADMIN_TOKEN` 用于登录管理台；`RESEND_API_KEY` 用于调用 Resend 发信。不要把它们写进源码或 `wrangler.toml`。

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

当前项目示例线上地址：

```text
https://reminder.yang-cc.cc.cd/
```

## 使用说明

打开管理台后，使用 `ADMIN_TOKEN` 登录。

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

