import { afterEach, describe, expect, it, vi } from "vitest";
import { matchNotificationChannelTestPath } from "./notificationChannels";
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
  it("does not expose a task or run number in reminder content", () => {
    expect(buildReminderNotificationContent("该喝水了", "reminder")).toBe("该喝水了");
    expect(buildReminderNotificationContent("该喝水了", "nag")).toBe("该喝水了\n\n这是一次追提醒。");
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
