/** The AI Prompt Editor: request bodies, output cleanup, the streamed chat client, and the two API calls. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/api";
import { chatText } from "@/lib/openrouter";
import { buildPreviewBody, buildRewriteBody, cleanRewrite, DEFAULT_INSTRUCTION, PREVIEW_IMAGE_MODEL, PROMPT_EDITOR_MODEL, previewAspect, REWRITE_SYSTEM_PROMPT } from "@/lib/prompt-editor";
import { setStoredKey } from "@/lib/settings";
import { PNG_2X2, PNG_BASE64 } from "../../__tests__/mock-openrouter";

/** A `text/event-stream` response whose body arrives in the given pieces (split anywhere, like the network does). */
function sse(pieces: string[], status = 200): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const p of pieces) c.enqueue(enc.encode(p));
      c.close();
    },
  });
  return new Response(stream, { status, headers: { "content-type": "text/event-stream" } });
}
const chunk = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

interface Call {
  url: string;
  body: Record<string, unknown>;
  auth: string | null;
}
function stubFetch(reply: (call: Call) => Response): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = { url: new URL(String(input)).pathname, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>, auth: new Headers(init?.headers).get("authorization") };
    calls.push(call);
    return reply(call);
  });
  return calls;
}

const body = buildRewriteBody("a cat on a roof", "more cinematic", { modelName: "Seedance 2.5", duration: 5, aspectRatio: "16:9", startsFromImage: true });

describe("request bodies", () => {
  it("asks the latest fast GPT for a streamed rewrite with the run's context, low reasoning and the cost", () => {
    expect(body).toMatchObject({ model: "openai/gpt-6-luna", stream: true, reasoning: { effort: "low", exclude: true }, usage: { include: true } });
    expect(body.max_tokens).toBeGreaterThan(500);
    expect(body.messages[0]).toEqual({ role: "system", content: REWRITE_SYSTEM_PROMPT });
    const user = body.messages[1]?.content ?? "";
    expect(user).toContain("Video: Seedance 2.5 · 5 s · 16:9 · starts from an attached image (first frame)");
    expect(user).toContain('"""\na cat on a roof\n"""');
    expect(user).toContain("Instruction: more cinematic");
    const fresh = buildRewriteBody("  ", "", { motionControl: true, duration: 5 }).messages[1]?.content ?? "";
    expect(fresh).toContain("Current prompt: (empty");
    expect(fresh).toContain(`Instruction: ${DEFAULT_INSTRUCTION}`);
    expect(fresh).toContain("motion control");
    expect(fresh).not.toContain("5 s");
  });

  it("previews with the latest fast GPT Image at low quality, the video's ratio, and the first frame as a reference", () => {
    expect(PROMPT_EDITOR_MODEL.id).toBe("openai/gpt-6-luna");
    expect(PREVIEW_IMAGE_MODEL.id).toBe("openai/gpt-image-2.5-flare");
    const p = buildPreviewBody(" neon market ", "16:9");
    expect(p).toMatchObject({ model: "openai/gpt-image-2.5-flare", aspect_ratio: "16:9", quality: "low" });
    expect(p.prompt.endsWith("\n\nneon market")).toBe(true);
    expect(p).not.toHaveProperty("input_references");
    expect(buildPreviewBody("x", "9:16", "data:image/png;base64,AA").input_references).toEqual([{ type: "image_url", image_url: { url: "data:image/png;base64,AA" } }]);
    expect(previewAspect("16:9")).toBe("16:9");
    expect(previewAspect("9:21")).toBe("9:16");
    expect(previewAspect(undefined)).toBe("16:9");
  });

  it("takes fences, labels and wrapping quotes off the reply", () => {
    expect(cleanRewrite('  "A slow dolly shot."  ')).toBe("A slow dolly shot.");
    expect(cleanRewrite("```\nA slow dolly shot.\n```")).toBe("A slow dolly shot.");
    expect(cleanRewrite("**Prompt:** A slow dolly shot.")).toBe("A slow dolly shot.");
    expect(cleanRewrite("“A slow dolly shot.”")).toBe("A slow dolly shot.");
    expect(cleanRewrite('He says "hi" and waves')).toBe('He says "hi" and waves');
  });
});

describe("chatText (streamed)", () => {
  it("assembles deltas split across chunks, skips keep-alive comments, and reads the cost from the last chunk", async () => {
    const calls = stubFetch(() =>
      sse([": OPENROUTER PROCESSING\n\n", chunk("A slow ").slice(0, 25), chunk("A slow ").slice(25), chunk("dolly shot."), `data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { cost: 0.00021 } })}\n\n`, "data: [DONE]\n\n"]),
    );
    const seen: string[] = [];
    const res = await chatText("k", body, { onText: (t) => seen.push(t) });
    expect(res).toEqual({ text: "A slow dolly shot.", costUsd: 0.00021 });
    expect(seen).toEqual(["A slow ", "A slow dolly shot."]);
    expect(calls[0]).toMatchObject({ url: "/api/v1/chat/completions", auth: "Bearer k" });
  });

  it("turns an error chunk mid-stream into a 502 with OpenRouter's message, and a 401 into the key message", async () => {
    stubFetch(() => sse([chunk("A slow"), `data: ${JSON.stringify({ error: { message: "Provider overloaded", code: 502 } })}\n\n`]));
    await expect(chatText("k", body)).rejects.toMatchObject({ status: 502, error: "Provider overloaded" });
    stubFetch(() => json(401, { error: { message: "User not found.", code: 401 } }));
    await expect(chatText("k", body)).rejects.toMatchObject({ status: 401 });
    stubFetch(() => json(400, { error: { message: "reasoning.effort must be one of low, medium, high" } }));
    await expect(chatText("k", body)).rejects.toMatchObject({ status: 400, error: "reasoning.effort must be one of low, medium, high" });
  });

  it("reads a reply that was not streamed (a buffering proxy) whole", async () => {
    stubFetch(() => json(200, { choices: [{ message: { content: "A slow dolly shot." } }], usage: { cost: 0.0002 } }));
    expect(await chatText("k", body)).toEqual({ text: "A slow dolly shot.", costUsd: 0.0002 });
  });
});

describe("api", () => {
  beforeEach(() => setStoredKey("test-key"));

  it("rewrites a prompt (cleaned, streamed through onText) and needs a key", async () => {
    stubFetch(() => sse([chunk('"A cat leaps'), chunk(' across rooftops at dusk."'), "data: [DONE]\n\n"]));
    const seen: string[] = [];
    const res = await api.rewriteVideoPrompt({ prompt: "cat roof", instruction: "" }, { onText: (t) => seen.push(t) });
    expect(res).toEqual({ prompt: "A cat leaps across rooftops at dusk." });
    expect(seen.at(-1)).toBe("A cat leaps across rooftops at dusk.");
    stubFetch(() => sse(["data: [DONE]\n\n"]));
    await expect(api.rewriteVideoPrompt({ prompt: "x", instruction: "" })).rejects.toMatchObject({ status: 502 });
    setStoredKey("");
    await expect(api.rewriteVideoPrompt({ prompt: "x", instruction: "" })).rejects.toMatchObject({ status: 401 });
  });

  it("previews a frame through the native images API, with the attached first frame, and returns a data URL", async () => {
    const frame = (await api.upload(new Blob([PNG_2X2], { type: "image/png" }))).media.id;
    const calls = stubFetch(() => json(200, { data: [{ b64_json: PNG_BASE64, media_type: "image/png" }], usage: { cost: 0.006 } }));
    const res = await api.previewVideoFrame({ prompt: "neon market", aspectRatio: "9:21", firstFrame: frame });
    expect(res).toEqual({ dataUrl: `data:image/png;base64,${PNG_BASE64}`, costUsd: 0.006 });
    expect(calls[0]?.url).toBe("/api/v1/images");
    expect(calls[0]?.body).toMatchObject({ model: "openai/gpt-image-2.5-flare", aspect_ratio: "9:16", quality: "low" });
    expect((calls[0]?.body.input_references as { image_url: { url: string } }[])[0]?.image_url.url).toBe(`data:image/png;base64,${PNG_BASE64}`);
    await expect(api.previewVideoFrame({ prompt: "  " })).rejects.toMatchObject({ status: 400 });
    stubFetch(() => json(200, { data: [{ b64_json: btoa("not an image") }] }));
    await expect(api.previewVideoFrame({ prompt: "x" })).rejects.toMatchObject({ status: 502 });
  });
});
