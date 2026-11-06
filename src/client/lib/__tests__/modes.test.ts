/** The composer modes: which models each lists, and which model a mode falls back to. */
import { describe, expect, it } from "vitest";
import { IMAGE_MODELS, VIDEO_MODELS } from "@shared/models";
import { inMode, modelForMode, modelModes } from "../modes";

const listed = <M extends { id: string; hidden?: boolean }>(models: M[]) => models.filter((m) => !m.hidden);
const ids = (models: { id: string }[]) => models.map((m) => m.id);

describe("modelModes", () => {
  it("video: editors edit, upscalers upscale, models that take reference videos create and edit, motion control creates", () => {
    const modes = (id: string) => modelModes(VIDEO_MODELS.find((m) => m.id === id)!);
    expect(modes("fal/wan-2.7-edit")).toEqual(["edit"]);
    expect(modes("topaz/upscale-video")).toEqual(["upscale"]);
    expect(modes("alibaba/wan-3.0-prime")).toEqual(["create", "edit"]);
    expect(modes("bytedance/seedance-2.5")).toEqual(["create", "edit"]);
    expect(modes("google/veo-3.1")).toEqual(["create"]);
    expect(modes("fal/kling-v3-pro-motion-control")).toEqual(["create"]);
  });

  it("image: a model that takes a source image creates and edits; one that only edits is in Edit only", () => {
    const modes = (id: string) => modelModes(IMAGE_MODELS.find((m) => m.id === id)!);
    expect(modes("google/gemini-3-pro-image")).toEqual(["create", "edit"]);
    expect(modes("krea/krea-2-large")).toEqual(["create"]);
    expect(modes("fal/qwen-image-edit-2511")).toEqual(["edit"]);
    expect(modes("recraft/crisp-upscale")).toEqual(["upscale"]);
  });

  it("every listed model is in at least one mode", () => {
    for (const m of [...listed(IMAGE_MODELS), ...listed(VIDEO_MODELS)]) expect(modelModes(m), m.id).not.toEqual([]);
  });

  it("video Edit lists the 8 editors and the 7 models that take reference videos", () => {
    const edit = listed(VIDEO_MODELS).filter((m) => inMode(m, "edit"));
    expect(edit).toHaveLength(15);
    expect(ids(edit.filter((m) => !m.caps.videoEdit))).toEqual(
      expect.arrayContaining(["bytedance/seedance-2.5", "alibaba/wan-3.0", "alibaba/wan-3.0-prime", "fal/kling-v4"]),
    );
  });
});

describe("modelForMode", () => {
  it("keeps a model the mode lists, else falls back to the mode's default", () => {
    expect(modelForMode(VIDEO_MODELS, "edit", "alibaba/wan-3.0")?.id).toBe("alibaba/wan-3.0");
    expect(modelForMode(VIDEO_MODELS, "edit", "google/veo-3.1")?.id).toBe("black-forest-labs/flux-video-edit");
    expect(modelForMode(VIDEO_MODELS, "upscale", undefined)?.id).toBe("topaz/upscale-video");
    expect(modelForMode(IMAGE_MODELS, "edit", "krea/krea-2-large")?.id).toBe("google/gemini-3-pro-image");
  });
});
