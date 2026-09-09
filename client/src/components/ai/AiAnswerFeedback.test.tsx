import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { readFileSync } from "node:fs";
import AiAnswerFeedback from "./AiAnswerFeedback";
import { mergeMessages, type ChatMessage } from "./MumbaoChat";
import { fetchQualityAdmin } from "@/lib/aiQualityAdmin";
vi.mock("@/lib/shop/adminAuth",()=>({
  getAdminToken:()=> "synthetic-admin",
  createAdminApiError:(status:number,payload:{message:string})=>Object.assign(new Error(payload.message),{status}),
}));
beforeEach(()=>vi.stubGlobal("React",React));
afterEach(()=>vi.unstubAllGlobals());
describe("Phase 1C client boundary",()=>{
  it("renders accessible labelled buttons with no token in DOM or automatic fetch",()=>{
    const transport=vi.fn();vi.stubGlobal("fetch",transport);
    const html=renderToStaticMarkup(<AiAnswerFeedback token="synthetic-feedback-token"/>);
    expect(html).toContain('aria-label="有幫助"');expect(html).toContain('aria-label="沒幫助"');
    expect(html).toContain('aria-pressed="false"');expect(html).toContain('type="button"');
    expect(html).not.toContain("synthetic-feedback-token");expect(transport).not.toHaveBeenCalled();
  });
  it("preserves completed token regardless of polling/response ordering",()=>{
    const original:ChatMessage={id:"synthetic",role:"assistant",message:"answer"};
    const completed={...original,feedback_token:"synthetic-feedback-token"};
    expect(mergeMessages([original],[completed])[0].feedback_token).toBe(completed.feedback_token);
    expect(mergeMessages([completed],[original])[0].feedback_token).toBe(completed.feedback_token);
    expect(mergeMessages([{...original,role:"user"}],[completed])[0].feedback_token).toBeUndefined();
  });
  it("never persists or forwards feedback token with transcript/context/debug fields",()=>{
    const source=readFileSync(new URL("./MumbaoChat.tsx",import.meta.url),"utf8");
    const cache=source.slice(source.indexOf("const dedupedCacheMessages"),source.indexOf("function getMaxDesktopWindowSize"));
    expect(cache).not.toContain("feedback_token");
    const debug=source.slice(source.indexOf('logChatDebug("API response received"'),source.indexOf('logChatDebug("AI message inserted"'));
    expect(debug).not.toContain("feedback_token");
    expect(source).toContain('message.role === "assistant" && !message.isWelcome && !message.isOptimistic && message.feedback_token');
  });
  it.each([401,403,503])("forwards %i through existing Admin error authority with no retry",async status=>{
    const fetch=vi.fn(async(_url: string)=>new Response(JSON.stringify({code:status===503?"not_initialized":"unauthorized"}),{status}));
    vi.stubGlobal("fetch",fetch);
    await expect(fetchQualityAdmin("list")).rejects.toMatchObject({status});
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/admin-ai-quality?action=list");
  });
});
