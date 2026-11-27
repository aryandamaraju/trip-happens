import math
from datetime import date

from fastapi import HTTPException

from opening_hours import check_visit_time
from routing import get_route


def format_time(minutes: int):
    # Show the day offset if a schedule crosses midnight.
    day_offset = minutes // (24 * 60)
    hours = (minutes // 60) % 24
    remaining_minutes = minutes % 60

    formatted = f"{hours:02d}:{remaining_minutes:02d}"

    if day_offset > 0:
        formatted += f" (+{day_offset} day)"

    return formatted


def add_schedule(
    stops: list,
    visit_date: date | None = None,
    confirmed_places: dict | None = None,
):
    if confirmed_places is None:
        confirmed_places = {}

    current_time = 9 * 60
    scheduled_stops = []
    warnings = []
    routing_available = True

    meal_breaks = []

    def add_lunch(start_minutes):
        end_minutes = start_minutes + 45

        meal_breaks.append({
            "type": "lunch",
            "suggested_start": format_time(start_minutes),
            "suggested_end": format_time(end_minutes),
            "duration_minutes": 45,
            "note": (
                "Suggested meal break. No restaurant is selected. "
                "Restaurant travel and meal costs are not estimated."
            ),
        })

        if start_minutes > 14 * 60:
            warnings.append(
                "Lunch falls after 2:00 PM because of the current stop order "
                "and visit lengths. Consider changing the day's plan."
            )

        return end_minutes

    for index, stop in enumerate(stops):
        categories = stop["place"]["categories"]

        # Visit lengths are still assumptions.
        if "museums" in categories:
            visit_minutes = 90
        else:
            visit_minutes = 45

        # Take lunch after a completed visit once it is noon or later.
        # Add it before travel to the next attraction.
        if index > 0 and not meal_breaks and current_time >= 12 * 60:
            current_time = add_lunch(current_time)

        travel_before = None
        travel_minutes = 0
        buffer_before = 0

        if index > 0:
            previous_place = stops[index - 1]["place"]
            current_place = stop["place"]

            if routing_available:
                try:
                    route = get_route(
                        start_lat=previous_place["latitude"],
                        start_lon=previous_place["longitude"],
                        end_lat=current_place["latitude"],
                        end_lon=current_place["longitude"],
                    )

                    # Reject unusable durations before scheduling.
                    seconds = route["duration_seconds"]

                    if (
                        isinstance(seconds, bool)
                        or not isinstance(seconds, (int, float))
                        or not math.isfinite(seconds)
                        or seconds < 0
                    ):
                        raise ValueError("Invalid route duration")

                    travel_minutes = math.ceil(seconds / 60)

                    travel_before = {
                        **route,
                        "source": "OSRM",
                        "scheduled_minutes": travel_minutes,
                    }

                except (HTTPException, KeyError, TypeError, ValueError):
                    # Stop requesting more routes for this trip.
                    routing_available = False

                    warnings.append(
                        f"Driving estimates were unavailable from stop "
                        f"{index + 1} onward. A 15-minute assumed buffer "
                        "is used for each remaining journey. "
                        "These journeys may take longer."
                    )

            if not routing_available:
                buffer_before = 15

        current_time += travel_minutes + buffer_before

        # Use only the Google match selected for this attraction.
        place_details = confirmed_places.get(str(stop["place"]["id"]))

        hours_check = check_visit_time(
            arrival_minutes=current_time,
            visit_minutes=visit_minutes,
            visit_date=visit_date,
            place_details=place_details,
        )

        current_time = hours_check["start_minutes"]
        end_time = current_time + visit_minutes

        if hours_check["status"] == "conflict":
            warnings.append(
                f"{stop['place']['name']}: {hours_check['note']}"
            )

        scheduled_stop = stop.copy()

        # None means no route estimate is attached.
        scheduled_stop["travel_before"] = travel_before

        scheduled_stop["schedule"] = {
            "suggested_start": format_time(current_time),
            "suggested_end": format_time(end_time),
            "assumed_visit_minutes": visit_minutes,
            "estimated_travel_before_minutes": travel_minutes,
            "assumed_buffer_before_minutes": buffer_before,
            "waiting_before_minutes": hours_check["waiting_minutes"],
            "opening_hours_status": hours_check["status"],
            "opening_hours_note": hours_check["note"],
        }

        scheduled_stops.append(scheduled_stop)
        current_time = end_time

    # Short days still get a suggested lunch after their last attraction.
    if scheduled_stops and not meal_breaks:
        lunch_start = max(current_time, 12 * 60)
        current_time = add_lunch(lunch_start)

    if current_time >= 24 * 60:
        warnings.append(
            "This draft reaches or passes midnight. "
            "It needs fewer stops or a different route."
        )
        
    return {
        "stops": scheduled_stops,
        "meal_breaks": meal_breaks,
        "warnings": warnings,
    }