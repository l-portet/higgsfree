import { describe, expect, it } from "vitest";
import { DEFAULT_HOST, parseDotenv, parseHost } from "../env.ts";

describe("parseDotenv", () => {
  it("parses keys, quotes, comments and export prefixes", () => {
    const parsed = parseDotenv(`
# comment
OPENROUTER_API_KEY=sk-or-v1-abc
PORT = 9000
export APP_NAME="Open Higgsfield"
APP_URL='http://localhost:8787' # trailing
EMPTY=
MULTI="a\\nb"
INLINE=value # comment
`);
    expect(parsed).toEqual({
      OPENROUTER_API_KEY: "sk-or-v1-abc",
      PORT: "9000",
      APP_NAME: "Open Higgsfield",
      APP_URL: "http://localhost:8787",
      EMPTY: "",
      MULTI: "a\nb",
      INLINE: "value",
    });
  });
});

describe("parseHost", () => {
  it("defaults to loopback when HOST is unset or blank", () => {
    expect(DEFAULT_HOST).toBe("127.0.0.1");
    expect(parseHost(undefined)).toBe("127.0.0.1");
    expect(parseHost("")).toBe("127.0.0.1");
    expect(parseHost("   ")).toBe("127.0.0.1");
  });

  it("returns the trimmed value and unwraps bracketed IPv6 literals", () => {
    expect(parseHost("0.0.0.0")).toBe("0.0.0.0");
    expect(parseHost("  192.168.1.20 ")).toBe("192.168.1.20");
    expect(parseHost("[::1]")).toBe("::1");
    expect(parseHost("::")).toBe("::");
    expect(parseHost("[]")).toBe("127.0.0.1");
  });

  it("honours a custom fallback", () => {
    expect(parseHost(undefined, "0.0.0.0")).toBe("0.0.0.0");
  });
});
