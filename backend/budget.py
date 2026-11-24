from decimal import Decimal, InvalidOperation


def read_amount(value):
    # Use Decimal to avoid floating-point errors when adding money.
    if isinstance(value, bool):
        raise ValueError("Money amounts must be numbers.")

    try:
        amount = Decimal(str(value))
    except InvalidOperation:
        raise ValueError("Money amounts must be numbers.")

    if not amount.is_finite() or amount < 0:
        raise ValueError("Money amounts must be finite and nonnegative.")

    return amount.quantize(Decimal("0.01"))


def check_budget(
    total_budget: float,
    food_budget: float,
    activity_prices: list[float | None],
):
    total = read_amount(total_budget)
    food = read_amount(food_budget)

    if total <= 0:
        raise ValueError("The total budget must be greater than zero.")

    if food > total:
        raise ValueError("The food allowance cannot exceed the total budget.")

    activity_total = Decimal("0.00")
    unknown_count = 0

    for price in activity_prices:
        # None means unknown. Zero means a known free activity.
        if price is None:
            unknown_count += 1
        else:
            activity_total += read_amount(price)

    accounted_total = food + activity_total
    remaining = total - accounted_total

    # Known costs can exceed the budget even with some prices missing.
    if accounted_total > total:
        status = "over_budget"
        message = (
            "Entered activity costs plus the food allowance "
            "exceed the total budget."
        )
    elif not activity_prices:
        status = "incomplete"
        message = "There are no activities to check."
    elif unknown_count > 0:
        status = "incomplete"
        message = (
            "Some activity prices are unknown, "
            "so the full budget cannot be checked."
        )
    else:
        status = "within_entered_budget"
        message = (
            "Entered activity costs plus the food allowance "
            "fit within the total budget."
        )

    return {
        "status": status,
        "message": message,
        "currency": "USD",
        "total_budget": float(total),
        "food_allowance": float(food),
        "activity_allowance": float(total - food),
        "known_activity_total": float(activity_total),
        "accounted_total": float(accounted_total),
        "remaining_after_known_costs": float(remaining),
        "priced_activity_count": len(activity_prices) - unknown_count,
        "unknown_activity_count": unknown_count,
        "all_activity_prices_known": (
            bool(activity_prices) and unknown_count == 0
        ),
        "prices_verified": False,
    }