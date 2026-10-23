import { randomUUID } from "node:crypto";
import { expect, test, request, type APIRequestContext } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

test("authenticated block actually hides public Quests and forbids stakes until unblocked", async () => {
  test.setTimeout(120_000);
  const host = new URL(BASE).hostname;
  test.skip(!["localhost","127.0.0.1"].includes(host), "This mutation test is strictly local disposable PostgreSQL");
  const id=randomUUID().replaceAll("-","");
  const contexts:APIRequestContext[]=[];
  async function makeActor(name:string) {
    const ctx=await request.newContext({baseURL:BASE});
    contexts.push(ctx);
    const csrf=await (await ctx.get("/api/auth/csrf")).json();
    const registered=await ctx.post("/api/auth/callback/credentials",{form:{
      csrfToken:csrf.csrfToken,action:"register",email:`qa_block_${id}_${name}@example.invalid`,
      username:`qa_block_${id}_${name}`,password:randomUUID()+"Aa9!",callbackUrl:BASE+"/app/community",json:"true",
    }});
    expect(registered.status()).toBe(200);
    const session=await (await ctx.get("/api/auth/session")).json();
    expect(session.user?.id).toBeTruthy();
    return {ctx,user:session.user as {id:string;username:string}};
  }
  const parse=async(res: Awaited<ReturnType<APIRequestContext["get"]>>) => res.json();
  try {
    const a=await makeActor("a"),b=await makeActor("b");
    async function create(actor:typeof a,name:string) {
      const res=await actor.ctx.post("/api/challenges",{data:{
        title:`QA blocked ${name} ${id}`,stake:0,evidenceType:"text",visibility:"public",isPublic:true,
        deadline:"2h",rules:"Write one answer for our agreed public challenge.",
      }});
      expect(res.status(),await res.text()).toBe(201);
      return (await res.json()).challenge.id as string;
    }
    const bQuest=await create(b,"from b");
    const aQuest=await create(a,"from a");
    const before=await parse(await a.ctx.get("/api/challenges?status=open&limit=50"));
    expect(before.challenges.some((q:{id:string})=>q.id===bQuest)).toBe(true);
    const creditsBefore=(await parse(await a.ctx.get("/api/tokens"))).offChain.credits;
    const block=await a.ctx.post("/api/support/report",{data:{
      kind:"block_user",target:b.user.id,
      reason:"Do not show me this person or allow future public Quest interactions.",
    }});
    expect(block.status(),await block.text()).toBe(200);
    expect((await block.json()).blocked).toBe(true);
    const repeat=await a.ctx.post("/api/support/report",{data:{
      kind:"block_user",target:b.user.username,reason:"Keep the same blocked account hidden.",
    }});
    expect(repeat.status()).toBe(200);
    const managed=await parse(await a.ctx.get("/api/users/blocks"));
    expect(managed.blockedUsers.filter((u:{id:string})=>u.id===b.user.id)).toHaveLength(1);
    expect((await a.ctx.get(`/api/challenges/${bQuest}`)).status()).toBe(404);
    expect((await a.ctx.get(`/api/challenges/${bQuest}/evidence`)).status()).toBe(403);
    const listing=await parse(await a.ctx.get("/api/challenges?status=open&limit=50"));
    expect(listing.challenges.some((q:{id:string})=>q.id===bQuest)).toBe(false);
    const discovery=await parse(await a.ctx.get("/api/challenges/discover?limit=50"));
    expect(discovery.challenges.some((q:{id:string})=>q.id===bQuest)).toBe(false);
    const reverse=await parse(await b.ctx.get("/api/challenges?status=open&limit=50"));
    expect(reverse.challenges.some((q:{id:string})=>q.id===aQuest)).toBe(false);
    expect((await a.ctx.post(`/api/challenges/${bQuest}/accept`)).status()).toBe(403);
    expect((await b.ctx.post(`/api/challenges/${aQuest}/accept`)).status()).toBe(403);
    expect((await parse(await a.ctx.get("/api/tokens"))).offChain.credits).toBe(creditsBefore);
    const deleted=await a.ctx.delete("/api/users/blocks",{data:{targetUserId:b.user.id}});
    expect(deleted.status()).toBe(200);
    expect((await parse(await a.ctx.get("/api/users/blocks"))).blockedUsers).toHaveLength(0);
    expect((await a.ctx.get(`/api/challenges/${bQuest}`)).status()).toBe(200);
    const joined=await a.ctx.post(`/api/challenges/${bQuest}/accept`);
    expect(joined.status(),await joined.text()).toBe(200);
    console.log("E2E_BLOCKING_PASS",JSON.stringify({
      blocked:b.user.id,hiddenPublic:true,reverseJoinDenied:true,creditsUnchangedWhileBlocked:true,
      unblocked:true,joinAfterUnblock:true,
    }));
  } finally {await Promise.all(contexts.map(c=>c.dispose()));}
});
