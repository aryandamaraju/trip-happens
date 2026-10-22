import { useState } from "react";

function CitySearch({ onSelect }) {
  const [query, setQuery] = useState("");
  const [locations, setLocations] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function searchCities() {
    setError("");
    setLocations([]);
    setSelectedId("");
    onSelect(null);

    if (query.trim().length < 2) {
      setError("Enter at least two characters to search.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/locations/search?city=" +
          encodeURIComponent(query.trim())
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "City search failed."
        );
      }

      setLocations(data.locations);

      if (data.locations.length === 0) {
        setError("No cities found. Try another city name.");
      }
    } catch (error) {
      setError(error.message || "Could not search for cities.");
    } finally {
      setLoading(false);
    }
  }

  function selectCity(event) {
    const id = event.target.value;
    setSelectedId(id);

    const city = locations.find(
      (location) => String(location.id) === id
    );

    onSelect(city || null);
  }

  return (
    <div className="city-search">
      <label>
        Search destination
        <input
          type="text"
          placeholder="Baltimore"
          value={query}
          disabled={loading}
          maxLength={100}
          onChange={(event) => {
            setQuery(event.target.value);
            setLocations([]);
            setSelectedId("");
            setError("");
            onSelect(null);
          }}
        />
      </label>

      <button
        type="button"
        onClick={searchCities}
        disabled={loading}
      >
        {loading ? "Searching..." : "Search cities"}
      </button>

      {error && <p role="alert">{error}</p>}

      {locations.length > 0 && (
        <label>
          Choose your destination
          <select value={selectedId} onChange={selectCity} required>
            <option value="">Select a city</option>

            {locations.map((city) => (
              <option key={city.id} value={city.id}>
                {[city.name, city.region, city.country]
                  .filter(Boolean)
                  .join(", ")}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="hint">Location data: GeoNames via Open-Meteo.</p>
    </div>
  );
}

export default CitySearch;