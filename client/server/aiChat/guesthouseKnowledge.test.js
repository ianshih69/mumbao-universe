import { describe, expect, it } from "vitest";
import { loadGuesthouseKnowledge } from "./guesthouseKnowledge.js";

describe("guesthouse knowledge loader", () => {
  it("loads the private markdown from a module-relative path", async () => {
    const knowledge = await loadGuesthouseKnowledge();

    expect(knowledge.length).toBeGreaterThan(100);
    expect(knowledge).toContain("慢慢蒔光");
  });
});
