from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator
from locations import search_locations
from attractions import search_attractions
from weather import get_weather
from routing import get_route
from planner import gather_trip_data
from llm import interpret_trip
from itinerary import build_itinerary, order_stops
from schedule import add_schedule
from fastapi.middleware.cors import CORSMiddleware
from datetime import date

# Create the backend app
app = FastAPI(
    title="Trip Happens API",
    description="Personalized travel planning.",
    version="0.1.0",
)

# Allow our local React frontend to call the backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

# Define the trip details the user can send
class TripRequest(BaseModel):
    destination: str = Field(min_length=2, max_length=100)
    days: int = Field(ge=1, le=30)
    # Optional until the user selects a date in the frontend.
    trip_date: date | None = None

    # Reject zero, negative values, infinity, and NaN.
    budget: float = Field(gt=0, allow_inf_nan=False)

    # Part of the total budget reserved for food.
    food_budget: float = Field(
        default=0,
        ge=0,
        allow_inf_nan=False,
    )

    interests: list[str] = Field(min_length=1)

    pace: Literal["relaxed", "balanced", "packed"] = "balanced"
    popularity: Literal["popular", "mixed", "hidden_gems"] = "mixed"
    variety: Literal["low", "medium", "high"] = "medium"

    @field_validator("destination", mode="before")
    @classmethod
    def clean_destination(cls, value):
        # Remove spaces before checking the destination's length.
        if isinstance(value, str):
            return value.strip()

        return value

    @field_validator("interests")
    @classmethod
    def clean_interests(cls, interests):
        cleaned_interests = []

        for interest in interests:
            interest = interest.strip().lower()

            # Skip blank entries and repeated interests.
            if interest and interest not in cleaned_interests:
                cleaned_interests.append(interest)

        if not cleaned_interests:
            raise ValueError("Enter at least one interest.")

        return cleaned_interests

    @model_validator(mode="after")
    def check_food_budget(self):
        if self.food_budget > self.budget:
            raise ValueError(
                "The food allowance cannot exceed the total budget."
            )

        return self

# Use the existing trip fields and add the selected location
class TripResearchRequest(TripRequest):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    radius: int = Field(default=5000, ge=100, le=10000)

# A written travel request from the user
class TripMessage(BaseModel):
    message: str = Field(min_length=10, max_length=2000)

# Our first itinerary demo supports one day only
class OneDayTripRequest(TripResearchRequest):
    days: Literal[1] = 1

# Show a welcome message at the main URL
@app.get("/")
def home():
    return {"message": "Welcome to Trip Happens!"}

# Check that the backend is running
@app.get("/health")
def health_check():
    return {"status": "ok"}

# Receive trip details after FastAPI checks them against TripRequest
@app.post("/trips/preview")
def preview_trip(trip: TripRequest):

    # Calculate the average daily budget
    daily_budget = round(trip.budget / trip.days, 2)

    # Return the details for now; itinerary generation comes later
    return {
        "message": "Trip details received. No itinerary generated yet.",
        "trip": trip,
        "daily_budget": daily_budget,
    }

# Search for a destination and return matching places
@app.get("/locations/search")
def find_locations(city: str = Query(min_length=2, max_length=100)):
    # Remove extra spaces around the search
    city = city.strip()

    if len(city) < 2:
        raise HTTPException(
            status_code=422,
            detail="Enter at least two characters for the city.",
        )

    locations = search_locations(city)

    return {
        "query": city,
        "count": len(locations),
        "locations": locations,
        "attribution": "Location data: GeoNames via OpenMeteo",
    }

# Find nearby attractions using the selected city's coordinates
@app.get("/attractions/search")
def find_attractions(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    radius: int = Query(default=5000, ge=100, le=10000),
):
    attractions = search_attractions(latitude, longitude, radius)

    return {
        "latitude": latitude,
        "longitude": longitude,
        "radius_m": radius,
        "count": len(attractions),
        "attractions": attractions,
        "attribution": "Attraction data: OpenTripMap",
    }

# Return a forecast starting today at the selected destination
@app.get("/weather/forecast")
def weather_forecast(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    days: int = Query(default=3, ge=1, le=7),
):
    weather = get_weather(latitude, longitude, days)

    return {
        "latitude": latitude,
        "longitude": longitude,
        "timezone": weather["timezone"],
        "forecast": weather["forecast"],
        "attribution": "Weather data: Open-Meteo",
    }

# Calculate driving distance and time between two places
@app.get("/routes/preview")
def preview_route(
    start_lat: float = Query(ge=-90, le=90),
    start_lon: float = Query(ge=-180, le=180),
    end_lat: float = Query(ge=-90, le=90),
    end_lon: float = Query(ge=-180, le=180),
):
    route = get_route(start_lat, start_lon, end_lat, end_lon)

    return {
        "start": {
            "latitude": start_lat,
            "longitude": start_lon,
        },
        "end": {
            "latitude": end_lat,
            "longitude": end_lon,
        },
        "route": route,
        "attribution": "Routing: OSRM. Map data: OpenStreetMap contributors.",
    }

# Gather real data for a trip before generating its itinerary
@app.post("/trips/research")
def research_trip(trip: TripResearchRequest):
    data = gather_trip_data(
        latitude=trip.latitude,
        longitude=trip.longitude,
        days=trip.days,
        radius=trip.radius,
        trip_date=trip.trip_date,
    )

    return {
        "message": "Trip data gathered. No itinerary generated yet.",
        "trip": trip,
        "daily_budget": round(trip.budget / trip.days, 2),
        "attraction_count": len(data["attractions"]),
        "attractions": data["attractions"],
        "weather": data["weather"],
        "warnings": data["warnings"],
        "sources": {
            "attractions": "OpenTripMap",
            "weather": (
                "Open-Meteo" if data["weather"] is not None else None
            ),
        },
    }

# Turn a written request into trip fields for the user to review
@app.post("/trips/interpret")
def interpret_request(request: TripMessage):
    message = request.message.strip()

    if len(message) < 10:
        raise HTTPException(
            status_code=422,
            detail="Please describe your trip in at least ten characters.",
        )

    return interpret_trip(message)

# Gather real places and select a basic one day draft
@app.post("/trips/itinerary")
def create_itinerary(trip: OneDayTripRequest):
    data = gather_trip_data(
        latitude=trip.latitude,
        longitude=trip.longitude,
        days=trip.days,
        radius=trip.radius,
        trip_date=trip.trip_date,
    )

    # Apply weather preferences only to an explicitly selected trip date.
    prefer_museums = False

    if trip.trip_date is not None and data["weather"] is not None:
        selected_date = trip.trip_date.isoformat()

        for day in data["weather"]["forecast"]:
            if day["date"] != selected_date:
                continue

            precipitation_chance = day.get(
                "precipitation_chance_max_percent"
            )

            # Missing or invalid values should not trigger the rule.
            if (
                not isinstance(precipitation_chance, bool)
                and isinstance(precipitation_chance, (int, float))
                and 60 <= precipitation_chance <= 100
            ):
                prefer_museums = True

            break

    itinerary = build_itinerary(
        attractions=data["attractions"],
        interests=trip.interests,
        pace=trip.pace,
        variety=trip.variety,
        popularity=trip.popularity,
        prefer_museums=prefer_museums,
    )

    # Add visit times and estimated travel between selected stops.
    # Start near the selected city coordinates.
    ordered_stops = order_stops(
        stops=itinerary["stops"],
        start_lat=trip.latitude,
        start_lon=trip.longitude,
    )

    # Calculate travel and visit times using the new stop order.
    schedule = add_schedule(ordered_stops)
    scheduled_stops = schedule["stops"]

    # Summarize the journeys between attractions.
    estimated_driving_minutes = 0
    estimated_distance_km = 0
    estimated_journeys = 0
    fallback_journeys = 0
    fallback_buffer_minutes = 0

    for stop in scheduled_stops:
        if stop["position"] == 1:
            continue

        route = stop["travel_before"]

        if route is not None:
            estimated_driving_minutes += route["scheduled_minutes"]
            estimated_distance_km += route["distance_m"] / 1000
            estimated_journeys += 1
        else:
            fallback_journeys += 1
            fallback_buffer_minutes += (
                stop["schedule"]["assumed_buffer_before_minutes"]
            )

    travel_summary = {
        "mode": "driving",
        "estimated_journeys": estimated_journeys,
        "fallback_journeys": fallback_journeys,
        "estimated_driving_minutes": estimated_driving_minutes,
        "estimated_distance_km": round(estimated_distance_km, 2),
        "fallback_buffer_minutes": fallback_buffer_minutes,
    }

    warnings = (
        data["warnings"]
        + itinerary["warnings"]
        + schedule["warnings"]
    )

    # Make the current limitations clear
    warnings.extend([
        "Stops use a nearby-first order based on straight-line distance, "
        "starting near the selected city coordinates. "
        "This is not a guaranteed fastest driving route.",
        "Travel between stops uses estimated driving times where available. "
        "These are not live traffic estimates and do not include parking "
        "or walking to entrances.",
        "Travel to the first stop and from the last stop is not included.",
        "Opening hours are not checked. Suggested times may fall outside opening hours.",
        "Activity costs are unknown, so the budget has not been verified.",
        "Popularity uses available OpenTripMap ratings, not visitor counts. "
        "Hidden gems means lower-rated places, not confirmed undiscovered places.",
        "Variety uses attraction categories. Different settings may return the same stops when choices are limited.",
        "Weather can favor museums when the selected date has at least "
        "a 60% precipitation chance. This is a simple planning rule, "
        "not a guarantee of suitable conditions.",
    ])

    return {
        "status": "draft",
        "trip": trip,
        "budget_usd": trip.budget,
        "budget_verified": False,
        "budget_breakdown": {
            "total_usd": trip.budget,
            "food_allowance_usd": trip.food_budget,
            "activity_allowance_usd": round(
                trip.budget - trip.food_budget,
                2,
            ),
            "activity_costs_known": False,
        },
        "target_stop_count": itinerary["target_stop_count"],
        "selected_stop_count": itinerary["selected_stop_count"],
        "stops": scheduled_stops,
        "travel_summary": travel_summary,
        "schedule_basis": (
            "Starts at 09:00 destination local time. "
            "Uses assumed visit lengths and estimated driving times, "
            "with 15-minute fallback buffers when routing is unavailable."
        ),
        "opening_hours_verified": False,
        "weather": data["weather"],
        "warnings": warnings,
        "sources": {
            "attractions": "OpenTripMap",
            "weather": (
                "Open-Meteo" if data["weather"] is not None else None
            ),
            "routing": (
                "OSRM / OpenStreetMap contributors"
                if any(
                    stop["travel_before"] is not None
                    for stop in scheduled_stops
                )
                else None
            ),
        },
    }