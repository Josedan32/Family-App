import random
from uuid import UUID, uuid4

import pytest

from family_api.services.assignment import choose_assignee

A, B, C = uuid4(), uuid4(), uuid4()


def test_picks_the_lowest_balance() -> None:
    assert choose_assignee([A, B, C], {A: 10, B: 3, C: 7}, random.Random(0)) == B


def test_a_tie_is_broken_at_random_not_by_order() -> None:
    """C-03 / FR-M8-07: a deterministic tie-break favours one person forever."""
    picks = [
        choose_assignee([A, B], {A: 5, B: 5}, random.Random(seed)) for seed in range(400)
    ]
    share = picks.count(A) / len(picks)
    assert 0.4 < share < 0.6, f"A was chosen {share:.0%} of the time"


def test_a_three_way_tie_is_roughly_even() -> None:
    picks = [
        choose_assignee([A, B, C], {A: 0, B: 0, C: 0}, random.Random(seed))
        for seed in range(600)
    ]
    for member in (A, B, C):
        share = picks.count(member) / len(picks)
        assert 0.25 < share < 0.42


def test_negative_balances_are_handled() -> None:
    """A manual adjustment can push someone below zero."""
    assert choose_assignee([A, B], {A: -5, B: 0}, random.Random(0)) == A


def test_an_empty_candidate_list_raises() -> None:
    with pytest.raises(ValueError, match="No eligible"):
        choose_assignee([], {}, random.Random(0))


def test_a_missing_balance_is_treated_as_zero() -> None:
    """A brand-new member must not be skipped because they have no row yet."""
    assert choose_assignee([A, B], {B: 4}, random.Random(0)) == A
