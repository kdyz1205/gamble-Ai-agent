// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * AI Usage Token — ERC-1155 Multi-Tier Model Tokens
 *
 * Each token ID = a different AI model tier:
 *   ID 1 = HAIKU   (fast, cheap)       → 1 token = 1 Haiku inference
 *   ID 2 = SONNET  (balanced)          → 1 token = 1 Sonnet inference
 *   ID 3 = OPUS    (most powerful)     → 1 token = 1 Opus inference
 *
 * Pricing (USDC per token):
 *   HAIKU  = $0.01 (1 USDC = 100 HAIKU tokens)
 *   SONNET = $0.05 (1 USDC = 20  SONNET tokens)
 *   OPUS   = $0.25 (1 USDC = 4   OPUS tokens)
 *
 * Each token is:
 *   - Mintable:     deposit USDC → get model tokens
 *   - Burnable:     consumed when that model is called (on-chain proof)
 *   - Transferable: sell your unused Opus tokens, buy Haiku, trade freely
 *   - Stakeable:    lock in ChallengeEscrow for bets (Opus stakes worth more)
 *
 * Inspired by: DeRouter, Morpheus, ERC-4885, Compute Labs
 */
contract UsageToken is ERC1155, Ownable {
    IERC20 public immutable usdc;

    // Model tier IDs
    uint256 public constant HAIKU  = 1;
    uint256 public constant SONNET = 2;
    uint256 public constant OPUS   = 3;

    // Price per token in USDC micro-units (6 decimals)
    // HAIKU = 0.01 USDC = 10_000 micro-USDC
    // SONNET = 0.05 USDC = 50_000 micro-USDC
    // OPUS = 0.25 USDC = 250_000 micro-USDC
    mapping(uint256 => uint256) public pricePerToken;

    // Authorized burners (server wallet, escrow contract)
    mapping(address => bool) public authorizedBurners;

    // On-chain inference log
    event InferenceBurned(
        address indexed user,
        uint256 indexed modelId,
        uint256 amount,
        string action,
        bytes32 requestId
    );
    event TokensMinted(
        address indexed user,
        uint256 indexed modelId,
        uint256 usdcPaid,
        uint256 tokensMinted
    );
    event BurnerUpdated(address indexed burner, bool authorized);
    event PriceUpdated(uint256 indexed modelId, uint256 newPrice);

    constructor(address _usdc) ERC1155("") Ownable(msg.sender) {
        usdc = IERC20(_usdc);

        pricePerToken[HAIKU]  = 10_000;   // $0.01
        pricePerToken[SONNET] = 50_000;   // $0.05
        pricePerToken[OPUS]   = 250_000;  // $0.25
    }

    /**
     * Buy model tokens with USDC.
     * @param modelId  Which model tier (1=HAIKU, 2=SONNET, 3=OPUS)
     * @param usdcAmount How much USDC to spend (6 decimals)
     */
    function mint(uint256 modelId, uint256 usdcAmount) external {
        require(pricePerToken[modelId] > 0, "Invalid model");
        require(usdcAmount > 0, "Zero amount");

        uint256 tokensOut = usdcAmount / pricePerToken[modelId];
        require(tokensOut > 0, "Amount too small");

        require(usdc.transferFrom(msg.sender, address(this), usdcAmount), "USDC transfer failed");

        _mint(msg.sender, modelId, tokensOut, "");
        emit TokensMinted(msg.sender, modelId, usdcAmount, tokensOut);
    }

    /**
     * Server burns a token when AI is called — on-chain proof of inference.
     */
    function burnForInference(
        address user,
        uint256 modelId,
        uint256 amount,
        string calldata action,
        bytes32 requestId
    ) external {
        require(authorizedBurners[msg.sender], "Not authorized");
        _burn(user, modelId, amount);
        emit InferenceBurned(user, modelId, amount, action, requestId);
    }

    /**
     * User self-burns (e.g. direct SDK usage).
     */
    function burnSelf(
        uint256 modelId,
        uint256 amount,
        string calldata action,
        bytes32 requestId
    ) external {
        _burn(msg.sender, modelId, amount);
        emit InferenceBurned(msg.sender, modelId, amount, action, requestId);
    }

    /**
     * Provider deposits: AI subscription provider mints tokens backed by
     * their own subscription capacity.
     * Only callable by owner (platform) after verifying provider's API key works.
     */
    function providerMint(
        address provider,
        uint256 modelId,
        uint256 amount
    ) external onlyOwner {
        require(pricePerToken[modelId] > 0, "Invalid model");
        _mint(provider, modelId, amount, "");
        emit TokensMinted(provider, modelId, 0, amount);
    }

    // ── Admin ──

    function setAuthorizedBurner(address burner, bool authorized) external onlyOwner {
        authorizedBurners[burner] = authorized;
        emit BurnerUpdated(burner, authorized);
    }

    function setPrice(uint256 modelId, uint256 newPrice) external onlyOwner {
        pricePerToken[modelId] = newPrice;
        emit PriceUpdated(modelId, newPrice);
    }

    function withdrawUSDC(uint256 amount) external onlyOwner {
        require(usdc.transfer(owner(), amount), "Withdraw failed");
    }

    function uri(uint256 modelId) public pure override returns (string memory) {
        if (modelId == HAIKU)  return "https://challengeai.app/tokens/haiku.json";
        if (modelId == SONNET) return "https://challengeai.app/tokens/sonnet.json";
        if (modelId == OPUS)   return "https://challengeai.app/tokens/opus.json";
        return "";
    }
}
