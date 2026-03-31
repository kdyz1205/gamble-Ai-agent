"""Tests for game and strategy registries."""


from gamble_agent.domain.models import GameType
from gamble_agent.games.base import GameEngine
from gamble_agent.games.registry import get_all_engines, get_default_bet_type, get_engine_class


class TestGameRegistry:
    def test_all_game_types_registered(self):
        engines = get_all_engines()
        for gt in GameType:
            assert gt in engines

    def test_get_engine_class(self):
        cls = get_engine_class(GameType.BLACKJACK)
        assert issubclass(cls, GameEngine)

    def test_default_bet_types(self):
        assert get_default_bet_type(GameType.BLACKJACK) == "standard"
        assert get_default_bet_type(GameType.ROULETTE) == "red"
        assert get_default_bet_type(GameType.DICE) == "pass"
        assert get_default_bet_type(GameType.SLOTS) == "spin"

    def test_engine_instances_have_correct_game_type(self):
        for game_type, engine_cls in get_all_engines().items():
            engine = engine_cls()
            assert engine.game_type == game_type

    def test_all_engines_have_valid_bet_types(self):
        for engine_cls in get_all_engines().values():
            engine = engine_cls()
            assert len(engine.valid_bet_types) > 0

    def test_all_engines_have_positive_house_edge(self):
        for engine_cls in get_all_engines().values():
            engine = engine_cls()
            assert engine.house_edge > 0
