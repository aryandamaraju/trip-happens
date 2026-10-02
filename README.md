# Trip Happens

Trip Happens is a travel planning project for CMSC 668. Our goal is to create personalized itineraries based on a user's destination, budget, interests, and travel style.

Users will be able to choose a relaxed or packed schedule, popular attractions or hidden gems, and how much variety they want.

## Current Progress

The basic FastAPI backend is set up. It includes:

- A welcome endpoint
- A health check endpoint
- A trip preview endpoint that validates trip details and returns an average daily budget

The preview does not generate an itinerary or save data yet.

## Running the Backend

The current local setup uses Python 3.13.

After cloning the repository, open a terminal in the project folder.

### 1. Open the backend folder

```powershell
cd backend
```

### 2. Create a virtual environment

Only needed during the first setup:

```powershell
py -3.13 -m venv .venv
```

### 3. Install packages

```powershell
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 4. Start the server

Run this from the backend folder:

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --reload
```

Keep the terminal running while using the backend.

### Input Rules

- Destination: 2–100 characters
- Days: 1–30
- Budget: greater than zero
- Interests: a list of strings
- Pace: `relaxed`, `balanced`, or `packed`
- Popularity: `popular`, `mixed`, or `hidden_gems`
- Variety: `low`, `medium`, or `high`

If empty, pace defaults to `balanced`, popularity to `mixed`, and variety to `medium`.

## Next Steps

- Connect the travel data services
- Add LLM request interpretation
- Score activities based on user preferences
- Generate itineraries
- Build the React interface
- Add database storage
- Evaluate preference fit, variety, and practical fit

## NOTE
Do not commit `.venv`, `.env`, or API keys.