// Read backend times, including a possible next-day offset.
function readMinutes(time) {
  if (typeof time !== "string") return null;

  const match = time.match(
    /^(\d{2}):(\d{2})(?: \(\+(\d+) day\))?$/
  );

  if (!match) return null;

  return (
    Number(match[1]) * 60 +
    Number(match[2]) +
    Number(match[3] ?? 0) * 1440
  );
}


// Display timeline times in 12-hour format.
function displayTime(minutes) {
  const dayOffset = Math.floor(minutes / 1440);
  const hour = Math.floor(minutes / 60) % 24;
  const minute = String(minutes % 60).padStart(2, "0");
  const period = hour >= 12 ? "PM" : "AM";
  const extra = dayOffset > 0 ? ` (+${dayOffset} day)` : "";

  return `${hour % 12 || 12}:${minute} ${period}${extra}`;
}


function DayTimeline({ day }) {
  const events = [];

  for (const stop of day.stops) {
    const schedule = stop.schedule;
    if (!schedule) continue;

    const start = readMinutes(schedule.suggested_start);
    const end = readMinutes(schedule.suggested_end);

    if (start === null || end === null) continue;

    const waiting = schedule.waiting_before_minutes ?? 0;
    const arrival = start - waiting;

    const driving = schedule.estimated_travel_before_minutes ?? 0;
    const buffer = schedule.assumed_buffer_before_minutes ?? 0;
    const travelMinutes = driving + buffer;

    // Travel happens before arrival at the attraction.
    if (stop.position > 1 && travelMinutes > 0) {
      events.push({
        key: `travel-${stop.place.id}`,
        type: "travel",
        start: arrival - travelMinutes,
        end: arrival,
        title: stop.travel_before
          ? `Drive to ${stop.place.name}`
          : `Travel buffer before ${stop.place.name}`,
        note: stop.travel_before
          ? "Estimated driving time. Parking and walking are excluded."
          : "Assumed travel time. The journey may take longer.",
      });
    }

    if (waiting > 0) {
      events.push({
        key: `waiting-${stop.place.id}`,
        type: "waiting",
        start: arrival,
        end: start,
        title: "Wait for opening",
        note: stop.place.name,
      });
    }

    events.push({
      key: `visit-${stop.place.id}`,
      type: "visit",
      start,
      end,
      title: `${stop.position}. ${stop.place.name}`,
      note: `${schedule.assumed_visit_minutes} minute assumed visit`,
      conflict: schedule.opening_hours_status === "conflict",
      conflictNote: schedule.opening_hours_note,
    });
  }

  for (const [index, meal] of (day.meal_breaks ?? []).entries()) {
    const start = readMinutes(meal.suggested_start);
    const end = readMinutes(meal.suggested_end);

    if (start === null || end === null) continue;

    events.push({
      key: `meal-${index}`,
      type: "meal",
      start,
      end,
      title: "Lunch break",
      note: meal.note,
    });
  }

  events.sort((first, second) => first.start - second.start);

  if (events.length === 0) return null;

  return (
    <section className="day-timeline">
      <h4>Day at a glance</h4>

      <p className="timeline-note">
        Suggested times in the destination's local time.
        Conflicts need review before following this schedule.
      </p>

      <ol className="timeline-list">
        {events.map((event) => (
          <li
            key={event.key}
            className={`timeline-event timeline-${event.type}`}
          >
            <p className="timeline-time">
              {displayTime(event.start)} to {displayTime(event.end)}
            </p>

            <p className="timeline-title">{event.title}</p>
            <p className="timeline-note">{event.note}</p>

            {event.conflict && (
              <p className="schedule-conflict">
                <strong>Time needs review: </strong>
                {event.conflictNote}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default DayTimeline;