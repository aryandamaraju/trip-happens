from fastapi import FastAPI

app = FastAPI(
    title="Trip Happens API",
    description="Group trip planning and itinerary recommendations.",
    version="0.1.0",
)


@app.get("/")
def home():
    return {"message": "Welcome to Trip Happens!"}


@app.get("/health")
def health_check():
    return {"status": "ok"}