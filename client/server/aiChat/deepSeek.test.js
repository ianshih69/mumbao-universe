import { describe, expect, it } from "vitest";
import {
  buildDeepSeekRequestPayload,
  parseDeepSeekResponseBody,
  runWithFailureStage,
} from "./deepSeek.js";

describe("DeepSeek request and response handling", () => {
  it("disables thinking mode in the provider payload", () => {
    const payload = buildDeepSeekRequestPayload({
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "可以帶狗嗎？" }],
    });

    expect(payload).toMatchObject({
      model: "deepseek-v4-flash",
      stream: false,
      temperature: 0.7,
      max_tokens: 500,
      thinking: { type: "disabled" },
    });
  });

  it("parses non-empty final content", () => {
    const result = parseDeepSeekResponseBody({
      ok: true,
      status: 200,
      body: JSON.stringify({
        choices: [
          {
            message: { content: "可以攜帶狗狗入住。" },
            finish_reason: "stop",
          },
        ],
      }),
    });

    expect(result).toEqual({
      answer: "可以攜帶狗狗入住。",
      finishReason: "stop",
      providerStatus: 200,
    });
  });

  it("classifies empty final content", () => {
    expect(() =>
      parseDeepSeekResponseBody({
        ok: true,
        status: 200,
        body: JSON.stringify({
          choices: [
            {
              message: { content: "" },
              finish_reason: "length",
            },
          ],
        }),
      })
    ).toThrowError(
      expect.objectContaining({
        failureStage: "provider_empty_content",
        finishReason: "length",
      })
    );
  });

  it("classifies an assistant insert failure separately", async () => {
    await expect(
      runWithFailureStage(
        "assistant_insert_failed",
        async () => {
          throw new Error("simulated insert failure");
        },
        { providerStatus: 200, finishReason: "stop" }
      )
    ).rejects.toMatchObject({
      failureStage: "assistant_insert_failed",
      providerStatus: 200,
      finishReason: "stop",
    });
  });
});
