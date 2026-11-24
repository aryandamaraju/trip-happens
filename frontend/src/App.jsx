import { useState } from "react";
import CitySearch from "./CitySearch";
import ItineraryResult from "./ItineraryResult";
import "./App.css";
import TripInterpreter from "./TripInterpreter";

function App() {
  const [selectedCity, setSelectedCity] = useState(null);
  const [budget, setBudget] = useState("");
  const [foodBudget, setFoodBudget] = useState("");
  const [interests, setInterests] = useState("");
  const [pace, setPace] = useState("balanced");
  const [itinerary, setItinerary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [interpreting, setInterpreting] = useState(false);
  const [citySearchKey, setCitySearchKey] = useState(0);
  const [suggestedDestination, setSuggestedDestination] = useState("");
  const [popularity, setPopularity] = useState("mixed");
  const [variety, setVariety] = useState("medium");
  const [tripDate, setTripDate] = useState("");
  const [days, setDays] = useState("1");

  // Remove the old result when the user changes trip details.
  function clearResult() {
    setItinerary(null);
    setError("");
  }

  function applyTripDetails(trip) {
    // Replace old values so missing details do not carry over.
    setBudget(trip.budget == null ? "" : String(trip.budget));
    // Fill in an explicitly stated food allowance.
    setFoodBudget(
      trip.food_budget == null ? "" : String(trip.food_budget)
    );
    setInterests(trip.interests.join(", "));
    setPace(trip.pace ?? "");
    setPopularity(trip.popularity ?? "mixed");
    setVariety(trip.variety ?? "medium");
    // Use the extracted date, or leave the date picker blank.
    setTripDate(trip.trip_date ?? "");

    // The user must confirm a city from our location search.
    setSuggestedDestination(trip.destination ?? "");
    setSelectedCity(null);
    setCitySearchKey((previousKey) => previousKey + 1);
    // Leave missing trip lengths blank for the user to complete.
    setDays(trip.days == null ? "" : String(trip.days));

    clearResult();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    clearResult();

    const tripDays = Number(days);

    if (!Number.isInteger(tripDays) || tripDays < 1 || tripDays > 7) {
      setError("Enter a whole number of days between 1 and 7.");
      return;
    }

    if (!selectedCity) {
      setError("Search for a city and select a result first.");
      return;
    }

    const interestList = interests
      .split(",")
      .map((interest) => interest.trim().toLowerCase())
      .filter((interest) => interest !== "");

    if (interestList.length === 0) {
      setError("Please enter at least one interest.");
      return;
    }

    const budgetNumber = Number(budget);

    if (!Number.isFinite(budgetNumber) || budgetNumber <= 0) {
      setError("Please enter a budget greater than zero.");
      return;
    }

    // A blank food allowance means no money is reserved for food.
    const foodAmount = foodBudget === "" ? 0 : Number(foodBudget);

    if (!Number.isFinite(foodAmount) || foodAmount < 0) {
      setError("Enter a food allowance of zero or more.");
      return;
    }

    if (foodAmount > Number(budget)) {
      setError("The food allowance cannot exceed the total budget.");
      return;
    }

    // Use the selected city's coordinates for the attraction search.
    const trip = {
      destination: [
        selectedCity.name,
        selectedCity.region,
        selectedCity.country,
      ].filter(Boolean).join(", "),
      days: tripDays,
      trip_date: tripDate || null,
      budget: budgetNumber,
      food_budget: foodAmount,
      interests: interestList,
      pace: pace,
      popularity: popularity,
      variety: variety,
      latitude: selectedCity.latitude,
      longitude: selectedCity.longitude,
      radius: 5000,
    };

    setLoading(true);

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/trips/itinerary",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(trip),
        }
      );

      // Read the response text first so non-JSON errors are handled too.
      const responseText = await response.text();
      let data;

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          `The server returned an unexpected response (${response.status}).`
        );
      }

      if (!response.ok) {
        let message = "Could not generate the itinerary.";

        if (typeof data.detail === "string") {
          message = data.detail;
        } else if (Array.isArray(data.detail)) {
          message = data.detail.map((item) => item.msg).join(" ");
        }

        throw new Error(message);
      }

      setItinerary(data);
    } catch (error) {
      setError(error.message || "Could not reach the backend.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <h1>Trip Happens</h1>
      <p>Plan 1 to 7 days in one destination based on your interests and pace.</p>

      <TripInterpreter
        onApply={applyTripDetails}
        onBusyChange={setInterpreting}
        disabled={loading}
      />

      {suggestedDestination && (
        <p>
          Suggested destination: <strong>{suggestedDestination}</strong>.
          Search for it below and select the correct city.
        </p>
      )}

      <form onSubmit={handleSubmit}>
        {/* Prevent edits while this trip is being generated. */}
        <fieldset disabled={loading || interpreting}>
          <legend>Trip details</legend>

          <CitySearch
            key={citySearchKey}
            onSelect={(city) => {
              setSelectedCity(city);
              clearResult();
            }}
          />
          <label htmlFor="trip-days">Number of days</label>
          <input
            id="trip-days"
            type="number"
            min="1"
            max="7"
            step="1"
            value={days}
            onChange={(event) => {
              setDays(event.target.value);
              clearResult();
            }}
            required
          />

          <p>
            Plan 1 to 7 days in one destination. Your total budget and food
            allowance cover the entire trip.
          </p>
          <label htmlFor="trip-date">Trip date (optional)</label>
          <input
            id="trip-date"
            type="date"
            value={tripDate}
            onChange={(event) => {
              setTripDate(event.target.value);
              clearResult();
            }}
          />

          <p>
            Choose the date at your destination. Leave blank to see weather
            starting today. Forecasts for distant dates may be unavailable.
          </p>
          <p>
            Review the trip date after applying a written request.
            You can choose or change it here.
          </p>

          <label>
            Food and activity budget (USD)
            <input
              type="number"
              placeholder="100"
              value={budget}
              onChange={(event) => {
                setBudget(event.target.value);
                clearResult();
              }}
              min="0.01"
              step="0.01"
              required
            />
          </label>

          <label htmlFor="food-budget">Food allowance (USD)</label>
          <input
            id="food-budget"
            type="number"
            min="0"
            step="0.01"
            value={foodBudget}
            onChange={(event) => {
              setFoodBudget(event.target.value);
              clearResult();
            }}
            placeholder="Example: 30"
          />

          <p>
            This comes out of your total budget. Leave blank to reserve $0.
            The remaining amount is your activity allowance.
          </p>

          <p className="hint">
            Total for one traveler. Excludes hotels and flights.
          </p>

          <label>
            Interests
            <input
              type="text"
              placeholder="museums, history"
              value={interests}
              onChange={(event) => {
                setInterests(event.target.value);
                clearResult();
              }}
              required
            />
          </label>
          <p className="hint">
            Separate interests with commas. Currently supported: museums,
            history, nature, architecture.
          </p>

          <label>
            Pace
            <select
              value={pace}
              onChange={(event) => {
                setPace(event.target.value);
                clearResult();
              }}
              required
            >
              <option value="">Choose a pace</option>
              <option value="relaxed">Relaxed — up to 3 stops</option>
              <option value="balanced">Balanced — up to 4 stops</option>
              <option value="packed">Packed — up to 5 stops</option>
            </select>
          </label>

          <label>
            Activity variety
            <select
              value={variety}
              onChange={(event) => {
                setVariety(event.target.value);
                clearResult();
              }}
            >
              <option value="low">Low, allow similar activities</option>
              <option value="medium">Medium, cover my interests</option>
              <option value="high">High, prefer different activity types</option>
            </select>
          </label>

          <p className="hint">
            Variety depends on the places available. High variety prefers
            different activity types when interest scores are equal.
          </p>

          <label htmlFor="popularity">Place popularity</label>
          
          <select
            id="popularity"
            value={popularity}
            onChange={(event) => {
              setPopularity(event.target.value);
              clearResult();
            }}
          >
            <option value="popular">Prefer popular places</option>
            <option value="mixed">No popularity preference</option>
            <option value="hidden_gems">Prefer hidden gems</option>
          </select>

          <p>
            Uses available attraction ratings. Hidden gems favors lower ratings,
            which does not necessarily mean fewer visitors.
          </p>

          <button type="submit">
            {loading ? "Generating..." : "Generate itinerary"}
          </button>
        </fieldset>
      </form>

      {loading && (
        <p role="status">Finding attractions and checking the weather...</p>
      )}

      {error && <p role="alert">{error}</p>}

      {itinerary && <ItineraryResult itinerary={itinerary} />}
    </main>
  );
}

export default App;