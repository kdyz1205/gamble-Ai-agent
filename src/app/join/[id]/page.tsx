"use client";

import { useEffect, useState, use } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSession } from "next-auth/react";
import Link from "next/link";
import AuthModal from "@/components/AuthModal";
import * as api from "@/lib/api-client";
import { acceptanceContract, challengeUsesChineseCopy, compactChallengeRules, parseChallengeRules, settlementSummary } from "@/lib/challenge-display";
import { formatChallengeDeadline } from "@/lib/challenge-time";
import { isAiReviewStatus, isEvidenceWindowStatus, isOpenForOpponentStatus } from "@/lib/challenge-state-machine";

interface Challenge {
  id: string;
  title: string;
  type: string;
  status: string;
  stake: number;
  deadline: string | null;
  rules: string | null;
  evidenceType: string;
  stakeToken: string;
  disputeWindow: string | null;
  proofWindow: string | null;
  settlementMode: string;
  fallbackRule: string | null;
  locationMode?: string | null;
  creator: { id: string; username: string };
}

type JoinLocationStatus = "idle" | "checking" | "ready" | "blocked" | "unavailable";

const LOCATION_GATED_MODES = new Set([
  "nearby_discovery",
  "same_place_required",
  "walk_to_join",
  "geo_fenced_zone",
  "live_route",
  "mass_local_event",
]);

const NAVY = "#1E293B";
const NAVY_DIM = "#64748B";
const NAVY_FAINT = "#E2E8F0";
const PEACH = "#FED7AA";
const PEACH_TEXT = "#7C2D12";
const ORANGE_GLOW = "rgba(251,146,60,0.39)";
const MINT = "#A7F3D0";
const MINT_TEXT = "#065F46";
const LAVENDER = "#E9D5FF";
const CREAM = "#FFEDD5";
const ROSE_BG = "#FECACA";
const ROSE_TEXT = "#991B1B";

export default function JoinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const user = session?.user as { id: string; username: string } | undefined;

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [contractAccepted, setContractAccepted] = useState(false);
  const [locationSnapshot, setLocationSnapshot] = useState<api.LocationSnapshot | null>(null);
  const [locationStatus, setLocationStatus] = useState<JoinLocationStatus>("idle");
  const [locationMessage, setLocationMessage] = useState<string | null>(null);

  useEffect(() => {
    api.getChallenge(id)
      .then((res) => {
        setChallenge(res.challenge);
        setLoading(false);
      })
      .catch(() => {
        setError("Can't find this challenge.");
        setLoading(false);
      });
  }, [id]);

  const needsLocationGate = (target: Challenge | null) => {
    if (!target?.locationMode) return false;
    return LOCATION_GATED_MODES.has(target.locationMode);
  };

  const requestBrowserLocation = () => new Promise<api.LocationSnapshot>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser cannot provide location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => reject(new Error("Location permission is required before joining this nearby challenge.")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  });

  const verifyLocationForJoin = async (): Promise<api.LocationSnapshot> => {
    setLocationStatus("checking");
    setLocationMessage("Checking whether you are close enough to join...");
    let snapshot: api.LocationSnapshot;
    try {
      snapshot = await requestBrowserLocation();
    } catch (err) {
      setLocationSnapshot(null);
      setLocationStatus("unavailable");
      setLocationMessage(err instanceof Error ? err.message : "Location permission is required before joining this nearby challenge.");
      throw err;
    }
    const result = await api.checkLocationEligibility(id, snapshot);
    if (!result.eligible) {
      setLocationSnapshot(null);
      setLocationStatus("blocked");
      const distanceLabel = result.distanceMeters == null
        ? ""
        : ` You are about ${Math.round(result.distanceMeters)}m away; required radius is ${result.requiredRadiusMeters}m.`;
      setLocationMessage(`${result.reason}${distanceLabel}`);
      throw new Error(result.reason);
    }
    setLocationSnapshot(snapshot);
    setLocationStatus("ready");
    setLocationMessage(result.reason);
    return snapshot;
  };

  const handleCheckLocation = async () => {
    if (!challenge) return;
    if (!user) {
      setShowAuth(true);
      setError("Sign in before checking location.");
      return;
    }
    setError(null);
    try {
      await verifyLocationForJoin();
    } catch (err) {
      setLocationStatus(err instanceof Error && err.message.includes("permission") ? "unavailable" : "blocked");
      setError(err instanceof Error ? err.message : "Could not verify your location.");
    }
  };

  const handleAccept = async () => {
    if (!contractAccepted) {
      setError("Accept the rule contract first.");
      return;
    }
    if (!user) {
      setShowAuth(true);
      return;
    }
    setAccepting(true);
    setError(null);
    try {
      const joinSnapshot = challenge && needsLocationGate(challenge)
        ? await verifyLocationForJoin()
        : locationSnapshot;
      await api.acceptChallenge(id, joinSnapshot ?? null, { acceptedRuleContract: true });
      setAccepted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept challenge.");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <motion.div
          className="w-10 h-10 rounded-full border-[3px] border-t-transparent"
          style={{ borderColor: PEACH, borderTopColor: "transparent" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
        <span className="text-sm font-semibold" style={{ color: NAVY_DIM }}>
          Loading the challenge...
        </span>
      </div>
    );
  }

  if (error && !challenge) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-5">
        <p className="text-base font-bold" style={{ color: ROSE_TEXT }}>
          {error}
        </p>
        <Link
          href="/"
          className="px-5 py-2.5 text-sm font-bold active:scale-95 transition-transform"
          style={{
            color: PEACH_TEXT,
            background: PEACH,
            borderRadius: "9999px",
            boxShadow: `0 4px 14px 0 ${ORANGE_GLOW}`,
          }}
        >
          Create a new challenge
        </Link>
        <Link
          href="/markets"
          className="px-5 py-2.5 text-sm font-bold active:scale-95 transition-transform"
          style={{
            color: NAVY,
            background: "#FFFFFF",
            border: `1px solid ${NAVY_FAINT}`,
            borderRadius: "9999px",
          }}
        >
          Back to challenge manager
        </Link>
      </div>
    );
  }

  const c = challenge!;
  const stakeLabel = c.stake > 0 ? `${c.stake} cr` : "Free";
  const ruleCards = parseChallengeRules(c);
  const compactRules = compactChallengeRules(c);
  const contract = acceptanceContract(c);
  const zhCopy = challengeUsesChineseCopy(c);
  const locationGateRequired = needsLocationGate(c);
  const rawDeadlineLabel = formatChallengeDeadline(c.deadline, { includePrefix: !zhCopy });
  const deadlineLabel = zhCopy && rawDeadlineLabel
    ? rawDeadlineLabel === "Deadline passed" ? "已过期" : `截止 ${rawDeadlineLabel}`
    : rawDeadlineLabel;

  return (
    <div className="min-h-screen relative">
      <header className="relative z-20 flex items-center justify-between px-5 py-4">
        <Link href="/" className="text-base font-bold tracking-tight" style={{ color: NAVY }}>
          Axelrod
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/markets"
            className="text-xs font-bold px-3 py-1.5 active:scale-95 transition-transform"
            style={{ color: NAVY, background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "9999px" }}
          >
            My challenges
          </Link>
          <Link
            href="/radar"
            className="hidden text-xs font-bold px-3 py-1.5 active:scale-95 transition-transform sm:inline-block"
            style={{ color: MINT_TEXT, background: MINT, borderRadius: "9999px" }}
          >
            Radar
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-lg mx-auto px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
          className="lp-glass overflow-hidden"
          style={{ borderRadius: "28px", boxShadow: "0 8px 30px rgba(15,23,42,0.04)" }}
        >
          <div
            className="px-5 py-3 text-center"
            style={{
              background: `linear-gradient(90deg, ${PEACH}1A, ${LAVENDER}1A, ${MINT}1A)`,
              borderBottom: `1px solid ${NAVY_FAINT}`,
            }}
          >
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: PEACH_TEXT }}>
              You have been challenged
            </span>
          </div>

          <div className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-base font-extrabold"
                style={{ background: PEACH, color: PEACH_TEXT }}
              >
                {c.creator.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: NAVY }}>
                  {c.creator.username}
                </p>
                <p className="text-xs font-medium" style={{ color: NAVY_DIM }}>
                  {zhCopy ? "邀请你挑战" : "challenged you"}
                </p>
              </div>
              <span
                className="ml-auto text-[11px] font-bold px-2.5 py-1"
                style={{ color: PEACH_TEXT, background: CREAM, borderRadius: "9999px" }}
              >
                {c.type}
              </span>
            </div>

            <h1 className="text-2xl font-extrabold mb-5 leading-tight" style={{ color: NAVY }}>
              {c.title}
            </h1>

            <div className="mb-5 px-4 py-3" style={{ background: `${MINT}14`, border: `1px solid ${MINT}55`, borderRadius: "16px" }}>
              <p className="text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: MINT_TEXT }}>
                {zhCopy ? "快速了解" : "Quick read"}
              </p>
              <p className="text-sm font-semibold leading-relaxed" style={{ color: NAVY }}>
                {zhCopy ? "同意规则，提交证据，AI 给出判定建议。" : "Accept rules. Submit proof. AI recommends the winner."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-5">
              <div
                className="px-3 py-3"
                style={{
                  background: `${c.stake > 0 ? PEACH : MINT}14`,
                  border: `1px solid ${(c.stake > 0 ? PEACH : MINT)}33`,
                  borderRadius: "16px",
                }}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: NAVY_DIM }}>
                  {zhCopy ? "积分" : "Stake"}
                </p>
                <p className="text-sm font-bold" style={{ color: NAVY }}>
                  {stakeLabel}
                </p>
              </div>
              <div
                className="px-3 py-3"
                style={{ background: `${MINT}14`, border: `1px solid ${MINT}33`, borderRadius: "16px" }}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: NAVY_DIM }}>
                  {zhCopy ? "证据" : "Evidence"}
                </p>
                <p className="text-sm font-bold" style={{ color: NAVY }}>
                  {c.evidenceType.replace(/_/g, " ")}
                </p>
              </div>
            </div>

            <div className="grid gap-2 mb-5">
              {compactRules.map((card) => (
                <div
                  key={card.label}
                  className="px-4 py-3"
                  style={{ background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "16px" }}
                >
                  <p className="text-[10px] font-black uppercase tracking-wider mb-1" style={{ color: MINT_TEXT }}>
                    {card.label}
                  </p>
                  <p className="text-sm font-semibold leading-relaxed" style={{ color: NAVY }}>
                    {card.value}
                  </p>
                </div>
              ))}
              {ruleCards.length > 0 && (
                <details className="px-4 py-3" style={{ background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "16px" }}>
                  <summary className="cursor-pointer text-xs font-black" style={{ color: NAVY }}>
                    {zhCopy ? "完整规则" : "Full rules"}
                  </summary>
                  <div className="mt-3 grid gap-2">
                    {ruleCards.map((card) => (
                      <div key={card.label}>
                        <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: NAVY_DIM }}>
                          {card.label}
                        </p>
                        <p className="text-xs font-semibold leading-relaxed" style={{ color: NAVY }}>
                          {card.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            {locationGateRequired && (
              <div
                className="mb-5 px-4 py-3"
                style={{
                  background: locationStatus === "ready" ? `${MINT}18` : "#FFFFFF",
                  border: `1px solid ${locationStatus === "ready" ? MINT : NAVY_FAINT}`,
                  borderRadius: "16px",
                }}
              >
                <p className="text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: MINT_TEXT }}>
                  {zhCopy ? "需要位置" : "Location required"}
                </p>
                <p className="text-sm font-semibold leading-relaxed mb-3" style={{ color: NAVY }}>
                  {zhCopy ? "加入前需要位置验证。" : "Location check required to join."}
                </p>
                {locationMessage && (
                  <p
                    className="text-xs font-bold leading-relaxed mb-3"
                    style={{ color: locationStatus === "blocked" || locationStatus === "unavailable" ? ROSE_TEXT : MINT_TEXT }}
                  >
                    {locationMessage}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleCheckLocation}
                  disabled={locationStatus === "checking"}
                  className="px-4 py-2 text-xs font-extrabold disabled:opacity-60 active:scale-95 transition-transform"
                  style={{
                    background: locationStatus === "ready" ? MINT : PEACH,
                    color: locationStatus === "ready" ? MINT_TEXT : PEACH_TEXT,
                    borderRadius: "9999px",
                  }}
                >
                  {locationStatus === "checking"
                    ? zhCopy ? "验证中..." : "Checking..."
                    : locationStatus === "ready"
                      ? zhCopy ? "位置已验证" : "Location verified"
                      : zhCopy ? "验证位置" : "Check location"}
                </button>
              </div>
            )}

            <div className="mb-5 px-4 py-3" style={{ background: CREAM, border: "1px solid #FFE0CC", borderRadius: "16px" }}>
              <p className="text-[11px] font-black uppercase tracking-wider mb-2" style={{ color: PEACH_TEXT }}>
                {zhCopy ? "接受" : "Accept"}
              </p>
              <p className="text-xs font-bold mb-3" style={{ color: PEACH_TEXT }}>
                {settlementSummary(c)}
              </p>
              <details className="mb-3">
              <summary className="cursor-pointer text-xs font-black" style={{ color: PEACH_TEXT }}>
                  {zhCopy ? "完整条款" : "Full terms"}
                </summary>
                <ul className="mt-2 space-y-1.5">
                  {contract.map((item) => (
                    <li key={item} className="text-xs font-semibold leading-relaxed" style={{ color: NAVY }}>
                      - {item}
                    </li>
                  ))}
                </ul>
              </details>
              <label className="flex items-start gap-2 text-xs font-bold cursor-pointer" style={{ color: NAVY }}>
                <input
                  type="checkbox"
                  checked={contractAccepted}
                  onChange={(event) => setContractAccepted(event.target.checked)}
                  className="mt-0.5"
                />
                <span>{zhCopy ? "我同意规则、AI 判定、争议处理和积分结算。" : "I accept rules, AI judging, disputes, and credits."}</span>
              </label>
            </div>

            {deadlineLabel && (
              <div className="mb-5 px-4 py-2.5" style={{ background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "16px" }}>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-0.5" style={{ color: NAVY_DIM }}>
                  {zhCopy ? "截止时间" : "Deadline"}
                </p>
                <p className="text-sm font-bold" style={{ color: NAVY }}>
                  {deadlineLabel}
                </p>
              </div>
            )}

            <AnimatePresence mode="wait">
              {accepted ? (
                <motion.div
                  key="accepted"
                  className="text-center py-5"
                  style={{
                    background: MINT,
                    border: `1px solid ${MINT}`,
                    borderRadius: "20px",
                    boxShadow: "0 4px 14px 0 rgba(110,231,183,0.40)",
                  }}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <p className="text-lg font-extrabold mb-1" style={{ color: MINT_TEXT }}>
                    {zhCopy ? "你已加入。" : "You are in."}
                  </p>
                  <p className="text-sm font-medium" style={{ color: MINT_TEXT, opacity: 0.85 }}>
                    {zhCopy ? "请在截止前提交证据。" : "Submit your evidence before the deadline."}
                  </p>
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <Link
                      href={`/challenge/${id}`}
                      className="inline-block mt-4 px-5 py-2.5 text-sm font-bold active:scale-95 transition-transform"
                      style={{
                        background: "#FFFFFF",
                        color: MINT_TEXT,
                        border: `1px solid ${MINT}`,
                        borderRadius: "9999px",
                      }}
                    >
                      {zhCopy ? "进入挑战" : "Go to the challenge"}
                    </Link>
                  </motion.div>
                </motion.div>
              ) : !isOpenForOpponentStatus(c.status) ? (
                <motion.div
                  key="closed"
                  className="text-center py-4 px-4"
                  style={{ background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "16px" }}
                >
                  <p className="text-sm font-bold" style={{ color: NAVY_DIM }}>
                    {isEvidenceWindowStatus(c.status)
                      ? zhCopy ? "挑战已开始，请提交证据。" : "Challenge is live. Go submit evidence."
                      : isAiReviewStatus(c.status)
                        ? zhCopy ? "AI 正在复核。" : "AI is reviewing."
                        : c.status === "settled"
                          ? zhCopy ? "已结算。" : "Already settled."
                          : zhCopy ? "这个挑战已不再开放。" : "This challenge is no longer open."}
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Link
                      href={`/challenge/${id}`}
                      className="px-4 py-2 text-xs font-black active:scale-95 transition-transform"
                      style={{ color: MINT_TEXT, background: MINT, borderRadius: "9999px" }}
                    >
                      {zhCopy ? "打开挑战房间" : "Open challenge room"}
                    </Link>
                    <Link
                      href="/markets"
                      className="px-4 py-2 text-xs font-black active:scale-95 transition-transform"
                      style={{ color: NAVY, background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "9999px" }}
                    >
                      {zhCopy ? "返回管理页" : "Back to manager"}
                    </Link>
                  </div>
                </motion.div>
              ) : (
                <motion.button
                  key="accept"
                  onClick={handleAccept}
                  disabled={accepting || !contractAccepted}
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  className="w-full py-4 text-base font-extrabold disabled:opacity-60"
                  style={{
                    background: accepting || !contractAccepted ? NAVY_FAINT : PEACH,
                    color: accepting || !contractAccepted ? NAVY_DIM : PEACH_TEXT,
                    borderRadius: "9999px",
                    boxShadow: accepting || !contractAccepted ? "none" : `0 4px 14px 0 ${ORANGE_GLOW}`,
                  }}
                >
                  {accepting
                    ? zhCopy ? "加入中..." : "Joining..."
                    : c.stake > 0
                      ? zhCopy ? `接受并托管 ${stakeLabel}` : `Accept + lock ${stakeLabel}`
                      : zhCopy ? "接受并加入" : "Accept + join"}
                </motion.button>
              )}
            </AnimatePresence>

            {error && !accepted && (
              <p
                className="text-xs font-semibold text-center mt-3 px-3 py-2"
                style={{ color: ROSE_TEXT, background: ROSE_BG, borderRadius: "12px" }}
              >
                {error}
              </p>
            )}

            {!user && !accepted && (
              <p className="text-sm font-medium text-center mt-3" style={{ color: NAVY_DIM }}>
                <button
                  onClick={() => setShowAuth(true)}
                  className="font-extrabold underline decoration-dotted"
                  style={{ color: PEACH_TEXT }}
                >
                  Sign in
                </button>{" "}
                to accept this challenge
              </p>
            )}
          </div>
        </motion.div>
      </main>

      <AuthModal
        open={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={() => setShowAuth(false)}
      />
    </div>
  );
}
