import httpx
from fastapi import HTTPException

# Expand common abbreviations used in destination searches.
REGION_ALIASES = {
    "dc": "District of Columbia",
    "md": "Maryland",
    "va": "Virginia",
    "ny": "New York",
    "ca": "California",
    "fl": "Florida",
    "tx": "Texas",
    "pa": "Pennsylvania",
    "nj": "New Jersey",
    "ma": "Massachusetts",
}


def clean_location_search(city: str):
    # Remove extra spaces.
    city = " ".join(city.split())

    # Handle common ways of writing Washington, DC without a comma.
    simple_name = city.lower().replace(".", "")

    if simple_name in ("washington dc", "dc"):
        return "Washington, District of Columbia"

    parts = [part.strip() for part in city.split(",")]

    # Expand the region after the city name.
    if len(parts) > 1:
        region = parts[1].lower().replace(".", "")
        parts[1] = REGION_ALIASES.get(region, parts[1])

    return ", ".join(parts)

# Find places that match the user's search
def search_locations(city: str):
    url = "https://geocoding-api.open-meteo.com/v1/search"

    # Ask for about five matching places
    params = {
        "name": clean_location_search(city),
        "count": 10,
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
            # GeoNames codes starting with P identify populated places.
            feature_code = place.get("feature_code", "")

            if not feature_code.startswith("PPL"):
                continue

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