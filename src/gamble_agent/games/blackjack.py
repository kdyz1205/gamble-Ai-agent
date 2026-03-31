"""Blackjack game engine with simplified rules."""

from __future__ import annotations

import random

from gamble_agent.domain.models import Bet, BetOutcome, BetResult, GameType
from gamble_agent.games.base import GameEngine

# Card values: 2-10 face value, J/Q/K = 10, A = 11 or 1
CARD_VALUES: dict[str, int] = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
    "9": 9, "10": 10, "J": 10, "Q": 10, "K": 10, "A": 11,
}
SUITS = ["hearts", "diamonds", "clubs", "spades"]
RANKS = list(CARD_VALUES.keys())


def _make_deck(num_decks: int = 6) -> list[str]:
    """Create an unshuffled multi-deck shoe."""
    return [f"{rank}_{suit}" for suit in SUITS for rank in RANKS] * num_decks


def _hand_value(hand: list[str]) -> int:
    """Calculate the best hand value, adjusting aces as needed."""
    value = 0
    aces = 0
    for card in hand:
        rank = card.split("_")[0]
        value += CARD_VALUES[rank]
        if rank == "A":
            aces += 1
    while value > 21 and aces > 0:
        value -= 10
        aces -= 1
    return value


def _is_blackjack(hand: list[str]) -> bool:
    return len(hand) == 2 and _hand_value(hand) == 21


class BlackjackEngine(GameEngine):
    """Simplified blackjack: player uses basic strategy, dealer hits on soft 17."""

    def __init__(self, num_decks: int = 6, rng: random.Random | None = None) -> None:
        self._num_decks = num_decks
        self._rng = rng or random.Random()

    @property
    def game_type(self) -> GameType:
        return GameType.BLACKJACK

    @property
    def valid_bet_types(self) -> list[str]:
        return ["standard"]

    @property
    def house_edge(self) -> float:
        return 0.5  # ~0.5% with basic strategy

    def play_round(self, bet: Bet) -> tuple[BetResult, dict[str, object]]:
        self.validate_bet_type(bet.bet_type)

        deck = _make_deck(self._num_decks)
        self._rng.shuffle(deck)

        player_hand = [deck.pop(), deck.pop()]
        dealer_hand = [deck.pop(), deck.pop()]

        # Check for naturals
        player_bj = _is_blackjack(player_hand)
        dealer_bj = _is_blackjack(dealer_hand)

        if player_bj and dealer_bj:
            return self._make_result(bet, BetOutcome.PUSH, bet.amount, player_hand, dealer_hand)
        if player_bj:
            payout = bet.amount + bet.amount * 1.5  # 3:2 blackjack pays
            return self._make_result(bet, BetOutcome.WIN, payout, player_hand, dealer_hand)
        if dealer_bj:
            return self._make_result(bet, BetOutcome.LOSE, 0, player_hand, dealer_hand)

        # Player plays basic strategy
        while self._should_hit(player_hand, dealer_hand[0]):
            player_hand.append(deck.pop())
            if _hand_value(player_hand) > 21:
                return self._make_result(bet, BetOutcome.LOSE, 0, player_hand, dealer_hand)

        # Dealer plays: hit on soft 17
        while self._dealer_should_hit(dealer_hand):
            dealer_hand.append(deck.pop())

        player_val = _hand_value(player_hand)
        dealer_val = _hand_value(dealer_hand)

        if dealer_val > 21 or player_val > dealer_val:
            payout = bet.amount * 2
            return self._make_result(bet, BetOutcome.WIN, payout, player_hand, dealer_hand)
        elif player_val == dealer_val:
            return self._make_result(bet, BetOutcome.PUSH, bet.amount, player_hand, dealer_hand)
        else:
            return self._make_result(bet, BetOutcome.LOSE, 0, player_hand, dealer_hand)

    def _should_hit(self, player_hand: list[str], dealer_upcard: str) -> bool:
        """Simplified basic strategy."""
        player_val = _hand_value(player_hand)
        dealer_up_val = CARD_VALUES[dealer_upcard.split("_")[0]]

        if player_val <= 11:
            return True
        if player_val >= 17:
            return False
        if player_val >= 13 and dealer_up_val <= 6:
            return False
        return not (player_val == 12 and 4 <= dealer_up_val <= 6)

    def _dealer_should_hit(self, dealer_hand: list[str]) -> bool:
        """Dealer hits on soft 17 and below."""
        value = _hand_value(dealer_hand)
        if value < 17:
            return True
        if value == 17:
            # Check for soft 17 (has ace counted as 11)
            has_ace = any(c.split("_")[0] == "A" for c in dealer_hand)
            raw_value = sum(CARD_VALUES[c.split("_")[0]] for c in dealer_hand)
            return has_ace and raw_value != 17
        return False

    def _make_result(
        self,
        bet: Bet,
        outcome: BetOutcome,
        payout: float,
        player_hand: list[str],
        dealer_hand: list[str],
    ) -> tuple[BetResult, dict[str, object]]:
        result = BetResult(
            bet=bet,
            outcome=outcome,
            payout=payout,
            net=payout - bet.amount,
        )
        details: dict[str, object] = {
            "player_hand": player_hand,
            "dealer_hand": dealer_hand,
            "player_value": _hand_value(player_hand),
            "dealer_value": _hand_value(dealer_hand),
        }
        return result, details
