import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Local Vite + synthetic HTTP fixtures only. No application secrets or remote APIs.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = process.env.QUALITY_UI_BASE || "http://127.0.0.1:5187";
assert.equal(new URL(base).hostname, "127.0.0.1");
const out = path.join(os.tmpdir(),"mumbao-quality-phase-1c-ui");
await mkdir(out,{recursive:true});
const browser = await chromium.launch({channel:"chrome",headless:true});
const sessionId="00000000-0000-4000-8000-000000000777";
const eventId="11111111-1111-4111-8111-111111111111";
const user={authMode:"account",display_name:"Local QA",role_code:"super_admin",role_name:"Super Admin",permissions:["ai_quality.view","ai_quality.review"],is_active:true};
const event={id:eventId,event_type:"negative_feedback",severity:"low",capability_id:"parking",
  created_at:"2026-09-10T04:00:00Z",reviewed_at:null,feedback_category:"misunderstood_question",
  signal_code:null,question:"有停車位嗎？",answer:"有提供停車位。"};
const overview={conversations:12,positive:4,negative:1,high_risk:0,problem_turns:1,categories:{misunderstood_question:1},limited:false,sample_limit:5000};
const detail={...event,metadata:{},execution:{provider_used:false,provider_call_count:0,scenario_changed:false,pending_created:false,pending_consumed:false},
  context:[{relative:"current",role:"user",text:"我的電話[PHONE]，email [EMAIL]，想問停車位。"},
    {relative:"current",role:"assistant",text:"有提供停車位。"}]};
const results=[];
async function setup(width,admin=false) {
  const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1});
  if(admin)await context.addInitScript(({user})=>{
    sessionStorage.setItem("adminShopToken","synthetic-ui-token");
    sessionStorage.setItem("adminShopIdentity",JSON.stringify(user));
  },{user});
  const page=await context.newPage(), errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  const state={votes:[],messages:0,feedbackStatus:200,adminMode:"ok",releaseVote:null,releaseMessage:null,delayVote:false,delayMessage:false,chatError:false};
  await context.route("**/*",async route=>{
    const request=route.request(),url=new URL(request.url());
    const json=(data,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(data)});
    if(url.origin!==base)return route.fulfill({status:204,body:""});
    if(!url.pathname.startsWith("/api/"))return route.continue();
    if(url.pathname==="/api/admin-shop")return json({authMode:"account",user,permissions:user.permissions});
    if(url.pathname==="/api/admin-ai-quality"){
      if(state.adminMode==="off")return json({enabled:false});
      if(state.adminMode!=="ok")return json({code:state.adminMode==="503"?"not_initialized":state.adminMode==="401"?"unauthorized":"forbidden"},Number(state.adminMode));
      const action=url.searchParams.get("action");
      const data=action==="overview"?overview:action==="detail"?detail:action==="review"?{reviewed:true}:
        action==="health"?{conversation_rows:12,message_rows:24,event_rows:5,review_rows:0,eval_rows:0,
          cleanup_due_count:0,oldest_message_at:"2026-09-09T04:00:00Z",message_retention_days:30,event_retention_days:90}:
        {events:[{...event,id:url.searchParams.has("before_id")?"22222222-2222-4222-8222-222222222222":eventId}],has_more:!url.searchParams.has("before_id")};
      return json({enabled:true,data});
    }
    if(url.pathname==="/api/ai-quality-feedback"){
      state.votes.push(request.postDataJSON());
      if(state.delayVote)await new Promise(resolve=>{state.releaseVote=resolve;});
      return json({ok:state.feedbackStatus===200},state.feedbackStatus);
    }
    if(url.pathname==="/api/ai-chat"){
      const body=request.postDataJSON()||{},session={id:sessionId,visitor_id:body.visitor_id,status:"ai_active",ai_mode:"ai_active",should_ai_reply:true};
      if(url.searchParams.get("action")!=="message")return json({session,messages:[],sessions:[],has_more:false});
      state.messages++;
      if(state.delayMessage)await new Promise(resolve=>{state.releaseMessage=resolve;});
      if(state.chatError)return json({error:"synthetic_unavailable"},503);
      return json({session,userMessage:{id:"synthetic-user-"+state.messages,sender:"user",message:body.message||body.question,created_at:new Date().toISOString()},
        aiMessage:{id:"synthetic-ai-"+state.messages,sender:"ai",message:"有提供停車位。",feedback_token:"synthetic-feedback-token",created_at:new Date().toISOString()},
        answer:"有提供停車位。",provider_used:"local",ai_mode:"ai_active"});
    }
    return json({});
  });
  return {context,page,state,errors};
}
async function noOverflow(page) {
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
}
async function waitState(check) {
  const deadline=Date.now()+5000;
  while(!check()){if(Date.now()>deadline)throw new Error("fixture_timeout");await new Promise(resolve=>setTimeout(resolve,20));}
}
try {
  for(const width of [375,390,430]){
    const {context,page,state,errors}=await setup(width);
    await page.goto(base+"/chat");
    const input=page.getByPlaceholder("輸入想問慢寶的問題");
    await input.waitFor({state:"visible"});
    assert.equal(await page.getByRole("button",{name:"有幫助",exact:true}).count(),0);
    state.delayMessage=true;
    await input.fill("有停車位嗎");await page.getByRole("button",{name:"送出訊息"}).click();
    await waitState(()=>state.releaseMessage);
    assert.equal(await page.getByRole("button",{name:"有幫助",exact:true}).count(),0);
    state.releaseMessage();state.delayMessage=false;
    const up=page.getByRole("button",{name:"有幫助",exact:true}),down=page.getByRole("button",{name:"沒幫助",exact:true});
    await up.waitFor({state:"visible"});
    await up.focus();assert.equal(await up.evaluate(e=>e===document.activeElement),true);
    state.delayVote=true;await up.press("Enter");await waitState(()=>state.releaseVote);
    assert.equal(await up.isDisabled(),true);assert.equal(await down.isDisabled(),true);
    state.releaseVote();state.delayVote=false;
    await page.getByText("謝謝你的回饋。",{exact:true}).waitFor();
    assert.equal(await up.getAttribute("aria-pressed"),"true");
    await down.click();await page.getByRole("button",{name:"沒理解我的問題",exact:true}).waitFor();
    await noOverflow(page);
    for(const box of await page.locator('[aria-label="回答回饋"] button').evaluateAll(elements=>elements.map(e=>{
      const r=e.getBoundingClientRect();return {left:r.left,right:r.right,height:r.height};
    }))){
      assert.ok(box.left>=0&&box.right<=width);assert.ok(box.height>=40);
    }
    await page.screenshot({path:path.join(out,"customer-"+width+".png"),animations:"disabled"});
    await page.getByRole("button",{name:"沒理解我的問題",exact:true}).click();
    await page.getByText("謝謝你的回饋。",{exact:true}).waitFor();
    assert.equal(await down.getAttribute("aria-pressed"),"true");
    assert.deepEqual(state.votes.at(-1),{token:"synthetic-feedback-token",polarity:"negative",category:"misunderstood_question"});
    state.feedbackStatus=503;await up.click();await page.getByText("回饋暫時無法送出",{exact:true}).waitFor();
    assert.equal(state.messages,1);assert.equal(await down.getAttribute("aria-pressed"),"true");
    state.chatError=true;await input.fill("其他問題");await page.getByRole("button",{name:"送出訊息"}).click();
    await waitState(()=>state.messages===2);
    await page.getByRole("button",{name:"送出訊息"}).waitFor();
    assert.equal(await up.count(),1);
    assert.deepEqual(errors,[]);
    results.push({surface:"customer",width,pass:true,feedback_reads:0});
    await context.close();
  }
  for(const width of [1440,1280,1024,390]){
    const {context,page,state,errors}=await setup(width,true);
    await page.goto(base+"/admin/ai-improvement");
    const row=page.getByRole("button").filter({hasText:"負面回饋"}).filter({hasText:"有停車位嗎"});
    await row.waitFor({state:"visible"});await noOverflow(page);
    await page.screenshot({path:path.join(out,"admin-"+width+".png"),animations:"disabled"});
    await row.click();await page.getByRole("dialog").getByText("我的電話[PHONE]，email [EMAIL]，想問停車位。").waitFor();
    await noOverflow(page);
    await page.screenshot({path:path.join(out,"admin-detail-"+width+".png"),animations:"disabled"});
    await page.getByRole("button",{name:"標記已檢視",exact:true}).click();
    await page.getByRole("dialog").waitFor({state:"hidden"});
    await page.getByRole("button",{name:"下一頁",exact:true}).click();await page.getByText("第 2 頁",{exact:true}).waitFor();
    await page.getByLabel("時間",{exact:true}).selectOption("30");
    await page.getByText("第 1 頁",{exact:true}).waitFor();
    await page.getByRole("tab",{name:"資料健康"}).click();await page.getByText("訊息保留 30 天 · 事件保留 90 天").waitFor();
    await noOverflow(page);
    state.adminMode="503";await page.getByRole("button",{name:"重新整理",exact:true}).click();
    await page.getByText("AI 品質資料尚未初始化。",{exact:true}).waitFor();
    state.adminMode="off";await page.getByRole("button",{name:"重新整理",exact:true}).click();
    await page.getByText("AI 品質資料功能尚未啟用。",{exact:true}).waitFor();
    state.adminMode="403";await page.getByRole("button",{name:"重新整理",exact:true}).click();
    await page.getByText("您沒有此操作權限",{exact:true}).waitFor();
    assert.equal(new URL(page.url()).pathname,"/admin/ai-improvement");
    state.adminMode="401";await page.getByRole("button",{name:"重新整理",exact:true}).click();
    await page.waitForURL("**/admin/shop/login**");
    assert.deepEqual(errors,[]);
    results.push({surface:"admin",width,pass:true});
    await context.close();
  }
  console.log(JSON.stringify({pass:true,results,uncaught_errors:0,production_requests:0,screenshots:out},null,2));
} finally { await browser.close(); }
