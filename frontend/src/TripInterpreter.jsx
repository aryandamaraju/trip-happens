import { useState } from "react";

function TripInterpreter({ onApply, onBusyChange, disabled }) {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function interpretMessage(event) {
    event.preventDefault();
    setError("");
    setResult(null);

    if (message.trim().length < 10) {
      setError("Please describe your trip in a little more detail.");
      return;
    }

    setLoading(true);
    onBusyChange(true);

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/trips/interpret",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: message.trim() }),
        }
      );

      const text = await response.text();
      let data;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("The server returned an unexpected response.");
      }

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Could not interpret the trip request."
        );
      }

      setResult(data);
    } catch (error) {
      setError(error.message || "Could not reach the backend.");
    } finally {
      setLoading(false);
      onBusyChange(false);
    }
  }

  return (
    <section className="interpreter">
      <h2>Describe your trip</h2>
      <p>
        Use this optional helper, or fill in the trip form yourself.
      </p>

      <form onSubmit={interpretMessage}>
        <label>
          What would you like to do?
          <textarea
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              setResult(null);
              setError("");
            }}
            placeholder="I want a relaxed one-day trip to Baltimore..."
            rows={4}
            minLength={10}
            maxLength={2000}
            disabled={loading || disabled}
            required
          />
        </label>

        <button type="submit" disabled={loading || disabled}>
          {loading ? "Reading your request..." : "Read trip details"}
        </button>
      </form>

      {loading && <p role="status">Waiting for Gemini...</p>}
      {error && <p role="alert">{error}</p>}

      {result && (
        <div className="preview">
          <h3>Review the extracted details</h3>
          <p>Check these details before using them.</p>

          <p>
            <strong>Destination:</strong>{" "}
            {result.trip.destination ?? "Not provided"}
          </p>
          <p>
            <strong>Days:</strong> {result.trip.days ?? "Not provided"}
          </p>
          <p>
            <strong>Budget:</strong>{" "}
            {result.trip.budget == null
              ? "Not provided"
              : `$${result.trip.budget} USD`}
          </p>
          <p>
            <strong>Interests:</strong>{" "}
            {result.trip.interests.join(", ") || "Not provided"}
          </p>
          <p>
            <strong>Pace:</strong> {result.trip.pace ?? "Not provided"}
          </p>
          <p>
            <strong>Popularity:</strong>{" "}
            {result.trip.popularity ?? "Not provided"}
          </p>
          <p>
            <strong>Variety:</strong>{" "}
            {result.trip.variety ?? "Not provided"}
          </p>

          {result.missing_fields.length > 0 && (
            <p>
              Missing details: {result.missing_fields.join(", ")}
            </p>
          )}

          <p>
            This demo plans one day. Popularity and variety are saved
            but do not affect stop selection yet.
          </p>

          {result.trip.days > 1 ? (
            <p>
              Multi-day planning is not supported yet. Edit your request
              to describe a one-day trip.
            </p>
          ) : (
            <button
              type="button"
              disabled={loading || disabled}
              onClick={() => onApply(result.trip)}
            >
              Use these details for a one-day trip
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default TripInterpreter;