# stubborn YC Late Application Packet

Status: draft ready for founder review before submission  
Prepared: 2026-05-20  
Batch target: YC Summer 2026 late application, or the next available batch if YC rolls it forward  
Apply URL: https://apply.ycombinator.com/  
Product URL: https://stubborn-ai.vercel.app/  

## Submission Notes

YC currently says the Summer 2026 on-time deadline has passed, but late applications are still accepted. Submit as soon as the founder fields and video link are filled in.

Do not submit until the remaining fields are replaced:

- `[DEMO VIDEO URL]`
- `[PERSONAL IMPRESSIVE ACHIEVEMENT]`
- `[REVENUE, IF ANY]`
- `[ACTIVE USER OR PILOT DETAILS, IF ANY]`

The product claims below are evidence-backed from the current repository and production API:

- Live production web app: `https://stubborn-ai.vercel.app/`
- Production homepage returns 200 and exposes the challenge composer.
- Production API returned `total=182` challenge records on 2026-05-20. Treat these as build/test/product records unless real user usage is separately confirmed.
- The repo implements chat intake, challenge creation, opponent join, evidence upload, AI judging, manual review, credits ledger, and settlement confirmation paths.

## Core Positioning

### One-line pitch

stubborn is the AI-native marketplace where anyone can turn a real-world challenge into an evidence-backed market from one sentence.

### Very short description

stubborn lets users type a challenge in natural language, have AI turn it into enforceable rules, invite an opponent or audience, collect video/photo evidence, get an AI verdict, and settle credits.

### Market vision

Pump.fun made asset creation feel instant and social. stubborn applies that same "anyone can create a market" idea to real-world human challenges: fitness dares, creator competitions, local games, prediction contests, skill battles, and community events. The long-term product is a marketplace of user-created challenge markets, where the hardest parts - rule writing, evidence standards, judging, and settlement - are handled by AI.

### YC-safe phrasing

We should not describe stubborn primarily as gambling. The stronger and safer framing is:

"AI-created challenge markets with evidence-based outcomes and internal credits first."

## YC Application Answers

### Company name

stubborn

### Company URL

https://stubborn-ai.vercel.app/

### What is your company going to make?

stubborn is a chat-first marketplace for real-world challenges. A user types something like "I bet I can do more push-ups than Alex on camera by tonight"; our AI turns it into a structured challenge contract with rules, stake, evidence requirements, deadline, and judging rubric. The opponent joins from a link, both sides submit video/photo evidence, an AI judge recommends a verdict with reasoning, and credits settle after confirmation.

Today it works as a challenge app. The larger product is a market factory: anyone can create a challenge market from a sentence, and communities can discover, join, compete in, and eventually trade around these outcomes.

### Describe your company in 50 characters or less

AI market maker for real-world challenges

Alternative:

Create challenge markets from one sentence

### What category best describes your company?

Consumer, AI, Marketplace, Social, Fintech-adjacent.

If YC forces one category, choose Consumer or AI. If there is a marketplace option, choose Marketplace.

### Where do you live now, and where would the company be based after YC?

Fremont, California. I can relocate to San Francisco for YC and would likely build from San Francisco during the batch.

### If you have already started working on it, how long have you been working and how much of that has been full-time?

I started building stubborn as a real product in 2026. I have been moving it from prototype to production web app, focusing on the hard parts that make this more than a normal social app: challenge state, evidence submission, AI judgment, internal credits, and settlement safety. I am ready to work on it full-time.

Replace with exact date/full-time status:

`[EXACT START DATE AND FULL-TIME STATUS]`

### How far along are you?

We have a working production web app. Users can start from a chat-style composer, have the system structure a challenge, publish it, share or join a challenge, submit evidence, run an AI judge flow, reach manual review when confidence is low, and confirm settlement through an internal credits ledger.

The production backend currently has 182 challenge records from build/test/product usage. We are not presenting that as organic traction yet. The current stage is functional prototype/pre-launch: the core loop exists, and the next step is narrowing the wedge to a repeatable community use case that creates daily challenge liquidity.

### How many active users or customers do you have?

Pre-launch. We have a live product and internal/test challenge activity, but we should not count test records as active users. The next milestone is 10-20 communities or creator groups running real challenges on stubborn every week.

If real usage exists, replace with:

`[NUMBER] weekly active users, [NUMBER] creators/communities, [NUMBER] completed real challenges, [NUMBER] repeat users.`

### Do you have revenue?

Not yet.

Initial monetization will come from a take rate on paid challenge settlement, creator/community market fees, and AI judging fees. We will keep early usage in internal credits and non-cash rewards until the compliance path is clear for any real-money or regulated-market expansion.

### What is new about what you are making?

The new thing is that AI makes small, user-created outcome markets cheap enough to create and judge.

Before multimodal AI, a challenge market needed humans to write rules, decide what evidence counts, judge disputes, and settle outcomes. That overhead only made sense for large markets like sports betting or public prediction markets. stubborn collapses that overhead. The user writes one sentence; AI drafts the contract, decides what evidence is needed, interprets media, explains a verdict, and routes uncertain cases to review.

That means markets can exist for tiny, social, local, creator-driven, and weirdly specific outcomes that were never worth formalizing before.

### What do you understand about your business that other companies in it just don't get?

Most people frame this as either a betting app or a social challenge app. I think the real primitive is "market creation."

The hard part is not showing a feed of challenges. The hard part is compiling messy human intent into a contract that can survive real-world ambiguity: who participates, what evidence counts, when the window closes, how confidence is handled, when settlement is allowed, and how to avoid double settlement or fake outcomes.

If that compiler becomes good, the product can expand from friend-to-friend challenges into a large marketplace of community-created outcome markets. The first wedge is playful, but the core infrastructure is a rules, evidence, judgment, and settlement system.

### Who are your competitors, and who might become competitors?

The obvious competitors are Polymarket, fantasy/sportsbook products, Strava and fitness challenges, Discord/Telegram informal bets, creator competition tools, and social apps where people already do dares and challenges manually.

Polymarket is great for public prediction markets, but it is not designed for one-sentence creation of personal or local human challenges. Fitness apps have challenges, but they are tied to their own data sources and narrow activity types. Social apps have distribution, but not enforceable rules, evidence standards, or settlement. Sportsbooks have liquidity and payments, but not user-generated market creation.

stubborn's wedge is that the AI contract/evidence/judge loop lets a normal person create a market that previously required an operator.

### How do or will you make money?

First, we can charge a small platform fee on internal-credit challenge settlement and creator/community tournaments.

Second, we can charge for AI judging and premium market tooling: better evidence processing, creator moderation, community leaderboards, private groups, and market templates.

Longer term, if the compliance path supports it, stubborn can expand into regulated paid challenge markets, creator outcome markets, or on-chain settlement rails. We do not need to start there. The first version should prove daily market creation and repeat participation without taking avoidable regulatory risk.

### How will you get users?

The wedge is communities where people already create informal challenges but lack a trusted way to define, judge, and settle them:

- fitness creators and local gyms
- friend groups doing dares, workouts, skill challenges, or game challenges
- streamers and creator communities
- school clubs, intramurals, and campus competitions
- crypto/social communities that already understand markets but want playful, evidence-backed challenges

The first growth loop is simple: every challenge creates a share link. The opponent has to open the link to join, evidence submission creates media, and completed challenges become replayable proof. A creator can publish a weekly challenge, followers join, and the best outcomes become social content.

### Why now?

Three things changed:

1. Users are comfortable creating social content on video, and challenge formats already spread naturally.
2. Multimodal AI can read rules, inspect photos/videos, and produce structured reasoning good enough to recommend outcomes.
3. Market creation is becoming consumer behavior. People want to create the game, not just join someone else's game.

The old version of this required a human operator. The new version can be AI-native from creation to evidence to judgment.

### Why did you pick this idea to work on?

I keep seeing people create informal bets and challenges in chats, but the moment money, pride, or public reputation is involved, the ambiguity breaks the fun: unclear rules, fake evidence, disputes, and no clean settlement.

At the same time, AI agents are getting good enough to turn natural language into structured workflows and inspect real-world evidence. stubborn is the product that makes that feel consumer-simple: say the challenge, invite people, prove it, settle it.

### What is the most impressive thing each founder has built or achieved?

Zhiwen Luo built stubborn as a full-stack production web app with a chat-first challenge compiler, participant flow, evidence upload, AI judging path, manual review path, credits ledger, and settlement confirmation. The system is not a toy UI; it includes state-machine and ledger logic for a product where incorrect outcomes matter.

Replace or strengthen with one specific non-stubborn achievement:

`[PERSONAL IMPRESSIVE ACHIEVEMENT: e.g. built X used by Y people, shipped Z, won A, published B, earned C, built a trading/agent system with concrete proof.]`

### Are you solo or do you have cofounders?

Currently solo founder.

YC says solo founders can apply, but I know this company would benefit from another exceptional technical/product cofounder. I would use YC's network aggressively to find someone who is strong in consumer distribution, trust/safety, marketplaces, or regulated fintech if the right person appears.

If a cofounder exists, replace with:

`[COFOUNDER NAME, ROLE, EQUITY, RELATIONSHIP HISTORY]`

### Equity split

100% founder-owned before any YC investment or formal option pool.

### Are you incorporated?

Not yet. We can incorporate in the US if accepted to YC or when it becomes operationally necessary.

### Have you raised money?

No outside funding yet.

Suggested if true:

No outside funding yet.

### Are you actively fundraising?

[YES/NO]

Suggested if true:

We are primarily focused on getting into YC and reaching a sharp traction milestone. We would consider aligned investors who understand consumer marketplaces, AI agents, trust/safety, and regulated-market risk.

### What convinced you this is a big market?

People already spend huge amounts of time on games, competitions, sports, fantasy, creator content, prediction markets, and social challenges. These are all versions of the same behavior: people want to make outcomes matter.

The limiting factor has been market creation. If only platforms can create markets, the market is limited to sports, elections, crypto prices, and generic prediction topics. If any creator, local group, friend group, or community can create a challenge market from one sentence, the number of possible markets explodes.

stubborn starts with simple real-world challenges because they are emotionally immediate and easy to share. But the end state is a consumer market layer for anything people can define, prove, judge, and settle.

### What is your insight about marketplace liquidity?

Most marketplaces die because supply and demand have to be created separately. stubborn's first markets are naturally two-sided because challenge creation names the counterparty or audience. A user does not publish an empty listing and hope liquidity appears; they challenge a person or community directly, and the join link brings the other side in.

Over time, successful challenge templates become reusable markets. That creates marketplace liquidity from repeated formats: weekly gym challenges, creator dares, local tournaments, game score battles, prediction contests, and community leaderboards.

### What is your biggest risk?

The biggest risks are trust, safety, and compliance.

Trust: AI verdicts must be explainable, confidence-aware, and reviewable. The product already treats low confidence as manual review instead of pretending every case is automatic.

Safety: challenges must avoid harmful or illegal behavior. The market-creation layer needs policy gates and safe templates.

Compliance: any move from internal credits or non-cash rewards into real-money markets must be done carefully. The right path is to prove repeat engagement with credits first, then handle regulated settlement only where allowed.

### If you applied with this idea before, what has changed?

[IF APPLIED BEFORE: describe concrete progress since last application.]

Suggested if first application:

This is our first YC application for stubborn.

### What other ideas did you consider?

Related ideas:

- A general AI agent for creating structured contracts from chat.
- A creator competition platform where AI judges submissions.
- A local challenge app for gyms and campus groups.
- An evidence oracle API for consumer apps that need photo/video verification.

stubborn combines these into the clearest consumer wedge: AI-created challenge markets.

### Why YC?

YC is the best place to sharpen the wedge and move fast without drifting into a vague social app or over-regulated financial product too early.

We need help with three things:

1. Choosing the first community wedge that creates daily repeat use.
2. Recruiting a world-class cofounder or early teammate if the right person exists.
3. Navigating the line between playful internal-credit challenge markets and future regulated market/payment opportunities.

YC's network is unusually strong for consumer marketplaces, fintech-adjacent products, AI tooling, and founder-to-founder distribution.

### Anything else we should know?

This is not intended to be just another betting app. The bet is that AI will make market creation as easy as posting a video.

Today, stubborn turns a sentence into a challenge contract and uses evidence plus AI judgment to settle credits. If that loop works, the product can become a marketplace where every creator and community can launch their own outcome markets.

The first version is intentionally narrow and playful. The ambition is much bigger: a consumer market layer for real-world actions.

## Demo Video Script

Target length: 60 seconds. Record as founder talking over a live screen recording.

### Script

Hi, I'm Zhiwen Luo, founder of stubborn.

stubborn lets anyone create a real-world challenge market from one sentence.

I start here in the chat composer and type: "I bet Alex I can do more push-ups than him on camera by tonight." stubborn turns that into structured rules: who is competing, what evidence is required, the deadline, the stake, and how the winner will be judged.

Now I publish it and send this link to the opponent. The opponent joins, the challenge moves into the evidence window, and both sides upload video or photo proof.

Then the AI judge reviews the evidence against the rules. If confidence is high, it recommends a winner with reasoning. If confidence is low, it routes to manual review instead of pretending the answer is certain.

After the verdict is confirmed, credits settle through the ledger.

The bigger idea is that this is a market factory. Today it works for friend challenges. Eventually any creator, gym, campus club, or online community can create their own challenge market from a sentence.

Pump.fun made creation instant for tokens. stubborn makes creation instant for real-world outcome markets.

## Interview Prep

### What are you building?

A chat-first AI market maker for real-world challenges. Users describe a challenge, AI compiles it into a contract, participants submit evidence, AI judges, and credits settle.

### Why is this not just gambling?

The first product is internal-credit and challenge-based, closer to social competition than a sportsbook. We are deliberately proving engagement, evidence quality, and settlement mechanics before any real-money expansion. If we ever move into regulated settlement, we will do it in the correct jurisdictions and structure.

### Why will anyone use this repeatedly?

Challenges are already repeat behavior in friend groups, gyms, campuses, games, and creator communities. The problem is that today they are informal and disputed. stubborn makes them easy to create, share, prove, and finish.

### What is the wedge?

Creator/community challenges with visible evidence: fitness challenges, skill battles, local competitions, and streamable dares. These have built-in distribution because the challenge link invites the opponent or audience.

### What is the big company?

The market layer for user-created real-world outcomes. If anyone can define an outcome, collect proof, get it judged, and settle it, then markets can be created for millions of things that were previously too small or too messy to formalize.

### What do you need to prove next?

One community repeatedly creating and completing challenges every week.

Concrete 30-day goal:

- 10 creator/community pilots
- 100 completed non-test challenges
- 30% weekly repeat creators
- median challenge creation under 60 seconds
- no unresolved settlement disputes on completed challenges

## Late Application Note

If there is a free-text update or late-note field, use this:

We are applying late because the product reached a coherent live loop only recently: chat-to-challenge creation, participant join, evidence upload, AI verdict/manual review, and credits settlement. We are submitting now rather than waiting because YC explicitly encourages late applications when founders are ready, and the next few weeks are exactly when YC could help us sharpen the first marketplace wedge.

## Exact Submission Checklist

1. Fill founder legal name, email, location, incorporation status, equity split, and fundraising status.
2. Record the 60-second demo video from the script above.
3. Replace the demo placeholder with the video URL.
4. Confirm whether any real users/revenue can honestly be claimed. If not, leave the application as pre-launch with a live product.
5. Submit at https://apply.ycombinator.com/.
6. Check email for YC submission confirmation.

## First Failure Check

If the YC form asks a question not covered here, answer it using this rule:

Start with the concrete product in one sentence. Then add the market ambition. Do not lead with abstract language.

Example:

"stubborn lets users create AI-judged challenge markets from one sentence. The long-term goal is a marketplace where creators and communities can launch real-world outcome markets without writing rules, hiring judges, or building payment/settlement infrastructure."
