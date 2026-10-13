import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import HTTPException


# Load the .env file located beside this Python file
load_dotenv(Path(__file__).parent / ".env")


# Find attractions around a selected location
def search_attractions(latitude: float, longitude: float, radius: int):
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
        "kinds": "interesting_places",
        "format": "json",
        "limit": 100,
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
            })

    except (KeyError, TypeError, AttributeError):
        raise HTTPException(
            status_code=502,
            detail="OpenTripMap returned incomplete or invalid place data.",
        )

    return attractions