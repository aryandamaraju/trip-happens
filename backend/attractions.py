import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import HTTPException


# Load the .env file located beside this Python file
load_dotenv(Path(__file__).parent / ".env")

# Convert the provider's rating into a simple popularity score.
def get_popularity_score(rate):
    ratings = {
        "1": 1,
        "2": 2,
        "3": 3,
        "1h": 1,
        "2h": 2,
        "3h": 3,
    }

    return ratings.get(str(rate).strip().lower())

# Find attractions around a selected location
def search_attractions(
    latitude: float,
    longitude: float,
    radius: int,
    kinds: str = "interesting_places",
    limit: int = 100,
    include_search_info: bool = False,
):
    api_key = os.getenv("OPENTRIPMAP_API_KEY")

    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Add OPENTRIPMAP_API_KEY to backend/.env first.",
        )

    url = "https://api.opentripmap.com/0.1/en/places/radius"

    params = {
        "apikey": api_key,
        "lat": latitude,
        "lon": longitude,
        "radius": radius,
        "kinds": kinds,
        "format": "json",
        "limit": limit,
    }

    try:
        response = httpx.get(url, params=params, timeout=15.0)

        if response.status_code in (401, 403):
            raise HTTPException(
                status_code=502,
                detail="OpenTripMap rejected the key or account access.",
            )

        if response.status_code == 429:
            raise HTTPException(
                status_code=503,
                detail="OpenTripMap's request limit was reached. Try later.",
            )

        response.raise_for_status()
        places = response.json()

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Attraction search took too long. Please try again.",
        )

    except httpx.HTTPError:
        raise HTTPException(
            status_code=502,
            detail="Could not retrieve attractions from OpenTripMap.",
        )

    except ValueError:
        raise HTTPException(
            status_code=502,
            detail="OpenTripMap returned an unreadable response.",
        )

    # Expectation is a list of places from this API
    if not isinstance(places, list):
        raise HTTPException(
            status_code=502,
            detail="OpenTripMap returned an unexpected response.",
        )

    attractions = []

    try:
        for place in places:
            name = place.get("name", "").strip()

            # Skip unnamed places because they are hard to show in a trip
            if not name:
                continue

            attractions.append({
                "id": place["xid"],
                "name": name,
                "categories": place["kinds"].split(","),
                "latitude": place["point"]["lat"],
                "longitude": place["point"]["lon"],
                "distance_from_center_m": place.get("dist"),
                "source": "OpenTripMap",

                # Keep the original value for reference.
                "provider_rating": place.get("rate"),

                # Use recognized ratings for popularity preferences.
                "popularity_score": get_popularity_score(
                    place.get("rate")
                ),
            })

    except (KeyError, TypeError, AttributeError):
        raise HTTPException(
            status_code=502,
            detail="OpenTripMap returned incomplete or invalid place data.",
        )

    # The planner also needs to know whether results may be truncated.
    if include_search_info:
        return {
            "attractions": attractions,
            "limit_reached": len(places) >= limit,
        }

    # Keep the existing list response for the attraction search endpoint.
    return attractions