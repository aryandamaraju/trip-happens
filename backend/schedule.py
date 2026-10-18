def format_time(minutes: int):
    # Convert minutes since midnight into a time like 09:00.
    hours = minutes // 60
    remaining_minutes = minutes % 60

    return f"{hours:02d}:{remaining_minutes:02d}"


def add_schedule(stops: list):
    current_time = 9 * 60
    buffer_minutes = 15
    scheduled_stops = []

    for index, stop in enumerate(stops):
        categories = stop["place"]["categories"]

        # These lengths are assumptions for the draft.
        if "museums" in categories:
            visit_minutes = 90
        else:
            visit_minutes = 45

        # Add a buffer before each stop except the first one.
        buffer_before = 0
        if index > 0:
            buffer_before = buffer_minutes
            current_time += buffer_before

        end_time = current_time + visit_minutes

        # Keep the original stop details and add its schedule.
        scheduled_stop = stop.copy()
        scheduled_stop["schedule"] = {
            "suggested_start": format_time(current_time),
            "suggested_end": format_time(end_time),
            "assumed_visit_minutes": visit_minutes,
            "assumed_buffer_before_minutes": buffer_before,
        }

        scheduled_stops.append(scheduled_stop)
        current_time = end_time

    return scheduled_stops