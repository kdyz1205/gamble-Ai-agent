"use client";

import { useMemo, useState } from "react";
import BrandMark from "@/components/BrandMark";

type ScreenId =
  | "home"
  | "protocol"
  | "join"
  | "room"
  | "evidence"
  | "verdict"
  | "settlement"
  | "battle"
  | "manual"
  | "mobile";

type LabState =
  | "empty"
  | "loading"
  | "logged_out"
  | "logged_in_creator"
  | "logged_in_opponent"
  | "waiting_opponent"
  | "accepted"
  | "evidence_uploaded"
  | "judging"
  | "auto_settle_eligible"
  | "manual_review"
  | "blocked"
  | "settled_winner"
  | "settled_tie"
  | "error";

type Screen = {
  id: ScreenId;
  title: string;
  shortTitle: string;
  purpose: string;
};

type LabStateOption = {
  id: LabState;
  label: string;
  stage: string;
};

const screens: Screen[] = [
  {
    id: "home",
    title: "Home Composer",
    shortTitle: "Home",
    purpose: "One line -> challenge",
  },
  {
    id: "protocol",
    title: "Protocol Preview",
    shortTitle: "Protocol",
    purpose: "Rules, proof, identity, settlement",
  },
  {
    id: "join",
    title: "Join Contract",
    shortTitle: "Join",
    purpose: "Opponent consent before joining",
  },
  {
    id: "room",
    title: "Challenge Room",
    shortTitle: "Room",
    purpose: "Live state and next action",
  },
  {
    id: "evidence",
    title: "Evidence Upload",
    shortTitle: "Evidence",
    purpose: "Camera, upload, identity proof",
  },
  {
    id: "verdict",
    title: "AI Verdict Panel",
    shortTitle: "Verdict",
    purpose: "Winner, proof quality, issues",
  },
  {
    id: "settlement",
    title: "Settlement Result",
    shortTitle: "Settle",
    purpose: "Credits and ledger result",
  },
  {
    id: "battle",
    title: "Battle Room",
    shortTitle: "Battle",
    purpose: "Same-camera left/right proof",
  },
  {
    id: "manual",
    title: "Manual Review",
    shortTitle: "Review",
    purpose: "Human fallback queue",
  },
  {
    id: "mobile",
    title: "Mobile / Codex Narrow Layout",
    shortTitle: "Mobile",
    purpose: "720px and phone-first flow",
  },
];

const states: LabStateOption[] = [
  { id: "empty", label: "Empty", stage: "start" },
  { id: "loading", label: "Loading", stage: "build" },
  { id: "logged_out", label: "Logged out", stage: "auth" },
  { id: "logged_in_creator", label: "Creator", stage: "auth" },
  { id: "logged_in_opponent", label: "Opponent", stage: "auth" },
  { id: "waiting_opponent", label: "Waiting opponent", stage: "join" },
  { id: "accepted", label: "Accepted", stage: "join" },
  { id: "evidence_uploaded", label: "Evidence uploaded", stage: "proof" },
  { id: "judging", label: "Judging", stage: "verdict" },
  { id: "auto_settle_eligible", label: "Auto-settle eligible", stage: "settle" },
  { id: "manual_review", label: "Manual review", stage: "review" },
  { id: "blocked", label: "Blocked", stage: "safety" },
  { id: "settled_winner", label: "Settled winner", stage: "done" },
  { id: "settled_tie", label: "Settled tie", stage: "done" },
  { id: "error", label: "Error", stage: "fail" },
];

const fixture = {
  appName: "stubborn",
  prompt: "Challenge Jerry: I can do 20 pushups in one minute.",
  title: "Push-up sprint",
  summary: "Alex and Jerry compete to finish 20 valid pushups. Fastest valid finish wins.",
  stake: 1,
  deadline: "Today 8:00 PM",
  creator: {
    name: "Alex",
    handle: "@alex",
    side: "Left",
    code: "AX-4829",
    intro: "I am Alex.",
  },
  opponent: {
    name: "Jerry",
    handle: "@jerry",
    side: "Right",
    code: "AX-7314",
    intro: "I am Jerry.",
  },
  verdictReason:
    "Alex completed 20 valid reps in one continuous attempt. Jerry completed 18 valid reps before time expired.",
  identityPrompt: "Wave, say your name, then start.",
};

const stateCopy: Record<LabState, { headline: string; detail: string; action: string }> = {
  empty: {
    headline: "No draft yet",
    detail: "The user has not asked for a challenge.",
    action: "Type one line",
  },
  loading: {
    headline: "Building challenge",
    detail: "stubborn is turning the prompt into a playable challenge.",
    action: "Building",
  },
  logged_out: {
    headline: "Sign in required",
    detail: "Users can preview, but publishing or joining needs an account.",
    action: "Sign in",
  },
  logged_in_creator: {
    headline: "Creator view",
    detail: "The creator can confirm, invite, record, and close eligible drafts.",
    action: "Create challenge",
  },
  logged_in_opponent: {
    headline: "Opponent view",
    detail: "The opponent sees the contract first, then accepts or declines.",
    action: "Review rules",
  },
  waiting_opponent: {
    headline: "Waiting for opponent",
    detail: "The invite is live. The next step is share or cancel.",
    action: "Copy invite",
  },
  accepted: {
    headline: "Opponent accepted",
    detail: "Both participants agreed to the proof and judgment protocol.",
    action: "Start proof",
  },
  evidence_uploaded: {
    headline: "Evidence uploaded",
    detail: "Both sides have submitted proof. The judge can inspect evidence next.",
    action: "Run AI judge",
  },
  judging: {
    headline: "AI judging",
    detail: "Evidence is being checked for identity, quality, and outcome.",
    action: "Reviewing",
  },
  auto_settle_eligible: {
    headline: "Auto-settle eligible",
    detail: "Proof is clear, identity is clear, and no blocking issue exists.",
    action: "Confirm payout",
  },
  manual_review: {
    headline: "Needs manual review",
    detail: "The AI found at least one issue that blocks automatic settlement.",
    action: "Open review",
  },
  blocked: {
    headline: "Challenge blocked",
    detail: "Safety or compliance policy rejected this version before publish.",
    action: "Use safe version",
  },
  settled_winner: {
    headline: "Winner settled",
    detail: "Credits were moved through the ledger and the challenge is terminal.",
    action: "View receipt",
  },
  settled_tie: {
    headline: "Tie recorded",
    detail: "No winner was selected. Stakes are refunded or recorded as no contest.",
    action: "View receipt",
  },
  error: {
    headline: "Action failed",
    detail: "The UI must show the reason and give one clear recovery button.",
    action: "Retry",
  },
};

const reviewBlockingIssues = [
  "Full body is not visible for the last 8 seconds.",
  "Identity intro is not clear enough.",
  "Rep depth cannot be verified from the angle.",
];

export default function UiConceptLab() {
  const [screenId, setScreenId] = useState<ScreenId>("home");
  const [labState, setLabState] = useState<LabState>("logged_in_creator");

  const selectedScreen = useMemo(
    () => screens.find((screen) => screen.id === screenId) ?? screens[0],
    [screenId],
  );
  const selectedState = stateCopy[labState];

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-[#111827]">
      <div className="grid min-h-screen grid-cols-1 sm:grid-cols-[272px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="z-10 border-b border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur-xl sm:sticky sm:top-0 sm:h-screen sm:overflow-y-auto sm:border-b-0 sm:border-r">
          <div className="mb-4 flex items-center gap-3">
            <BrandMark className="h-10 w-10 rounded-2xl border border-emerald-100 bg-emerald-50 p-1.5 shadow-sm" />
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700">UI Lab</p>
              <h1 className="truncate text-lg font-black tracking-[-0.03em]">stubborn screens</h1>
            </div>
          </div>

          <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Fixture only</p>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">
              No login, DB, upload, or judge API calls from this page.
            </p>
          </div>

          <label className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-slate-500" htmlFor="ui-lab-state">
            State
          </label>
          <select
            id="ui-lab-state"
            data-testid="ui-lab-state-select"
            value={labState}
            onChange={(event) => setLabState(event.target.value as LabState)}
            className="mb-4 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-900 outline-none ring-emerald-500 transition focus:ring-2"
          >
            {states.map((state) => (
              <option key={state.id} value={state.id}>
                {state.label}
              </option>
            ))}
          </select>

          <div className="mb-4 grid grid-cols-2 gap-2">
            <StatePill state="empty" current={labState} onSelect={setLabState} />
            <StatePill state="loading" current={labState} onSelect={setLabState} />
            <StatePill state="manual_review" current={labState} onSelect={setLabState} />
            <StatePill state="settled_winner" current={labState} onSelect={setLabState} />
          </div>

          <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Screens</p>
          <nav className="grid gap-2" aria-label="UI lab screens">
            {screens.map((screen, index) => {
              const active = screen.id === selectedScreen.id;
              return (
                <button
                  key={screen.id}
                  type="button"
                  data-testid={`screen-tab-${screen.id}`}
                  onClick={() => setScreenId(screen.id)}
                  className={`rounded-2xl border p-3 text-left transition ${
                    active
                      ? "border-emerald-300 bg-emerald-50 shadow-[0_12px_34px_rgba(16,185,129,0.12)]"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black tracking-[-0.01em]">
                      {String(index + 1).padStart(2, "0")} {screen.shortTitle}
                    </p>
                    {active ? (
                      <span className="rounded-full bg-emerald-600 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                        open
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] font-semibold leading-snug text-slate-500">{screen.purpose}</p>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0 p-3 sm:p-4 xl:p-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-3 rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm sm:mb-4 sm:p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">{selectedScreen.title}</p>
                  <h2 className="mt-1 text-2xl font-black tracking-[-0.045em] text-slate-950 sm:text-3xl">
                    {selectedState.headline}
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-slate-600">{selectedState.detail}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">
                    {states.find((state) => state.id === labState)?.stage}
                  </span>
                  <span className={statusBadgeClass(labState)}>{selectedState.action}</span>
                </div>
              </div>
            </div>

            <div
              data-testid={`preview-${selectedScreen.id}`}
              className="min-h-[560px] rounded-[28px] border border-slate-200 bg-white shadow-[0_26px_80px_rgba(15,23,42,0.08)]"
            >
              <ScreenPreview screenId={selectedScreen.id} state={labState} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatePill({
  state,
  current,
  onSelect,
}: {
  state: LabState;
  current: LabState;
  onSelect: (state: LabState) => void;
}) {
  const active = state === current;

  return (
    <button
      type="button"
      onClick={() => onSelect(state)}
      className={`rounded-full border px-3 py-2 text-[11px] font-black transition ${
        active ? "border-emerald-300 bg-emerald-600 text-white" : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
      }`}
    >
      {stateCopy[state].action}
    </button>
  );
}

function ScreenPreview({ screenId, state }: { screenId: ScreenId; state: LabState }) {
  switch (screenId) {
    case "home":
      return <HomeComposerPreview state={state} />;
    case "protocol":
      return <ProtocolPreview state={state} />;
    case "join":
      return <JoinContractPreview state={state} />;
    case "room":
      return <ChallengeRoomPreview state={state} />;
    case "evidence":
      return <EvidenceUploadPreview state={state} />;
    case "verdict":
      return <AiVerdictPreview state={state} />;
    case "settlement":
      return <SettlementPreview state={state} />;
    case "battle":
      return <BattleRoomPreview state={state} />;
    case "manual":
      return <ManualReviewPreview state={state} />;
    case "mobile":
      return <MobileNarrowPreview state={state} />;
    default:
      return null;
  }
}

function HomeComposerPreview({ state }: { state: LabState }) {
  const disabled = state === "loading" || state === "blocked" || state === "logged_out";
  const prompt = state === "empty" ? "" : fixture.prompt;

  return (
    <div className="flex min-h-[560px] flex-col justify-between overflow-hidden rounded-[28px] bg-[#f7fbfa] p-5 sm:p-7">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          <BrandHeader />
          <h3 className="mt-8 max-w-xl text-5xl font-black leading-[0.92] tracking-[-0.065em] text-slate-950 sm:text-6xl">
            Say it. Prove it.
          </h3>
          <p className="mt-4 max-w-lg text-base font-semibold leading-relaxed text-slate-600">
            One line becomes a challenge your friend can join, record, and settle.
          </p>
        </div>
        <div className="grid content-start gap-3">
          <FlowTile step="1" label="Say" />
          <FlowTile step="2" label="Invite" />
          <FlowTile step="3" label="Record" />
        </div>
      </div>

      {state === "error" ? <InlineAlert tone="bad" title="AI protocol compilation failed" detail="Show retry and exact provider error here." /> : null}
      {state === "blocked" ? (
        <InlineAlert tone="warn" title="Unsafe challenge blocked" detail="Offer a safe replacement before publish." />
      ) : null}

      <div className="mt-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <textarea
          readOnly
          value={prompt}
          placeholder="Challenge Alex: I can do 20 pushups in one minute..."
          className="h-32 w-full resize-none border-0 bg-white p-5 text-lg font-semibold leading-relaxed text-slate-900 outline-none placeholder:text-slate-400"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-3">
          <div className="flex flex-wrap gap-2">
            <SmallChip active label="Auto language" />
            <SmallChip label="English" />
            <SmallChip label="Chinese" />
            <SmallChip label="Mic" />
          </div>
          <button
            type="button"
            disabled={disabled}
            className={`rounded-full px-7 py-3 text-sm font-black transition ${
              disabled ? "bg-slate-100 text-slate-400" : "bg-[#ffd29a] text-[#7c2d12] shadow-[0_10px_30px_rgba(251,146,60,0.2)]"
            }`}
          >
            {state === "loading" ? "Building" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProtocolPreview({ state }: { state: LabState }) {
  const blocked = state === "blocked";
  const manual = state === "manual_review";

  return (
    <ShellFrame eyebrow="Draft" title={blocked ? "Use a safe version" : fixture.title} state={state}>
      <div className="rounded-[30px] border border-slate-200 bg-slate-50 p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Challenge</p>
        <p className="mt-2 max-w-2xl text-3xl font-black leading-tight tracking-[-0.045em] text-slate-950">
          {blocked ? "This version cannot be played." : fixture.summary}
        </p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ProtocolItem label="Players" value={manual ? "review first" : "Alex vs Jerry"} />
        <ProtocolItem label="Proof" value="wave + say name" />
        <ProtocolItem label="Winner" value={blocked ? "blocked" : "fastest valid finish"} />
        <ProtocolItem label="Payout" value={blocked ? "none" : "winner takes stake"} />
      </div>
      <div className="mt-4">
        <div className={`rounded-3xl border p-4 ${blocked ? "border-red-200 bg-red-50" : "border-emerald-100 bg-emerald-50"}`}>
          <p className={`text-xs font-black uppercase tracking-[0.16em] ${blocked ? "text-red-700" : "text-emerald-700"}`}>
            {blocked ? "Blocked" : "Ready"}
          </p>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-700">
            {blocked ? "Show one safer replacement." : "Keep the full contract collapsed unless the user asks."}
          </p>
        </div>
      </div>
    </ShellFrame>
  );
}

function JoinContractPreview({ state }: { state: LabState }) {
  const accepted = state === "accepted" || state === "evidence_uploaded" || state === "judging" || state === "auto_settle_eligible";
  const blocked = state === "blocked";

  return (
    <ShellFrame eyebrow="Join contract" title={fixture.title} state={state}>
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="grid gap-3">
          <ContractRow label="Who" value={`${fixture.creator.name} vs ${fixture.opponent.name}`} />
          <ContractRow label="Win" value="Fastest valid completion of 20 pushups wins." />
          <ContractRow label="Proof" value="One continuous same-camera video with both people visible." />
          <ContractRow label="Agree" value="Rules, AI judging, dispute window, and credit settlement." />
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Opponent</p>
          <AvatarLine name={fixture.opponent.name} handle={fixture.opponent.handle} tone="blue" />
          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-sm font-black text-slate-950">{accepted ? "Rules accepted" : "Consent required"}</p>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
              {accepted ? "Opponent can now submit evidence." : "Joining does not happen until this contract is accepted."}
            </p>
          </div>
          <button
            type="button"
            disabled={blocked}
            className={`mt-4 w-full rounded-full px-4 py-3 text-sm font-black ${
              blocked ? "bg-slate-200 text-slate-400" : "bg-emerald-600 text-white"
            }`}
          >
            {accepted ? "Accepted" : "Accept rules"}
          </button>
        </div>
      </div>
    </ShellFrame>
  );
}

function ChallengeRoomPreview({ state }: { state: LabState }) {
  const currentStep = stepForState(state);

  return (
    <ShellFrame eyebrow="Challenge room" title={fixture.title} state={state}>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid grid-cols-4 gap-2 text-center">
            {["Opponent", "Evidence", "AI Verdict", "Settle"].map((step, index) => (
              <div key={step} className={`rounded-2xl px-3 py-3 ${index <= currentStep ? "bg-emerald-600 text-white" : "bg-white text-slate-400"}`}>
                <p className="text-[10px] font-black uppercase tracking-wide">{index + 1}</p>
                <p className="mt-1 text-xs font-black">{step}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <AvatarCard person={fixture.creator} status="Creator" />
            <AvatarCard person={fixture.opponent} status={state === "waiting_opponent" ? "Waiting" : "Accepted"} />
          </div>
        </div>
        <ActionRail state={state} />
      </div>
    </ShellFrame>
  );
}

function EvidenceUploadPreview({ state }: { state: LabState }) {
  const uploaded = state === "evidence_uploaded" || state === "judging" || state === "auto_settle_eligible" || state === "settled_winner";

  return (
    <ShellFrame eyebrow="Evidence" title="Record proof" state={state}>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="rounded-[28px] border border-slate-200 bg-slate-950 p-4 text-white">
          <div className="aspect-video rounded-3xl border border-white/10 bg-[linear-gradient(135deg,#0f172a,#1f2937)] p-4">
            <div className="flex h-full flex-col justify-between">
              <div className="flex justify-between gap-3">
                <ProofBadge label={`${fixture.creator.name}: ${fixture.creator.side}`} />
                <ProofBadge label={`${fixture.opponent.name}: ${fixture.opponent.side}`} />
              </div>
              <div className="mx-auto rounded-full bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white/80">
                {uploaded ? "Video saved" : "Camera"}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <IdentityCue name={fixture.creator.name} text={fixture.creator.intro} />
                <IdentityCue name={fixture.opponent.name} text={fixture.opponent.intro} />
              </div>
            </div>
          </div>
        </div>
        <div className="grid gap-3">
          <EvidenceStep done label="Wave and say your name" />
          <EvidenceStep done={uploaded} label="Keep the video continuous" />
          <EvidenceStep done={uploaded} label="Keep both bodies visible" />
          <EvidenceStep done={state === "auto_settle_eligible" || state === "settled_winner"} label="Ready for verdict" />
          <button type="button" className="mt-1 rounded-full bg-emerald-600 px-4 py-3 text-sm font-black text-white">
            {uploaded ? "Video saved" : "Record or upload"}
          </button>
        </div>
      </div>
    </ShellFrame>
  );
}

function AiVerdictPreview({ state }: { state: LabState }) {
  const manual = state === "manual_review";
  const blocked = state === "blocked" || state === "error";
  const quality = blocked ? "Invalid" : manual ? "Unclear" : "Good";
  const recommendation = blocked ? "Do not settle" : manual ? "Needs review" : "Settle winner";
  const decision = blocked ? "Blocked" : manual ? "Review" : "Alex wins";

  return (
    <ShellFrame eyebrow="AI verdict" title={recommendation} state={state}>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className={`rounded-[28px] border p-5 ${blocked || manual ? "border-amber-200 bg-amber-50" : "border-emerald-100 bg-emerald-50"}`}>
          <p className={`text-xs font-black uppercase tracking-[0.16em] ${blocked || manual ? "text-amber-700" : "text-emerald-700"}`}>
            AI checked
          </p>
          <p className="mt-5 text-5xl font-black tracking-[-0.06em] text-slate-950">{decision}</p>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-600">
            {blocked || manual ? "Do not move credits until a human checks this." : "Proof is clear enough for payout."}
          </p>
          <div className="mt-5 grid gap-2">
            <CheckLine ok={!blocked && !manual} label="Identity clear" />
            <CheckLine ok={!blocked && !manual} label="Attempt visible" />
            <CheckLine ok={!blocked && !manual} label="Winner clear" />
          </div>
        </div>
        <div className="grid gap-3">
          <VerdictRow label="Winner" value={blocked || manual ? "No automatic winner" : fixture.creator.name} />
          <VerdictRow label="Evidence quality" value={quality} />
          <VerdictRow label="What happened" value={blocked || manual ? "Blocking issues must be resolved first." : fixture.verdictReason} />
          <VerdictRow label="Settlement" value={blocked || manual ? "Hold credits" : "Move payout"} />
          <BlockingIssues issues={manual || blocked ? reviewBlockingIssues : []} />
        </div>
      </div>
    </ShellFrame>
  );
}

function SettlementPreview({ state }: { state: LabState }) {
  const tie = state === "settled_tie" || state === "manual_review";
  const winner = state === "settled_winner" || state === "auto_settle_eligible";

  return (
    <ShellFrame eyebrow="Settlement" title={tie ? "No winner payout" : winner ? `${fixture.creator.name} wins` : "Not settled yet"} state={state}>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="grid gap-3">
          <LedgerRow actor={fixture.creator.name} type="stake" amount="-1" after="39" />
          <LedgerRow actor={fixture.creator.name} type="judge" amount="-1" after="38" />
          <LedgerRow actor={fixture.opponent.name} type="stake" amount="-1" after="39" />
          {tie ? (
            <>
              <LedgerRow actor={fixture.creator.name} type="refund" amount="+1" after="39" />
              <LedgerRow actor={fixture.opponent.name} type="refund" amount="+1" after="40" />
            </>
          ) : (
            <>
              <LedgerRow actor={fixture.opponent.name} type="loss" amount="-1" after="38" />
              <LedgerRow actor={fixture.creator.name} type="win" amount="+2" after="40" highlight />
            </>
          )}
        </div>
        <div className="rounded-[28px] border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Receipt</p>
          <p className="mt-4 text-4xl font-black tracking-[-0.05em]">{tie ? "Refund" : "+2 pts"}</p>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">
            {tie ? "The result is recorded without moving winner credits." : "Winner payout is ledger-backed and auditable."}
          </p>
        </div>
      </div>
    </ShellFrame>
  );
}

function BattleRoomPreview({ state }: { state: LabState }) {
  return (
    <div className="min-h-[560px] overflow-hidden rounded-[28px] bg-slate-950 p-4 text-white">
      <div className="mb-4 flex items-center justify-between gap-3">
        <BrandHeader dark />
        <span className="rounded-full bg-emerald-400 px-3 py-2 text-xs font-black text-slate-950">{stateCopy[state].action}</span>
      </div>
      <div className="grid min-h-[420px] gap-3 md:grid-cols-2">
        <BattleSide person={fixture.creator} count="20" tone="emerald" />
        <BattleSide person={fixture.opponent} count="18" tone="blue" />
      </div>
      <div className="mt-3 rounded-3xl border border-white/10 bg-white/10 p-4 text-center">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white/60">Identity intro</p>
        <p className="mt-1 text-2xl font-black tracking-[-0.03em]">{fixture.identityPrompt}</p>
      </div>
    </div>
  );
}

function ManualReviewPreview({ state }: { state: LabState }) {
  return (
    <ShellFrame eyebrow="Manual review" title="Human fallback" state={state}>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Review packet</p>
          <div className="mt-4 grid gap-3">
            {reviewBlockingIssues.map((issue) => (
              <div key={issue} className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
                {issue}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Reviewer action</p>
          <div className="mt-4 grid gap-2">
            <button type="button" className="rounded-full bg-emerald-600 px-4 py-3 text-sm font-black text-white">
              Approve winner
            </button>
            <button type="button" className="rounded-full border border-slate-200 px-4 py-3 text-sm font-black text-slate-700">
              Refund
            </button>
            <button type="button" className="rounded-full border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">
              Void evidence
            </button>
          </div>
        </div>
      </div>
    </ShellFrame>
  );
}

function MobileNarrowPreview({ state }: { state: LabState }) {
  return (
    <div className="grid min-h-[560px] place-items-center rounded-[28px] bg-slate-100 p-4">
      <div className="w-full max-w-[390px] overflow-hidden rounded-[34px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
        <div className="border-b border-slate-200 p-4">
          <BrandHeader />
        </div>
        <div className="p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">{stateCopy[state].action}</p>
          <h3 className="mt-2 text-3xl font-black leading-[0.95] tracking-[-0.055em] text-slate-950">
            One-line challenge.
          </h3>
          <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-black text-slate-950">{fixture.prompt}</p>
          </div>
          <div className="mt-4 grid gap-2">
            <MobileStep done label="Build rules" />
            <MobileStep done={state !== "empty" && state !== "loading"} label="Invite opponent" />
            <MobileStep done={state === "evidence_uploaded" || state === "judging" || state === "settled_winner"} label="Submit proof" />
            <MobileStep done={state === "settled_winner"} label="Settle credits" />
          </div>
        </div>
        <div className="grid grid-cols-3 border-t border-slate-200 text-center text-xs font-black text-slate-500">
          <div className="p-3 text-emerald-700">Create</div>
          <div className="p-3">Join</div>
          <div className="p-3">Me</div>
        </div>
      </div>
    </div>
  );
}

function ShellFrame({
  eyebrow,
  title,
  state,
  children,
}: {
  eyebrow: string;
  title: string;
  state: LabState;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[560px] rounded-[28px] p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">{eyebrow}</p>
          <h3 className="mt-1 truncate text-3xl font-black tracking-[-0.055em] text-slate-950">{title}</h3>
        </div>
        <span className={statusBadgeClass(state)}>{stateCopy[state].action}</span>
      </div>
      {children}
    </div>
  );
}

function BrandHeader({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark className={`h-10 w-10 rounded-2xl border p-1.5 ${dark ? "border-white/10 bg-white/10" : "border-emerald-100 bg-emerald-50"}`} />
      <div>
        <p className={`text-sm font-black tracking-[-0.02em] ${dark ? "text-white" : "text-slate-950"}`}>{fixture.appName}</p>
        <p className={`text-xs font-bold ${dark ? "text-white/50" : "text-slate-500"}`}>AI challenge protocol</p>
      </div>
    </div>
  );
}

function FlowTile({ step, label }: { step: string; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-50 text-sm font-black text-emerald-700">{step}</div>
      <p className="text-xl font-black tracking-[-0.035em] text-slate-950">{label}</p>
    </div>
  );
}

function SmallChip({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <span className={`rounded-full px-3 py-2 text-xs font-black ${active ? "bg-[#ffd29a] text-[#7c2d12]" : "bg-slate-50 text-slate-600"}`}>
      {label}
    </span>
  );
}

function InlineAlert({ tone, title, detail }: { tone: "bad" | "warn"; title: string; detail: string }) {
  const classes = tone === "bad" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <div className={`mt-6 rounded-3xl border p-4 ${classes}`}>
      <p className="text-sm font-black">{title}</p>
      <p className="mt-1 text-xs font-semibold">{detail}</p>
    </div>
  );
}

function ProtocolItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">{label}</p>
      <p className="mt-2 text-base font-black tracking-[-0.02em] text-slate-950">{value}</p>
    </div>
  );
}

function ContractRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-black tracking-[-0.025em] text-slate-950">{value}</p>
    </div>
  );
}

function AvatarLine({
  name,
  handle,
  tone,
  inverse = false,
}: {
  name: string;
  handle: string;
  tone: "emerald" | "blue";
  inverse?: boolean;
}) {
  const color = tone === "emerald" ? "bg-emerald-600" : "bg-blue-600";
  return (
    <div className="mt-4 flex items-center gap-3">
      <div className={`grid h-12 w-12 place-items-center rounded-2xl text-sm font-black text-white ${color}`}>{name[0]}</div>
      <div>
        <p className={`text-sm font-black ${inverse ? "text-white" : "text-slate-950"}`}>{name}</p>
        <p className={`text-xs font-bold ${inverse ? "text-white/55" : "text-slate-500"}`}>{handle}</p>
      </div>
    </div>
  );
}

function AvatarCard({ person, status }: { person: typeof fixture.creator; status: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4">
      <AvatarLine name={person.name} handle={person.handle} tone={person.name === fixture.creator.name ? "emerald" : "blue"} />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniStat label="Side" value={person.side} />
        <MiniStat label="Code" value={person.code} />
      </div>
      <p className="mt-3 rounded-full bg-slate-50 px-3 py-2 text-center text-xs font-black text-slate-600">{status}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

function ActionRail({ state }: { state: LabState }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Next action</p>
      <p className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-950">{stateCopy[state].action}</p>
      <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">{stateCopy[state].detail}</p>
      <button type="button" className="mt-5 w-full rounded-full bg-emerald-600 px-4 py-3 text-sm font-black text-white">
        {stateCopy[state].action}
      </button>
      <button type="button" className="mt-2 w-full rounded-full border border-slate-200 px-4 py-3 text-sm font-black text-slate-700">
        Copy invite
      </button>
    </div>
  );
}

function ProofBadge({ label }: { label: string }) {
  return <span className="rounded-full bg-white/10 px-3 py-2 text-xs font-black text-white">{label}</span>;
}

function IdentityCue({ name, text }: { name: string; text: string }) {
  return (
    <div className="rounded-2xl bg-white/10 p-3 text-center">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-white/50">{name} waves</p>
      <p className="mt-1 text-sm font-black text-white">{text}</p>
    </div>
  );
}

function EvidenceStep({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={`rounded-3xl border p-4 ${done ? "border-emerald-100 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <p className={`text-sm font-black ${done ? "text-emerald-700" : "text-slate-500"}`}>{done ? "OK" : "Pending"} - {label}</p>
    </div>
  );
}

function VerdictRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-base font-black leading-snug text-slate-950">{value}</p>
    </div>
  );
}

function BlockingIssues({ issues }: { issues: string[] }) {
  if (issues.length === 0) {
    return (
      <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Blocking issues</p>
        <p className="mt-2 text-base font-black text-slate-950">None</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">Blocking issues</p>
      <div className="mt-2 grid gap-2">
        {issues.map((issue) => (
          <p key={issue} className="rounded-2xl bg-white/70 px-3 py-2 text-sm font-bold text-amber-900">
            {issue}
          </p>
        ))}
      </div>
    </div>
  );
}

function CheckLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-white/70 px-3 py-2">
      <div className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
      <p className="text-sm font-black text-slate-800">{label}</p>
    </div>
  );
}

function LedgerRow({
  actor,
  type,
  amount,
  after,
  highlight = false,
}: {
  actor: string;
  type: string;
  amount: string;
  after: string;
  highlight?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-3xl border p-4 ${highlight ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <div>
        <p className="text-sm font-black text-slate-950">{actor}</p>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{type}</p>
      </div>
      <p className={`text-lg font-black ${amount.startsWith("+") ? "text-emerald-700" : "text-slate-700"}`}>{amount}</p>
      <p className="rounded-full bg-slate-50 px-3 py-2 text-xs font-black text-slate-500">{after}</p>
    </div>
  );
}

function BattleSide({ person, count, tone }: { person: typeof fixture.creator; count: string; tone: "emerald" | "blue" }) {
  const color = tone === "emerald" ? "bg-emerald-400 text-slate-950" : "bg-blue-400 text-slate-950";

  return (
    <div className="flex flex-col justify-between rounded-[28px] border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <AvatarLine name={person.name} handle={person.handle} tone={tone} inverse />
        <span className={`rounded-full px-3 py-2 text-xs font-black ${color}`}>{person.side}</span>
      </div>
      <div className="grid place-items-center py-12">
        <div className="text-center">
          <p className="text-8xl font-black leading-none tracking-[-0.08em]">{count}</p>
          <p className="mt-2 text-xs font-black uppercase tracking-[0.2em] text-white/50">valid reps</p>
        </div>
      </div>
      <div className="rounded-2xl bg-white/10 p-3 text-center text-sm font-black">Optional code {person.code}</div>
    </div>
  );
}

function MobileStep({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
      <div className={`h-3 w-3 rounded-full ${done ? "bg-emerald-500" : "bg-slate-300"}`} />
      <p className="text-sm font-black text-slate-800">{label}</p>
    </div>
  );
}

function statusBadgeClass(state: LabState) {
  if (state === "error") return "rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-700";
  if (state === "blocked" || state === "manual_review") return "rounded-full bg-amber-50 px-3 py-2 text-xs font-black text-amber-700";
  if (state === "settled_winner" || state === "auto_settle_eligible") {
    return "rounded-full bg-emerald-600 px-3 py-2 text-xs font-black text-white";
  }
  return "rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-600";
}

function stepForState(state: LabState) {
  if (state === "waiting_opponent" || state === "logged_in_creator" || state === "logged_out") return 0;
  if (state === "accepted") return 1;
  if (state === "evidence_uploaded" || state === "judging") return 2;
  if (state === "settled_winner" || state === "settled_tie" || state === "auto_settle_eligible") return 3;
  return 1;
}
