from enum import Enum
from pydantic import BaseModel, Field


class NodeType(str, Enum):
    target = "target"
    skill = "skill"
    project = "project"
    milestone = "milestone"
    role = "role"


class NodeStatus(str, Enum):
    complete = "complete"
    current = "current"
    missing = "missing"
    locked = "locked"
    optional = "optional"


class RoadmapNode(BaseModel):
    id: str
    title: str
    type: NodeType
    status: NodeStatus = NodeStatus.missing
    description: str = ""
    why_it_matters: str = ""
    estimated_hours: int = Field(default=0, ge=0)
    prerequisites: list[str] = Field(default_factory=list)
    projects: list[str] = Field(default_factory=list)
    interview_questions: list[str] = Field(default_factory=list)


class RoadmapEdge(BaseModel):
    source: str
    target: str
    label: str = "prerequisite"


class Roadmap(BaseModel):
    target_role: str
    timeline_months: int = Field(ge=1)
    hours_per_week: int = Field(ge=1)
    readiness_score: int = Field(default=0, ge=0, le=100)
    nodes: list[RoadmapNode]
    edges: list[RoadmapEdge]


class RoadmapRequest(BaseModel):
    target_role: str = Field(min_length=3)
    current_skills: list[str] = Field(default_factory=list)
    hours_per_week: int = Field(default=10, ge=1, le=80)
    timeline_months: int = Field(default=6, ge=1, le=60)


class UpdateRequest(BaseModel):
    roadmap: Roadmap
    known_skills: list[str] = Field(default_factory=list)
    hours_per_week: int | None = Field(default=None, ge=1, le=80)
