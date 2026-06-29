export const mockWorldData = {
  gateway: {
    title: "Summoners World",
    subtitle: "A bright quest realm for challenges, proof, Familiars, and receipts.",
    trust: ["Familiar review online", "Credit ledger guarded", "Proof trail sealed"],
  },
  contract: {
    challenger: {
      name: "Summoner",
      presence: "Challenger",
      familiar: "OracleX",
      image: "/scene/quixnova/familiars/oraclex.png",
      pnl: "+820 XP",
      seal: "S+",
      winRate: "12-4",
    },
    opponent: {
      name: "EdgeHound",
      presence: "Challenger",
      familiar: "Momentum Hunter",
      image: "/scene/quixnova/familiars/edgehound.png",
      pnl: "+610 XP",
      seal: "A+",
      winRate: "9-5",
    },
    pact: {
      title: "Summoner Challenges EdgeHound",
      condition: "Win condition: achieve victory by the defined strategy.",
      proof: "Proof requirement: uploaded proof and final Familiar review.",
      stake: "Quest entry: internal credits stay tracked until the result.",
    },
  },
} as const;
