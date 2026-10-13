from fastapi import HTTPException

from attractions import search_attractions
from weather import get_weather


# Gather the information we will use to build an itinerary
def gather_trip_data(
    latitude: float,
    longitude: float,
    days: int,
    radius: int,
):
    warnings = []

    # Attractions are required for planning
    # If this request fails, its error goes back to the user
    attractions = search_attractions(latitude, longitude, radius)

    if not attractions:
        warnings.append(
            "No named attractions were found. Try a larger search radius."
        )

    # The weather endpoint currently supports up to seven days
    forecast_days = min(days, 7)
    weather = None

    try:
        weather = get_weather(latitude, longitude, forecast_days)

    except HTTPException:
        # We can still show attractions if weather is unavailable
        warnings.append(
            "Weather is unavailable. Attraction results are still included."
        )

    if weather is not None:
        warnings.append(
            "This forecast starts today at the destination. "
            "It is not matched to future trip dates yet."
        )

        if days > 7:
            warnings.append(
                "Weather is included for only the next seven days."
            )

    return {
        "attractions": attractions,
        "weather": weather,
        "warnings": warnings,
    }