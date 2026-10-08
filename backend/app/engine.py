from .schemas import Roadmap, RoadmapRequest, UpdateRequest, NodeStatus, NodeType
from .graph import career_graph


def _fallback_readiness(roadmap: Roadmap) -> int:
    eligible = [n for n in roadmap.nodes if n.type in {NodeType.skill, NodeType.project, NodeType.milestone}]
    if not eligible:
        return 0
    complete = sum(n.status == NodeStatus.complete for n in eligible)
    return round(complete / len(eligible) * 100)


def generate_roadmap(req: RoadmapRequest) -> Roadmap:
    result = career_graph.invoke({"request": req})
    roadmap = result.get("roadmap")
    if roadmap is None:
        raise RuntimeError(result.get("error", "Roadmap generation failed"))
    roadmap.readiness_score = _fallback_readiness(roadmap)
    return roadmap


def update_roadmap(req: UpdateRequest) -> Roadmap:
    known = {s.strip().lower() for s in req.known_skills}
    roadmap = req.roadmap.model_copy(deep=True)

    if req.hours_per_week is not None:
        roadmap.hours_per_week = req.hours_per_week

    # Mark explicitly known nodes complete.
    for node in roadmap.nodes:
        if node.title.strip().lower() in known or node.id.strip().lower() in known:
            node.status = NodeStatus.complete

    completed = {n.id for n in roadmap.nodes if n.status == NodeStatus.complete}

    # Recalculate node accessibility from prerequisites.
    for node in roadmap.nodes:
        if node.status == NodeStatus.complete:
            continue
        if node.type == NodeType.target:
            node.status = NodeStatus.current if all(p in completed for p in node.prerequisites) else NodeStatus.locked
        elif node.prerequisites and all(p in completed for p in node.prerequisites):
            node.status = NodeStatus.current
        elif node.prerequisites:
            node.status = NodeStatus.locked

    roadmap.readiness_score = _fallback_readiness(roadmap)
    return roadmap
