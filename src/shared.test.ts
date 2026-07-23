import { describe, expect, it } from "vitest";
import {
  normalizeEmailAddress,
  sameEmailAddress,
  extractRunId,
  getFirstMeaningfulLine,
  addMinutes,
  formatInTimezone,
  makeId,
  safeJsonParse,
  readRequiredString,
  readOptionalString,
  readOptionalStringAllowEmpty,
  readOptionalPositiveInteger,
  readOptionalNonNegativeInteger,
  readOptionalBoolean,
  readOptionalRecord,
  requireRecord,
  readListLimit,
  readPagination,
  makePagedResult,
  hasExplicitTimezone,
  isValidEmail,
  isValidTaskId,
  isTaskStatus,
  countCharacters,
  assertMaxCharacters,
  assertMaxInteger,
  normalizeEmail,
  hashPassword,
  verifyPassword,
  makePasswordSalt,
  signSessionPayload,
  verifySessionSignature,
  readCookie,
  encodeBase64UrlString,
  encodeBase64UrlBytes,
  decodeBase64UrlToString,
  decodeBase64UrlToBytes,
  constantTimeEqual,
  AdminInputError,
  jsonError,
} from "./shared";

describe("Email normalization", () => {
  it("normalizes email address by trimming and lowercasing", () => {
    expect(normalizeEmailAddress("  Test@Example.COM  ")).toBe("test@example.com");
    expect(normalizeEmailAddress("user@domain.com")).toBe("user@domain.com");
  });

  it("compares email addresses ignoring case and whitespace", () => {
    expect(sameEmailAddress("Test@Example.COM", "test@example.com")).toBe(true);
    expect(sameEmailAddress("  user@domain.com  ", "USER@DOMAIN.COM")).toBe(true);
    expect(sameEmailAddress("user1@domain.com", "user2@domain.com")).toBe(false);
  });

  it("normalizes email correctly", () => {
    expect(normalizeEmail("  User@Example.COM  ")).toBe("user@example.com");
    expect(normalizeEmail("TEST@test.com")).toBe("test@test.com");
  });
});

describe("Run ID extraction", () => {
  it("extracts run ID from subject line", () => {
    expect(extractRunId("Re: [R:run_abc123] Your reminder")).toBe("run_abc123");
    expect(extractRunId("[R:run_xyz789] Task reminder")).toBe("run_xyz789");
  });

  it("returns null when no run ID found", () => {
    expect(extractRunId("No run ID here")).toBeNull();
    expect(extractRunId("Random [text] in subject")).toBeNull();
    expect(extractRunId("[run_abc123] without prefix")).toBeNull();
  });
});

describe("Text processing", () => {
  it("gets first meaningful line from text", () => {
    expect(getFirstMeaningfulLine("\n\n  Hello World  \n\nSecond line")).toBe("Hello World");
    expect(getFirstMeaningfulLine("   \r\n   \r\n   First   ")).toBe("First");
    expect(getFirstMeaningfulLine("")).toBe("");
    expect(getFirstMeaningfulLine("   \n   \n   ")).toBe("");
  });

  it("counts characters correctly", () => {
    expect(countCharacters("hello")).toBe(5);
    expect(countCharacters("你好")).toBe(2);
    expect(countCharacters("emoji 😊")).toBe(7);
  });

  it("asserts max characters", () => {
    expect(() => assertMaxCharacters("hello", 10, "Field")).not.toThrow();
    expect(() => assertMaxCharacters("hello world", 5, "Field")).toThrow(AdminInputError);
    expect(() => assertMaxCharacters("hello world", 5, "Field")).toThrow("Field must be 5 characters or fewer");
  });
});

describe("Date and time utilities", () => {
  it("adds minutes to a date", () => {
    const date = new Date("2026-01-01T12:00:00Z");
    const result = addMinutes(date, 30);
    expect(result.toISOString()).toBe("2026-01-01T12:30:00.000Z");
  });

  it("formats date in timezone", () => {
    const date = new Date("2026-01-01T12:00:00Z");
    const formatted = formatInTimezone(date, "America/New_York");
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("detects explicit timezone in date string", () => {
    expect(hasExplicitTimezone("2026-01-01T12:00:00Z")).toBe(true);
    expect(hasExplicitTimezone("2026-01-01T12:00:00+08:00")).toBe(true);
    expect(hasExplicitTimezone("2026-01-01T12:00:00-05:00")).toBe(true);
    expect(hasExplicitTimezone("2026-01-01T12:00:00")).toBe(false);
  });
});

describe("ID generation", () => {
  it("generates ID with prefix", () => {
    const id1 = makeId("test");
    const id2 = makeId("test");
    expect(id1).toMatch(/^test_[a-f0-9]{16}$/);
    expect(id2).toMatch(/^test_[a-f0-9]{16}$/);
    expect(id1).not.toBe(id2);
  });
});

describe("JSON parsing", () => {
  it("safely parses valid JSON", () => {
    expect(safeJsonParse('{"key": "value"}')).toEqual({ key: "value" });
    expect(safeJsonParse("[1, 2, 3]")).toEqual([1, 2, 3]);
  });

  it("returns null for invalid JSON", () => {
    expect(safeJsonParse("not json")).toBeNull();
    expect(safeJsonParse("{invalid}")).toBeNull();
  });
});

describe("Input validation - strings", () => {
  it("reads required string", () => {
    expect(readRequiredString({ name: "John" }, ["name"], "Name")).toBe("John");
    expect(readRequiredString({ name: "  John  " }, ["name"], "Name")).toBe("John");
  });

  it("throws when required string is missing", () => {
    expect(() => readRequiredString({}, ["name"], "Name")).toThrow("Name is required");
    expect(() => readRequiredString({ name: "" }, ["name"], "Name")).toThrow("Name is required");
    expect(() => readRequiredString({ name: "   " }, ["name"], "Name")).toThrow("Name is required");
  });

  it("reads optional string", () => {
    expect(readOptionalString({ name: "John" }, ["name"])).toBe("John");
    expect(readOptionalString({ name: "  John  " }, ["name"])).toBe("John");
    expect(readOptionalString({}, ["name"])).toBeNull();
    expect(readOptionalString({ name: "" }, ["name"])).toBeNull();
    expect(readOptionalString({ name: "   " }, ["name"])).toBeNull();
  });

  it("reads optional string allowing empty", () => {
    expect(readOptionalStringAllowEmpty({ text: "" }, ["text"])).toBe("");
    expect(readOptionalStringAllowEmpty({ text: "  hello  " }, ["text"])).toBe("hello");
    expect(readOptionalStringAllowEmpty({}, ["text"])).toBeNull();
  });

  it("throws when string field is not a string", () => {
    expect(() => readOptionalString({ name: 123 }, ["name"])).toThrow("name must be a string");
    expect(() => readOptionalString({ name: true }, ["name"])).toThrow("name must be a string");
  });
});

describe("Input validation - integers", () => {
  it("reads optional positive integer", () => {
    expect(readOptionalPositiveInteger({ count: 5 }, ["count"], "Count")).toBe(5);
    expect(readOptionalPositiveInteger({ count: "10" }, ["count"], "Count")).toBe(10);
    expect(readOptionalPositiveInteger({}, ["count"], "Count")).toBeNull();
  });

  it("throws for invalid positive integer", () => {
    expect(() => readOptionalPositiveInteger({ count: 0 }, ["count"], "Count")).toThrow("Count must be a positive integer");
    expect(() => readOptionalPositiveInteger({ count: -5 }, ["count"], "Count")).toThrow("Count must be a positive integer");
    expect(() => readOptionalPositiveInteger({ count: 3.14 }, ["count"], "Count")).toThrow("Count must be a positive integer");
  });

  it("reads optional non-negative integer", () => {
    expect(readOptionalNonNegativeInteger({ count: 0 }, ["count"], "Count")).toBe(0);
    expect(readOptionalNonNegativeInteger({ count: 5 }, ["count"], "Count")).toBe(5);
    expect(readOptionalNonNegativeInteger({ count: "10" }, ["count"], "Count")).toBe(10);
    expect(readOptionalNonNegativeInteger({}, ["count"], "Count")).toBeNull();
  });

  it("throws for invalid non-negative integer", () => {
    expect(() => readOptionalNonNegativeInteger({ count: -1 }, ["count"], "Count")).toThrow("Count must be a non-negative integer");
    expect(() => readOptionalNonNegativeInteger({ count: 3.14 }, ["count"], "Count")).toThrow("Count must be a non-negative integer");
  });

  it("asserts max integer value", () => {
    expect(() => assertMaxInteger(50, 100, "Value")).not.toThrow();
    expect(() => assertMaxInteger(150, 100, "Value")).toThrow(AdminInputError);
    expect(() => assertMaxInteger(150, 100, "Value")).toThrow("Value must be 100 or less");
  });
});

describe("Input validation - boolean and record", () => {
  it("reads optional boolean", () => {
    expect(readOptionalBoolean({ flag: true }, ["flag"])).toBe(true);
    expect(readOptionalBoolean({ flag: false }, ["flag"])).toBe(false);
    expect(readOptionalBoolean({}, ["flag"])).toBeNull();
  });

  it("throws when boolean is not boolean type", () => {
    expect(() => readOptionalBoolean({ flag: "true" }, ["flag"])).toThrow("flag must be a boolean");
    expect(() => readOptionalBoolean({ flag: 1 }, ["flag"])).toThrow("flag must be a boolean");
  });

  it("reads optional record", () => {
    const record = { nested: { key: "value" } };
    expect(readOptionalRecord(record, ["nested"])).toEqual({ key: "value" });
    expect(readOptionalRecord({}, ["nested"])).toBeNull();
  });

  it("requires record to be an object", () => {
    expect(() => requireRecord({ key: "value" }, "Data")).not.toThrow();
    expect(() => requireRecord(null, "Data")).toThrow("Data must be an object");
    expect(() => requireRecord([1, 2, 3], "Data")).toThrow("Data must be an object");
    expect(() => requireRecord("string", "Data")).toThrow("Data must be an object");
  });
});

describe("Pagination", () => {
  it("reads list limit", () => {
    expect(readListLimit("10")).toBe(10);
    expect(readListLimit("200")).toBe(100); // MAX_LIST_LIMIT is 100
    expect(readListLimit(null)).toBe(50);
  });

  it("throws for invalid list limit", () => {
    expect(() => readListLimit("0")).toThrow("limit must be a positive integer");
    expect(() => readListLimit("-5")).toThrow("limit must be a positive integer");
    expect(() => readListLimit("abc")).toThrow("limit must be a positive integer");
  });

  it("reads pagination from URL", () => {
    const url = new URL("http://example.com?page=2&pageSize=25");
    const pagination = readPagination(url);
    expect(pagination).toEqual({ page: 2, pageSize: 25, offset: 25 });
  });

  it("uses defaults for pagination", () => {
    const url = new URL("http://example.com");
    const pagination = readPagination(url);
    expect(pagination).toEqual({ page: 1, pageSize: 20, offset: 0 });
  });

  it("caps page size at MAX_LIST_LIMIT", () => {
    const url = new URL("http://example.com?page=1&pageSize=200");
    const pagination = readPagination(url);
    expect(pagination.pageSize).toBe(100);
  });

  it("makes paged result", () => {
    const items = [1, 2, 3];
    const pagination = { page: 2, pageSize: 3, offset: 3 };
    const result = makePagedResult(items, pagination, 10);

    expect(result).toEqual({
      items: [1, 2, 3],
      page: 2,
      pageSize: 3,
      total: 10,
      totalPages: 4,
      hasPrev: true,
      hasNext: true,
    });
  });
});

describe("Email validation", () => {
  it("validates correct email addresses", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("test.user@example.co.uk")).toBe(true);
    expect(isValidEmail("user+tag@example.com")).toBe(true);
  });

  it("rejects invalid email addresses", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("notanemail")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
    expect(isValidEmail("user@domain")).toBe(false);
    expect(isValidEmail("user..name@example.com")).toBe(false);
    expect(isValidEmail("user@domain..com")).toBe(false);
  });
});

describe("Task ID validation", () => {
  it("validates correct task IDs", () => {
    expect(isValidTaskId("task_123")).toBe(true);
    expect(isValidTaskId("abc-def_123")).toBe(true);
  });

  it("rejects invalid task IDs", () => {
    expect(isValidTaskId("ab")).toBe(false); // too short
    expect(isValidTaskId("a".repeat(81))).toBe(false); // too long
    expect(isValidTaskId("task@123")).toBe(false); // invalid char
    expect(isValidTaskId("task 123")).toBe(false); // space
  });
});

describe("Task status validation", () => {
  it("validates task status", () => {
    expect(isTaskStatus("active")).toBe(true);
    expect(isTaskStatus("done")).toBe(true);
    expect(isTaskStatus("paused")).toBe(true);
    expect(isTaskStatus("cancelled")).toBe(true);
    expect(isTaskStatus("invalid")).toBe(false);
    expect(isTaskStatus("")).toBe(false);
  });
});

describe("Password hashing and verification", () => {
  it("hashes password with generated salt", async () => {
    const result = await hashPassword("mypassword");
    expect(result.password_hash).toBeTruthy();
    expect(result.password_salt).toBeTruthy();
    expect(result.password_hash.length).toBeGreaterThan(20);
  });

  it("generates unique salt each time", () => {
    const salt1 = makePasswordSalt();
    const salt2 = makePasswordSalt();
    expect(salt1).not.toBe(salt2);
    expect(salt1.length).toBeGreaterThan(10);
  });

  it("verifies correct password", async () => {
    const password = "testpassword123";
    const { password_hash, password_salt } = await hashPassword(password);
    const isValid = await verifyPassword(password, password_salt, password_hash);
    expect(isValid).toBe(true);
  });

  it("rejects incorrect password", async () => {
    const { password_hash, password_salt } = await hashPassword("correct");
    const isValid = await verifyPassword("wrong", password_salt, password_hash);
    expect(isValid).toBe(false);
  });
});

describe("Session signing and verification", () => {
  it("signs and verifies session payload", async () => {
    const secret = "my-secret-key";
    const payload = "user_data";
    const signature = await signSessionPayload(secret, payload);
    const isValid = await verifySessionSignature(secret, payload, signature);
    expect(isValid).toBe(true);
  });

  it("rejects tampered signature", async () => {
    const secret = "my-secret-key";
    const payload = "user_data";
    const signature = await signSessionPayload(secret, payload);
    const isValid = await verifySessionSignature(secret, "tampered_data", signature);
    expect(isValid).toBe(false);
  });

  it("rejects wrong secret", async () => {
    const payload = "user_data";
    const signature = await signSessionPayload("secret1", payload);
    const isValid = await verifySessionSignature("secret2", payload, signature);
    expect(isValid).toBe(false);
  });
});

describe("Cookie reading", () => {
  it("reads cookie from request", () => {
    const request = new Request("http://example.com", {
      headers: { Cookie: "session=abc123; other=value" },
    });
    expect(readCookie(request, "session")).toBe("abc123");
    expect(readCookie(request, "other")).toBe("value");
  });

  it("returns null for missing cookie", () => {
    const request = new Request("http://example.com", {
      headers: { Cookie: "session=abc123" },
    });
    expect(readCookie(request, "missing")).toBeNull();
  });

  it("handles empty cookie header", () => {
    const request = new Request("http://example.com");
    expect(readCookie(request, "session")).toBeNull();
  });
});

describe("Base64 URL encoding", () => {
  it("encodes and decodes strings", () => {
    const original = "Hello World!";
    const encoded = encodeBase64UrlString(original);
    const decoded = decodeBase64UrlToString(encoded);
    expect(decoded).toBe(original);
  });

  it("encodes and decodes bytes", () => {
    const original = new Uint8Array([1, 2, 3, 4, 5]);
    const encoded = encodeBase64UrlBytes(original);
    const decoded = decodeBase64UrlToBytes(encoded);
    expect(decoded).toEqual(original);
  });

  it("produces URL-safe encoding", () => {
    const encoded = encodeBase64UrlString("test+data/with=padding");
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
  });
});

describe("Constant time comparison", () => {
  it("returns true for equal strings", () => {
    expect(constantTimeEqual("hello", "hello")).toBe(true);
    expect(constantTimeEqual("", "")).toBe(true);
  });

  it("returns false for different strings", () => {
    expect(constantTimeEqual("hello", "world")).toBe(false);
    expect(constantTimeEqual("hello", "hello2")).toBe(false);
    expect(constantTimeEqual("hello", "")).toBe(false);
  });
});

describe("Error handling", () => {
  it("creates AdminInputError with status", () => {
    const error = new AdminInputError("Invalid input", 422);
    expect(error.message).toBe("Invalid input");
    expect(error.status).toBe(422);
  });

  it("creates AdminInputError with default status", () => {
    const error = new AdminInputError("Bad request");
    expect(error.status).toBe(400);
  });

  it("converts AdminInputError to JSON response", () => {
    const error = new AdminInputError("Invalid input", 422);
    const response = jsonError(error);
    expect(response.status).toBe(422);
  });

  it("converts generic Error to JSON response", () => {
    const error = new Error("Something went wrong");
    const response = jsonError(error);
    expect(response.status).toBe(500);
  });

  it("converts unknown error to JSON response", () => {
    const response = jsonError("String error");
    expect(response.status).toBe(500);
  });
});
