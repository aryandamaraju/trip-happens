import httpx
from fastapi import HTTPException
import time
from threading import Lock

# Remember successful routes for 30 minutes.
route_cache = {}
cache_seconds = 30 * 60

# Allow only one route request at a time.
route_lock = Lock()
last_request_time = 0.0


def get_route(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
):
    global last_request_time

    key = (start_lat, start_lon, end_lat, end_lon)

    with route_lock:
        now = time.monotonic()
        cached = route_cache.get(key)

        if cached and now - cached["saved_at"] < cache_seconds:
            return cached["route"].copy()

        # Leave at least one second between requests.
        wait_seconds = 1.0 - (now - last_request_time)

        if wait_seconds > 0:
            time.sleep(wait_seconds)

        last_request_time = time.monotonic()

        route = request_route(
            start_lat,
            start_lon,
            end_lat,
            end_lon,
        )

        # Keep the cache small for our local demo.
        if len(route_cache) >= 200:
            route_cache.clear()

        route_cache[key] = {
            "saved_at": time.monotonic(),
            "route": route.copy(),
        }

        return route

# Get a driving route between two locations
def request_route(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
):
    
    coordinates = f"{start_lon},{start_lat};{end_lon},{end_lat}"
    url = f"https://router.project-osrm.org/route/v1/driving/{coordinates}"

    # We only need distance and time for now
    params = {
        "overview": "false",
        "steps": "false",
        "alternatives": "false",
    }

    try:
        response = httpx.get(url, params=params, timeout=15.0)

        if response.status_code == 429:
            raise HTTPException(
                status_code=503,
                detail="The routing service is busy. Please try again later.",
            )

        data = response.json()

        if not isinstance(data, dict):
            raise ValueError("Unexpected response format")

        # These codes mean the service cannot connect the locations
        if data.get("code") in ("NoRoute", "NoSegment"):
            raise HTTPException(
                status_code=404,
                detail="No driving route was found for these locations.",
            )

        response.raise_for_status()

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Route search took too long. Please try again.",
        )

    except httpx.HTTPError:
        raise HTTPException(
            status_code=502,
            detail="Could not retrieve a route from OSRM.",
        )

    except ValueError:
        raise HTTPException(
            status_code=502,
            detail="The routing service returned an unreadable response.",
        )

    if data.get("code") != "Ok":
        raise HTTPException(
            status_code=502,
            detail="The routing service could not process the request.",
        )

    try:
        route = data["routes"][0]

        # Keep the original units for later when we do itinerary calculations
        distance_m = route["distance"]
        duration_seconds = route["duration"]

        return {
            "mode": "driving",
            "distance_m": distance_m,
            "duration_seconds": duration_seconds,
            "distance_km": round(distance_m / 1000, 2),
            "duration_minutes": round(duration_seconds / 60, 1),
        }

    except (KeyError, IndexError, TypeError):
        raise HTTPException(
            status_code=502,
            detail="The routing service returned incomplete route data.",
        )