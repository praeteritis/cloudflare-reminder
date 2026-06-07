export const LOGIN_PAGE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>邮件提醒登录</title>
  <style>
    :root {
      color-scheme: light;
      --paper: #f7f8fb;
      --surface: #ffffff;
      --ink: #1c222b;
      --muted: #667085;
      --line: #d9dee8;
      --line-strong: #bac4d3;
      --teal: #0f766e;
      --teal-soft: #d8f3ee;
      --red: #b42318;
      --shadow: 0 18px 48px rgba(29, 41, 57, 0.11);
    }

    * {
      box-sizing: border-box;
    }

    html {
      min-width: 320px;
      min-height: 100%;
      background:
        linear-gradient(135deg, rgba(15, 118, 110, 0.12), transparent 36%),
        linear-gradient(180deg, #ffffff 0%, var(--paper) 48%, #eef2f7 100%);
    }

    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 22px;
      color: var(--ink);
      font-family: ui-serif, Georgia, "Times New Roman", "Noto Serif SC", serif;
      line-height: 1.45;
    }

    button,
    input {
      font: inherit;
    }

    .login {
      width: min(440px, 100%);
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .head {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 20px 20px 16px;
      border-bottom: 1px solid var(--line);
    }

    .mark {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border: 1px solid var(--ink);
      border-radius: 8px;
      background: var(--teal-soft);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 19px;
      font-weight: 800;
    }

    h1 {
      margin: 0;
      font-size: 24px;
      line-height: 1.08;
      letter-spacing: 0;
    }

    .sub {
      margin-top: 3px;
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }

    form {
      display: grid;
      gap: 14px;
      padding: 18px 20px 20px;
    }

    label {
      display: grid;
      gap: 7px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 650;
    }

    input {
      width: 100%;
      min-height: 42px;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: #fff;
      color: var(--ink);
      padding: 9px 10px;
      outline: none;
    }

    input:focus {
      border-color: var(--teal);
      box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.13);
    }

    .remember {
      min-height: 28px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--ink);
      font-size: 14px;
      font-weight: 750;
    }

    .remember input {
      width: 18px;
      min-height: 18px;
      accent-color: var(--teal);
    }

    button {
      min-height: 42px;
      border: 1px solid var(--teal);
      border-radius: 7px;
      background: var(--teal);
      color: #fff;
      cursor: pointer;
      font-weight: 800;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.62;
    }

    .notice {
      min-height: 42px;
      display: none;
      align-items: center;
      padding: 10px 12px;
      border: 1px solid rgba(180, 35, 24, 0.24);
      border-radius: 8px;
      background: #fff1f0;
      color: var(--red);
      font-size: 14px;
      font-weight: 700;
    }

    .notice.show {
      display: flex;
    }
  </style>
</head>
<body>
  <section class="login">
    <div class="head">
      <div class="mark">R</div>
      <div>
        <h1>管理员入口</h1>
        <div class="sub">personal-mail-reminder</div>
      </div>
    </div>

    <form id="login-form">
      <div id="login-notice" class="notice" role="status"></div>
      <label>
        Admin Token
        <input id="admin-token" type="password" autocomplete="current-password" autofocus required>
      </label>
      <label class="remember">
        <input id="remember-login" type="checkbox">
        记住登录
      </label>
      <button id="login-button" type="submit">进入管理台</button>
    </form>
  </section>

  <script>
    (function () {
      var form = document.getElementById('login-form');
      var input = document.getElementById('admin-token');
      var remember = document.getElementById('remember-login');
      var button = document.getElementById('login-button');
      var notice = document.getElementById('login-notice');

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        notice.className = 'notice';
        button.disabled = true;

        fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: input.value.trim(),
            remember: remember.checked
          })
        })
          .then(function (response) {
            return response.json().catch(function () {
              return {};
            }).then(function (payload) {
              if (!response.ok || payload.ok === false) {
                throw new Error(payload.error || '登录失败');
              }
              window.location.reload();
            });
          })
          .catch(function (error) {
            notice.textContent = error.message || String(error);
            notice.className = 'notice show';
            button.disabled = false;
          });
      });
    })();
  </script>
</body>
</html>`;

export const ADMIN_PAGE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>邮件提醒管理台</title>
  <style>
    :root {
      color-scheme: light;
      --paper: #f7f8fb;
      --surface: #ffffff;
      --ink: #1c222b;
      --muted: #667085;
      --line: #d9dee8;
      --line-strong: #bac4d3;
      --teal: #0f766e;
      --teal-soft: #d8f3ee;
      --blue: #2563eb;
      --amber: #b45309;
      --red: #b42318;
      --green: #15803d;
      --shadow: 0 16px 40px rgba(29, 41, 57, 0.08);
    }

    * {
      box-sizing: border-box;
    }

    html {
      min-width: 320px;
      background:
        linear-gradient(135deg, rgba(15, 118, 110, 0.08), transparent 34%),
        linear-gradient(180deg, #ffffff 0%, var(--paper) 42%, #eef2f7 100%);
    }

    body {
      margin: 0;
      color: var(--ink);
      font-family: ui-serif, Georgia, "Times New Roman", "Noto Serif SC", serif;
      line-height: 1.45;
    }

    button,
    input,
    textarea,
    select {
      font: inherit;
    }

    button {
      min-height: 38px;
      border: 1px solid var(--line-strong);
      border-radius: 7px;
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      transition: transform 0.12s ease, border-color 0.12s ease, background 0.12s ease;
    }

    button:hover {
      border-color: var(--ink);
      transform: translateY(-1px);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.58;
      transform: none;
    }

    label {
      display: grid;
      gap: 7px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 650;
    }

    input,
    textarea,
    select {
      width: 100%;
      min-height: 40px;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: #fff;
      color: var(--ink);
      padding: 9px 10px;
      outline: none;
    }

    textarea {
      min-height: 104px;
      resize: vertical;
    }

    input:focus,
    textarea:focus,
    select:focus {
      border-color: var(--teal);
      box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.13);
    }

    .app {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: grid;
      grid-template-columns: minmax(180px, 1fr) minmax(240px, 560px);
      gap: 18px;
      align-items: center;
      padding: 14px clamp(16px, 3vw, 34px);
      border-bottom: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.86);
      backdrop-filter: blur(16px);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .mark {
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      border: 1px solid var(--ink);
      border-radius: 8px;
      background: var(--teal-soft);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 18px;
      font-weight: 800;
    }

    h1 {
      margin: 0;
      font-size: clamp(20px, 2vw, 28px);
      line-height: 1.05;
      letter-spacing: 0;
    }

    .status-line {
      margin-top: 3px;
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }

    .tokenbar {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 8px;
      align-items: end;
    }

    .account-status {
      min-height: 40px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }

    .remember {
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      font-size: 13px;
      white-space: nowrap;
    }

    .remember input {
      width: 16px;
      min-height: 16px;
      accent-color: var(--teal);
    }

    .github-link {
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      border: 1px solid var(--line-strong);
      border-radius: 7px;
      background: var(--surface);
      color: var(--ink);
      text-decoration: none;
      transition: transform 0.12s ease, border-color 0.12s ease, background 0.12s ease;
    }

    .github-link:hover {
      border-color: var(--ink);
      transform: translateY(-1px);
    }

    .github-link:focus-visible {
      outline: none;
      border-color: var(--teal);
      box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.13);
    }

    .github-link svg {
      width: 18px;
      height: 18px;
      display: block;
      fill: currentColor;
    }

    .main {
      display: grid;
      grid-template-columns: minmax(320px, 430px) minmax(0, 1fr);
      gap: 18px;
      width: min(1480px, 100%);
      margin: 0 auto;
      padding: 18px clamp(14px, 3vw, 34px) 34px;
    }

    .stack {
      display: grid;
      align-content: start;
      gap: 18px;
      min-width: 0;
    }

    .panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.9);
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 16px 13px;
      border-bottom: 1px solid var(--line);
    }

    .panel-title {
      margin: 0;
      font-size: 18px;
      line-height: 1.2;
      letter-spacing: 0;
    }

    .form {
      display: grid;
      gap: 14px;
      padding: 16px;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .duration {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 108px;
      gap: 8px;
    }

    .segmented {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 4px;
      padding: 4px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #eef2f7;
    }

    .segmented button {
      min-height: 34px;
      border-color: transparent;
      background: transparent;
      box-shadow: none;
    }

    .segmented button[aria-pressed="true"] {
      background: #fff;
      border-color: var(--line-strong);
      color: var(--teal);
      font-weight: 800;
    }

    .checkline {
      min-height: 40px;
      display: flex;
      align-items: center;
      gap: 9px;
      color: var(--ink);
      font-size: 14px;
      font-weight: 750;
    }

    .checkline input {
      width: 18px;
      min-height: 18px;
      accent-color: var(--teal);
    }

    .actions {
      display: flex;
      gap: 9px;
      align-items: center;
      flex-wrap: wrap;
    }

    .guide {
      display: grid;
      gap: 14px;
      padding: 16px;
    }

    .guide-list {
      display: grid;
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .guide-list li {
      display: grid;
      grid-template-columns: 28px minmax(0, 1fr);
      gap: 10px;
      align-items: start;
    }

    .guide-index {
      width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(15, 118, 110, 0.35);
      border-radius: 7px;
      background: var(--teal-soft);
      color: var(--teal);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
      font-weight: 800;
    }

    .guide-title {
      margin: 0 0 3px;
      font-size: 14px;
      font-weight: 850;
      color: var(--ink);
      line-height: 1.25;
    }

    .guide-text {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      overflow-wrap: anywhere;
    }

    .guide-note {
      margin: 0;
      padding: 11px 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #f8fafc;
      color: var(--muted);
      font-size: 13px;
    }

    .reply-code {
      display: inline-grid;
      place-items: center;
      min-width: 24px;
      min-height: 22px;
      padding: 0 6px;
      border: 1px solid var(--line-strong);
      border-radius: 6px;
      background: #fff;
      color: var(--ink);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      font-weight: 800;
    }

    .primary {
      border-color: var(--teal);
      background: var(--teal);
      color: #fff;
      font-weight: 800;
      padding: 0 14px;
    }

    .quiet {
      padding: 0 12px;
      color: var(--muted);
    }

    .danger {
      border-color: rgba(180, 35, 24, 0.45);
      color: var(--red);
    }

    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.72);
    }

    .filters {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .filter {
      min-height: 32px;
      padding: 0 10px;
      color: var(--muted);
    }

    .filter[aria-pressed="true"] {
      border-color: var(--teal);
      background: var(--teal-soft);
      color: var(--teal);
      font-weight: 800;
    }

    .tasks {
      display: grid;
      gap: 10px;
      padding: 14px;
    }

    .task {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      border: 1px solid var(--line);
      border-left: 5px solid var(--line-strong);
      border-radius: 8px;
      background: #fff;
      padding: 13px;
    }

    .task.active {
      border-left-color: var(--teal);
    }

    .task.paused {
      border-left-color: var(--amber);
    }

    .task.done {
      border-left-color: var(--green);
    }

    .task.cancelled {
      border-left-color: var(--red);
    }

    .task h3 {
      margin: 0 0 6px;
      font-size: 17px;
      line-height: 1.2;
      letter-spacing: 0;
      overflow-wrap: anywhere;
    }

    .task-body {
      margin: 0 0 10px;
      color: var(--muted);
      font-size: 14px;
      overflow-wrap: anywhere;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 2px 8px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #f8fafc;
      white-space: nowrap;
    }

    .pill.status-active {
      border-color: rgba(15, 118, 110, 0.35);
      color: var(--teal);
      background: var(--teal-soft);
    }

    .pill.status-paused {
      border-color: rgba(180, 83, 9, 0.35);
      color: var(--amber);
      background: #fff7ed;
    }

    .pill.status-done {
      border-color: rgba(21, 128, 61, 0.35);
      color: var(--green);
      background: #ecfdf3;
    }

    .pill.status-cancelled {
      border-color: rgba(180, 35, 24, 0.35);
      color: var(--red);
      background: #fff1f0;
    }

    .task-actions {
      display: flex;
      gap: 8px;
      align-items: start;
      justify-content: end;
      flex-wrap: wrap;
      min-width: 188px;
    }

    .notice {
      min-height: 42px;
      display: none;
      align-items: center;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 700;
    }

    .notice.show {
      display: flex;
    }

    .notice.ok {
      color: var(--green);
      background: #ecfdf3;
      border: 1px solid rgba(21, 128, 61, 0.24);
    }

    .notice.error {
      color: var(--red);
      background: #fff1f0;
      border: 1px solid rgba(180, 35, 24, 0.24);
    }

    .empty {
      min-height: 180px;
      display: grid;
      place-items: center;
      border: 1px dashed var(--line-strong);
      border-radius: 8px;
      color: var(--muted);
      background: rgba(255, 255, 255, 0.5);
      text-align: center;
      padding: 20px;
    }

    .hidden {
      display: none !important;
    }

    @media (max-width: 980px) {
      .topbar,
      .main {
        grid-template-columns: 1fr;
      }

      .tokenbar {
        grid-template-columns: 1fr auto auto;
      }

      .remember {
        grid-column: 1 / -1;
      }
    }

    @media (max-width: 680px) {
      .grid-2,
      .task {
        grid-template-columns: 1fr;
      }

      .task-actions {
        justify-content: start;
        min-width: 0;
      }

      .toolbar {
        align-items: stretch;
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <div class="mark">R</div>
        <div>
          <h1>邮件提醒管理台</h1>
          <div class="status-line" id="service-status">personal-mail-reminder</div>
        </div>
      </div>

      <div class="tokenbar">
        <div class="account-status">session verified</div>
        <a class="github-link" href="https://github.com/maya1900/cloudflare-reminder" target="_blank" rel="noreferrer" aria-label="打开 GitHub 仓库" title="GitHub 仓库">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.54 2.86 8.39 6.84 9.75.5.09.68-.22.68-.49 0-.24-.01-1.05-.01-1.9-2.78.62-3.37-1.22-3.37-1.22-.45-1.19-1.11-1.51-1.11-1.51-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.35 9.35 0 0 1 12 6.98c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.11 10.11 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
          </svg>
        </a>
        <button id="logout" class="quiet" type="button">退出</button>
      </div>
    </header>

    <main class="main">
      <div class="stack">
        <section class="panel">
          <div class="panel-head">
            <h2 id="form-title" class="panel-title">新建提醒</h2>
          </div>

          <form id="task-form" class="form">
            <div id="notice" class="notice" role="status"></div>

            <label>
              收件邮箱
              <input id="recipient-email" type="email" autocomplete="email" required placeholder="you@example.com">
            </label>

            <label>
              标题
              <input id="task-title" type="text" required maxlength="120" placeholder="每日复盘">
            </label>

            <label>
              正文
              <textarea id="task-body" maxlength="1200" placeholder="写下今天完成的 3 件事。"></textarea>
            </label>

            <div class="segmented" aria-label="到期方式">
              <button id="mode-relative" type="button" aria-pressed="true">相对时间</button>
              <button id="mode-absolute" type="button" aria-pressed="false">指定时间</button>
            </div>

            <div id="relative-fields" class="grid-2">
              <label>
                多久后
                <span class="duration">
                  <input id="relative-amount" type="number" min="1" step="1" value="15">
                  <select id="relative-unit">
                    <option value="minute">分钟</option>
                    <option value="hour">小时</option>
                    <option value="day">天</option>
                  </select>
                </span>
              </label>
              <label>
                追提醒间隔
                <span class="duration">
                  <input id="nag-amount" type="number" min="1" step="1" value="15">
                  <select id="nag-unit">
                    <option value="minute">分钟</option>
                    <option value="hour">小时</option>
                  </select>
                </span>
              </label>
            </div>

            <div id="absolute-fields" class="grid-2 hidden">
              <label>
                到期时间
                <input id="due-at" type="datetime-local">
              </label>
              <label>
                追提醒间隔
                <span class="duration">
                  <input id="nag-amount-absolute" type="number" min="1" step="1" value="30">
                  <select id="nag-unit-absolute">
                    <option value="minute">分钟</option>
                    <option value="hour">小时</option>
                  </select>
                </span>
              </label>
            </div>

            <label class="checkline">
              <input id="repeat-enabled" type="checkbox">
              重复提醒
            </label>

            <div id="repeat-fields" class="grid-2 hidden">
              <label>
                重复间隔
                <span class="duration">
                  <input id="repeat-amount" type="number" min="1" step="1" value="15">
                  <select id="repeat-unit">
                    <option value="minute">分钟</option>
                    <option value="hour">小时</option>
                    <option value="day">天</option>
                  </select>
                </span>
              </label>
              <label>
                重复基准
                <select id="repeat-anchor">
                  <option value="scheduled_time">计划时间</option>
                  <option value="completion_time">完成时间</option>
                </select>
              </label>
            </div>

            <div class="actions">
              <button id="submit-task" class="primary" type="submit">创建提醒</button>
              <button id="reset-form" class="quiet" type="button">清空</button>
            </div>
          </form>
        </section>

        <section class="panel" aria-labelledby="guide-title">
          <div class="panel-head">
            <h2 id="guide-title" class="panel-title">使用说明</h2>
          </div>
          <div class="guide">
            <ol class="guide-list">
              <li>
                <span class="guide-index">1</span>
                <div>
                  <p class="guide-title">创建提醒</p>
                  <p class="guide-text">填写收件邮箱、标题、正文和到期时间；追提醒间隔决定未完成时多久再发一次邮件。</p>
                </div>
              </li>
              <li>
                <span class="guide-index">2</span>
                <div>
                  <p class="guide-title">收到邮件</p>
                  <p class="guide-text">系统每分钟检查到期任务。邮件主题里的运行编号会自动用于识别回复。</p>
                </div>
              </li>
              <li>
                <span class="guide-index">3</span>
                <div>
                  <p class="guide-title">回复完成</p>
                  <p class="guide-text">直接回复提醒邮件，正文第一行只写 <span class="reply-code">1</span>，本次提醒会被标记完成。</p>
                </div>
              </li>
            </ol>
            <p class="guide-note">重复提醒按“计划时间”会保持固定节奏；按“完成时间”会从你回复完成后重新计时。</p>
          </div>
        </section>
      </div>

      <section class="panel">
        <div class="toolbar">
          <div class="filters" aria-label="任务状态">
            <button class="filter" type="button" data-status="all" aria-pressed="true">全部</button>
            <button class="filter" type="button" data-status="active" aria-pressed="false">进行中</button>
            <button class="filter" type="button" data-status="paused" aria-pressed="false">已暂停</button>
            <button class="filter" type="button" data-status="done" aria-pressed="false">已完成</button>
            <button class="filter" type="button" data-status="cancelled" aria-pressed="false">已取消</button>
          </div>
          <div class="actions">
            <button id="process-due" class="quiet" type="button">触发检查</button>
            <button id="refresh-tasks" class="primary" type="button">刷新</button>
          </div>
        </div>

        <div id="tasks" class="tasks">
          <div class="empty">加载中</div>
        </div>
      </section>
    </main>
  </div>

  <script>
    (function () {
      var form = document.getElementById('task-form');
      var formTitle = document.getElementById('form-title');
      var notice = document.getElementById('notice');
      var tasksEl = document.getElementById('tasks');
      var statusEl = document.getElementById('service-status');
      var submitTask = document.getElementById('submit-task');
      var resetForm = document.getElementById('reset-form');
      var modeRelative = document.getElementById('mode-relative');
      var modeAbsolute = document.getElementById('mode-absolute');
      var relativeFields = document.getElementById('relative-fields');
      var absoluteFields = document.getElementById('absolute-fields');
      var repeatEnabled = document.getElementById('repeat-enabled');
      var repeatFields = document.getElementById('repeat-fields');
      var relativeAmount = document.getElementById('relative-amount');
      var relativeUnit = document.getElementById('relative-unit');
      var nagAmount = document.getElementById('nag-amount');
      var nagUnit = document.getElementById('nag-unit');
      var repeatAmount = document.getElementById('repeat-amount');
      var repeatUnit = document.getElementById('repeat-unit');
      var filterStatus = 'all';
      var dueMode = 'relative';
      var editingTaskId = null;
      var taskById = {};
      var nagTouched = false;
      var repeatTouched = false;

      document.getElementById('logout').addEventListener('click', function () {
        fetch('/auth/logout', { method: 'POST' }).finally(function () {
          window.location.href = '/';
        });
      });

      modeRelative.addEventListener('click', function () {
        setDueMode('relative');
      });

      modeAbsolute.addEventListener('click', function () {
        setDueMode('absolute');
      });

      repeatEnabled.addEventListener('change', function () {
        repeatFields.classList.toggle('hidden', !repeatEnabled.checked);
        if (repeatEnabled.checked && dueMode === 'relative' && !repeatTouched) {
          syncRepeatToRelative();
        }
      });

      resetForm.addEventListener('click', function () {
        resetEditor();
      });

      [relativeAmount, relativeUnit].forEach(function (control) {
        control.addEventListener('input', syncRelativeDefaults);
        control.addEventListener('change', syncRelativeDefaults);
      });

      [nagAmount, nagUnit].forEach(function (control) {
        control.addEventListener('input', function () {
          nagTouched = true;
        });
        control.addEventListener('change', function () {
          nagTouched = true;
        });
      });

      [repeatAmount, repeatUnit].forEach(function (control) {
        control.addEventListener('input', function () {
          repeatTouched = true;
        });
        control.addEventListener('change', function () {
          repeatTouched = true;
        });
      });

      document.getElementById('refresh-tasks').addEventListener('click', function () {
        loadTasks();
      });

      document.getElementById('process-due').addEventListener('click', function () {
        callApi('/admin/process-due', { method: 'POST' })
          .then(function (summary) {
            flash('ok', '已检查：新建 ' + summary.createdRuns + '，追提醒 ' + summary.nagReminders);
            loadTasks();
          })
          .catch(showError);
      });

      document.querySelectorAll('.filter').forEach(function (button) {
        button.addEventListener('click', function () {
          filterStatus = button.getAttribute('data-status') || 'all';
          document.querySelectorAll('.filter').forEach(function (item) {
            item.setAttribute('aria-pressed', String(item === button));
          });
          loadTasks();
        });
      });

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var payload = buildPayload();
        var isEditing = Boolean(editingTaskId);
        var path = isEditing
          ? '/admin/tasks/' + encodeURIComponent(editingTaskId)
          : '/admin/tasks';
        callApi(path, {
          method: isEditing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then(function () {
            flash('ok', isEditing ? '提醒已保存' : '提醒已创建');
            resetEditor();
            loadTasks();
          })
          .catch(showError);
      });

      tasksEl.addEventListener('click', function (event) {
        var target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }

        var action = target.getAttribute('data-action');
        var taskId = target.getAttribute('data-task-id');
        if (!action || !taskId) {
          return;
        }

        if (action === 'edit') {
          beginEdit(taskId);
          return;
        }

        callApi('/admin/tasks/' + encodeURIComponent(taskId) + '/' + action, { method: 'POST' })
          .then(function () {
            flash('ok', '任务已更新');
            loadTasks();
          })
          .catch(showError);
      });

      loadTasks();
      syncRelativeDefaults();

      function resetEditor() {
        form.reset();
        editingTaskId = null;
        nagTouched = false;
        repeatTouched = false;
        setDueMode('relative');
        repeatFields.classList.add('hidden');
        updateFormMode();
        syncRelativeDefaults();
      }

      function updateFormMode() {
        var isEditing = Boolean(editingTaskId);
        formTitle.textContent = isEditing ? '编辑提醒' : '新建提醒';
        submitTask.textContent = isEditing ? '保存修改' : '创建提醒';
        resetForm.textContent = isEditing ? '取消编辑' : '清空';
      }

      function beginEdit(taskId) {
        var task = taskById[taskId];
        if (!task) {
          flash('error', '找不到要编辑的任务');
          return;
        }

        editingTaskId = task.id;
        updateFormMode();

        document.getElementById('recipient-email').value = task.recipientEmail || '';
        document.getElementById('task-title').value = task.title || '';
        document.getElementById('task-body').value = task.body || '';
        document.getElementById('due-at').value = toDateTimeLocalValue(task.nextDueAtUtc);
        setDueMode('absolute');
        setDurationMinutes('nag-amount-absolute', 'nag-unit-absolute', task.nagIntervalMinutes, false);

        var hasRepeat = task.recurrenceType === 'interval' && task.recurrenceIntervalMinutes;
        repeatEnabled.checked = Boolean(hasRepeat);
        repeatFields.classList.toggle('hidden', !hasRepeat);
        if (hasRepeat) {
          setDurationMinutes('repeat-amount', 'repeat-unit', task.recurrenceIntervalMinutes, true);
          document.getElementById('repeat-anchor').value = task.recurrenceAnchor || 'scheduled_time';
        }

        nagTouched = true;
        repeatTouched = true;
        flash('ok', '正在编辑：' + task.title);
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      function setDueMode(nextMode) {
        dueMode = nextMode;
        var isRelative = nextMode === 'relative';
        modeRelative.setAttribute('aria-pressed', String(isRelative));
        modeAbsolute.setAttribute('aria-pressed', String(!isRelative));
        relativeFields.classList.toggle('hidden', !isRelative);
        absoluteFields.classList.toggle('hidden', isRelative);
        if (isRelative) {
          syncRelativeDefaults();
        }
      }

      function buildPayload() {
        var title = document.getElementById('task-title').value.trim();
        var body = document.getElementById('task-body').value.trim();
        var payload = {
          recipientEmail: document.getElementById('recipient-email').value.trim(),
          title: title,
          body: body || title,
          nagIntervalMinutes: dueMode === 'relative'
            ? durationToMinutes('nag-amount', 'nag-unit')
            : durationToMinutes('nag-amount-absolute', 'nag-unit-absolute')
        };

        if (dueMode === 'relative') {
          payload.minutesFromNow = durationToMinutes('relative-amount', 'relative-unit');
        } else {
          payload.dueAt = document.getElementById('due-at').value;
        }

        if (repeatEnabled.checked) {
          payload.recurrence = {
            type: 'interval',
            intervalMinutes: durationToMinutes('repeat-amount', 'repeat-unit'),
            anchor: document.getElementById('repeat-anchor').value
          };
        }

        return payload;
      }

      function readNumber(id) {
        return Number(document.getElementById(id).value);
      }

      function durationToMinutes(amountId, unitId) {
        var unit = document.getElementById(unitId).value;
        var multiplier = unit === 'day' ? 1440 : unit === 'hour' ? 60 : 1;
        return readNumber(amountId) * multiplier;
      }

      function syncRelativeDefaults() {
        if (dueMode !== 'relative') {
          return;
        }

        if (!nagTouched) {
          syncNagToRelative();
        }

        if (repeatEnabled.checked && !repeatTouched) {
          syncRepeatToRelative();
        }
      }

      function syncNagToRelative() {
        var amount = readNumber('relative-amount') || 1;
        var unit = relativeUnit.value;

        if (unit === 'day') {
          nagAmount.value = String(amount * 24);
          nagUnit.value = 'hour';
        } else {
          nagAmount.value = String(amount);
          nagUnit.value = unit;
        }
      }

      function syncRepeatToRelative() {
        repeatAmount.value = relativeAmount.value || '1';
        repeatUnit.value = relativeUnit.value;
      }

      function setDurationMinutes(amountId, unitId, minutes, allowDay) {
        var value = Number(minutes || 1);
        var unit = 'minute';
        if (allowDay && value % 1440 === 0) {
          value = value / 1440;
          unit = 'day';
        } else if (value % 60 === 0) {
          value = value / 60;
          unit = 'hour';
        }

        document.getElementById(amountId).value = String(value);
        document.getElementById(unitId).value = unit;
      }

      function toDateTimeLocalValue(value) {
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          return '';
        }

        var local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 16);
      }

      function callApi(path, options) {
        options = options || {};
        var headers = new Headers(options.headers || {});

        return fetch(path, Object.assign({}, options, { headers: headers }))
          .then(function (response) {
            return response.json().catch(function () {
              return {};
            }).then(function (payload) {
              if (response.status === 401) {
                window.location.href = '/';
              }
              if (!response.ok || payload.ok === false) {
                throw new Error(payload.error || ('HTTP ' + response.status));
              }
              return payload;
            });
          });
      }

      function loadTasks() {
        tasksEl.innerHTML = '<div class="empty">加载中</div>';
        callApi('/admin/tasks?status=' + encodeURIComponent(filterStatus) + '&limit=50')
          .then(function (payload) {
            renderTasks(payload.tasks || []);
            statusEl.textContent = 'updated ' + new Date().toLocaleTimeString('zh-CN', { hour12: false });
          })
          .catch(function (error) {
            tasksEl.innerHTML = '<div class="empty">' + escapeHtml(error.message) + '</div>';
            showError(error);
          });
      }

      function renderTasks(tasks) {
        if (!tasks.length) {
          taskById = {};
          tasksEl.innerHTML = '<div class="empty">暂无任务</div>';
          return;
        }

        taskById = {};
        tasks.forEach(function (task) {
          taskById[task.id] = task;
        });
        tasksEl.innerHTML = tasks.map(renderTask).join('');
      }

      function renderTask(task) {
        var statusClass = 'status-' + task.status;
        var recurrence = task.recurrenceType === 'interval'
          ? '每 ' + formatDuration(task.recurrenceIntervalMinutes)
          : '一次性';
        var run = task.currentRun
          ? '<span class="pill">run ' + escapeHtml(task.currentRun.status || 'open') + ' / ' + Number(task.currentRun.sentCount || 0) + '</span>'
          : '';
        var actions = renderActions(task);

        return '<article class="task ' + escapeHtml(task.status) + '">' +
          '<div>' +
            '<h3>' + escapeHtml(task.title) + '</h3>' +
            '<p class="task-body">' + escapeHtml(task.body || '') + '</p>' +
            '<div class="meta">' +
              '<span class="pill ' + statusClass + '">' + statusLabel(task.status) + '</span>' +
              '<span class="pill">' + escapeHtml(task.recipientEmail) + '</span>' +
              '<span class="pill">下次 ' + formatTime(task.nextDueAtUtc) + '</span>' +
              '<span class="pill">' + recurrence + '</span>' +
              '<span class="pill">追 ' + formatDuration(task.nagIntervalMinutes) + '</span>' +
              run +
            '</div>' +
          '</div>' +
          '<div class="task-actions">' + actions + '</div>' +
        '</article>';
      }

      function renderActions(task) {
        var id = escapeAttribute(task.id);
        var edit = '<button class="quiet" type="button" data-action="edit" data-task-id="' + id + '">编辑</button>';
        if (task.status === 'active') {
          return edit +
            '<button class="quiet" type="button" data-action="pause" data-task-id="' + id + '">暂停</button>' +
            '<button class="danger" type="button" data-action="cancel" data-task-id="' + id + '">取消</button>';
        }
        if (task.status === 'paused') {
          return edit +
            '<button class="primary" type="button" data-action="resume" data-task-id="' + id + '">恢复</button>' +
            '<button class="danger" type="button" data-action="cancel" data-task-id="' + id + '">取消</button>';
        }
        return edit +
          '<button class="quiet" type="button" data-action="resume" data-task-id="' + id + '">重新激活</button>';
      }

      function statusLabel(status) {
        if (status === 'active') return '进行中';
        if (status === 'paused') return '已暂停';
        if (status === 'done') return '已完成';
        if (status === 'cancelled') return '已取消';
        return status;
      }

      function formatTime(value) {
        if (!value) {
          return '-';
        }
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          return value;
        }
        return date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
      }

      function formatDuration(minutes) {
        var value = Number(minutes || 0);
        if (value > 0 && value % 1440 === 0) {
          return value / 1440 + ' 天';
        }
        if (value > 0 && value % 60 === 0) {
          return value / 60 + ' 小时';
        }
        return value + ' 分钟';
      }

      function flash(type, message) {
        notice.className = 'notice show ' + type;
        notice.textContent = message;
        window.clearTimeout(flash.timer);
        flash.timer = window.setTimeout(function () {
          notice.className = 'notice';
        }, 4200);
      }

      function showError(error) {
        flash('error', error.message || String(error));
      }

      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function escapeAttribute(value) {
        return escapeHtml(value).replace(/\\x60/g, '&#96;');
      }
    })();
  </script>
</body>
</html>`;

export function renderAdminPage(): Response {
  return new Response(ADMIN_PAGE_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function renderLoginPage(): Response {
  return new Response(LOGIN_PAGE_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
