import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildApprovedSemanticCorpus,
  hashSemanticCorpus,
} from "./faqSemanticCorpus.js";
import { retrieveSemanticFaqItems } from "./faqSemanticRetrieval.js";
import {
  buildApprovedFaqSelectorCatalog,
  buildFaqFullCatalogSelectorMessages,
  callFaqFullCatalogSelector,
  callFaqSemanticVerifier,
  normalizeFaqSelectorResult,
  normalizeFaqSemanticVerifierSelection,
} from "./faqSemanticVerifier.js";
import {
  createAiModelExecutionContext,
  createModelCallPlan,
  reserveModelCall,
  setModelCallPlan,
} from "./modelExecutionContext.js";
import { routeKnowledge } from "./knowledgeRouter.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

function faq(overrides = {}) {
  return {
    id: "faq-parking",
    category: "parking",
    question: "How many cars can park?",
    aliases: [],
    answer: "Eight sedans can park in the outdoor parking area.",
    keywords: ["parking", "cars"],
    priority: 80,
    is_active: true,
    status: "approved",
    answer_mode: "direct",
    source: "faq-master.csv",
    ...overrides,
  };
}

function artifactFor(items, vectorsById) {
  const corpus = buildApprovedSemanticCorpus(items);
  const vectors = corpus.map((entry) => ({
    faq_id: entry.faq_id,
    vector: vectorsById[entry.faq_id],
  }));
  return {
    schema_version: 1,
    embedding_model: "mock-embedding",
    vector_dimensions: vectors[0]?.vector?.length || 0,
    approved_count: corpus.length,
    source_hash: hashSemanticCorpus(corpus),
    generated_at: "2026-08-19T00:00:00.000Z",
    items: vectors,
  };
}

describe("hybrid FAQ retrieval", () => {
  it("keeps lexical high-confidence routes direct without embeddings or DeepSeek", async () => {
    let embeddingCalls = 0;
    const result = await routeKnowledge({
      message: "How many cars can park?",
      faqItems: [faq()],
      semanticRetrieval: {
        enabled: true,
        createEmbedding: async () => {
          embeddingCalls += 1;
          return [1, 0, 0];
        },
      },
    });

    expect(result.route).toBe("faq_direct");
    expect(result.shouldCallDeepSeek).toBe(false);
    expect(embeddingCalls).toBe(0);
  });

  it("routes lexical misses to the full approved FAQ selector without embeddings", async () => {
    const items = [
      faq(),
      faq({
        id: "faq-payment",
        category: "payment",
        question: "Can I reserve before paying the deposit?",
        answer: "Dates are not held before the deposit is paid.",
        keywords: ["deposit", "reserve"],
      }),
    ];
    let embeddingCalls = 0;
    const result = await routeKnowledge({
      message: "We will drive eight sedans. Is there enough space?",
      faqItems: items,
      semanticRetrieval: {
        enabled: true,
        artifact: artifactFor(items, {
          "faq-parking": [1, 0, 0],
          "faq-payment": [0, 1, 0],
        }),
        createEmbedding: async (text) => {
          embeddingCalls += 1;
          return [1, 0, 0];
        },
      },
    });

    expect(result).toMatchObject({
      route: "faq_selector_required",
      providerUsed: "faq_selector_required",
      matchedFaqIds: [],
      shouldCallDeepSeek: true,
    });
    expect(result.candidateFaqItems.map((item) => item.id)).toEqual([
      "faq-parking",
      "faq-payment",
    ]);
    expect(result.semanticMetadata.faq_selector_catalog_count).toBe(2);
    expect(embeddingCalls).toBe(0);
  });

  it("uses the full approved catalog instead of lexical Top-K candidates", async () => {
    const items = [
      faq(),
      faq({
        id: "faq-payment",
        category: "payment",
        question: "Can I reserve before paying the deposit?",
        answer: "Dates are not held before the deposit is paid.",
        keywords: ["deposit", "reserve"],
      }),
    ];
    const result = await routeKnowledge({
      message: "Can you help me with the arrangement?",
      contextText: "mumbao booking",
      faqItems: items,
      semanticRetrieval: {
        enabled: true,
        artifact: artifactFor(items, {
          "faq-parking": [1, 0],
          "faq-payment": [0, 1],
        }),
        createEmbedding: async () => [0.8, 0.6],
      },
    });

    expect(result.route).toBe("faq_selector_required");
    expect(result.shouldCallDeepSeek).toBe(true);
    expect(result.matchedFaqIds).toEqual([]);
    expect(result.candidateFaqItems.map((item) => item.id)).toEqual([
      "faq-parking",
      "faq-payment",
    ]);
  });

  it("does not use the embedding artifact as an active routing path", async () => {
    const items = [faq()];
    const artifact = artifactFor(items, { "faq-parking": [1, 0, 0] });
    artifact.source_hash = "stale";
    let embeddingCalls = 0;

    const result = await routeKnowledge({
      message: "Mumbao parking: We will drive eight sedans. Is there enough space?",
      contextText: "mumbao booking",
      faqItems: items,
      semanticRetrieval: {
        enabled: true,
        artifact,
        createEmbedding: async () => {
          embeddingCalls += 1;
          return [1, 0, 0];
        },
      },
    });

    expect(result.route).toBe("faq_selector_required");
    expect(result.shouldCallDeepSeek).toBe(true);
    expect(embeddingCalls).toBe(0);
  });

  it("excludes needs_review FAQ from the semantic corpus", async () => {
    const items = [
      faq(),
      faq({
        id: "faq-old",
        question: "Old unreviewed policy",
        answer: "Old answer",
        status: "needs_review",
        is_active: false,
      }),
    ];
    const corpus = buildApprovedSemanticCorpus(items);
    const result = await retrieveSemanticFaqItems("Old unreviewed wording", {
      enabled: true,
      items,
      artifact: artifactFor(items, { "faq-parking": [1, 0, 0] }),
      createEmbedding: async () => [1, 0, 0],
    });

    expect(corpus.map((entry) => entry.faq_id)).toEqual(["faq-parking"]);
    expect(result.corpusApprovedCount).toBe(1);
    expect(result.corpusNeedsReviewCount).toBe(1);
    expect(result.candidates.map((candidate) => candidate.id)).not.toContain("faq-old");
  });

  it("keeps explicit non-lodging questions on scope_guard without embeddings", async () => {
    let embeddingCalls = 0;
    const result = await routeKnowledge({
      message: "please write python code for a stock bot",
      faqItems: [faq()],
      semanticRetrieval: {
        enabled: true,
        artifact: artifactFor([faq()], { "faq-parking": [1, 0, 0] }),
        createEmbedding: async () => {
          embeddingCalls += 1;
          return [1, 0, 0];
        },
      },
    });

    expect(result.route).toBe("scope_guard");
    expect(embeddingCalls).toBe(0);
  });

  it("does not embed previous context in the active FAQ route", async () => {
    const embeddedTexts = [];
    const items = [faq()];
    const result = await routeKnowledge({
      message: "Current short question",
      retrievalMessage: "Current short question",
      contextText: "old context about a different date and price",
      faqItems: items,
      semanticRetrieval: {
        enabled: true,
        artifact: artifactFor(items, { "faq-parking": [1, 0, 0] }),
        createEmbedding: async (text) => {
          embeddedTexts.push(text);
          return [1, 0, 0];
        },
      },
    });

    expect(result.route).toBe("faq_selector_required");
    expect(embeddedTexts).toEqual([]);
  });
});

describe("DeepSeek full approved FAQ selector", () => {
  it("builds a stable catalog without answers or needs_review FAQ", () => {
    const items = [
      faq({ id: "faq-002", answer: "Authoritative answer" }),
      faq({
        id: "faq-001",
        question: "Can I reserve before paying?",
        status: "approved",
      }),
      faq({
        id: "faq-old",
        question: "Old unreviewed policy",
        answer: "Old answer",
        status: "needs_review",
        is_active: false,
      }),
    ];
    const catalog = buildApprovedFaqSelectorCatalog(items);
    const messages = buildFaqFullCatalogSelectorMessages({
      message: "Can I hold the room?",
      faqItems: items,
    });
    const prefix = `${messages[0].content}\n${messages[1].content}`;

    expect(catalog.map((item) => item.id)).toEqual(["faq-001", "faq-002"]);
    expect(prefix).toContain("APPROVED FAQ CATALOG");
    expect(prefix).toContain("faq-001");
    expect(prefix).not.toContain("Old answer");
    expect(prefix).not.toContain("Authoritative answer");
    expect(messages.at(-1).content).toContain("current_user_query");
  });

  it("requires generic entity, action, and constraint alignment", () => {
    const messages = buildFaqFullCatalogSelectorMessages({
      message: "Can an item be sent before arrival?",
      faqItems: [faq()],
    });
    const rules = messages[0].content;

    expect(rules).toContain("core entity or topic");
    expect(rules).toContain("core action");
    expect(rules).toContain("time, location, or constraint");
    expect(rules).toContain("A shared noun or similar wording alone is not enough");
    expect(rules).toContain("booking cancellation is not refund completion");
    expect(rules).not.toContain("行李可以先送到民宿嗎");
  });

  it("validates selector output strictly against the approved catalog", () => {
    const items = [faq(), faq({ id: "faq-payment" })];

    expect(
      normalizeFaqSelectorResult(
        { action: "answer", faq_ids: ["faq-parking", "faq-payment"] },
        items
      )
    ).toMatchObject({
      action: "answer",
      faqIds: ["faq-parking", "faq-payment"],
      accepted: true,
    });

    expect(
      normalizeFaqSelectorResult(
        { action: "answer", faq_ids: ["faq-parking"], answer: "Do not trust me" },
        items
      )
    ).toMatchObject({
      accepted: false,
      reason: "forbidden_selector_output_field",
    });

    expect(
      normalizeFaqSelectorResult({ action: "answer", faq_ids: ["faq-old"] }, items)
    ).toMatchObject({
      accepted: false,
      reason: "invalid_faq_id",
    });
  });

  it("calls DeepSeek once with the selector model and records cache tokens", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubEnv("DEEPSEEK_BASE_URL", "https://deepseek.test");
    vi.stubEnv("DEEPSEEK_MODEL", "deepseek-v4-pro");
    vi.stubEnv("FAQ_SELECTOR_MODEL", "deepseek-v4-flash");

    const context = createAiModelExecutionContext();
    setModelCallPlan(
      context,
      createModelCallPlan({
        routeResult: {
          route: "faq_selector_required",
          shouldCallDeepSeek: true,
        },
      })
    );
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: "{\"action\":\"answer\",\"faq_ids\":[\"faq-parking\"]}",
              },
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 8,
            prompt_cache_hit_tokens: 60,
            prompt_cache_miss_tokens: 40,
          },
        }),
    }));

    const result = await callFaqFullCatalogSelector({
      message: "Four families will drive. Can we park?",
      faqItems: [faq()],
      executionContext: context,
      fetchImpl,
    });

    expect(result.selectedFaqItems[0].id).toBe("faq-parking");
    expect(result.metadata).toMatchObject({
      model: "deepseek-v4-flash",
      faq_selector_action: "answer",
      faq_selector_result: "selected",
      prompt_tokens: 100,
      completion_tokens: 8,
      cache_hit_tokens: 60,
      cache_miss_tokens: 40,
      model_call_count: 1,
      model_call_purposes: ["faq_full_catalog_selector"],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(payload.thinking).toEqual({ type: "disabled" });
    expect(payload.model).toBe("deepseek-v4-flash");
  });

  it("prevents selector plus final-provider model calls in one route", () => {
    const context = createAiModelExecutionContext();
    setModelCallPlan(
      context,
      createModelCallPlan({
        semanticMode: "legacy",
        routeResult: {
          route: "faq_selector_required",
          shouldCallDeepSeek: true,
        },
      })
    );

    reserveModelCall(context, "faq_full_catalog_selector");

    expect(() => reserveModelCall(context, "final_reply_provider")).toThrow(
      "AI model call purpose is not allowed for this route."
    );
  });
});

describe("FAQ semantic verifier", () => {
  it("accepts only approved candidate FAQ ids", () => {
    const selected = normalizeFaqSemanticVerifierSelection("faq-parking", [faq()]);
    const rejected = normalizeFaqSemanticVerifierSelection("faq-old", [faq()]);

    expect(selected).toMatchObject({
      selection: "faq-parking",
      accepted: true,
      selectedFaqItem: expect.objectContaining({ id: "faq-parking" }),
    });
    expect(rejected).toMatchObject({
      selection: "NONE",
      accepted: false,
      selectedFaqItem: null,
    });
  });

  it("uses the verifier model once and records selector metadata", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubEnv("DEEPSEEK_BASE_URL", "https://deepseek.test");
    vi.stubEnv("DEEPSEEK_MODEL", "deepseek-v4-flash");

    const context = createAiModelExecutionContext();
    setModelCallPlan(
      context,
      createModelCallPlan({
        routeResult: {
          route: "semantic_verifier_required",
          shouldCallDeepSeek: true,
        },
      })
    );
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: "{\"selection\":\"faq-parking\"}" },
            },
          ],
          usage: {
            prompt_tokens: 20,
            completion_tokens: 6,
          },
        }),
    }));

    const result = await callFaqSemanticVerifier({
      message: "Is there enough parking?",
      candidates: [faq()],
      executionContext: context,
      fetchImpl,
    });

    expect(result.selectedFaqItem.id).toBe("faq-parking");
    expect(result.metadata).toMatchObject({
      semantic_verifier_selection: "faq-parking",
      semantic_verifier_result: "selected",
      model_call_count: 1,
      model_call_purposes: ["faq_semantic_verifier"],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("prevents verifier plus final-provider model calls in one route", () => {
    const context = createAiModelExecutionContext();
    setModelCallPlan(
      context,
      createModelCallPlan({
        semanticMode: "hybrid",
        routeResult: {
          route: "semantic_verifier_required",
          shouldCallDeepSeek: true,
        },
      })
    );

    reserveModelCall(context, "faq_semantic_verifier");

    expect(() => reserveModelCall(context, "final_reply_provider")).toThrow(
      "AI model call purpose is not allowed for this route."
    );
  });
});
