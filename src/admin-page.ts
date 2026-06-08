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

    .tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
      margin: 18px 20px 0;
      padding: 4px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #eef2f7;
    }

    .tab {
      min-height: 34px;
      border-color: transparent;
      background: transparent;
      color: var(--muted);
    }

    .tab[aria-pressed="true"] {
      border-color: var(--line-strong);
      background: #fff;
      color: var(--teal);
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

    .hidden {
      display: none;
    }
  </style>
</head>
<body>
  <section class="login">
    <div class="head">
      <div class="mark">R</div>
      <div>
          <h1>邮件提醒入口</h1>
        <div class="sub">personal-mail-reminder</div>
      </div>
    </div>

    <div class="tabs" aria-label="登录方式">
      <button class="tab" type="button" data-mode="user-login" aria-pressed="true">用户登录</button>
      <button class="tab" type="button" data-mode="register" aria-pressed="false">注册</button>
      <button class="tab" type="button" data-mode="admin" aria-pressed="false">管理员</button>
    </div>

    <form id="user-login-form" class="auth-form" data-mode="user-login">
      <div id="user-login-notice" class="notice" role="status"></div>
      <label>
        邮箱
        <input id="user-login-email" type="email" autocomplete="email" autofocus required>
      </label>
      <label>
        密码
        <input id="user-login-password" type="password" autocomplete="current-password" required>
      </label>
      <label class="remember">
        <input id="user-login-remember" type="checkbox">
        记住登录
      </label>
      <button id="user-login-button" type="submit">登录</button>
      <button id="user-linuxdo-button" type="button">使用 Linux.do 登录</button>
    </form>

    <form id="register-form" class="auth-form hidden" data-mode="register">
      <div id="register-notice" class="notice" role="status"></div>
      <label>
        邮箱
        <input id="register-email" type="email" autocomplete="email" required>
      </label>
      <label>
        密码
        <input id="register-password" type="password" autocomplete="new-password" minlength="8" required>
      </label>
      <label id="register-invite-row" class="hidden">
        邀请码
        <input id="register-invite-code" type="text" autocomplete="off">
      </label>
      <label class="remember">
        <input id="register-remember" type="checkbox" checked>
        记住登录
      </label>
      <button id="register-button" type="submit">注册并进入</button>
      <button id="register-linuxdo-button" type="button">使用 Linux.do 登录</button>
    </form>

    <form id="linuxdo-complete-form" class="auth-form hidden" data-mode="linuxdo-complete">
      <div id="linuxdo-complete-notice" class="notice" role="status"></div>
      <label>
        邀请码
        <input id="linuxdo-complete-invite-code" type="text" autocomplete="off" required>
      </label>
      <button id="linuxdo-complete-button" type="submit">完成 Linux.do 注册</button>
    </form>

    <form id="login-form" class="auth-form hidden" data-mode="admin">
      <div id="login-notice" class="notice" role="status"></div>
      <label>
        Admin Token
        <input id="admin-token" type="password" autocomplete="current-password" required>
      </label>
      <label class="remember">
        <input id="remember-login" type="checkbox">
        记住登录
      </label>
      <button id="login-button" type="submit">进入管理台</button>
    </form>
  </section>

  <script>
    window.REMINDER_LOGIN = __REMINDER_LOGIN_CONFIG__;
  </script>
  <script>
    (function () {
      var config = window.REMINDER_LOGIN || { settings: {} };
      var settings = config.settings || {};
      var registerButton = document.getElementById('register-button');
      var userLinuxdoButton = document.getElementById('user-linuxdo-button');
      var registerLinuxdoButton = document.getElementById('register-linuxdo-button');
      var inviteRow = document.getElementById('register-invite-row');
      var pendingLinuxdoToken = new URLSearchParams(window.location.search).get('linuxdoPending') || '';
      var linuxdoError = new URLSearchParams(window.location.search).get('linuxdoError') || '';

      inviteRow.classList.toggle('hidden', !settings.requireInvite);
      registerButton.disabled = settings.allowRegistration === false;
      if (settings.allowRegistration === false) {
        registerButton.textContent = '注册暂未开放';
      }

      userLinuxdoButton.addEventListener('click', startLinuxdo);
      registerLinuxdoButton.addEventListener('click', startLinuxdo);

      if (pendingLinuxdoToken) {
        setAuthMode('linuxdo-complete');
        var pendingNotice = document.getElementById('linuxdo-complete-notice');
        pendingNotice.textContent = 'Linux.do 授权成功，请填写邀请码完成注册。';
        pendingNotice.className = 'notice show';
      }

      if (linuxdoError) {
        var userNotice = document.getElementById('user-login-notice');
        userNotice.textContent = linuxdoError;
        userNotice.className = 'notice show';
      }

      document.querySelectorAll('.tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
          setAuthMode(tab.getAttribute('data-mode') || 'user-login');
        });
      });

      document.getElementById('linuxdo-complete-form').addEventListener('submit', function (event) {
        event.preventDefault();
        var notice = document.getElementById('linuxdo-complete-notice');
        var button = document.getElementById('linuxdo-complete-button');
        notice.className = 'notice';
        button.disabled = true;
        fetch('/auth/linuxdo/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pendingToken: pendingLinuxdoToken,
            inviteCode: document.getElementById('linuxdo-complete-invite-code').value.trim()
          })
        })
          .then(function (response) {
            return response.json().catch(function () {
              return {};
            }).then(function (payload) {
              if (!response.ok || payload.ok === false) {
                throw new Error(payload.error || '注册失败');
              }
              window.location.href = '/';
            });
          })
          .catch(function (error) {
            notice.textContent = error.message || String(error);
            notice.className = 'notice show';
            button.disabled = false;
          });
      });

      function setAuthMode(mode) {
        document.querySelectorAll('.tab').forEach(function (item) {
          item.setAttribute('aria-pressed', String(item.getAttribute('data-mode') === mode));
        });
        document.querySelectorAll('.auth-form').forEach(function (form) {
          form.classList.toggle('hidden', form.getAttribute('data-mode') !== mode);
        });
      }

      function startLinuxdo() {
        window.location.href = '/auth/linuxdo/start';
      }

      bindPasswordForm({
        formId: 'user-login-form',
        noticeId: 'user-login-notice',
        buttonId: 'user-login-button',
        path: '/auth/user-login',
        payload: function () {
          return {
            email: document.getElementById('user-login-email').value.trim(),
            password: document.getElementById('user-login-password').value,
            remember: document.getElementById('user-login-remember').checked
          };
        }
      });

      bindPasswordForm({
        formId: 'register-form',
        noticeId: 'register-notice',
        buttonId: 'register-button',
        path: '/auth/register',
        payload: function () {
          return {
            email: document.getElementById('register-email').value.trim(),
            password: document.getElementById('register-password').value,
            inviteCode: document.getElementById('register-invite-code').value.trim(),
            remember: document.getElementById('register-remember').checked
          };
        }
      });

      bindPasswordForm({
        formId: 'login-form',
        noticeId: 'login-notice',
        buttonId: 'login-button',
        path: '/auth/login',
        payload: function () {
          return {
            token: document.getElementById('admin-token').value.trim(),
            remember: document.getElementById('remember-login').checked
          };
        }
      });

      function bindPasswordForm(options) {
        var form = document.getElementById(options.formId);
        var button = document.getElementById(options.buttonId);
        var notice = document.getElementById(options.noticeId);

        form.addEventListener('submit', function (event) {
        event.preventDefault();
        notice.className = 'notice';
        button.disabled = true;

        fetch(options.path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options.payload())
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
      }
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
      grid-template-columns: minmax(180px, 1fr) minmax(0, 560px);
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
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      align-items: end;
      min-width: 0;
    }

    .account-status {
      min-height: 40px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      min-width: 0;
      max-width: min(430px, 52vw);
      flex: 0 1 auto;
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }

    .account-email {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .account-usage {
      white-space: nowrap;
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
      column-gap: 18px;
      row-gap: 10px;
      align-content: start;
      grid-auto-rows: max-content;
      width: min(1480px, 100%);
      margin: 0 auto;
      padding: 18px clamp(14px, 3vw, 34px) 34px;
    }

    .view-tabs {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      align-self: start;
      gap: 4px;
      flex-wrap: wrap;
      width: fit-content;
      padding: 4px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #eef2f7;
    }

    .view-tab {
      min-height: 34px;
      height: 34px;
      padding: 0 14px;
      border-color: transparent;
      background: transparent;
      color: var(--muted);
    }

    .view-tab[aria-pressed="true"] {
      border-color: var(--teal);
      background: #fff;
      color: var(--teal);
      font-weight: 800;
    }

    .full-view {
      grid-column: 1 / -1;
    }

    .app-view {
      align-self: start;
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

    .table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }

    .table th,
    .table td {
      padding: 11px 12px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }

    .table th {
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
    }

    .settings-grid {
      display: grid;
      gap: 14px;
      padding: 16px;
    }

    .pager {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 0 14px 14px;
      color: var(--muted);
      font-size: 13px;
    }

    .pager button {
      min-height: 32px;
      padding: 0 10px;
    }

    .announcement-bar {
      grid-column: 1 / -1;
      display: none;
      padding: 12px 14px;
      border: 1px solid rgba(15, 118, 110, 0.24);
      border-radius: 8px;
      background: var(--teal-soft);
      color: var(--ink);
      font-size: 14px;
      font-weight: 750;
      overflow-wrap: anywhere;
    }

    .announcement-bar.show {
      display: block;
    }

    .icon-button {
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      padding: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-weight: 900;
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 30;
      display: grid;
      place-items: center;
      padding: 22px;
      background: rgba(28, 34, 43, 0.32);
    }

    .modal {
      width: min(520px, 100%);
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .modal-body {
      padding: 16px;
      color: var(--ink);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
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
        grid-template-columns: 1fr auto auto auto;
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
        <div id="account-status" class="account-status">session verified</div>
        <button id="announcement-button" class="icon-button hidden" type="button" aria-label="查看公告" title="查看公告">!</button>
        <a class="github-link" href="https://github.com/maya1900/cloudflare-reminder" target="_blank" rel="noreferrer" aria-label="打开 GitHub 仓库" title="GitHub 仓库">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.54 2.86 8.39 6.84 9.75.5.09.68-.22.68-.49 0-.24-.01-1.05-.01-1.9-2.78.62-3.37-1.22-3.37-1.22-.45-1.19-1.11-1.51-1.11-1.51-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.35 9.35 0 0 1 12 6.98c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.11 10.11 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
          </svg>
        </a>
        <button id="logout" class="quiet" type="button">退出</button>
      </div>
    </header>

    <main class="main">
      <div id="app-announcement" class="announcement-bar"></div>
      <nav class="view-tabs" aria-label="后台视图">
        <button class="view-tab" type="button" data-view="tasks" aria-pressed="true">任务</button>
        <button class="view-tab" type="button" data-view="users" data-admin-only="true" aria-pressed="false">用户</button>
        <button class="view-tab" type="button" data-view="settings" data-admin-only="true" aria-pressed="false">设置</button>
        <button class="view-tab" type="button" data-view="announcement" data-admin-only="true" aria-pressed="false">公告</button>
        <button class="view-tab" type="button" data-view="logs" aria-pressed="false">日志</button>
      </nav>

      <div class="stack app-view" data-view-panel="tasks">
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

      <section class="panel app-view" data-view-panel="tasks">
        <div class="toolbar">
          <div class="filters" aria-label="任务状态">
            <button class="filter" type="button" data-status="all" aria-pressed="true">全部</button>
            <button class="filter" type="button" data-status="active" aria-pressed="false">进行中</button>
            <button class="filter" type="button" data-status="paused" aria-pressed="false">已暂停</button>
            <button class="filter" type="button" data-status="done" aria-pressed="false">已完成</button>
            <button class="filter" type="button" data-status="cancelled" aria-pressed="false">已取消</button>
          </div>
          <div class="actions">
            <button id="process-due" class="quiet" type="button" data-admin-only="true">触发检查</button>
            <button id="refresh-tasks" class="primary" type="button">刷新</button>
          </div>
        </div>

        <div id="tasks" class="tasks">
          <div class="empty">加载中</div>
        </div>
      </section>

      <section class="panel full-view app-view hidden" data-view-panel="users" data-admin-only="true">
        <div class="toolbar">
          <h2 class="panel-title">用户管理</h2>
          <button id="refresh-users" class="primary" type="button">刷新</button>
        </div>
        <div id="users-table" class="tasks">
          <div class="empty">加载中</div>
        </div>
        <div id="users-pager" class="pager"></div>
      </section>

      <section class="panel full-view app-view hidden" data-view-panel="settings" data-admin-only="true">
        <div class="panel-head">
          <h2 class="panel-title">系统设置</h2>
        </div>
        <form id="settings-form" class="settings-grid">
          <div id="settings-notice" class="notice" role="status"></div>
          <label class="checkline">
            <input id="allow-registration" type="checkbox">
            允许用户注册
          </label>
          <label class="checkline">
            <input id="require-invite" type="checkbox">
            注册需要邀请码
          </label>
          <div class="grid-2">
            <label>
              生成数量
              <input id="invite-count" type="number" min="1" max="100" step="1" value="1">
            </label>
            <label>
              过期时间
              <input id="invite-expires-at" type="datetime-local">
            </label>
          </div>
          <div class="actions">
            <button id="generate-invite" class="quiet" type="button">生成邀请码</button>
            <button id="refresh-invites" class="quiet" type="button">刷新邀请码</button>
            <button id="delete-selected-invites" class="danger" type="button">删除选中</button>
          </div>
          <div id="invites-table" class="tasks">
            <div class="empty">暂无邀请码</div>
          </div>
          <div id="invites-pager" class="pager"></div>
          <div class="actions">
            <button class="primary" type="submit">保存设置</button>
          </div>
        </form>
      </section>

      <section class="panel full-view app-view hidden" data-view-panel="announcement" data-admin-only="true">
        <div class="panel-head">
          <h2 class="panel-title">公告</h2>
        </div>
        <form id="announcement-form" class="settings-grid">
          <div id="announcement-notice" class="notice" role="status"></div>
          <label>
            公告内容
            <textarea id="announcement-text" maxlength="1200"></textarea>
          </label>
          <div class="actions">
            <button class="primary" type="submit">保存公告</button>
          </div>
        </form>
      </section>

      <section class="panel full-view app-view hidden" data-view-panel="logs">
        <div class="toolbar">
          <div class="filters">
            <select id="log-action-filter" aria-label="日志类型">
              <option value="all">全部日志</option>
              <option value="auth_register">注册</option>
              <option value="auth_login">登录</option>
              <option value="auth_linuxdo_login">Linux.do 登录</option>
              <option value="task_create">创建任务</option>
              <option value="task_update">编辑任务</option>
              <option value="task_delete">删除任务</option>
              <option value="email_send_success">邮件成功</option>
              <option value="email_send_failed">邮件失败</option>
              <option value="admin_user_ban">封禁用户</option>
              <option value="admin_user_delete">删除用户</option>
              <option value="admin_settings_update">设置变更</option>
            </select>
          </div>
          <button id="refresh-logs" class="primary" type="button">刷新</button>
        </div>
        <div id="logs-table" class="tasks">
          <div class="empty">加载中</div>
        </div>
        <div id="logs-pager" class="pager"></div>
      </section>
    </main>
  </div>

  <div id="announcement-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="announcement-title">
    <section class="modal">
      <div class="panel-head">
        <h2 id="announcement-title" class="panel-title">公告</h2>
        <button id="announcement-close" class="quiet" type="button">关闭</button>
      </div>
      <div id="announcement-modal-body" class="modal-body"></div>
    </section>
  </div>

  <script>
    window.REMINDER_APP = __REMINDER_APP_CONFIG__;
  </script>
  <script>
    (function () {
      var appConfig = window.REMINDER_APP || {
        isAdmin: true,
        userEmail: 'admin',
        taskBasePath: '/admin/tasks'
      };
      var form = document.getElementById('task-form');
      var formTitle = document.getElementById('form-title');
      var notice = document.getElementById('notice');
      var settingsNotice = document.getElementById('settings-notice');
      var announcementNotice = document.getElementById('announcement-notice');
      var tasksEl = document.getElementById('tasks');
      var usersTable = document.getElementById('users-table');
      var logsTable = document.getElementById('logs-table');
      var invitesTable = document.getElementById('invites-table');
      var usersPager = document.getElementById('users-pager');
      var logsPager = document.getElementById('logs-pager');
      var invitesPager = document.getElementById('invites-pager');
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
      var processDue = document.getElementById('process-due');
      var accountStatus = document.getElementById('account-status');
      var appAnnouncement = document.getElementById('app-announcement');
      var announcementButton = document.getElementById('announcement-button');
      var announcementModal = document.getElementById('announcement-modal');
      var announcementModalBody = document.getElementById('announcement-modal-body');
      var taskBasePath = appConfig.taskBasePath || '/admin/tasks';
      var settings = appConfig.settings || {};
      var filterStatus = 'all';
      var activeView = 'tasks';
      var announcementShown = false;
      var usersPage = 1;
      var invitesPage = 1;
      var logsPage = 1;
      var pageSize = 20;
      var dueMode = 'relative';
      var editingTaskId = null;
      var taskById = {};
      var nagTouched = false;
      var repeatTouched = false;

      renderAccountStatus(0, 5);

      renderAnnouncement(settings.announcementText || '');
      hydrateSettingsForm(settings);

      document.querySelectorAll('[data-admin-only="true"]').forEach(function (element) {
        element.classList.toggle('hidden', !appConfig.isAdmin);
      });
      if (!appConfig.isAdmin) {
        document.querySelectorAll('#log-action-filter option[value^="admin_"]').forEach(function (option) {
          option.remove();
        });
      }
      setView('tasks');

      document.querySelectorAll('.view-tab').forEach(function (button) {
        button.addEventListener('click', function () {
          setView(button.getAttribute('data-view') || 'tasks');
        });
      });

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

      document.getElementById('refresh-logs').addEventListener('click', function () {
        loadLogs();
      });

      document.getElementById('log-action-filter').addEventListener('change', function () {
        logsPage = 1;
        loadLogs();
      });

      document.getElementById('announcement-close').addEventListener('click', function () {
        announcementModal.classList.add('hidden');
      });

      announcementButton.addEventListener('click', function () {
        showAnnouncementModal();
      });

      if (appConfig.isAdmin) {
        document.getElementById('refresh-users').addEventListener('click', function () {
          loadUsers();
        });

        document.getElementById('settings-form').addEventListener('submit', function (event) {
          event.preventDefault();
          saveSettings();
        });

        document.getElementById('announcement-form').addEventListener('submit', function (event) {
          event.preventDefault();
          saveAnnouncement();
        });

        document.getElementById('generate-invite').addEventListener('click', function () {
          createInvite();
        });

        document.getElementById('refresh-invites').addEventListener('click', function () {
          loadInvites();
        });

        document.getElementById('delete-selected-invites').addEventListener('click', function () {
          deleteSelectedInvites();
        });
      }

      if (processDue) {
        processDue.addEventListener('click', function () {
          callApi('/admin/process-due', { method: 'POST' })
            .then(function (summary) {
              flash('ok', '已检查：新建 ' + summary.createdRuns + '，追提醒 ' + summary.nagReminders);
              loadTasks();
            })
            .catch(showError);
        });
      }

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
          ? taskBasePath + '/' + encodeURIComponent(editingTaskId)
          : taskBasePath;
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

        if (action === 'delete') {
          if (!window.confirm('确认删除这个任务？')) {
            return;
          }
          callApi(taskBasePath + '/' + encodeURIComponent(taskId), { method: 'DELETE' })
            .then(function () {
              flash('ok', '任务已删除');
              loadTasks();
            })
            .catch(showError);
          return;
        }

        callApi(taskBasePath + '/' + encodeURIComponent(taskId) + '/' + action, { method: 'POST' })
          .then(function () {
            flash('ok', '任务已更新');
            loadTasks();
          })
          .catch(showError);
      });

      loadTasks();
      syncRelativeDefaults();

      function setView(view) {
        if (!appConfig.isAdmin && view !== 'tasks' && view !== 'logs') {
          view = 'tasks';
        }
        activeView = view;
        document.querySelectorAll('.view-tab').forEach(function (button) {
          button.setAttribute('aria-pressed', String(button.getAttribute('data-view') === view));
        });
        document.querySelectorAll('[data-view-panel]').forEach(function (panel) {
          panel.classList.toggle('hidden', panel.getAttribute('data-view-panel') !== view);
        });
        if (view === 'users') {
          loadUsers();
        }
        if (view === 'settings') {
          loadSettings();
          loadInvites();
        }
        if (view === 'announcement') {
          loadSettings();
        }
        if (view === 'logs') {
          loadLogs();
        }
      }

      function renderAnnouncement(text) {
        if (!text) {
          appAnnouncement.className = 'announcement-bar';
          appAnnouncement.textContent = '';
          announcementButton.classList.add('hidden');
          announcementModal.classList.add('hidden');
          return;
        }
        appAnnouncement.className = 'announcement-bar';
        appAnnouncement.textContent = '';
        announcementModalBody.textContent = text;
        announcementButton.classList.remove('hidden');
        if (!announcementShown) {
          announcementShown = true;
          showAnnouncementModal();
        }
      }

      function showAnnouncementModal() {
        if (!settings.announcementText) {
          return;
        }
        announcementModalBody.textContent = settings.announcementText;
        announcementModal.classList.remove('hidden');
      }

      function hydrateSettingsForm(nextSettings) {
        if (!appConfig.isAdmin) {
          return;
        }
        document.getElementById('allow-registration').checked = nextSettings.allowRegistration !== false;
        document.getElementById('require-invite').checked = nextSettings.requireInvite === true;
        document.getElementById('announcement-text').value = nextSettings.announcementText || '';
      }

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

      function loadSettings() {
        if (!appConfig.isAdmin) {
          return;
        }
        callApi('/admin/settings')
          .then(function (payload) {
            settings = payload.settings || {};
            hydrateSettingsForm(settings);
            renderAnnouncement(settings.announcementText || '');
          })
          .catch(showError);
      }

      function saveSettings() {
        showPanelNotice(settingsNotice, 'ok', '正在保存设置...');
        callApi('/admin/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            allowRegistration: document.getElementById('allow-registration').checked,
            requireInvite: document.getElementById('require-invite').checked
          })
        })
          .then(function (payload) {
            settings = payload.settings || {};
            hydrateSettingsForm(settings);
            showPanelNotice(settingsNotice, 'ok', '设置已保存');
            flash('ok', '设置已保存');
          })
          .catch(function (error) {
            showPanelNotice(settingsNotice, 'error', error.message || String(error));
            showError(error);
          });
      }

      function saveAnnouncement() {
        showPanelNotice(announcementNotice, 'ok', '正在保存公告...');
        callApi('/admin/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            announcementText: document.getElementById('announcement-text').value.trim()
          })
        })
          .then(function (payload) {
            settings = payload.settings || {};
            hydrateSettingsForm(settings);
            renderAnnouncement(settings.announcementText || '');
            showPanelNotice(announcementNotice, 'ok', '公告已保存');
            flash('ok', '公告已保存');
          })
          .catch(function (error) {
            showPanelNotice(announcementNotice, 'error', error.message || String(error));
            showError(error);
          });
      }

      function loadInvites() {
        if (!appConfig.isAdmin) {
          return;
        }
        invitesTable.innerHTML = '<div class="empty">加载中</div>';
        callApi('/admin/invites?page=' + invitesPage + '&pageSize=' + pageSize)
          .then(function (payload) {
            renderInvites(payload.invites || []);
            renderPager(invitesPager, payload.page, function (nextPage) {
              invitesPage = nextPage;
              loadInvites();
            });
          })
          .catch(function (error) {
            invitesTable.innerHTML = '<div class="empty">' + escapeHtml(error.message) + '</div>';
            showError(error);
          });
      }

      function createInvite() {
        var expiresAt = document.getElementById('invite-expires-at').value;
        callApi('/admin/invites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            count: Number(document.getElementById('invite-count').value || 1),
            expiresAt: expiresAt ? new Date(expiresAt).toISOString() : ''
          })
        })
          .then(function (payload) {
            var count = payload.invites ? payload.invites.length : 1;
            flash('ok', '已生成 ' + count + ' 个邀请码');
            loadInvites();
          })
          .catch(showError);
      }

      function renderInvites(invites) {
        if (!invites.length) {
          invitesTable.innerHTML = '<div class="empty">暂无邀请码</div>';
          return;
        }

        invitesTable.innerHTML = '<table class="table"><thead><tr>' +
          '<th><input id="select-all-invites" type="checkbox" aria-label="选择本页全部邀请码"></th><th>邀请码</th><th>状态</th><th>使用者</th><th>过期时间</th><th>创建时间</th><th>操作</th>' +
          '</tr></thead><tbody>' +
          invites.map(function (invite) {
            var used = Boolean(invite.usedAtUtc);
            var expired = Boolean(invite.expired);
            var code = escapeAttribute(invite.code);
            var action = used
              ? ''
              : '<button class="danger" type="button" data-invite-action="delete" data-invite-code="' + code + '">删除</button>';
            var status = used ? '已使用' : expired ? '已过期' : '未使用';
            var selectable = used ? 'disabled' : '';
            return '<tr>' +
              '<td><input class="invite-select" type="checkbox" value="' + code + '" ' + selectable + '></td>' +
              '<td><strong>' + escapeHtml(invite.code) + '</strong></td>' +
              '<td>' + status + '</td>' +
              '<td>' + escapeHtml(invite.usedByEmail || '-') + '</td>' +
              '<td>' + formatTime(invite.expiresAtUtc) + '</td>' +
              '<td>' + formatTime(invite.createdAtUtc) + '</td>' +
              '<td>' + action + '</td>' +
              '</tr>';
          }).join('') +
          '</tbody></table>';
      }

      function deleteSelectedInvites() {
        var codes = Array.from(document.querySelectorAll('.invite-select:checked')).map(function (input) {
          return input.value;
        });
        if (!codes.length) {
          flash('error', '请选择要删除的邀请码');
          return;
        }
        if (!window.confirm('确认删除选中的 ' + codes.length + ' 个未使用邀请码？')) {
          return;
        }
        callApi('/admin/invites/batch-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codes: codes })
        })
          .then(function (payload) {
            flash('ok', '已删除 ' + Number(payload.deleted || 0) + ' 个，跳过 ' + Number(payload.skipped || 0) + ' 个');
            loadInvites();
          })
          .catch(showError);
      }

      function renderPager(container, page, onChange) {
        if (!page) {
          container.innerHTML = '';
          return;
        }
        container.innerHTML =
          '<button class="quiet" type="button" data-page="prev" ' + (page.hasPrev ? '' : 'disabled') + '>上一页</button>' +
          '<span>第 ' + Number(page.page || 1) + ' / ' + Number(page.totalPages || 1) + ' 页，共 ' + Number(page.total || 0) + ' 条</span>' +
          '<button class="quiet" type="button" data-page="next" ' + (page.hasNext ? '' : 'disabled') + '>下一页</button>';

        container.onclick = function (event) {
          var target = event.target;
          if (!(target instanceof HTMLElement)) {
            return;
          }
          var direction = target.getAttribute('data-page');
          if (!direction) {
            return;
          }
          onChange(direction === 'prev' ? Number(page.page || 1) - 1 : Number(page.page || 1) + 1);
        };
      }

      invitesTable.addEventListener('click', function (event) {
        var target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        var action = target.getAttribute('data-invite-action');
        var code = target.getAttribute('data-invite-code');
        if (action !== 'delete' || !code) {
          return;
        }
        if (!window.confirm('确认删除这个未使用的邀请码？')) {
          return;
        }
        callApi('/admin/invites/' + encodeURIComponent(code), { method: 'DELETE' })
          .then(loadInvites)
          .catch(showError);
      });

      invitesTable.addEventListener('change', function (event) {
        var target = event.target;
        if (!(target instanceof HTMLInputElement) || target.id !== 'select-all-invites') {
          return;
        }
        document.querySelectorAll('.invite-select:not(:disabled)').forEach(function (input) {
          input.checked = target.checked;
        });
      });

      function loadUsers() {
        if (!appConfig.isAdmin) {
          return;
        }
        usersTable.innerHTML = '<div class="empty">加载中</div>';
        callApi('/admin/users?page=' + usersPage + '&pageSize=' + pageSize)
          .then(function (payload) {
            renderUsers(payload.users || []);
            renderPager(usersPager, payload.page, function (nextPage) {
              usersPage = nextPage;
              loadUsers();
            });
          })
          .catch(function (error) {
            usersTable.innerHTML = '<div class="empty">' + escapeHtml(error.message) + '</div>';
            showError(error);
          });
      }

      function renderUsers(users) {
        if (!users.length) {
          usersTable.innerHTML = '<div class="empty">暂无用户</div>';
          return;
        }

        usersTable.innerHTML = '<table class="table"><thead><tr>' +
          '<th>用户</th><th>状态</th><th>任务</th><th>登录</th><th>操作</th>' +
          '</tr></thead><tbody>' +
          users.map(renderUserRow).join('') +
          '</tbody></table>';
      }

      function renderUserRow(user) {
        var id = escapeAttribute(user.id);
        var provider = user.linuxdoUsername ? 'Linux.do @' + user.linuxdoUsername : '邮箱';
        var actions = '<button class="quiet" type="button" data-user-action="edit" data-user-id="' + id + '">编辑</button>';
        if (user.status === 'banned') {
          actions += '<button class="primary" type="button" data-user-action="unban" data-user-id="' + id + '">解封</button>';
        } else {
          actions += '<button class="danger" type="button" data-user-action="ban" data-user-id="' + id + '">封禁</button>';
        }
        actions += '<button class="danger" type="button" data-user-action="delete" data-user-id="' + id + '">删除</button>';

        return '<tr>' +
          '<td><strong>' + escapeHtml(user.email) + '</strong><br><span class="guide-text">' + escapeHtml(provider) + '</span></td>' +
          '<td>' + escapeHtml(user.status) + '</td>' +
          '<td>' + Number(user.taskCount || 0) + '/' + Number(user.taskLimit || 5) + '</td>' +
          '<td>' + formatTime(user.lastLoginAtUtc) + '</td>' +
          '<td><div class="actions">' + actions + '</div></td>' +
          '</tr>';
      }

      usersTable.addEventListener('click', function (event) {
        var target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        var action = target.getAttribute('data-user-action');
        var userId = target.getAttribute('data-user-id');
        if (!action || !userId) {
          return;
        }
        handleUserAction(action, userId);
      });

      function handleUserAction(action, userId) {
        if (action === 'edit') {
          var email = window.prompt('新的邮箱');
          if (!email) return;
          callApi('/admin/users/' + encodeURIComponent(userId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim() })
          }).then(loadUsers).catch(showError);
          return;
        }
        if (action === 'ban') {
          var reason = window.prompt('封禁原因', '');
          callApi('/admin/users/' + encodeURIComponent(userId) + '/ban', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: reason || '' })
          }).then(loadUsers).catch(showError);
          return;
        }
        if (action === 'unban') {
          callApi('/admin/users/' + encodeURIComponent(userId) + '/unban', { method: 'POST' })
            .then(loadUsers)
            .catch(showError);
          return;
        }
        if (action === 'delete') {
          if (!window.confirm('确认删除该用户及其所有数据？')) return;
          callApi('/admin/users/' + encodeURIComponent(userId), { method: 'DELETE' })
            .then(loadUsers)
            .catch(showError);
        }
      }

      function loadLogs() {
        logsTable.innerHTML = '<div class="empty">加载中</div>';
        var base = appConfig.isAdmin ? '/admin/logs' : '/user/logs';
        var action = document.getElementById('log-action-filter').value || 'all';
        callApi(base + '?action=' + encodeURIComponent(action) + '&page=' + logsPage + '&pageSize=' + pageSize)
          .then(function (payload) {
            renderLogs(payload.logs || []);
            renderPager(logsPager, payload.page, function (nextPage) {
              logsPage = nextPage;
              loadLogs();
            });
          })
          .catch(function (error) {
            logsTable.innerHTML = '<div class="empty">' + escapeHtml(error.message) + '</div>';
            showError(error);
          });
      }

      function renderLogs(logs) {
        if (!logs.length) {
          logsTable.innerHTML = '<div class="empty">最近 30 天暂无日志</div>';
          return;
        }

        logsTable.innerHTML = '<table class="table"><thead><tr>' +
          '<th>时间</th><th>动作</th><th>操作者</th><th>对象</th><th>详情</th>' +
          '</tr></thead><tbody>' +
          logs.map(function (log) {
            return '<tr>' +
              '<td>' + formatTime(log.createdAtUtc) + '</td>' +
              '<td>' + escapeHtml(log.action) + '</td>' +
              '<td>' + escapeHtml(log.actorEmail || log.actorType || '-') + '</td>' +
              '<td>' + escapeHtml((log.targetType || '-') + ':' + (log.targetId || '-')) + '</td>' +
              '<td>' + escapeHtml(formatLogDetails(log.details)) + '</td>' +
              '</tr>';
          }).join('') +
          '</tbody></table>';
      }

      function formatLogDetails(details) {
        if (!details) return '';
        if (typeof details === 'string') return details;
        try {
          return JSON.stringify(details);
        } catch (error) {
          return String(details);
        }
      }

      function loadTasks() {
        tasksEl.innerHTML = '<div class="empty">加载中</div>';
        callApi(taskBasePath + '?status=' + encodeURIComponent(filterStatus) + '&limit=50')
          .then(function (payload) {
            renderTasks(payload.tasks || []);
            if (!appConfig.isAdmin && payload.taskUsage) {
              renderAccountStatus(Number(payload.taskUsage.used || 0), Number(payload.taskUsage.limit || 5));
            }
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

      function renderAccountStatus(used, limit) {
        if (appConfig.isAdmin) {
          accountStatus.textContent = 'admin session';
          accountStatus.title = 'admin session';
          return;
        }
        var email = String(appConfig.userEmail || 'user');
        var usage = Number(used || 0) + '/' + Number(limit || 5) + ' tasks';
        accountStatus.title = email + ' / ' + usage;
        accountStatus.innerHTML = '<span class="account-email">' + escapeHtml(email) + '</span>' +
          '<span class="account-usage">' + escapeHtml(usage) + '</span>';
      }

      function renderTask(task) {
        var statusClass = 'status-' + task.status;
        var recurrence = task.recurrenceType === 'interval'
          ? '每 ' + formatDuration(task.recurrenceIntervalMinutes)
          : '一次性';
        var run = task.currentRun
          ? '<span class="pill">run ' + escapeHtml(task.currentRun.status || 'open') + ' / ' + Number(task.currentRun.sentCount || 0) + '</span>'
          : '';
        var owner = appConfig.isAdmin && task.userEmail
          ? '<span class="pill">' + escapeHtml(task.userEmail) + '</span>'
          : '';
        var actions = renderActions(task);

        return '<article class="task ' + escapeHtml(task.status) + '">' +
          '<div>' +
            '<h3>' + escapeHtml(task.title) + '</h3>' +
            '<p class="task-body">' + escapeHtml(task.body || '') + '</p>' +
            '<div class="meta">' +
              '<span class="pill ' + statusClass + '">' + statusLabel(task.status) + '</span>' +
              owner +
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
        var remove = '<button class="danger" type="button" data-action="delete" data-task-id="' + id + '">删除</button>';
        if (task.status === 'active') {
          return edit +
            '<button class="quiet" type="button" data-action="pause" data-task-id="' + id + '">暂停</button>' +
            '<button class="danger" type="button" data-action="cancel" data-task-id="' + id + '">取消</button>' +
            remove;
        }
        if (task.status === 'paused') {
          return edit +
            '<button class="primary" type="button" data-action="resume" data-task-id="' + id + '">恢复</button>' +
            '<button class="danger" type="button" data-action="cancel" data-task-id="' + id + '">取消</button>' +
            remove;
        }
        return edit +
          '<button class="quiet" type="button" data-action="resume" data-task-id="' + id + '">重新激活</button>' +
          remove;
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

      function showPanelNotice(element, type, message) {
        if (!element) {
          return;
        }
        element.className = 'notice show ' + type;
        element.textContent = message;
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

export function renderAdminPage(
  options: {
    isAdmin?: boolean;
    userEmail?: string;
    settings?: {
      allowRegistration?: boolean;
      requireInvite?: boolean;
      announcementText?: string;
    };
  } = {}
): Response {
  const isAdmin = options.isAdmin !== false;
  const html = ADMIN_PAGE_HTML.replace(
    "__REMINDER_APP_CONFIG__",
    JSON.stringify({
      isAdmin,
      userEmail: options.userEmail || (isAdmin ? "admin" : "user"),
      taskBasePath: isAdmin ? "/admin/tasks" : "/user/tasks",
      settings: options.settings || {},
    })
  );

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function renderLoginPage(options: {
  settings?: {
    allowRegistration?: boolean;
    requireInvite?: boolean;
    announcementText?: string;
  };
} = {}): Response {
  const html = LOGIN_PAGE_HTML.replace(
    "__REMINDER_LOGIN_CONFIG__",
    JSON.stringify({
      settings: options.settings || {},
    })
  );

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
