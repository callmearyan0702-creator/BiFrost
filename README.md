# PathForge

AI-powered reverse-engineered career roadmapper for the Lloyd Hackathon.

## Product

PathForge turns a specific dream role into a living career map. A student provides:

- Target role
- Current skills
- Hours available per week
- Deadline

The AI generates a dependency graph of skills, projects and milestones. Students can inspect any node, mark skills they already know, and replan the path around their actual starting point.

## Architecture

```text
React + React Flow
        |
        v
     FastAPI
        |
        v
     LangGraph
        |
        +--> Goal Analyzer
        +--> Career Planner / LLM
        +--> Reality Checker
        |
        v
Validated Roadmap JSON
```

The frontend consumes a stable `Roadmap` contract. LLM output is validated with Pydantic before it reaches the graph UI.

## Current milestone — LangGraph foundation

- FastAPI backend
- Pydantic roadmap schema
- LangGraph workflow
- LLM-based career graph generation
- Graph/dependency validation
- React + React Flow visualization
- Node detail panel
- Mark-known interaction
- Readiness score
- Hours/week and timeline constraints
- Configurable CORS
- `.env.example` for local configuration

## Setup

### Backend

```bash
cd backend
python -m venv .venv
# Windows
.venv\\Scripts\\activate
# macOS/Linux
source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env  # Windows
# cp .env.example .env # macOS/Linux
```

Set `OPENAI_API_KEY` in `.env`. Optionally change `PATHFORGE_MODEL`.

Start:

```bash
python -m app
```

API: http://localhost:8000

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173

If the backend is deployed separately, set:

```text
VITE_API_URL=https://your-backend.example.com
```

## API

### Generate roadmap

`POST /api/roadmap/generate`

```json
{
  "target_role": "AI Engineer at a product-based startup",
  "current_skills": ["Python", "ML", "SQL"],
  "hours_per_week": 10,
  "timeline_months": 6
}
```

### Update roadmap

`POST /api/roadmap/update`

Accepts the existing roadmap plus known skill/node IDs and optionally a new weekly-hour constraint.

## LangGraph workflow

1. `goal_analyzer` — normalizes the career goal and constraints.
2. `career_planner` — asks the LLM for a structured career dependency graph.
3. `reality_checker` — validates IDs, edges, prerequisites and target-node existence.
4. API returns only validated roadmap data.

## Next milestone

Improve dependency-aware rerouting so changing known skills or time constraints can regenerate only the affected path rather than merely changing node status. Then add constraint-aware timeline calculations, better node intelligence and deployment.

## Hackathon compliance

The Lloyd Hackathon brief requires the new public repository to be created after the permitted start time, all project code to be written during the hackathon, regular commits, and no secrets in the repository. Keep API keys in environment variables.

The brief also requires a public working URL, a README, a PPT and a demo. The application should handle bad input, AI/API failures and mobile use.
