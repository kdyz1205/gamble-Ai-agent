// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "./UsageToken.sol";

/**
 * ChallengeEscrow — ERC-1155 stakes + off-chain AI oracle settlement.
 *
 * State machine (contract does NOT judge; it only executes payouts from oracle calls):
 *   Created  → opponent accepts → Active
 *   Active   → onlyJudge beginJudging → Judging (escrow locked; no cancel/refund)
 *   Judging  → onlyJudge settle(winner, evidenceHash) → Settled (immediate token payout)
 *   Judging  → onlyJudge markDisputed → Disputed (owner resolves manually)
 *
 * On-chain challenge id is uint256 — use uint256(keccak256(abi.encodePacked(offChainUuid))) off-chain.
 */
contract ChallengeEscrow is Ownable, ERC1155Holder {
    UsageToken public immutable usageToken;

    enum State {
        Created,
        Active,
        Judging,
        Settled,
        Disputed
    }

    struct Challenge {
        uint256 id;
        address creator;
        address opponent;
        uint256 modelId;
        uint256 stake;
        State state;
        address winner;
        bytes32 evidenceHash;
    }

    mapping(uint256 => Challenge) public challenges;

    /// @notice Single oracle backend (AI judge wallet). Only this address may advance to Judging / Settle.
    address public judgeAddress;

    event ChallengeCreated(uint256 indexed id, address indexed creator, uint256 modelId, uint256 stake);
    event ChallengeAccepted(uint256 indexed id, address indexed opponent);
    event ChallengeJudging(uint256 indexed id);
    event ChallengeSettled(
        uint256 indexed id,
        address indexed winner,
        uint256 modelId,
        uint256 payout,
        bytes32 evidenceHash
    );
    event ChallengeCancelled(uint256 indexed id);
    event ChallengeDisputed(uint256 indexed id);
    event JudgeRotated(address indexed previousJudge, address indexed newJudge);

    modifier onlyJudge() {
        require(msg.sender == judgeAddress, "Not judge");
        _;
    }

    constructor(address _usageToken, address initialJudge) Ownable(msg.sender) {
        require(initialJudge != address(0), "Zero judge");
        usageToken = UsageToken(_usageToken);
        judgeAddress = initialJudge;
    }

    function setJudge(address newJudge) external onlyOwner {
        require(newJudge != address(0), "Zero judge");
        emit JudgeRotated(judgeAddress, newJudge);
        judgeAddress = newJudge;
    }

    function createChallenge(uint256 challengeId, uint256 modelId, uint256 stake) external {
        require(challenges[challengeId].creator == address(0), "Exists");
        require(stake > 0, "Zero stake");
        require(modelId >= 1 && modelId <= 3, "Invalid model tier");

        usageToken.safeTransferFrom(msg.sender, address(this), modelId, stake, "");

        challenges[challengeId] = Challenge({
            id: challengeId,
            creator: msg.sender,
            opponent: address(0),
            modelId: modelId,
            stake: stake,
            state: State.Created,
            winner: address(0),
            evidenceHash: bytes32(0)
        });

        emit ChallengeCreated(challengeId, msg.sender, modelId, stake);
    }

    function acceptChallenge(uint256 challengeId) external {
        Challenge storage c = challenges[challengeId];
        require(c.state == State.Created, "Not created");
        require(c.creator != msg.sender, "Own challenge");
        require(c.opponent == address(0), "Taken");

        usageToken.safeTransferFrom(msg.sender, address(this), c.modelId, c.stake, "");

        c.opponent = msg.sender;
        c.state = State.Active;

        emit ChallengeAccepted(challengeId, msg.sender);
    }

    /// @notice Refund only while still waiting for opponent. Not allowed in Active / Judging / etc.
    function cancel(uint256 challengeId) external {
        Challenge storage c = challenges[challengeId];
        require(c.state == State.Created, "Not cancelable");
        require(c.creator == msg.sender || msg.sender == judgeAddress, "Not authorized");

        uint256 mid = c.modelId;
        uint256 st = c.stake;
        address cr = c.creator;

        delete challenges[challengeId];

        usageToken.safeTransferFrom(address(this), cr, mid, st, "");

        emit ChallengeCancelled(challengeId);
    }

    /// @notice Oracle locks the pool for adjudication (matches off-chain "judging" status).
    function beginJudging(uint256 challengeId) external onlyJudge {
        Challenge storage c = challenges[challengeId];
        require(c.state == State.Active, "Not active");
        c.state = State.Judging;
        emit ChallengeJudging(challengeId);
    }

    /**
     * @notice Final settlement: only from Judging. Commits evidenceHash (e.g. keccak256 of verdict payload) then pays winner.
     * @param winner address(0) => tie / void — both sides refunded their stake.
     */
    function settle(uint256 challengeId, address winner, bytes32 evidenceHash) external onlyJudge {
        Challenge storage c = challenges[challengeId];
        require(c.state == State.Judging, "Not judging");
        require(evidenceHash != bytes32(0), "Zero hash");

        c.evidenceHash = evidenceHash;
        c.state = State.Settled;

        uint256 totalPayout = c.stake * 2;

        if (winner == address(0)) {
            usageToken.safeTransferFrom(address(this), c.creator, c.modelId, c.stake, "");
            usageToken.safeTransferFrom(address(this), c.opponent, c.modelId, c.stake, "");
            emit ChallengeSettled(challengeId, address(0), c.modelId, 0, evidenceHash);
        } else {
            require(winner == c.creator || winner == c.opponent, "Invalid winner");
            c.winner = winner;
            usageToken.safeTransferFrom(address(this), winner, c.modelId, totalPayout, "");
            emit ChallengeSettled(challengeId, winner, c.modelId, totalPayout, evidenceHash);
        }
    }

    /// @notice Escalate without payout; funds stay locked until owner resolves.
    function markDisputed(uint256 challengeId) external onlyJudge {
        Challenge storage c = challenges[challengeId];
        require(c.state == State.Judging, "Not judging");
        c.state = State.Disputed;
        emit ChallengeDisputed(challengeId);
    }

    /**
     * @notice Owner-only escape hatch after Disputed (human / DAO arbitration).
     * Same payout semantics as settle; reuses evidenceHash commitment.
     */
    function resolveDispute(uint256 challengeId, address winner, bytes32 evidenceHash) external onlyOwner {
        Challenge storage c = challenges[challengeId];
        require(c.state == State.Disputed, "Not disputed");
        require(evidenceHash != bytes32(0), "Zero hash");

        c.evidenceHash = evidenceHash;
        c.state = State.Settled;

        uint256 totalPayout = c.stake * 2;

        if (winner == address(0)) {
            usageToken.safeTransferFrom(address(this), c.creator, c.modelId, c.stake, "");
            usageToken.safeTransferFrom(address(this), c.opponent, c.modelId, c.stake, "");
            emit ChallengeSettled(challengeId, address(0), c.modelId, 0, evidenceHash);
        } else {
            require(winner == c.creator || winner == c.opponent, "Invalid winner");
            c.winner = winner;
            usageToken.safeTransferFrom(address(this), winner, c.modelId, totalPayout, "");
            emit ChallengeSettled(challengeId, winner, c.modelId, totalPayout, evidenceHash);
        }
    }
}
