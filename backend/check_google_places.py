import json

from fastapi import HTTPException
from google_places import search_place_details


try:
    candidates = search_place_details(
        name="National Aquarium",
        destination="Baltimore, Maryland",
    )

    print(json.dumps(candidates, indent=2, ensure_ascii=False))

except HTTPException as error:
    print(f"Error {error.status_code}: {error.detail}")