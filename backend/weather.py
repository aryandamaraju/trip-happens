import httpx
from fastapi import HTTPException


# Get a daily forecast for the selected location
def get_weather(latitude: float, longitude: float, days: int):
    url = "https://api.open-meteo.com/v1/forecast"

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "daily": (
            "temperature_2m_max,"
            "temperature_2m_min,"
            "precipitation_probability_max"
        ),
        "temperature_unit": "fahrenheit",
        "timezone": "auto",
        "forecast_days": days,
    }

    try:
        # Request the forecast and check for errors
        response = httpx.get(url, params=params, timeout=10.0)
        response.raise_for_status()
        data = response.json()

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Weather search took too long. Please try again.",
        )

    except httpx.HTTPError:
        raise HTTPException(
            status_code=502,
            detail="Could not retrieve the weather forecast.",
        )

    except ValueError:
        raise HTTPException(
            status_code=502,
            detail="The weather service returned an unreadable response.",
        )

    try:
        daily = data["daily"]
        forecast = []

        # Match each date with its temperatures and precipitation chance
        for i in range(len(daily["time"])):
            forecast.append({
                "date": daily["time"][i],
                "high_f": daily["temperature_2m_max"][i],
                "low_f": daily["temperature_2m_min"][i],
                "precipitation_chance_max_percent": (
                    daily["precipitation_probability_max"][i]
                ),
            })

        return {
            "timezone": data["timezone"],
            "forecast": forecast,
        }

    except (KeyError, TypeError, IndexError):
        raise HTTPException(
            status_code=502,
            detail="The weather service returned incomplete forecast data.",
        )