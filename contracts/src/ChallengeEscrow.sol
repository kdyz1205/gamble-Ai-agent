// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "./UsageToken.sol";

/**
 * ChallengeEscrow — Bet with AI model tokens (ERC-1155)
 *
 * You can stake ANY model tier. Higher tier = more valuable bet.
 * Both sides must stake the same model tier and amount.
 * Winner takes all staked tokens.
 *
 * Example:
 *   Player A stakes 5 OPUS tokens ($1.25 worth)
 *   Player B stakes 5 OPUS tokens ($1.25 worth)
 *   AI judges → Winner gets 10 OPUS tokens ($2.50 worth)
 *   Those OPUS tokens = 10 real Opus-level AI inference calls
 */
contract ChallengeEscrow is Ownable, ERC1155Holder {
    UsageToken public immutable usageToken;

    enum Status { Open, Live, Settled, Cancelled }

    struct Challenge {
        bytes32 id;
        address creator;
        address opponent;
        uint256 modelId;    // which tier token is being staked
        uint256 stake;      // tokens per side
        Status status;
        address winner;
    }

    mapping(bytes32 => Challenge) public challenges;
    mapping(address => bool) public authorizedJudges;

    event ChallengeCreated(bytes32 indexed id, address indexed creator, uint256 modelId, uint256 stake);
    event ChallengeAccepted(bytes32 indexed id, address indexed opponent);
    event ChallengeSettled(bytes32 indexed id, address indexed winner, uint256 modelId, uint256 payout);
    event ChallengeCancelled(bytes32 indexed id);
    event JudgeUpdated(address indexed judge, bool authorized);

    constructor(address _usageToken) Ownable(msg.sender) {
        usageToken = UsageToken(_usageToken);
    }

    function createChallenge(bytes32 challengeId, uint256 modelId, uint256 stake) external {
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
            status: Status.Open,
            winner: address(0)
        });

        emit ChallengeCreated(challengeId, msg.sender, modelId, stake);
    }

    function acceptChallenge(bytes32 challengeId) external {
        Challenge storage c = challenges[challengeId];
        require(c.status == Status.Open, "Not open");
        require(c.creator != msg.sender, "Own challenge");
        require(c.opponent == address(0), "Taken");

        usageToken.safeTransferFrom(msg.sender, address(this), c.modelId, c.stake, "");

        c.opponent = msg.sender;
        c.status = Status.Live;

        emit ChallengeAccepted(challengeId, msg.sender);
    }

    function settle(bytes32 challengeId, address winner) external {
        require(authorizedJudges[msg.sender], "Not judge");
        Challenge storage c = challenges[challengeId];
        require(c.status == Status.Live, "Not live");

        c.status = Status.Settled;
        uint256 totalPayout = c.stake * 2;

        if (winner == address(0)) {
            usageToken.safeTransferFrom(address(this), c.creator, c.modelId, c.stake, "");
            usageToken.safeTransferFrom(address(this), c.opponent, c.modelId, c.stake, "");
            emit ChallengeSettled(challengeId, address(0), c.modelId, 0);
        } else {
            require(winner == c.creator || winner == c.opponent, "Invalid winner");
            c.winner = winner;
            usageToken.safeTransferFrom(address(this), winner, c.modelId, totalPayout, "");
            emit ChallengeSettled(challengeId, winner, c.modelId, totalPayout);
        }
    }

    function cancel(bytes32 challengeId) external {
        Challenge storage c = challenges[challengeId];
        require(c.status == Status.Open, "Not open");
        require(c.creator == msg.sender || authorizedJudges[msg.sender], "Not authorized");

        c.status = Status.Cancelled;
        usageToken.safeTransferFrom(address(this), c.creator, c.modelId, c.stake, "");

        emit ChallengeCancelled(challengeId);
    }

    function setAuthorizedJudge(address judge, bool authorized) external onlyOwner {
        authorizedJudges[judge] = authorized;
        emit JudgeUpdated(judge, authorized);
    }
}
