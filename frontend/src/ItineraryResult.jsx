function ItineraryResult({ itinerary }) {
  function downloadItinerary() {
    // Start with the main trip information.
    const lines = [
      "TRIP HAPPENS",
      "Draft itinerary",
      "",
      `Destination: ${itinerary.trip.destination}`,
      `Trip date: ${itinerary.trip.trip_date ?? "Not selected"}`,
      `Budget: $${itinerary.budget_usd}`,
      "Budget has not been verified against activity costs.",
      "Times are in the destination's local time.",
      "",
    ];

    // Add each attraction and its schedule.
    for (const stop of itinerary.stops) {
      lines.push(`${stop.position}. ${stop.place.name}`);

      if (stop.schedule) {
        lines.push(
          `Time: ${stop.schedule.suggested_start} to ${stop.schedule.suggested_end}`,
          `Assumed visit: ${stop.schedule.assumed_visit_minutes} minutes`
        );
      }

      lines.push(`Reason: ${stop.reason}`);

      if (stop.position === 1) {
        lines.push("Travel to the first stop is not included.");
      } else if (stop.travel_before) {
        lines.push(
          `Estimated drive from previous stop: ${stop.travel_before.scheduled_minutes} minutes`,
          `Driving distance: ${stop.travel_before.distance_km} km`
        );
      } else {
        const buffer =
          stop.schedule?.assumed_buffer_before_minutes ?? 15;

        lines.push(
          `Driving estimate unavailable. Assumed buffer: ${buffer} minutes.`
        );
      }

      lines.push("");
    }

    // Include the weather shown on the page.
    lines.push("WEATHER");

    if (itinerary.weather?.forecast?.length > 0) {
      if (!itinerary.trip.trip_date) {
        lines.push(
          "No trip date selected. Forecast starts today at the destination."
        );
      }

      for (const day of itinerary.weather.forecast) {
        const high =
          day.high_f == null ? "Unavailable" : `${day.high_f}°F`;

        const low =
          day.low_f == null ? "Unavailable" : `${day.low_f}°F`;

        const rainChance =
          day.precipitation_chance_max_percent == null
            ? "Unavailable"
            : `${day.precipitation_chance_max_percent}%`;

        lines.push(
          `Date: ${day.date}`,
          `High: ${high}`,
          `Low: ${low}`,
          `Maximum precipitation chance: ${rainChance}`,
          ""
        );
      }
    } else {
      lines.push("Weather is unavailable for this itinerary.", "");
    }
    // Keep the limitations with the downloaded itinerary.
    lines.push("THINGS TO KNOW");

    for (const warning of itinerary.warnings) {
      lines.push(`• ${warning}`);
    }

    lines.push(
      "",
      "SOURCES",
      `Attractions: ${itinerary.sources.attractions}`
    );
    
    if (itinerary.sources.weather) {
      lines.push(`Weather: ${itinerary.sources.weather}`);
    }

    if (itinerary.sources.routing) {
      lines.push(
        `Routing: ${itinerary.sources.routing}`,
        "https://www.openstreetmap.org/copyright"
      );
    }

    // Create a text file and start the download.
    const file = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8",
    });

    const url = URL.createObjectURL(file);
    const link = document.createElement("a");

    link.href = url;
    link.download = "trip-happens-itinerary.txt";

    document.body.appendChild(link);
    link.click();
    link.remove();

    // Release the temporary file URL after the download starts.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="preview">
      <h2>Your draft itinerary</h2>
      <button type="button" onClick={downloadItinerary}>
        Download itinerary
      </button>      
      <p>{itinerary.trip.destination}</p>
      <p>
        {itinerary.selected_stop_count} stops · Budget: $
        {itinerary.budget_usd}
      </p>
      <p>Budget has not been verified against activity costs.</p>
      <p>Suggested times are in the destination's local time.</p>

      {/* Summarize travel between the selected stops. */}
      {itinerary.travel_summary && (
        <div className="travel-details">
          <h3>Travel between stops</h3>

          {itinerary.stops.length < 2 ? (
            <p>There are no journeys between stops.</p>
          ) : (
            <>
              {itinerary.travel_summary.estimated_journeys > 0 && (
                <p>
                  Available driving estimates:{" "}
                  {itinerary.travel_summary.estimated_driving_minutes}
                  {" minutes · "}
                  {itinerary.travel_summary.estimated_distance_km}
                  {" km across "}
                  {itinerary.travel_summary.estimated_journeys}
                  {" journey(s)."}
                </p>
              )}

              {itinerary.travel_summary.fallback_journeys > 0 && (
                <p>
                  Missing driving estimates:{" "}
                  {itinerary.travel_summary.fallback_journeys}
                  {" journey(s). The schedule uses "}
                  {itinerary.travel_summary.fallback_buffer_minutes}
                  {" minutes of assumed buffers for these journeys."}
                </p>
              )}

              <p>
                Excludes travel to the first stop and from the last stop.
                Parking and walking to entrances are not included.
              </p>
            </>
          )}
        </div>
      )}

      {itinerary.stops.length === 0 && (
        <p>No stops were found. Try another destination.</p>
      )}

      {itinerary.stops.map((stop) => (
        <article className="stop-card" key={stop.place.id}>
          <h3>
            {stop.position}. {stop.place.name}
          </h3>

          {stop.schedule && (
            <>
              <p>
                <strong>
                  {stop.schedule.suggested_start}–
                  {stop.schedule.suggested_end}
                </strong>
              </p>
              <p>
                Assumed visit: {stop.schedule.assumed_visit_minutes} minutes
              </p>
            </>
          )}

          <p>{stop.reason}</p>

          {/* Explain the journey from the previous attraction. */}
          {stop.position === 1 ? (
            <p>
              First stop. Travel to this attraction is not included.
            </p>
          ) : stop.travel_before ? (
            <div className="travel-details">
              <p>
                <strong>Drive from previous stop:</strong>{" "}
                {stop.travel_before.scheduled_minutes} minutes
                {" · "}
                {stop.travel_before.distance_km} km
              </p>

              <p>
                Estimated by OSRM. Parking and walking to the entrance
                are not included.
              </p>
            </div>
          ) : (
            <div className="travel-details">
              <p>
                <strong>Travel estimate unavailable.</strong>{" "}
                The schedule allows an assumed{" "}
                {stop.schedule?.assumed_buffer_before_minutes ?? 15}
                -minute buffer from the previous stop.
              </p>

              <p>The actual journey may take longer.</p>
            </div>
          )}
        </article>
      ))}

      <h3>Weather forecast</h3>
      {itinerary.trip.trip_date ? (
        <p>
          Trip date: {itinerary.trip.trip_date}.
          Weather is shown only for matching dates when available.
        </p>
      ) : (
        <p>
          No trip date was selected. This forecast starts today
          at the destination.
        </p>
      )}

      {itinerary.weather ? (
        itinerary.weather.forecast.map((day) => (
          <div key={day.date}>
            <p><strong>{day.date}</strong></p>
            <p>
              High: {day.high_f == null ? "Unavailable" : `${day.high_f}°F`}
              {" · "}
              Low: {day.low_f == null ? "Unavailable" : `${day.low_f}°F`}
            </p>
            <p>
              Maximum precipitation chance:{" "}
              {day.precipitation_chance_max_percent == null
                ? "Unavailable"
                : `${day.precipitation_chance_max_percent}%`}
            </p>
          </div>
        ))
      ) : (
        <p>Weather is unavailable.</p>
      )}

      <h3>Things to know</h3>
      <ul>
        {itinerary.warnings.map((warning, index) => (
          <li key={index}>{warning}</li>
        ))}
      </ul>

      <p className="source-note">
        Attractions: {itinerary.sources.attractions}
        {itinerary.sources.weather &&
          ` · Weather: ${itinerary.sources.weather}`}
      </p>

      {itinerary.sources?.routing && (
        <p className="source-note">
          Driving estimates: OSRM. Map data:{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenStreetMap contributors
          </a>
          .
        </p>
      )}
    </section>
  );
}

export default ItineraryResult;