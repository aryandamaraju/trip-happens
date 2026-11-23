import httpx
from fastapi import HTTPException


# Find places that match the user's search
def search_locations(city: str):
    url = "https://geocoding-api.open-meteo.com/v1/search"

    # Ask for about five matching places
    params = {
        "name": city,
        "count": 5,
        "language": "en",
        "format": "json",
    }

    try:
        # Timeout so a slow service does not leave us waiting forever
        response = httpx.get(url, params=params, timeout=10.0)

        # Check if the external service returned an error
        response.raise_for_status()

        # Convert the JSON response into Python data
        data = response.json()

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Location search took too long. Please try again.",
        )

    except httpx.HTTPError:
        raise HTTPException(
            status_code=502,
            detail="Could not connect to the location service successfully.",
        )

    except ValueError:
        raise HTTPException(
            status_code=502,
            detail="The location service returned an unreadable response.",
        )

    locations = []

    try:
        # The service should return a JSON object.
        if not isinstance(data, dict):
            raise ValueError("Expected a JSON object.")

        # Missing results means no matching cities were found.
        results = data.get("results", [])

        if not isinstance(results, list):
            raise ValueError("Expected a list of cities.")

        for place in results:
            locations.append({
                "id": place["id"],
                "name": place["name"],
                "region": place.get("admin1", ""),
                "country": place.get("country", ""),
                "latitude": place["latitude"],
                "longitude": place["longitude"],
                "timezone": place.get("timezone"),
            })

    except (KeyError, TypeError, AttributeError, ValueError):
        raise HTTPException(
            status_code=502,
            detail="The location service returned incomplete or invalid city data.",
        )

    return locations