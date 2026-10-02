from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field

# Create the backend app
app = FastAPI(
    title="Trip Happens API",
    description="Personalized travel planning.",
    version="0.1.0",
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