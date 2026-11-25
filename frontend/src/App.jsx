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
    <header className="hero">
      <p className="eyebrow">A little planning. More exploring.</p>

      <h1>Trip Happens</h1>

      <p className="hero-description">
        Turn your interests into a trip worth taking.
        Choose a destination, set your pace, and explore your way.
      </p>

      <div className="hero-tags">
        <span>1 to 7 days</span>
        <span>Your interests</span>
        <span>Your pace</span>
      </div>
    </header>

      <TripInterpreter
        onApply={applyTripDetails}
        onBusyChange={setInterpreting}
        disabled={loading}
      />

      {suggestedDestination && !selectedCity && (
        <p className="hint">
          Destination filled in. Click Search cities and choose a result.
        </p>
      )}

      <form onSubmit={handleSubmit}>
        {/* Prevent edits while this trip is being generated. */}
        <fieldset disabled={loading || interpreting}>
          <legend>Trip details</legend>

          <CitySearch
            key={citySearchKey}
            initialQuery={suggestedDestination}
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

          <p className="hint">1 to 7 days in one city.</p>
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

          <p className="hint">
            Optional. Leave blank for weather starting today.
          </p>

          <label>
            Total trip budget (USD)
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

          <label htmlFor="food-budget">
            Food allowance, included in total (USD)
          </label>
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

          <p className="hint">Leave blank to reserve $0 for food.</p>

          <label>
            Interests
            <input
              type="text"
              placeholder="museums, parks, art"
              value={interests}
              onChange={(event) => {
                setInterests(event.target.value);
                clearResult();
              }}
              required
            />
          </label>
          <p className="hint">
            Separate interests with commas, such as museums, parks, or art.
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
              <option value="relaxed">Relaxed, up to 3 stops per day</option>
              <option value="balanced">Balanced, up to 4 stops per day</option>
              <option value="packed">Packed, up to 5 stops per day</option>
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
          
          <details className="planning-notes">
            <summary>Planning notes</summary>

            <ul>
              <li>
                Budget amounts are for one traveler across the whole trip.
                Food is included in the total. Hotels and transportation are excluded.
              </li>
              <li>
                Choose dates in the destination's local time.
                Weather forecasts may be unavailable for distant dates.
              </li>
              <li>
                Popularity uses attraction ratings. Hidden gems favors
                lower ratings, which does not guarantee fewer visitors.
              </li>
              <li>
                Variety changes the mix of attraction categories.
                Results depend on the places available.
              </li>
            </ul>
          </details>

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