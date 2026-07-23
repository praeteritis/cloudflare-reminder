import { afterEach, describe, expect, it, vi } from "vitest";
import { matchNotificationChannelTestPath } from "./notificationChannels";
import { buildReminderEmailContent } from "./emailDelivery";
import {
  buildChannelRequest,
  buildReminderNotificationContent,
  sendNotificationChannelTest,
  validateProviderResponse,
} from "./notificationDelivery";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("notification channel requests", () => {
  it("only asks for an email reply on confirmation tasks", () => {
    const sentAt = new Date("2026-07-23T01:30:45.000Z");
    expect(buildReminderEmailContent({
      task_type: "scheduled",
      title: "喝水",
      body: "现在喝水",
    }, "run_123", sentAt)).toEqual({
      subject: "喝水",
      text: "现在喝水\n\n发送时间：2026-07-23 09:30:45 GMT+08:00",
    });

    const confirmation = buildReminderEmailContent({
      task_type: "confirmation",
      title: "吃药",
      body: "请确认完成",
    }, "run_123", sentAt);
    expect(confirmation.subject).toContain("[R:run_123]");
    expect(confirmation.text).toContain("回复第一行只写");
    expect(confirmation.text).toContain("发送时间：2026-07-23 09:30:45 GMT+08:00");
  });

  it("does not expose a task or run number in reminder content", () => {
    const sentAt = new Date("2026-07-23T01:30:45.000Z");
    expect(buildReminderNotificationContent("该喝水了", "reminder", sentAt))
      .toBe("该喝水了\n\n发送时间：2026-07-23 09:30:45 GMT+08:00");
    expect(buildReminderNotificationContent("该喝水了", "nag", sentAt))
      .toBe("该喝水了\n\n这是一次追提醒。\n\n发送时间：2026-07-23 09:30:45 GMT+08:00");
  });

  it("builds a signed DingTalk URL from access token and secret", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const request = await buildChannelRequest("dingtalk", { accessToken: "token", secret: "SECsecret" }, "title", "body");
    const url = new URL(request.url);
    expect(url.origin + url.pathname).toBe("https://oapi.dingtalk.com/robot/send");
    expect(url.searchParams.get("access_token")).toBe("token");
    expect(url.searchParams.get("timestamp")).toBe("1700000000000");
    expect(url.searchParams.get("sign")).toBeTruthy();
  });

  it("builds enterprise WeChat and Feishu URLs from keys", async () => {
    const wecom = await buildChannelRequest("wecom", { key: "wx-key" }, "title", "body");
    const feishu = await buildChannelRequest("feishu", { key: "fs-key" }, "title", "body");
    expect(wecom.url).toBe("https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=wx-key");
    expect(feishu.url).toBe("https://open.feishu.cn/open-apis/bot/v2/hook/fs-key");
  });

  it("builds Bark URL from device key", async () => {
    const request = await buildChannelRequest("bark", { deviceKey: "device", group: "reminders" }, "任务", "内容");
    const url = new URL(request.url);
    expect(url.pathname).toContain("/device/");
    expect(url.searchParams.get("group")).toBe("reminders");
    expect(request.method).toBe("GET");
  });

  it("uses a complete PushDeer endpoint without appending any path", async () => {
    const request = await buildChannelRequest("pushdeer", {
      pushKey: "key", endpoint: "https://push.example.com/custom/push",
    }, "title", "body");
    expect(request.url).toBe("https://push.example.com/custom/push");
  });
});

describe("notification channel tests", () => {
  it("matches only the channel test endpoint", () => {
    expect(matchNotificationChannelTestPath("/admin/notification-channels/channel_1/test")).toBe("channel_1");
    expect(matchNotificationChannelTestPath("/admin/notification-channels/channel_1")).toBeNull();
  });

  it("sends a test notification through the saved channel configuration", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ errcode: 0 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendNotificationChannelTest({
      id: "channel_1",
      name: "钉钉值班群",
      type: "dingtalk",
      config_json: JSON.stringify({ accessToken: "token" }),
      enabled: 0,
      created_at_utc: "2026-01-01T00:00:00.000Z",
      updated_at_utc: "2026-01-01T00:00:00.000Z",
    });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(String(init.body)).toContain("测试通知");
  });

  it("returns the provider error when a test notification fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ errcode: 310000, errmsg: "sign not match" }),
      { status: 200 }
    )));

    const result = await sendNotificationChannelTest({
      id: "channel_1",
      name: "DingTalk",
      type: "dingtalk",
      config_json: JSON.stringify({ accessToken: "token" }),
      enabled: 1,
      created_at_utc: "2026-01-01T00:00:00.000Z",
      updated_at_utc: "2026-01-01T00:00:00.000Z",
    });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain("sign not match");
  });
});

describe("notification provider responses", () => {
  it("rejects business errors returned with HTTP 200", () => {
    expect(() => validateProviderResponse("dingtalk", { errcode: 310000, errmsg: "sign not match" }))
      .toThrow("sign not match");
    expect(() => validateProviderResponse("telegram", { ok: false, description: "Unauthorized" }))
      .toThrow();
  });

  it("accepts successful provider payloads", () => {
    expect(() => validateProviderResponse("dingtalk", { errcode: 0 })).not.toThrow();
    expect(() => validateProviderResponse("pushplus", { code: 200 })).not.toThrow();
    expect(() => validateProviderResponse("feishu", { code: 0 })).not.toThrow();
  });
});
