import { useEffect, useRef, useState } from "react";
import OpeningHours from "./OpeningHours";
import DayTimeline from "./DayTimeline.jsx";

// Convert kilometers to miles for display.
function toMiles(kilometers) {
  return (kilometers * 0.621371).toFixed(2);
}

// Convert a time like 13:45 into 1:45 PM.
function to12Hour(time) {
  if (!time) return "Unavailable";

  // Preserve a day offset, such as "01:30 (+1 day)".
  const match = time.match(/^(\d{2}):(\d{2})(.*)$/);

  if (!match) return time;

  const hours = Number(match[1]);
  const minutes = match[2];
  const extra = match[3];
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;

  return `${displayHour}:${minutes} ${period}${extra}`;
}

// Start fresh when a different itinerary is displayed.
function ItineraryResult({ itinerary }) {
  return (
    <ItineraryContent
      key={JSON.stringify(itinerary)}
      itinerary={itinerary}
    />
  );
}

function ItineraryContent({ itinerary: originalItinerary }) {
  const [itinerary, setItinerary] = useState(originalItinerary);
  const dailyPlans = itinerary.daily_plans ?? [];

  const [confirmedPlaces, setConfirmedPlaces] = useState({});
  const [pendingDays, setPendingDays] = useState({});
  const [updatingDay, setUpdatingDay] = useState(null);
  const [scheduleError, setScheduleError] = useState("");
  const scheduleRequest = useRef(null);
  const [admissions, setAdmissions] = useState({});
  const [loadingDay, setLoadingDay] = useState(null);
  const [priceError, setPriceError] = useState("");
  const activeRequest = useRef(null);

  useEffect(() => {
    return () => {
      // Stop requesting more attractions if this result is removed.
      activeRequest.current?.abort();
      scheduleRequest.current?.abort();
    };
  }, []);

  function admissionKey(day, stop) {
    return `${day.day}:${stop.place.id}`;
  }

  // Recalculate whenever admission results change.
  const budgetCheck = calculateBudget();

  // Remember the Google match selected for one stop.
  function selectOpeningHours(day, stop, selectedPlace) {
    if (scheduleRequest.current) return;

    const key = admissionKey(day, stop);

    setConfirmedPlaces((previous) => ({
      ...previous,
      [key]: selectedPlace,
    }));

    setPendingDays((previous) => ({
      ...previous,
      [day.day]: true,
    }));

    setScheduleError("");
  }


  // Add the daily travel summaries together after rescheduling.
  function combineTravel(dailyPlans) {
    const summary = {
      mode: "driving",
      estimated_journeys: 0,
      fallback_journeys: 0,
      estimated_driving_minutes: 0,
      estimated_distance_km: 0,
      fallback_buffer_minutes: 0,
    };

    const fields = [
      "estimated_journeys",
      "fallback_journeys",
      "estimated_driving_minutes",
      "estimated_distance_km",
      "fallback_buffer_minutes",
    ];

    for (const day of dailyPlans) {
      for (const field of fields) {
        summary[field] += day.travel_summary?.[field] ?? 0;
      }
    }

    summary.estimated_distance_km = Number(
      summary.estimated_distance_km.toFixed(2)
    );

    return summary;
  }

  function removeStop(day, stopToRemove) {
    if (scheduleRequest.current || activeRequest.current) return;

    const remainingStops = day.stops.filter(
      (stop) => stop.place.id !== stopToRemove.place.id
    );

    updateDaySchedule(day, remainingStops);
  }

  async function updateDaySchedule(day, stopsToSchedule = day.stops) {
    if (scheduleRequest.current || activeRequest.current) return;

    const selectedPlaces = {};

    for (const stop of stopsToSchedule) {
      const selected = confirmedPlaces[admissionKey(day, stop)];

      if (selected) {
        selectedPlaces[stop.place.id] = {
          google_place_id: selected.google_place_id,
          business_status: selected.business_status,
          regular_periods: selected.regular_periods,
        };
      }
    }

    const controller = new AbortController();
    scheduleRequest.current = controller;

    setUpdatingDay(day.day);
    setScheduleError("");

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/trips/reschedule-day",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            day: day.day,
            visit_date: day.date ?? null,
            stops: stopsToSchedule,
            confirmed_places: selectedPlaces,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Could not update this day's schedule."
        );
      }

      if (
        data.day !== day.day ||
        !Array.isArray(data.stops) ||
        !Array.isArray(data.warnings) ||
        !data.travel_summary ||
        data.stops.length !== stopsToSchedule.length ||
        data.stops.some(
          (stop, index) =>
            stop.place?.id !== stopsToSchedule[index].place.id
        )
      ) {
        throw new Error("The updated schedule response was incomplete.");
      }

      setItinerary((previous) => {
        // Identify the old daily warnings in the combined warning list.
        const oldDailyWarnings = new Set();

        for (const existingDay of previous.daily_plans) {
          for (const warning of existingDay.warnings ?? []) {
            oldDailyWarnings.add(`Day ${existingDay.day}: ${warning}`);
          }
        }

        const updatedDays = previous.daily_plans.map((existingDay) => {
          if (existingDay.day !== day.day) return existingDay;

          // An empty day no longer needs attraction-selection warnings.
          const planningWarnings =
            data.stops.length > 0
              ? existingDay.planning_warnings ?? []
              : [];

          return {
            ...existingDay,
            stops: data.stops,
            selected_stop_count: data.stops.length,
            meal_breaks: data.meal_breaks ?? [],
            travel_summary: data.travel_summary,
            planning_warnings: planningWarnings,
            schedule_warnings: data.warnings,
            warnings: [...planningWarnings, ...data.warnings],
            schedule_basis: data.schedule_basis,
          };
        });

        const allStops = updatedDays.flatMap(
          (updatedDay) => updatedDay.stops
        );

        // Keep general trip notes, then add the current daily warnings.
        const updatedWarnings = previous.warnings.filter(
          (warning) => !oldDailyWarnings.has(warning)
        );

        for (const updatedDay of updatedDays) {
          for (const warning of updatedDay.warnings ?? []) {
            updatedWarnings.push(`Day ${updatedDay.day}: ${warning}`);
          }
        }

        return {
          ...previous,
          daily_plans: updatedDays,
          stops: allStops,
          selected_stop_count: allStops.length,
          travel_summary: combineTravel(updatedDays),
          warnings: [...new Set(updatedWarnings)],
          sources: {
            ...previous.sources,
            routing: allStops.some((stop) => stop.travel_before != null)
              ? "OSRM / OpenStreetMap contributors"
              : null,
          },
        };
      });

      setPendingDays((previous) => ({
        ...previous,
        [day.day]: false,
      }));
    } catch (error) {
      if (error.name !== "AbortError") {
        setScheduleError(
          error.message || "Could not update the schedule."
        );
      }
    } finally {
      scheduleRequest.current = null;

      if (!controller.signal.aborted) {
        setUpdatingDay(null);
      }
    }
  }

function calculateBudget() {
  // Add money as whole cents to avoid floating-point addition errors.
  const totalCents = Math.round(itinerary.budget_usd * 100);
  const foodCents = Math.round(
    (itinerary.trip.food_budget ?? 0) * 100
  );

  let activityCents = 0;
  let pricedCount = 0;
  let unknownCount = 0;

  for (const day of dailyPlans) {
    for (const stop of day.stops) {
      const admission = admissions[admissionKey(day, stop)];
      const price = admission?.standard_adult_price_usd;

      // Zero counts as a listed price. Missing prices stay unknown.
      if (
        admission?.status === "listed_price" &&
        typeof price === "number" &&
        Number.isFinite(price) &&
        price >= 0
      ) {
        activityCents += Math.round(price * 100);
        pricedCount += 1;
      } else {
        unknownCount += 1;
      }
    }
  }

  const accountedCents = foodCents + activityCents;
  const remainingCents = totalCents - accountedCents;

  let status;
  let message;

  if (remainingCents < 0) {
    status = "over_budget";
    message = "Listed admission prices plus food exceed your budget.";
  } else if (pricedCount + unknownCount === 0) {
    status = "incomplete";
    message = "There are no activities to check.";
  } else if (unknownCount > 0) {
    status = "incomplete";
    message = "Some prices are unknown. The full trip cost is incomplete.";
  } else {
    status = "within_listed_budget";
    message = "Listed admission prices plus food fit your budget.";
  }

  return {
    status,
    message,
    food_allowance: foodCents / 100,
    known_activity_total: activityCents / 100,
    accounted_total: accountedCents / 100,
    remaining_after_known_costs: remainingCents / 100,
    priced_activity_count: pricedCount,
    unknown_activity_count: unknownCount,
    prices_verified: false,
  };
}

  async function lookupDayPrices(day) {
    if (activeRequest.current || scheduleRequest.current) {
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
    if (budgetCheck) {
      const budget = budgetCheck;

      lines.push(
        "",
        "BUDGET ESTIMATE",
        budget.message,
        `Food allowance: $${budget.food_allowance.toFixed(2)}`,
        `Listed admission total: $${budget.known_activity_total.toFixed(2)}`,
        `Amount accounted for: $${budget.accounted_total.toFixed(2)}`
      );

      if (budget.remaining_after_known_costs >= 0) {
        lines.push(
          `Remaining before unknown costs and extra fees: $${budget.remaining_after_known_costs.toFixed(2)}`
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

      // Include lunch in the downloaded file.
      for (const meal of day.meal_breaks ?? []) {
        lines.push(
          `Lunch break: ${to12Hour(meal.suggested_start)} to ${to12Hour(meal.suggested_end)}`,
          `Duration: ${meal.duration_minutes} minutes`,
          meal.note,
          ""
        );
      }

      if (day.stops.length === 0) {
        lines.push(
          "No stops are currently planned for this day.",
          ""
        );
      }

      for (const stop of day.stops) {
        lines.push(`${stop.position}. ${stop.place.name}`);

        if (stop.schedule) {
          lines.push(
            `Time: ${to12Hour(stop.schedule.suggested_start)} to ${to12Hour(stop.schedule.suggested_end)}`,
            `Assumed visit: ${stop.schedule.assumed_visit_minutes} minutes`
          );
        }

        lines.push(`Reason: ${stop.reason}`);

        if (stop.schedule?.opening_hours_note) {
          lines.push(
            `Opening hours check: ${stop.schedule.opening_hours_note}`,
            `Waiting before visit: ${stop.schedule.waiting_before_minutes ?? 0} minutes`
          );
        }

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
            "Listed prices are included in the budget estimate. Unknown prices remain unaccounted for."
          );
        } else {
          lines.push("Admission price has not been looked up.");
        }

        if (stop.position === 1) {
          lines.push("Travel to the first stop is not included.");
        } else if (stop.travel_before) {
          lines.push(
            `Estimated drive from previous stop: ${stop.travel_before.scheduled_minutes} minutes`,
            `Driving distance: ${toMiles(stop.travel_before.distance_km)} miles`
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
      <button
        type="button"
        onClick={downloadItinerary}
        disabled={
          updatingDay !== null ||
          Object.values(pendingDays).some(Boolean)
        }
      >
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
          <h3>Your spending plan</h3>

          <dl className="budget-grid">
            <div>
              <dt>Total budget</dt>
              <dd>
                ${itinerary.budget_breakdown.total_usd.toFixed(2)}
              </dd>
            </div>

            <div>
              <dt>For food</dt>
              <dd>
                ${itinerary.budget_breakdown.food_allowance_usd.toFixed(2)}
              </dd>
            </div>

            <div>
              <dt>For activities</dt>
              <dd>
                ${itinerary.budget_breakdown.activity_allowance_usd.toFixed(2)}
              </dd>
            </div>
          </dl>

          <p className="hint">
            Spending allowances only. Actual trip costs are not verified.
          </p>
        </div>
      )}
      <p>Suggested times are in the destination's local time.</p>

      <div className="budget-check" aria-live="polite">
      <h3>Budget estimate</h3>
      <p>{budgetCheck.message}</p>

      <dl className="budget-grid">
        <div>
          <dt>Listed admission total</dt>
          <dd>${budgetCheck.known_activity_total.toFixed(2)}</dd>
        </div>

        <div>
          <dt>Including food</dt>
          <dd>${budgetCheck.accounted_total.toFixed(2)}</dd>
        </div>

        <div>
          <dt>
            {budgetCheck.remaining_after_known_costs >= 0
              ? "Remaining*"
              : "Over budget by"}
          </dt>
          <dd>
            $
            {Math.abs(
              budgetCheck.remaining_after_known_costs
            ).toFixed(2)}
          </dd>
        </div>
      </dl>

      <p>
        {budgetCheck.priced_activity_count} stops with listed prices
        {" · "}
        {budgetCheck.unknown_activity_count} with unknown prices
      </p>

      <p className="hint">
        Unknown prices are not free. Listed prices are not verified
        for your visit date and may exclude fees.
      </p>

      {budgetCheck.remaining_after_known_costs >= 0 && (
        <p className="hint">
          *Before unknown activity costs and extra fees.
        </p>
      )}

      <details className="result-details">
        <summary>What this estimate includes</summary>
        <p>
          Listed adult admission for one traveler at each scheduled
          stop, plus your food allowance for the whole trip.
          Hotels and transportation are excluded.
        </p>
        <p>
          Check each attraction's sources and conditions before booking.
        </p>
      </details>
    </div>

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
                  {toMiles(itinerary.travel_summary.estimated_distance_km)}
                  {" miles across "}
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
        <p>No stops are currently included in this itinerary.</p>
      )}

      {loadingDay !== null && (
        <p role="status">
          Looking up Day {loadingDay}, one attraction at a time.
          This may take a few minutes.
        </p>
      )}

      {priceError && <p role="alert">{priceError}</p>}
      {scheduleError && <p role="alert">{scheduleError}</p>}
      {updatingDay !== null && (
        <p role="status">
          Recalculating Day {updatingDay}...
        </p>
      )}

      {dailyPlans.map((day) => (
        <section className="day-section" key={day.day}>
          <h3>
            Day {day.day}
            {day.date ? ` · ${day.date}` : ""}
          </h3>

          <p>
            {day.selected_stop_count} of {day.target_stop_count} target stops
          </p>

          {pendingDays[day.day] && (
            <p role="status">
              This timeline still uses the previous schedule.
              Update this day's times to apply your opening hours selections.
            </p>
          )}

          <DayTimeline day={day} />

          {day.stops.length > 0 && (
            <div className="schedule-controls">
              <button
                type="button"
                onClick={() => updateDaySchedule(day)}
                disabled={
                  updatingDay !== null ||
                  loadingDay !== null ||
                  !day.date ||
                  !pendingDays[day.day]
                }
              >
                {updatingDay === day.day
                  ? "Updating times..."
                  : "Update this day's times"}
              </button>

              {!day.date ? (
                <p className="hint">
                  Choose a trip date and generate a new itinerary to check hours.
                </p>
              ) : pendingDays[day.day] ? (
                <p role="status">
                  Opening hours selections changed. Update this day's times
                  to apply them. Displayed times still reflect the previous schedule.
                </p>
              ) : (
                <p className="hint">
                  Select a Google match under an attraction to adjust its time.
                </p>
              )}

              {day.schedule_warnings?.length > 0 && (
                <div role="status">
                  <p><strong>Schedule needs review</strong></p>
                  <ul>
                    {day.schedule_warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {day.stops.length > 0 && (
            <div className="admission-controls">
              <button
                type="button"
                onClick={() => lookupDayPrices(day)}
                disabled={
                  loadingDay !== null ||
                  updatingDay !== null ||
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
              <p>No stops are currently planned for this day.</p>
            </p>
          )}

          {day.travel_summary && day.stops.length > 1 && (
            <div className="travel-details">
              <p>
                Available driving estimates:{" "}
                {day.travel_summary.estimated_driving_minutes} minutes
                {" · "}
                {toMiles(day.travel_summary.estimated_distance_km)} miles
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
          {day.stops.length > 0 && <h4>Attraction details</h4>}
          {day.stops.map((stop) => (
            <article className="stop-card" key={stop.place.id}>
              <h4>
                {stop.position}. {stop.place.name}
              </h4>

              <button
                type="button"
                className="remove-stop"
                onClick={() => removeStop(day, stop)}
                disabled={updatingDay !== null || loadingDay !== null}
              >
                Remove stop
              </button>

              {stop.schedule && (
                <>
                  <p>
                    <strong>
                      {to12Hour(stop.schedule.suggested_start)} to{" "}
                      {to12Hour(stop.schedule.suggested_end)}
                    </strong>
                  </p>

                  <p>
                    Assumed visit:{" "}
                    {stop.schedule.assumed_visit_minutes} minutes
                  </p>
                </>
              )}

              {stop.schedule?.waiting_before_minutes > 0 && (
                <p>
                  Waiting for opening:{" "}
                  {stop.schedule.waiting_before_minutes} minutes
                </p>
              )}

              {stop.schedule?.opening_hours_note && (
                <p
                  className={
                    stop.schedule.opening_hours_status === "conflict"
                      ? "schedule-conflict"
                      : "hint"
                  }
                >
                  {stop.schedule.opening_hours_status === "conflict" && (
                    <strong>Time needs review: </strong>
                  )}
                  {stop.schedule.opening_hours_note}
                </p>
              )}
              <p>{stop.reason}</p>

              <AdmissionInfo
                admission={admissions[admissionKey(day, stop)]}
              />

              <OpeningHours
                place={stop.place}
                destination={itinerary.trip.destination}
                disabled={updatingDay !== null}
                onSelect={(selectedPlace) =>
                  selectOpeningHours(day, stop, selectedPlace)
                }
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
                    {toMiles(stop.travel_before.distance_km)} miles
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

      <p className="hint">
        Draft schedule. Only selected Google matches are checked against
        regular weekly hours. Review any time conflicts.
        Driving estimates exclude parking and walking.
      </p>

      <details className="result-details planning-notes">
        <summary>Things to know</summary>

        <ul>
          {itinerary.warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      </details>

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
    return <p className="hint">Admission price not looked up yet.</p>;
  }

  return (
    <div className="admission-details">
      {admission.status === "listed_price" ? (
        <>
          <p className="admission-price">
            <span>Listed adult admission</span>
            <strong>
              ${admission.standard_adult_price_usd.toFixed(2)} USD
            </strong>
          </p>

          <p className="hint">
            Not verified for your visit date. Fees may apply.
          </p>
        </>
      ) : (
        <p>
          <strong>Admission price unknown.</strong> Not assumed free.
        </p>
      )}

      <details className="result-details">
        <summary>Sources and conditions</summary>

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

        {admission.conditions?.length > 0 && (
          <ul>
            {admission.conditions.map((condition, index) => (
              <li key={index}>{condition}</li>
            ))}
          </ul>
        )}

        <p className="hint">
          Retrieved: {admission.retrieved_at}
          {admission.cached ? " (cached result)" : ""}
        </p>

        <p className="hint">
          Found using Tavily and extracted by Gemini.
          Check the source before booking.
        </p>
      </details>
    </div>
  );
}

export default ItineraryResult;