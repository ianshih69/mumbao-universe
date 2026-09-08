import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("booking general accommodation deposit disclosure", () => {
  it("shows the separate TWD 10,000 deposit throughout booking summaries", () => {
    const source = readFileSync(
      new URL("../../pages/Booking.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain(
      "const generalAccommodationDepositAmount = 10_000;",
    );
    expect(source).toContain(
      "入住時另收，不計入住宿總價、訂金 30% 或尾款 70%",
    );
    expect(
      source.match(/一般住宿押金（入住時另收）/g),
    ).toHaveLength(5);
  });
});
