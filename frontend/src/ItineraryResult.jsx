import { useEffect, useRef, useState } from "react";

// Start fresh when a different itinerary is displayed.
function ItineraryResult({ itinerary }) {
  return (
    <ItineraryContent
      key={JSON.stringify(itinerary)}
      itinerary={itinerary}
    />
  );
}

function ItineraryContent({ itinerary }) {
  const dailyPlans = itinerary.daily_plans ?? [];
  const [admissions, setAdmissions] = useState({});
  const [loadingDay, setLoadingDay] = useState(null);
  const [priceError, setPriceError] = useState("");
  const activeRequest = useRef(null);

  useEffect(() => {
    return () => {
      // Stop requesting more attractions if this result is removed.
      activeRequest.current?.abort();
    };
  }, []);

  function admissionKey(day, stop) {
    return `${day.day}:${stop.place.id}`;
  }

  async function lookupDayPrices(day) {
    if (activeRequest.current) {
      return;
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    setLoadingDay(day.day);
    setPriceError("");

    try {
      // Limit each click to at most five attractions.
      for (const stop of day.stops.slice(0, 5)) {
        if (controller.signal.aborted) {
          break;
        }

        const key = admissionKey(day, stop);

        // Reuse completed results, including an unknown price.
        if (admissions[key]) {
          continue;
        }

        const response = await fetch(
          "http://127.0.0.1:8000/attractions/admission",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            signal: controller.signal,
            body: JSON.stringify({
              name: stop.place.name,
              destination: itinerary.trip.destination,
              latitude: stop.place.latitude,
              longitude: stop.place.longitude,
              visit_date: day.date ?? null,
            }),
          }
        );

        let data;

        try {
          data = await response.json();
        } catch {
          throw new Error("The server returned an unexpected response.");
        }

        if (!response.ok) {
          throw new Error(
            typeof data.detail === "string"
              ? data.detail
              : "Could not look up admission information."
          );
        }

        if (
          !data ||
          !["listed_price", "unknown"].includes(data.status) ||
          !Array.isArray(data.conditions)
        ) {
          throw new Error("The admission response was incomplete.");
        }

        if (
          data.status === "listed_price" &&
          (
            typeof data.standard_adult_price_usd !== "number" ||
            !Number.isFinite(data.standard_adult_price_usd) ||
            data.standard_adult_price_usd < 0
          )
        ) {
          throw new Error("The admission price was invalid.");
        }

        setAdmissions((previous) => ({
          ...previous,
          [key]: data,
        }));
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        setPriceError(
          `${error.message} Further lookups stopped. Completed results are kept.`
        );
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;

        if (!controller.signal.aborted) {
          setLoadingDay(null);
        }
      }
    }
  }
  function downloadItinerary() {
    // Start with the main trip information.
    const lines = [
      "TRIP HAPPENS",
      "Draft itinerary",
      "",
      `Destination: ${itinerary.trip.destination}`,
      `Number of days: ${itinerary.trip.days}`,
      `Trip date: ${itinerary.trip.trip_date ?? "Not selected"}`,
      `Budget: $${itinerary.budget_usd}`,
      "Budget has not been verified against activity costs.",
      "Times are in the destination's local time.",
      "",
    ];
    
    if (itinerary.budget_breakdown) {
      const allocation = itinerary.budget_breakdown;

      lines.push(
        "BUDGET ALLOCATION",
        `Reserved for food: $${allocation.food_allowance_usd.toFixed(2)}`,
        `Available for activities: $${allocation.activity_allowance_usd.toFixed(2)}`,
        "These are allowances, not verified activity costs.",
        ""
      );
    }

    // Include the budget calculation in the downloaded file.
    if (itinerary.budget_check) {
      const budget = itinerary.budget_check;

      lines.push(
        "",
        "BUDGET CHECK",
        budget.message,
        `Food allowance: $${budget.food_allowance.toFixed(2)}`,
        `Known activity costs: $${budget.known_activity_total.toFixed(2)}`,
        `Amount accounted for: $${budget.accounted_total.toFixed(2)}`
      );

      if (budget.remaining_after_known_costs >= 0) {
        lines.push(
          `Remaining after known costs: $${budget.remaining_after_known_costs.toFixed(2)}`
        );
      } else {
        lines.push(
          `Over budget by: $${Math.abs(
            budget.remaining_after_known_costs
          ).toFixed(2)}`
        );
      }

      lines.push(
        `Activities with prices: ${budget.priced_activity_count}`,
        `Activities with unknown prices: ${budget.unknown_activity_count}`
      );

      if (budget.unknown_activity_count > 0) {
        lines.push(
          "Unknown prices are not treated as free. Remaining money may still be needed for these activities."
        );
      }

      lines.push(
        "This calculation covers activity admission and the food allowance.",
        "Lodging and transportation are excluded.",
        "Admission prices have not been independently verified.",
        ""
      );
    }

    // Add each day, then its attractions.
    for (const day of dailyPlans) {
      lines.push(
        `DAY ${day.day}${day.date ? ` · ${day.date}` : ""}`,
        `${day.selected_stop_count} of ${day.target_stop_count} target stops`,
        ""
      );

      if (day.stops.length === 0) {
        lines.push(
          "No additional matching attractions available in the retrieved results.",
          ""
        );
      }

      for (const stop of day.stops) {
        lines.push(`${stop.position}. ${stop.place.name}`);

        if (stop.schedule) {
          lines.push(
            `Time: ${stop.schedule.suggested_start} to ${stop.schedule.suggested_end}`,
            `Assumed visit: ${stop.schedule.assumed_visit_minutes} minutes`
          );
        }

        lines.push(`Reason: ${stop.reason}`);

        const admission = admissions[admissionKey(day, stop)];

        if (admission) {
          if (admission.status === "listed_price") {
            lines.push(
              `Listed standard adult admission: $${admission.standard_adult_price_usd.toFixed(2)} USD`
            );
          } else {
            lines.push("Admission price: unknown.");
          }

          if (admission.source_url) {
            lines.push(`Price source: ${admission.source_url}`);
          }

          if (admission.supporting_quote) {
            lines.push(`Supporting quote: ${admission.supporting_quote}`);
          }

          for (const condition of admission.conditions) {
            lines.push(`Price condition: ${condition}`);
          }

          lines.push(
            `Retrieved: ${admission.retrieved_at}`,
            "Lookup: Tavily search and Gemini extraction.",
            "Listed price only. Not verified for the visit date.",
            "This lookup has not been included in the budget calculation."
          );
        } else {
          lines.push("Admission price has not been looked up.");
        }

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
        {itinerary.trip.days} day(s) ·{" "}
        {itinerary.selected_stop_count} total stops · Total trip budget: $
        {itinerary.budget_usd}
      </p>
      <p>Budget has not been verified against activity costs.</p>
      {itinerary.budget_breakdown && (
        <div className="budget-details">
          <h3>Your budget allocation</h3>

          <p>
            Total budget: $
            {itinerary.budget_breakdown.total_usd.toFixed(2)}
          </p>

          <p>
            Reserved for food: $
            {itinerary.budget_breakdown.food_allowance_usd.toFixed(2)}
          </p>

          <p>
            Available for activities: $
            {itinerary.budget_breakdown.activity_allowance_usd.toFixed(2)}
          </p>

          <p>
            These are spending allowances. Attraction prices are unknown,
            so this does not confirm that the itinerary fits your budget.
          </p>
        </div>
      )}
      <p>Suggested times are in the destination's local time.</p>

      {itinerary.budget_check && (
        <div className="budget-check">
          <h3>Budget check</h3>

          <p>{itinerary.budget_check.message}</p>

          <p>
            <strong>Food allowance:</strong>{" "}
            ${itinerary.budget_check.food_allowance.toFixed(2)}
          </p>

          <p>
            <strong>Known activity costs:</strong>{" "}
            ${itinerary.budget_check.known_activity_total.toFixed(2)}
          </p>

          <p>
            <strong>Amount accounted for:</strong>{" "}
            ${itinerary.budget_check.accounted_total.toFixed(2)}
          </p>

          {itinerary.budget_check.remaining_after_known_costs >= 0 ? (
            <p>
              <strong>Remaining after known costs:</strong>{" "}
              $
              {itinerary.budget_check.remaining_after_known_costs.toFixed(2)}
            </p>
          ) : (
            <p>
              <strong>Over budget by:</strong>{" "}
              $
              {Math.abs(
                itinerary.budget_check.remaining_after_known_costs
              ).toFixed(2)}
            </p>
          )}

          <p>
            Activities with prices:{" "}
            {itinerary.budget_check.priced_activity_count}
            {" · "}
            Activities with unknown prices:{" "}
            {itinerary.budget_check.unknown_activity_count}
          </p>

          {itinerary.budget_check.unknown_activity_count > 0 && (
            <p>
              Unknown prices are not treated as free. Any remaining
              money may still be needed for these activities.
            </p>
          )}

          <p>
            This calculation covers activity admission and your food
            allowance. It excludes lodging and transportation.
            Admission prices have not been independently verified.
          </p>
        </div>
      )}

      {/* Summarize travel between the selected stops. */}
      {itinerary.travel_summary && (
        <div className="travel-details">
          <h3>Travel across the whole trip</h3>

          {itinerary.travel_summary.estimated_journeys + itinerary.travel_summary.fallback_journeys === 0 ? (
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
                Excludes travel to each day's first stop, from each day's last stop,
                and between days. Parking and walking to entrances are not included.
              </p>
            </>
          )}
        </div>
      )}

      {itinerary.stops.length === 0 && (
        <p>No stops were found. Try another destination.</p>
      )}

      {loadingDay !== null && (
        <p role="status">
          Looking up Day {loadingDay}, one attraction at a time.
          This may take a few minutes.
        </p>
      )}

      {priceError && <p role="alert">{priceError}</p>}

      {dailyPlans.map((day) => (
        <section className="day-section" key={day.day}>
          <h3>
            Day {day.day}
            {day.date ? ` · ${day.date}` : ""}
          </h3>

          <p>
            {day.selected_stop_count} of {day.target_stop_count} target stops
          </p>

          {day.stops.length > 0 && (
            <div className="admission-controls">
              <button
                type="button"
                onClick={() => lookupDayPrices(day)}
                disabled={
                  loadingDay !== null ||
                  day.stops.slice(0, 5).every(
                    (stop) => admissions[admissionKey(day, stop)]
                  )
                }
              >
                {loadingDay === day.day
                  ? "Looking up admission prices..."
                  : "Look up this day's admission prices"}
              </button>

              <p>
                Searches up to five attractions. Completed lookups
                are reused while this itinerary remains open.
              </p>
            </div>
          )}

          {day.stops.length === 0 && (
            <p>
              No additional matching attractions were available in the retrieved
              results for this day. Try fewer days, different interests, or another
              destination.
            </p>
          )}

          {day.travel_summary && day.stops.length > 1 && (
            <div className="travel-details">
              <p>
                Available driving estimates:{" "}
                {day.travel_summary.estimated_driving_minutes} minutes
                {" · "}
                {day.travel_summary.estimated_distance_km} km
              </p>

              {day.travel_summary.fallback_journeys > 0 && (
                <p>
                  Estimates are missing for{" "}
                  {day.travel_summary.fallback_journeys} journey(s).
                  The schedule includes{" "}
                  {day.travel_summary.fallback_buffer_minutes} minutes
                  of assumed buffers for those journeys.
                </p>
              )}
            </div>
          )}

          {day.date && (
            <div>
              <h4>Weather for this day</h4>

              {day.weather ? (
                <>
                  <p>
                    High:{" "}
                    {day.weather.high_f == null
                      ? "Unavailable"
                      : `${day.weather.high_f}°F`}
                    {" · "}
                    Low:{" "}
                    {day.weather.low_f == null
                      ? "Unavailable"
                      : `${day.weather.low_f}°F`}
                  </p>

                  <p>
                    Maximum precipitation chance:{" "}
                    {day.weather.precipitation_chance_max_percent == null
                      ? "Unavailable"
                      : `${day.weather.precipitation_chance_max_percent}%`}
                  </p>
                </>
              ) : (
                <p>Weather is unavailable for this date.</p>
              )}
            </div>
          )}

          {day.stops.map((stop) => (
            <article className="stop-card" key={stop.place.id}>
              <h4>
                {stop.position}. {stop.place.name}
              </h4>

              {stop.schedule && (
                <>
                  <p>
                    <strong>
                      {stop.schedule.suggested_start} to{" "}
                      {stop.schedule.suggested_end}
                    </strong>
                  </p>

                  <p>
                    Assumed visit:{" "}
                    {stop.schedule.assumed_visit_minutes} minutes
                  </p>
                </>
              )}

              <p>{stop.reason}</p>

              <AdmissionInfo
                admission={admissions[admissionKey(day, stop)]}
              />

              {stop.position === 1 ? (
                <p>
                  First stop of this day. Travel to this attraction
                  is not included.
                </p>
              ) : stop.travel_before ? (
                <div className="travel-details">
                  <p>
                    Drive from previous stop:{" "}
                    {stop.travel_before.scheduled_minutes} minutes
                    {" · "}
                    {stop.travel_before.distance_km} km
                  </p>

                  <p>
                    Estimated by OSRM. Parking and walking to the
                    entrance are not included.
                  </p>
                </div>
              ) : (
                <div className="travel-details">
                  <p>
                    Driving estimate unavailable. Assumed buffer:{" "}
                    {stop.schedule?.assumed_buffer_before_minutes ?? 15}
                    {" minutes. The journey may take longer."}
                  </p>
                </div>
              )}
            </article>
          ))}
        </section>
      ))}

      {!itinerary.trip.trip_date && (
        <>
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
        </>
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

function AdmissionInfo({ admission }) {
  if (!admission) {
    return <p>Admission price has not been looked up.</p>;
  }

  return (
    <div className="admission-details">
      <h5>Admission information</h5>

      {admission.status === "listed_price" ? (
        <p>
          Listed standard adult admission:{" "}
          <strong>
            ${admission.standard_adult_price_usd.toFixed(2)} USD
          </strong>
        </p>
      ) : (
        <p>Admission price is unknown.</p>
      )}

      {admission.source_url &&
        /^https?:\/\//i.test(admission.source_url) && (
          <p>
            <a
              href={admission.source_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              View price source
            </a>
          </p>
        )}

      {admission.supporting_quote && (
        <blockquote>{admission.supporting_quote}</blockquote>
      )}

      <ul>
        {admission.conditions.map((condition, index) => (
          <li key={index}>{condition}</li>
        ))}
      </ul>

      <p>
        Retrieved: {admission.retrieved_at}
        {admission.cached ? " (cached result)" : ""}
      </p>

      <p>
        Found using Tavily and extracted by Gemini. Check the source
        before booking. This is not a verified price for your visit date.
      </p>
    </div>
  );
}

export default ItineraryResult;