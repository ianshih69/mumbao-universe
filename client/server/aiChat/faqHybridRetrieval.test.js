import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildApprovedSemanticCorpus,
  hashSemanticCorpus,
} from "./faqSemanticCorpus.js";
import { retrieveSemanticFaqItems } from "./faqSemanticRetrieval.js";
import {
  callFaqSemanticVerifier,
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

  it("uses semantic_direct for a clear approved FAQ miss from lexical retrieval", async () => {
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
      message: "We will drive eight sedans. Is there enough space?",
      faqItems: items,
      semanticRetrieval: {
        enabled: true,
        artifact: artifactFor(items, {
          "faq-parking": [1, 0, 0],
          "faq-payment": [0, 1, 0],
        }),
        createEmbedding: async (text) => {
          expect(text).toBe("We will drive eight sedans. Is there enough space?");
          return [1, 0, 0];
        },
      },
    });

    expect(result).toMatchObject({
      route: "semantic_direct",
      providerUsed: "semantic_direct",
      matchedFaqIds: ["faq-parking"],
      confidence: "high",
      shouldCallDeepSeek: false,
      answer: "Eight sedans can park in the outdoor parking area.",
    });
    expect(result.semanticMetadata).toMatchObject({
      faq_semantic_retrieval_status: "clear",
      faq_semantic_embedding_called: true,
      faq_semantic_corpus_approved_count: 2,
      faq_semantic_corpus_needs_review_count: 0,
    });
  });

  it("routes ambiguous semantic matches to the selector-only verifier", async () => {
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

    expect(result.route).toBe("semantic_verifier_required");
    expect(result.shouldCallDeepSeek).toBe(true);
    expect(result.matchedFaqIds).toEqual(["faq-parking", "faq-payment"]);
  });

  it("falls back safely when the semantic artifact is stale", async () => {
    const items = [faq()];
    const artifact = artifactFor(items, { "faq-parking": [1, 0, 0] });
    artifact.source_hash = "stale";

    const result = await routeKnowledge({
      message: "Mumbao parking: We will drive eight sedans. Is there enough space?",
      contextText: "mumbao booking",
      faqItems: items,
      semanticRetrieval: {
        enabled: true,
        artifact,
        createEmbedding: async () => {
          throw new Error("embedding should not run for stale artifacts");
        },
      },
    });

    expect(result.route).toBe("knowledge_gap");
    expect(result.semanticMetadata).toMatchObject({
      faq_semantic_retrieval_status: "stale",
      faq_semantic_retrieval_reason: "embedding_artifact_hash_mismatch",
      faq_semantic_embedding_called: false,
    });
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

  it("does not embed previous context as the default semantic query", async () => {
    const embeddedTexts = [];
    const items = [faq()];
    await routeKnowledge({
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

    expect(embeddedTexts).toEqual(["Current short question"]);
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
