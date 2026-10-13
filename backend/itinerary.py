# Match common user interests to OpenTripMap categories
INTEREST_CATEGORIES = {
    "museum": "museums",
    "museums": "museums",
    "history": "historic",
    "historic": "historic",
    "nature": "natural",
    "architecture": "architecture",
}


def build_itinerary(attractions: list, interests: list[str], pace: str):
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

        candidates.append(candidate)

    # Places matching more requested categories come first
    candidates.sort(
        key=lambda place: place["interest_score"],
        reverse=True,
    )

    selected = candidates[:stop_limit]
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

        stops.append({
            "position": position,
            "place": place,
            "reason": reason,
        })

    warnings = []

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