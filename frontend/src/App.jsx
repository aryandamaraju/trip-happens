import { useState } from "react";
import CitySearch from "./CitySearch";
import ItineraryResult from "./ItineraryResult";
import "./App.css";
import TripInterpreter from "./TripInterpreter";

function App() {
  const [selectedCity, setSelectedCity] = useState(null);
  const [budget, setBudget] = useState("");
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

  // Remove the old result when the user changes trip details.
  function clearResult() {
    setItinerary(null);
    setError("");
  }

  function applyTripDetails(trip) {
    // Replace old values so missing details do not carry over.
    setBudget(trip.budget == null ? "" : String(trip.budget));
    setInterests(trip.interests.join(", "));
    setPace(trip.pace ?? "");
    setPopularity(trip.popularity ?? "mixed");
    setVariety(trip.variety ?? "medium");

    // The user must confirm a city from our location search.
    setSuggestedDestination(trip.destination ?? "");
    setSelectedCity(null);
    setCitySearchKey((previousKey) => previousKey + 1);

    clearResult();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    clearResult();

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

    // Use the selected city's coordinates for the attraction search.
    const trip = {
      destination: [
        selectedCity.name,
        selectedCity.region,
        selectedCity.country,
      ].filter(Boolean).join(", "),
      days: 1,
      budget: budgetNumber,
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
      <p>Plan a one-day trip based on your interests and pace.</p>

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