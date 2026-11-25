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
      <p>Describe your plans, or use the form below.</p>    
      <p>
        To include a date, write the month, day, and year,
        such as November 25, 2026. Otherwise, choose it in the form.
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
            placeholder="One day in Baltimore on November 28, 2026. $100 for food and activities, including $30 for food. Museums and parks, at a relaxed pace."
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
            <strong>Trip date:</strong>{" "}
            {result.trip.trip_date ?? "Not provided, choose it in the form"}
          </p>
          <p>
            <strong>Budget:</strong>{" "}
            {result.trip.budget == null
              ? "Not provided"
              : `$${result.trip.budget} USD`}
          </p>
          <p>
            <strong>Food allowance:</strong>{" "}
            {result.trip.food_budget == null
              ? "Not provided"
              : `$${result.trip.food_budget} USD, included in the total`}
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
            This planner supports 1 to 7 days in one destination.
            Budget amounts cover the whole trip.
            Review all details before applying them.
          </p>

          {result.trip.days != null &&
          (result.trip.days < 1 || result.trip.days > 7) ? (
            <p>
              This planner supports 1 to 7 days.
              Edit your request to use a supported trip length.
            </p>
          ) : (
            <button
              type="button"
              disabled={loading || disabled}
              onClick={() => onApply(result.trip)}
            >
              Use these trip details
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default TripInterpreter;