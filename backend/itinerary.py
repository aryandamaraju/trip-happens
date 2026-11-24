# Match common user interests to OpenTripMap categories
import math

from datetime import date, timedelta

INTEREST_CATEGORIES = {
    "museum": "museums",
    "museums": "museums",
    "history": "historic",
    "historic": "historic",
    "nature": "natural",
    "architecture": "architecture",
}

# Categories used to compare activity types.
# Broad tags like "interesting_places" are not useful for this.
ACTIVITY_TYPES = {
    "museums",
    "historic_districts",
    "monuments",
    "architecture",
    "natural",
    "gardens_and_parks",
    "churches",
    "theatres_and_entertainments",
    "sculptures",
}


def select_places(candidates: list, stop_limit: int, variety: str):
    # Candidates are already sorted by interest score.
    if variety == "low":
        return candidates[:stop_limit]

    selected = []
    remaining = candidates.copy()
    covered_interests = set()
    covered_types = set()

    # Medium and high first try to cover the requested interests.
    while remaining and len(selected) < stop_limit:
        best_place = None
        best_new_matches = 0

        for place in remaining:
            new_matches = 0

            for category in place["matched_categories"]:
                if category not in covered_interests:
                    new_matches += 1

            if new_matches > best_new_matches:
                best_place = place
                best_new_matches = new_matches

        if best_place is None:
            break

        selected.append(best_place)
        remaining.remove(best_place)
        covered_interests.update(best_place["matched_categories"])

        place_types = set(best_place["categories"]) & ACTIVITY_TYPES
        covered_types.update(place_types)

    # Fill the remaining slots.
    while remaining and len(selected) < stop_limit:
        best_place = remaining[0]

        if variety == "high":
            # Keep interest score first.
            # Among equal scores, prefer more new activity types.
            best_score = (-1, -1)

            for place in remaining:
                place_types = set(place["categories"]) & ACTIVITY_TYPES
                new_types = place_types - covered_types

                score = (
                    place["interest_score"],
                    len(new_types),
                )

                if score > best_score:
                    best_score = score
                    best_place = place

        selected.append(best_place)
        remaining.remove(best_place)

        place_types = set(best_place["categories"]) & ACTIVITY_TYPES
        covered_types.update(place_types)

    return selected

# Give each place a score for the selected popularity preference.
def get_popularity_priority(place: dict, popularity: str):
    if popularity == "mixed":
        return 0

    score = place.get("popularity_score")

    # Unknown ratings should not count as hidden gems.
    if score not in (1, 2, 3):
        return -1

    if popularity == "popular":
        return score

    if popularity == "hidden_gems":
        return 4 - score

    return 0

def clean_place_name(name: str):
    # Ignore capitalization and replace punctuation with spaces.
    cleaned = ""

    for character in name.casefold():
        if character.isalnum():
            cleaned += character
        else:
            cleaned += " "

    return " ".join(cleaned.split())


def is_same_place(first: dict, second: dict):
    # Matching provider IDs identify the same attraction.
    first_id = first.get("id")
    second_id = second.get("id")

    if first_id and first_id == second_id:
        return True

    first_name = clean_place_name(first.get("name", ""))
    second_name = clean_place_name(second.get("name", ""))

    if not first_name or not second_name:
        return False

    distance_km = distance_between(
        first["latitude"],
        first["longitude"],
        second["latitude"],
        second["longitude"],
    )

    # Matching names must also be close to each other.
    if first_name == second_name:
        return distance_km <= 0.1

    # For slightly different names, require nearby locations.
    if distance_km > 0.15:
        return False

    first_words = first_name.split()
    second_words = second_name.split()

    if len(first_words) <= len(second_words):
        shorter_words = first_words
        longer_words = second_words
    else:
        shorter_words = second_words
        longer_words = first_words

    # Avoid matching places based on a single generic word.
    if len(shorter_words) < 2:
        return False

    # Allow one extra word, such as a city name.
    if len(longer_words) != len(shorter_words) + 1:
        return False

    shorter_name = " ".join(shorter_words)
    longer_name = " ".join(longer_words)

    return (
        longer_name.startswith(shorter_name + " ")
        or longer_name.endswith(" " + shorter_name)
    )

def build_itinerary(attractions: list, interests: list[str], pace: str, variety: str = "medium", popularity: str = "mixed", prefer_museums: bool = False):
    stop_limits = {
        "relaxed": 3,
        "balanced": 4,
        "packed": 5,
    }

    stop_limit = stop_limits[pace]
    wanted_categories = []
    unsupported_interests = []

    # Turn the user's interests into categories we can compare
    for interest in interests:
        interest = interest.strip().lower()

        if not interest:
            continue

        category = INTEREST_CATEGORIES.get(interest)

        if category is None:
            if interest not in unsupported_interests:
                unsupported_interests.append(interest)

        elif category not in wanted_categories:
            wanted_categories.append(category)

    candidates = []
    seen_ids = set()

    for attraction in attractions:
        # Skip places that the data marks as destroyed.
        if "destroyed_objects" in attraction["categories"]:
            continue
        
        if attraction["id"] in seen_ids:
            continue

        seen_ids.add(attraction["id"])
        matched_categories = []

        for category in wanted_categories:
            if category in attraction["categories"]:
                matched_categories.append(category)

        # Copy the place so we do not change the original attraction data
        candidate = attraction.copy()
        candidate["interest_score"] = len(matched_categories)
        candidate["matched_categories"] = matched_categories
        # Museums are a rough indoor option, not guaranteed fully indoors.
        candidate["weather_score"] = 0

        if prefer_museums and "museums" in candidate["categories"]:
            candidate["weather_score"] = 1

        candidates.append(candidate)

    # Match interests first, then consider weather and popularity.
    candidates.sort(
        key=lambda place: (
            place["interest_score"],
            place["weather_score"],
            get_popularity_priority(place, popularity),
        ),
        reverse=True,
    )

    # Only schedule places matching a supported requested interest.
    candidates = [
        place
        for place in candidates
        if place["interest_score"] > 0
    ]

    # Keep the first ranked listing for each likely distinct place.
    unique_candidates = []

    for place in candidates:
        duplicate = any(
            is_same_place(place, existing)
            for existing in unique_candidates
        )

        if not duplicate:
            unique_candidates.append(place)

    candidates = unique_candidates

    selected = select_places(candidates, stop_limit, variety)

    stops = []

    for position, place in enumerate(selected, start=1):
        if place["matched_categories"]:
            reason = (
                "Matches these requested categories: "
                + ", ".join(place["matched_categories"])
            )
        else:
            reason = (
                "An additional nearby option. "
                "No supported interest-category match was found."
            )

        if place["weather_score"] == 1:
            reason += (
                " This museum received a weather preference because "
                "the selected date has a high precipitation chance. "
                "Indoor access has not been verified."
            )

        stops.append({
            "position": position,
            "place": place,
            "reason": reason,
        })

    # Show the rating used by the popularity preference.
    if popularity != "mixed":
        for stop in stops:
            score = stop["place"].get("popularity_score")

            if score in (1, 2, 3):
                stop["reason"] += (
                    f" OpenTripMap popularity rating: {score}/3."
                )
            else:
                stop["reason"] += (
                    " Popularity rating is unavailable."
                )

    warnings = []

    if prefer_museums:
        warnings.append(
            "The selected date has at least a 60% precipitation chance. "
            "Museum preference is enabled alongside interest and variety "
            "matching. Museums may include outdoor areas, and the final "
            "stops may remain unchanged."
        )

    # Explain when popularity information is missing.
    if popularity != "mixed":
        rated_count = 0

        for place in candidates:
            if place.get("popularity_score") in (1, 2, 3):
                rated_count += 1

        if candidates and rated_count == 0:
            warnings.append(
                "No usable popularity ratings were available. "
                "Your popularity preference could not affect this trip."
            )

        elif rated_count < len(candidates):
            warnings.append(
                "Some attractions have no usable popularity rating. "
                "Unrated places are not treated as hidden gems."
            )

    # Check which requested categories appear in the final selection.
    selected_categories = set()

    for place in selected:
        selected_categories.update(place["matched_categories"])

    missing_categories = []

    for category in wanted_categories:
        if category not in selected_categories:
            missing_categories.append(category)

    if missing_categories:
        warnings.append(
            "The selected stops do not cover these requested categories: "
            + ", ".join(missing_categories)
        )

    if unsupported_interests:
        warnings.append(
            "These interests are not supported by our basic matching yet: "
            + ", ".join(unsupported_interests)
        )

    if len(stops) < stop_limit:
        warnings.append(
            "Not enough distinct attractions matched the supported "
            "interests in the retrieved results. Unrelated places "
            "were not added just to fill the schedule."
        )

    if not stops and wanted_categories:
        warnings.append(
            "No unused matching attractions were available for this day."
        )

    return {
        "target_stop_count": stop_limit,
        "selected_stop_count": len(stops),
        "stops": stops,
        "warnings": warnings,
    }

# Calculate straight-line distance between two coordinates.
def distance_between(start_lat, start_lon, end_lat, end_lon):
    earth_radius_km = 6371

    lat_difference = math.radians(end_lat - start_lat)
    lon_difference = math.radians(end_lon - start_lon)

    start_lat = math.radians(start_lat)
    end_lat = math.radians(end_lat)

    value = (
        math.sin(lat_difference / 2) ** 2
        + math.cos(start_lat)
        * math.cos(end_lat)
        * math.sin(lon_difference / 2) ** 2
    )

    # Keep rounding errors within the valid range.
    value = max(0, min(1, value))

    return earth_radius_km * 2 * math.asin(math.sqrt(value))


# Keep the selected attractions, but visit nearby stops first.
def order_stops(stops: list, start_lat: float, start_lon: float):
    remaining = stops.copy()
    ordered = []

    current_lat = start_lat
    current_lon = start_lon

    while remaining:
        closest_stop = None
        closest_distance = float("inf")

        for stop in remaining:
            place = stop["place"]

            distance = distance_between(
                current_lat,
                current_lon,
                place["latitude"],
                place["longitude"],
            )

            if distance < closest_distance:
                closest_distance = distance
                closest_stop = stop

        if closest_stop is None:
            raise ValueError(
                "Could not choose the next stop. Check attraction coordinates."
            )

        remaining.remove(closest_stop)

        # Copy the stop so its original position is not changed.
        next_stop = closest_stop.copy()
        next_stop["position"] = len(ordered) + 1
        ordered.append(next_stop)

        current_lat = next_stop["place"]["latitude"]
        current_lon = next_stop["place"]["longitude"]

    return ordered

# Select different attractions for each day of the trip.
def build_daily_itineraries(
    attractions: list,
    interests: list[str],
    pace: str,
    days: int,
    variety: str = "medium",
    popularity: str = "mixed",
    trip_date: date | None = None,
    weather: dict | None = None,
):
    if not 1 <= days <= 7:
        raise ValueError("Trips must be between 1 and 7 days.")

    # Make sure the final date can be represented.
    if trip_date is not None:
        days_available = (date.max - trip_date).days

        if days - 1 > days_available:
            raise ValueError("The trip end date is outside the supported range.")

    remaining_attractions = attractions.copy()
    daily_plans = []

    for day_index in range(days):
        day_number = day_index + 1
        current_date = None
        daily_weather = None
        prefer_museums = False

        if trip_date is not None:
            current_date = trip_date + timedelta(days=day_index)

            # Find the forecast for this exact day.
            if weather is not None:
                for forecast in weather["forecast"]:
                    if forecast["date"] == current_date.isoformat():
                        daily_weather = forecast
                        break

        # Apply the weather rule separately for each dated day.
        if daily_weather is not None:
            chance = daily_weather.get(
                "precipitation_chance_max_percent"
            )

            if (
                not isinstance(chance, bool)
                and isinstance(chance, (int, float))
                and 60 <= chance <= 100
            ):
                prefer_museums = True

        # Reuse our existing interest and preference matching.
        itinerary = build_itinerary(
            attractions=remaining_attractions,
            interests=interests,
            pace=pace,
            variety=variety,
            popularity=popularity,
            prefer_museums=prefer_museums,
        )

        warnings = itinerary["warnings"].copy()

        if current_date is not None and daily_weather is None:
            warnings.append(
                "Weather is unavailable for this date. "
                "Weather preferences were not applied."
            )

        daily_plans.append({
            "day": day_number,
            "date": (
                current_date.isoformat()
                if current_date is not None
                else None
            ),
            "target_stop_count": itinerary["target_stop_count"],
            "selected_stop_count": itinerary["selected_stop_count"],
            "stops": itinerary["stops"],
            "weather": daily_weather,
            "warnings": warnings,
        })

        # Remove selected places and their likely duplicate listings.
        selected_places = [
            stop["place"]
            for stop in itinerary["stops"]
        ]

        remaining_attractions = [
            place
            for place in remaining_attractions
            if not any(
                is_same_place(place, selected)
                for selected in selected_places
            )
        ]

    return daily_plans