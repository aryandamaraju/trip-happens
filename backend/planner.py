from datetime import date

from fastapi import HTTPException

from attractions import search_attractions
from weather import get_weather


# Gather attractions and weather for the requested trip.
def gather_trip_data(
    latitude: float,
    longitude: float,
    days: int,
    radius: int,
    trip_date: date | None = None,
):
    warnings = []

    # Attractions are required for planning.
    attractions = search_attractions(latitude, longitude, radius)

    if not attractions:
        warnings.append(
            "No named attractions were found. Try a larger search radius."
        )

    weather = None

    try:
        if trip_date is None:
            # Keep the existing behavior when no date is selected.
            forecast_days = min(days, 7)
            weather = get_weather(
                latitude,
                longitude,
                forecast_days,
            )

            warnings.append(
                "No trip date was selected. "
                "Weather starts today at the destination."
            )

            if days > 7:
                warnings.append(
                    "Weather is included for only the next seven days."
                )

        else:
            # Fetch the available forecast window.
            available_weather = get_weather(
                latitude,
                longitude,
                16,
            )

            matching_days = []

            for day in available_weather["forecast"]:
                forecast_date = date.fromisoformat(day["date"])
                days_after_start = (forecast_date - trip_date).days

                # Keep only dates belonging to this trip.
                if 0 <= days_after_start < days:
                    matching_days.append(day)

            if matching_days:
                weather = {
                    "timezone": available_weather["timezone"],
                    "forecast": matching_days,
                }

                if len(matching_days) < days:
                    warnings.append(
                        "Weather is available for only part of your trip. "
                        "Only matching dates are shown."
                    )

            else:
                warnings.append(
                    "Your selected trip dates are outside the returned "
                    "forecast window. No weather is shown. "
                    "You can still use the itinerary."
                )

    except HTTPException:
        # Weather failure should not prevent attraction planning.
        warnings.append(
            "Weather is unavailable. Attraction results are still included."
        )

    except (KeyError, TypeError, ValueError):
        weather = None
        warnings.append(
            "The weather response could not be matched to your trip dates. "
            "Attraction results are still included."
        )

    return {
        "attractions": attractions,
        "weather": weather,
        "warnings": warnings,
    }