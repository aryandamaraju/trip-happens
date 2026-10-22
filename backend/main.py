from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from locations import search_locations
from attractions import search_attractions
from weather import get_weather
from routing import get_route
from planner import gather_trip_data
from llm import interpret_trip
from itinerary import build_itinerary
from schedule import add_schedule
from fastapi.middleware.cors import CORSMiddleware

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
    days: int = Field(ge=1, le=30) # Between 1 and 30 days
    budget: float = Field(gt=0) # Total budget in USD, must be positive
    interests: list[str] # For example: ["museums", "nature", "food"]

    # Limit each preference to these choices and set a default
    pace: Literal["relaxed", "balanced", "packed"] = "balanced"
    popularity: Literal["popular", "mixed", "hidden_gems"] = "mixed"
    variety: Literal["low", "medium", "high"] = "medium"

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
    )

    itinerary = build_itinerary(
        attractions=data["attractions"],
        interests=trip.interests,
        pace=trip.pace,
    )

    # Add suggested times after the stops have been selected.
    scheduled_stops = add_schedule(itinerary["stops"])

    warnings = data["warnings"] + itinerary["warnings"]

    # Make the current limitations clear
    warnings.extend([
        "Stops are ordered by interest match, not travel efficiency.",
        "Visit times, opening hours, and travel times are not scheduled yet.",
        "Opening hours are not checked. Suggested times may fall outside opening hours."
        "Activity costs are unknown, so the budget has not been verified.",
        "Popularity and variety preferences are saved but not applied yet.",
        "Weather is displayed but does not change activity selection yet.",
    ])

    return {
        "status": "draft",
        "trip": trip,
        "budget_usd": trip.budget,
        "budget_verified": False,
        "target_stop_count": itinerary["target_stop_count"],
        "selected_stop_count": itinerary["selected_stop_count"],
        "stops": scheduled_stops,
        "schedule_basis": "Assumed durations, starting at 09:00 destination local time",
        "opening_hours_verified": False,
        "weather": data["weather"],
        "warnings": warnings,
        "sources": {
            "attractions": "OpenTripMap",
            "weather": (
                "Open-Meteo" if data["weather"] is not None else None
            ),
        },
    }