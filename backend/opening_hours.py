from datetime import date


def point_minutes(point):
    # Google numbers weekdays from Sunday = 0.
    day = point["day"]
    hour = point.get("hour", 0)
    minute = point.get("minute", 0)

    for value in (day, hour, minute):
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError("Invalid opening time.")

    if not (0 <= day <= 6 and 0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValueError("Invalid opening time.")

    return day * 1440 + hour * 60 + minute


def get_open_windows(periods, visit_date):
    # None means the hours could not be checked.
    if not isinstance(periods, list):
        return None

    google_day = (visit_date.weekday() + 1) % 7
    day_start = google_day * 1440
    week_minutes = 7 * 1440
    windows = []

    try:
        for period in periods:
            opening = point_minutes(period["open"])
            closing_point = period.get("close")

            # Google's special format for a place open all week.
            if closing_point is None:
                if opening == 0 and len(periods) == 1:
                    return [(0, 1440)]

                return None

            closing = point_minutes(closing_point)

            # Handle periods that cross the end of the week.
            if closing <= opening:
                closing += week_minutes

            # Include overnight hours that began in the previous week.
            for shift in (-week_minutes, 0, week_minutes):
                start = opening + shift - day_start
                end = closing + shift - day_start

                # Keep only the part within the selected calendar day.
                start = max(0, start)
                end = min(1440, end)

                if start < end:
                    windows.append((start, end))

    except (KeyError, TypeError, ValueError):
        return None

    # Merge touching periods so they count as continuous opening.
    merged = []

    for start, end in sorted(windows):
        if merged and start <= merged[-1][1]:
            previous_start, previous_end = merged[-1]
            merged[-1] = (previous_start, max(previous_end, end))
        else:
            merged.append((start, end))

    return merged


def check_visit_time(
    arrival_minutes: int,
    visit_minutes: int,
    visit_date: date | None,
    place_details: dict | None,
):
    result = {
        "start_minutes": arrival_minutes,
        "waiting_minutes": 0,
        "status": "unchecked",
        "note": "No Google place has been selected for this stop.",
    }

    if place_details is None:
        return result

    business_status = place_details.get("business_status")

    if business_status in (
        "CLOSED_TEMPORARILY",
        "CLOSED_PERMANENTLY",
        "FUTURE_OPENING",
    ):
        result["status"] = "conflict"
        result["note"] = (
            "Google lists this place as closed or not yet open. "
            "Check availability before keeping this visit."
        )
        return result

    if visit_date is None:
        result["note"] = "Select a trip date to check opening hours."
        return result

    windows = get_open_windows(
        place_details.get("regular_periods"),
        visit_date,
    )

    if windows is None:
        result["note"] = "Usable opening hours are unavailable."
        return result

    for opening, closing in windows:
        suggested_start = max(arrival_minutes, opening)

        # The full visit must fit before closing.
        if suggested_start + visit_minutes <= closing:
            result["start_minutes"] = suggested_start
            result["waiting_minutes"] = suggested_start - arrival_minutes
            result["status"] = "fits_regular_hours"
            result["note"] = (
                "Fits regular weekly hours. Holiday hours, "
                "last admission, and ticket availability are not checked."
            )
            return result

    result["status"] = "conflict"
    result["note"] = (
        "The full visit does not fit within the listed regular hours "
        "after arrival on this date. The displayed time remains tentative."
    )
    return result