import json
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv


load_dotenv(Path(__file__).parent / ".env")


def check_price_search():
    api_key = os.getenv("GEMINI_API_KEY")
    # Use this model only for the price search test.
    model = "gemini-3.8-flash"
    model = model.removeprefix("models/")

    if not api_key:
        print("Add GEMINI_API_KEY to backend/.env first.")
        return

    url = (
        "https://generativelanguage.googleapis.com/v1beta/"
        f"models/{model}:generateContent"
    )

    # Test one attraction before adding price lookup to the app.
    prompt = """
    Use Google Search to find the current standard adult admission
    price for the National Aquarium in Baltimore, Maryland.

    Use the attraction's official website as the price source.
    Report the amount, currency, source link, and any conditions.
    Explain whether prices vary by visit date or exclude fees.
    If only a starting price is available, label it as a starting price.
    If you cannot find a supported price, say "Price unknown".
    Do not guess or treat missing prices as free.

    Keep the answer short. This is research, not a booking quote.
    """

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "tools": [{"google_search": {}}],
    }

    print(f"Testing search with: {model}")

    try:
        response = httpx.post(
            url,
            headers={"x-goog-api-key": api_key},
            json=payload,
            timeout=httpx.Timeout(60.0, connect=10.0),
        )
    except httpx.TimeoutException:
        print("Gemini took too long. Try this test again later.")
        return
    except httpx.RequestError:
        print("Could not connect to Gemini.")
        return

    if not response.is_success:
        print(f"Gemini returned HTTP {response.status_code}")
        print(response.text.replace(api_key, "[REDACTED]"))
        return

    try:
        data = response.json()
        candidate = data["candidates"][0]

        print("\nANSWER")
        for part in candidate.get("content", {}).get("parts", []):
            if not part.get("thought", False):
                print(part.get("text", ""))

        print("\nFINISH REASON")
        print(candidate.get("finishReason", "Not provided"))

        # These fields help us inspect the search evidence.
        metadata = candidate.get("groundingMetadata") or {}

        print("\nSEARCH QUERIES")
        print(json.dumps(
            metadata.get("webSearchQueries", []),
            indent=2,
        ))

        print("\nSEARCH SOURCES")
        print(json.dumps(
            metadata.get("groundingChunks", []),
            indent=2,
        ))

        print("\nCITATION SUPPORT")
        print(json.dumps(
            metadata.get("groundingSupports", []),
            indent=2,
        ))

        if not metadata.get("groundingChunks"):
            print(
                "\nNo search sources were returned. "
                "Do not use this answer as a verified price."
            )

    except (ValueError, KeyError, IndexError, TypeError, AttributeError):
        print("Gemini returned an unexpected response format.")


if __name__ == "__main__":
    check_price_search()