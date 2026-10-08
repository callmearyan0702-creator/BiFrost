from typing import TypedDict
import json
import os

from langgraph.graph import END, START, StateGraph
from openai import OpenAI

from .schemas import Roadmap, RoadmapRequest


class GraphState(TypedDict, total=False):
    request: RoadmapRequest
    raw_plan: dict
    roadmap: Roadmap
    error: str


SYSTEM_PROMPT = """
You are PathForge, a career-roadmapping engine.

Your job is to reverse-engineer a hyper-specific target job into a realistic dependency graph
for a student starting from their current skills and constraints.

Rules:
- Return ONLY valid JSON. No markdown.
- Do not invent certifications or requirements just to make the graph larger.
- Prefer concrete skills, roles, projects and milestones.
- Every prerequisite must refer to an existing node id.
- Keep the graph useful and compact: usually 8-16 nodes.
- Respect the student's available hours/week and timeline.
- Existing skills should be marked complete.
- The target role must be a target node.
- Use realistic estimated_hours values.
- Edges represent prerequisite -> dependent relationships.

Required JSON shape:
{
  "target_role": "string",
  "timeline_months": 6,
  "hours_per_week": 10,
  "nodes": [
    {
      "id": "stable-kebab-case-id",
      "title": "string",
      "type": "skill|project|milestone|role|target",
      "status": "complete|current|missing|locked|optional",
      "description": "string",
      "why_it_matters": "string",
      "estimated_hours": 10,
      "prerequisites": ["other-node-id"],
      "projects": ["concrete project/task"],
      "interview_questions": ["question"]
    }
  ],
  "edges": [
    {"source": "node-id", "target": "node-id", "label": "prerequisite"}
  ]
}
"""


def _client() -> OpenAI:
    """Create an OpenAI-compatible client configured for OpenRouter."""
    key = os.getenv("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY is not configured")

    return OpenAI(
        api_key=key,
        base_url="https://openrouter.ai/api/v1",
        default_headers={
            "HTTP-Referer": os.getenv("OPENROUTER_HTTP_REFERER", "http://localhost:5173"),
            "X-Title": os.getenv("OPENROUTER_TITLE", "PathForge"),
        },
    )


def _model() -> str:
    """Read the OpenRouter model from the environment."""
    model = os.getenv("OPENROUTER_MODEL") or os.getenv("PATHFORGE_MODEL")
    if not model:
        raise RuntimeError("OPENROUTER_MODEL is not configured")
    return model


def goal_analyzer(state: GraphState) -> GraphState:
    req = state["request"]
    # Keep the first node intentionally lightweight: the LLM receives normalized constraints
    # and performs the actual goal decomposition in the planning node.
    return {"request": req}


def career_planner(state: GraphState) -> GraphState:
    req = state["request"]
    model = _model()
    prompt = f"""
Target role: {req.target_role}
Current skills: {json.dumps(req.current_skills)}
Available time: {req.hours_per_week} hours/week
Deadline: {req.timeline_months} months

Generate the PathForge career graph for this student.
"""

    client = _client()

    try:
        response = client.chat.completions.create(
            model=model,
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        )
    except Exception as exc:
        # Some OpenRouter-routed free models may not support JSON response_format.
        # Retry without that optional parameter; the system prompt still requires JSON.
        response = client.chat.completions.create(
            model=model,
            temperature=0.2,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        )
    content = response.choices[0].message.content
    if not content:
        raise RuntimeError("LLM returned an empty roadmap")

    content = content.strip()

    # Accept raw JSON as requested, but tolerate accidental markdown fences
    # from models that ignore the "JSON only" instruction.
    if content.startswith("```"):
        lines = content.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        content = "\n".join(lines).strip()

    try:
        raw_plan = json.loads(content)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"LLM returned invalid JSON: {exc}") from exc

    return {"raw_plan": raw_plan}


def reality_checker(state: GraphState) -> GraphState:
    raw = state["raw_plan"]
    req = state["request"]

    # Pydantic performs the structural contract validation. Additional graph checks below
    # catch dependency errors that are valid JSON but unusable by the UI.
    roadmap = Roadmap.model_validate(raw)
    ids = {node.id for node in roadmap.nodes}
    if len(ids) != len(roadmap.nodes):
        raise ValueError("Roadmap contains duplicate node ids")

    for edge in roadmap.edges:
        if edge.source not in ids or edge.target not in ids:
            raise ValueError(f"Invalid edge: {edge.source} -> {edge.target}")

    for node in roadmap.nodes:
        missing = [p for p in node.prerequisites if p not in ids]
        if missing:
            raise ValueError(f"Node {node.id} has missing prerequisites: {missing}")

    target_nodes = [n for n in roadmap.nodes if n.type.value == "target"]
    if not target_nodes:
        raise ValueError("Roadmap must contain a target node")

    roadmap.target_role = req.target_role
    roadmap.timeline_months = req.timeline_months
    roadmap.hours_per_week = req.hours_per_week
    return {"roadmap": roadmap}


def build_graph():
    graph = StateGraph(GraphState)
    graph.add_node("goal_analyzer", goal_analyzer)
    graph.add_node("career_planner", career_planner)
    graph.add_node("reality_checker", reality_checker)

    graph.add_edge(START, "goal_analyzer")
    graph.add_edge("goal_analyzer", "career_planner")
    graph.add_edge("career_planner", "reality_checker")
    graph.add_edge("reality_checker", END)
    return graph.compile()


career_graph = build_graph()
