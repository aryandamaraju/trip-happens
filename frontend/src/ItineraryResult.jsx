function ItineraryResult({ itinerary }) {
  return (
    <section className="preview">
      <h2>Your draft itinerary</h2>
      <p>{itinerary.trip.destination}</p>
      <p>
        {itinerary.selected_stop_count} stops · Budget: $
        {itinerary.budget_usd}
      </p>
      <p>Budget has not been verified against activity costs.</p>
      <p>Suggested times are in the destination's local time.</p>

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
              <p>
                Buffer before stop:{" "}
                {stop.schedule.assumed_buffer_before_minutes} minutes
              </p>
            </>
          )}

          <p>{stop.reason}</p>
        </article>
      ))}

      <h3>Weather forecast</h3>
      <p>This forecast starts today, not on a selected future trip date.</p>

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
    </section>
  );
}

export default ItineraryResult;