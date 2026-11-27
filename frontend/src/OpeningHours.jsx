import { useEffect, useRef, useState } from "react";

function OpeningHours({ place, destination, onSelect, disabled }) {
  const [candidates, setCandidates] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activeRequest = useRef(null);

  // Cancel the request if this itinerary is removed.
  useEffect(() => {
    return () => activeRequest.current?.abort();
  }, []);

  async function lookupHours() {
    if (activeRequest.current) return;

    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/attractions/place-details",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            name: place.name,
            destination,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Could not retrieve opening hours."
        );
      }

      if (!Array.isArray(data.candidates)) {
        throw new Error("The server returned an unexpected response.");
      }

      setCandidates(data.candidates);
      setSelectedId("");
    } catch (error) {
      if (error.name !== "AbortError") {
        setError(error.message || "Could not reach the backend.");
      }
    } finally {
      activeRequest.current = null;

      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }

  const selectedPlace = candidates?.find(
    (candidate) => candidate.google_place_id === selectedId
  );

  const statusLabels = {
    OPERATIONAL: "Operating, not necessarily open right now",
    CLOSED_TEMPORARILY: "Temporarily closed",
    CLOSED_PERMANENTLY: "Permanently closed",
  };

  return (
    <div className="opening-hours">
      <h5>Opening hours</h5>

      {candidates === null && (
        <button
          type="button"
          onClick={lookupHours}
          disabled={loading || disabled}
        >
          {loading ? "Checking..." : "Check opening hours"}
        </button>
      )}

      {loading && <p role="status">Finding this attraction...</p>}
      {error && <p role="alert">{error}</p>}

      {candidates?.length === 0 && (
        <p>No matching places were returned. Opening hours are unknown.</p>
      )}

      {candidates?.length > 0 && (
        <>
          <p>Choose the matching place. Check its name and address.</p>

          <label>
            Google Maps result
            <select
              value={selectedId}
              disabled={disabled}
              onChange={(event) => {
                const id = event.target.value;
                setSelectedId(id);

                const selected = candidates.find(
                  (candidate) => candidate.google_place_id === id
                );

                onSelect(selected ?? null);
              }}
            >
              <option value="">Select a matching place</option>

              {candidates.map((candidate) => (
                <option
                  key={candidate.google_place_id}
                  value={candidate.google_place_id}
                >
                  {candidate.name}, {candidate.address ?? "Address unavailable"}
                </option>
              ))}
            </select>
          </label>

          <p className="hint">
            If none match, leave this unselected.
          </p>

          {selectedPlace && (
            <div>
              <p><strong>{selectedPlace.name}</strong></p>
              <p>{selectedPlace.address}</p>

              <p>
                <strong>Business status:</strong>{" "}
                {statusLabels[selectedPlace.business_status] ??
                  "Status unavailable"}
              </p>

              <details className="result-details" open>
                <summary>Regular weekly hours</summary>

                {selectedPlace.regular_hours?.length > 0 ? (
                  <ul>
                    {selectedPlace.regular_hours.map((hours, index) => (
                      <li key={index}>{hours}</li>
                    ))}
                  </ul>
                ) : (
                  <p>Opening hours are unavailable.</p>
                )}
              </details>

              {selectedPlace.google_maps_url?.startsWith("https://") && (
                <p>
                  <a
                    href={selectedPlace.google_maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View this place on Google Maps
                  </a>
                </p>
              )}

              <p className="hint">
                Regular hours may differ on holidays. After changing your selection,
                click “Update this day's times” to apply it.
              </p>
            </div>
          )}

          <p className="google-attribution" translate="no">
            Google Maps
          </p>
        </>
      )}
    </div>
  );
}

export default OpeningHours;