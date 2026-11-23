# Match common user interests to OpenTripMap categories
import math

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
            "Fewer named attractions were available than the target stop count."
        )

    if stops and wanted_categories:
        if not any(stop["place"]["interest_score"] > 0 for stop in stops):
            warnings.append(
                "No retrieved attractions matched the supported interests. "
                "The stops shown are nearby alternatives."
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