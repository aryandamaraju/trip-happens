import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import HTTPException


load_dotenv(Path(__file__).parent / ".env")


# Find possible Google matches for an attraction.
def search_place_details(name: str, destination: str):
    api_key = os.getenv("GOOGLE_PLACES_API_KEY")

    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Add GOOGLE_PLACES_API_KEY to backend/.env first.",
        )

    url = "https://places.googleapis.com/v1/places:searchText"

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": (
            "places.id,"
            "places.displayName,"
            "places.formattedAddress,"
            "places.location,"
            "places.businessStatus,"
            "places.regularOpeningHours,"
            "places.googleMapsUri"
        ),
    }

    # Return a few candidates so we can check the correct location.
    payload = {
        "textQuery": f"{name}, {destination}",
        "pageSize": 3,
        "languageCode": "en",
    }

    try:
        response = httpx.post(
            url,
            headers=headers,
            json=payload,
            timeout=20.0,
        )

        if response.status_code in (401, 403):
            raise HTTPException(
                status_code=502,
                detail="Google Places rejected the key or account access.",
            )

        if response.status_code == 429:
            raise HTTPException(
                status_code=503,
                detail="Google Places request limit reached. Try later.",
            )

        response.raise_for_status()
        data = response.json()

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Opening hours search took too long. Try again.",
        )

    except httpx.HTTPError:
        raise HTTPException(
            status_code=502,
            detail="Could not retrieve place details from Google.",
        )

    except ValueError:
        raise HTTPException(
            status_code=502,
            detail="Google Places returned an unreadable response.",
        )

    try:
        places = data.get("places", [])

        if not isinstance(places, list):
            raise ValueError("Expected a list of places.")

        candidates = []

        for place in places:
            location = place.get("location") or {}
            hours = place.get("regularOpeningHours") or {}

            candidates.append({
                "google_place_id": place["id"],
                "name": place["displayName"]["text"],
                "address": place.get("formattedAddress"),
                "latitude": location.get("latitude"),
                "longitude": location.get("longitude"),
                "business_status": place.get("businessStatus"),
                "regular_hours": hours.get("weekdayDescriptions", []),
                # Keep structured hours for scheduling later.
                "regular_periods": hours.get("periods", []),
                "google_maps_url": place.get("googleMapsUri"),
                "source": "Google Maps",
                "match_verified": False,
            })

    except (KeyError, TypeError, AttributeError, ValueError):
        raise HTTPException(
            status_code=502,
            detail="Google Places returned incomplete or invalid data.",
        )

    return candidates