import React, { useMemo, useState } from "react";
import ReactFlow, { Background, MiniMap, Handle, Position } from "reactflow";
import "reactflow/dist/style.css";
import { generateRoadmap, updateRoadmap } from "./services/api";

const starterSkills = ["Python", "SQL", "Machine Learning", "FastAPI", "LangGraph"];

function normalizeRoadmap(raw) {
  if (!raw) return null;
  return raw.roadmap || raw;
}

function CustomNode({ data }) {
  const status = data.status || "missing";
  const type = String(data.type || "skill").toLowerCase();
  return (
    <div className={`pf-node ${status} ${type}`}>
      <Handle type="target" position={Position.Top} />
      <div className="node-topline">
        <span className="node-type">{data.type || "skill"}</span>
        {status === "complete" ? <span className="node-check">✓</span> : null}
      </div>
      <div className="node-title">{data.title}</div>
      <div className="node-bottomline">
        {data.estimated_hours ? <span>{data.estimated_hours}h effort</span> : <span>Milestone</span>}
        {status === "locked" ? <span>Locked</span> : status === "complete" ? <span>Known</span> : <span>Next</span>}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { pathforge: CustomNode };

function makeGraph(roadmap, knownSkills) {
  const nodes = Array.isArray(roadmap?.nodes) ? roadmap.nodes : [];
  const edges = Array.isArray(roadmap?.edges) ? roadmap.edges : [];
  const levels = {};
  const incoming = new Map(nodes.map((n) => [n.id, []]));

  edges.forEach((e) => {
    if (incoming.has(e.target)) incoming.get(e.target).push(e.source);
  });

  function level(id, visiting = new Set()) {
    if (levels[id] !== undefined) return levels[id];
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const parents = incoming.get(id) || [];
    levels[id] = parents.length
      ? Math.max(...parents.map((p) => level(p, new Set(visiting)))) + 1
      : 0;
    return levels[id];
  }

  nodes.forEach((n) => level(n.id));
  const grouped = {};
  nodes.forEach((n) => {
    const l = levels[n.id] || 0;
    grouped[l] ||= [];
    grouped[l].push(n);
  });

  const flowNodes = nodes.map((n) => {
    const l = levels[n.id] || 0;
    const index = grouped[l].indexOf(n);
    const known = knownSkills.some((s) => s.toLowerCase() === String(n.title).toLowerCase()) || n.status === "complete";
    const prereqs = Array.isArray(n.prerequisites) ? n.prerequisites : [];
    const locked = prereqs.length > 0 && prereqs.some(
      (p) => !knownSkills.some((s) => s.toLowerCase() === String(p).toLowerCase())
    );

    return {
      id: n.id,
      type: "pathforge",
      position: { x: (index - (grouped[l].length - 1) / 2) * 280, y: l * 175 },
      data: { ...n, status: known ? "complete" : locked ? "locked" : "missing" },
    };
  });

  return { nodes: flowNodes, edges };
}

function getPhases(nodes) {
  const phases = {};
  nodes.forEach((n) => {
    const l = Number(n.position?.y || 0) / 175;
    const key = Math.round(l);
    phases[key] ||= [];
    phases[key].push(n);
  });
  return Object.entries(phases).sort(([a], [b]) => Number(a) - Number(b)).map(([level, items], i) => ({
    level: Number(level),
    title: i === 0 ? "Foundation" : i === Object.keys(phases).length - 1 ? "Target readiness" : `Phase ${i}`,
    items,
  }));
}

export default function App() {
  const [targetRole, setTargetRole] = useState("AI Engineer at a product-based startup");
  const [timeline, setTimeline] = useState(6);
  const [hours, setHours] = useState(10);
  const [skills, setSkills] = useState(starterSkills);
  const [skillText, setSkillText] = useState(starterSkills.join(", "));
  const [roadmap, setRoadmap] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [baseReadiness, setBaseReadiness] = useState(0);
  const [initialKnownCount, setInitialKnownCount] = useState(0);
  const [initialMissingCount, setInitialMissingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const graph = useMemo(() => roadmap ? makeGraph(roadmap, skills) : { nodes: [], edges: [] }, [roadmap, skills]);
  const skillNodes = graph.nodes.filter((n) => String(n.data.type || "skill").toLowerCase() === "skill");
  const knownNodeCount = skillNodes.filter((n) => n.data.status === "complete").length;
  const addedKnown = Math.max(0, knownNodeCount - initialKnownCount);
  const readiness = roadmap ? (initialMissingCount > 0 ? Math.min(100, baseReadiness + (addedKnown / initialMissingCount) * (100 - baseReadiness)) : baseReadiness) : 0;
  const selected = selectedId ? graph.nodes.find((n) => n.id === selectedId)?.data : null;
  const phases = useMemo(() => getPhases(graph.nodes), [graph.nodes]);

  const projects = graph.nodes.filter((n) => String(n.data.type || "").toLowerCase() === "project");
  const milestones = graph.nodes.filter((n) => String(n.data.type || "").toLowerCase() === "milestone");
  const totalHours = skillNodes.reduce((sum, n) => sum + Number(n.data.estimated_hours || 0), 0);
  const weeks = Math.max(1, Math.ceil(totalHours / Math.max(1, Number(hours))));

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const payload = { target_role: targetRole, timeline_months: Number(timeline), hours_per_week: Number(hours), current_skills: skills };
      const result = normalizeRoadmap(await generateRoadmap(payload));
      setRoadmap(result);
      const generatedGraph = makeGraph(result, skills);
      const generatedSkillNodes = generatedGraph.nodes.filter((n) => String(n.data.type || "skill").toLowerCase() === "skill");
      const generatedKnown = generatedSkillNodes.filter((n) => n.data.status === "complete").length;
      const generatedMissing = generatedSkillNodes.filter((n) => n.data.status !== "complete").length;
      setBaseReadiness(Number(result?.readiness_score ?? result?.readiness ?? 0));
      setInitialKnownCount(generatedKnown);
      setInitialMissingCount(Math.max(1, generatedMissing));
      setSelectedId(null);
    } catch (e) {
      setError(e.message || "Failed to generate roadmap.");
    } finally {
      setLoading(false);
    }
  }

  async function markKnown(node) {
    if (!node?.title || node.status === "complete") return;
    const next = [...new Set([...skills, node.title])];
    setSkills(next);
    setSkillText(next.join(", "));
    if (roadmap) updateRoadmap({ ...roadmap, known_skills: next }).catch(() => {});
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap"><div className="brand">PATHFORGE</div><div className="tagline">Reverse-engineer the career you want.</div></div>
        <div className="top-meta"><span className="live-dot" /> AI CAREER ENGINE <span className="separator" /> {roadmap ? `${timeline} MONTH ROADMAP` : "READY"}</div>
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <section className="panel destination-panel">
            <div className="section-kicker">01 / DESTINATION</div>
            <label>Dream role</label>
            <input value={targetRole} onChange={(e) => setTargetRole(e.target.value)} />
            <div className="row">
              <div><label>Timeline</label><div className="input-suffix"><input type="number" min="1" value={timeline} onChange={(e) => setTimeline(e.target.value)} /><span>mo</span></div></div>
              <div><label>Capacity</label><div className="input-suffix"><input type="number" min="1" value={hours} onChange={(e) => setHours(e.target.value)} /><span>h/w</span></div></div>
            </div>
          </section>

          <section className="panel">
            <div className="section-kicker">02 / CURRENT STATE</div>
            <label>Known skills</label>
            <textarea value={skillText} onChange={(e) => setSkillText(e.target.value)} onBlur={() => setSkills(skillText.split(",").map((s) => s.trim()).filter(Boolean))} />
            <div className="chips">{skills.map((s) => <span key={s} className="chip">{s}</span>)}</div>
          </section>

          <button className="forge-btn" onClick={generate} disabled={loading}>{loading ? "FORGING PATH..." : "FORGE MY PATH  →"}</button>
          {error && <div className="error-box">{error}</div>}

          {roadmap && (
            <section className="readiness-card">
              <div className="section-kicker">READINESS INDEX</div>
              <div className="readiness-row"><strong>{Math.round(readiness)}%</strong><span>{addedKnown > 0 ? `+${Math.round(readiness - baseReadiness)} pts` : "baseline"}</span></div>
              <div className="bar"><span style={{ width: `${Math.min(100, Math.max(0, readiness))}%` }} /></div>
              <div className="stat-grid">
                <div><b>{knownNodeCount}</b><small>KNOWN</small></div>
                <div><b>{skillNodes.filter(n => n.data.status === "missing").length}</b><small>BUILD</small></div>
                <div><b>{skillNodes.filter(n => n.data.status === "locked").length}</b><small>LOCKED</small></div>
              </div>
            </section>
          )}
        </aside>

        <section className="graph-area">
          {!roadmap ? (
            <div className="empty-state"><div className="hero-mark">PF</div><div className="hero-kicker">CAREER INTELLIGENCE / 01</div><h1>Start with the job.<br /><em>Work backward.</em></h1><p>PathForge maps the dependency graph between what you know today and the role you want next.</p><button className="secondary-btn" onClick={generate}>Generate starter roadmap</button></div>
          ) : (
            <>
              <div className="graph-header">
                <div><div className="section-kicker">YOUR REVERSE-ENGINEERED PATH</div><h2>{roadmap.target_role || targetRole}</h2><p>{skillNodes.length} skills · {projects.length} projects · {milestones.length} milestones</p></div>
                <div className="legend"><span><i className="known" /> Known</span><span><i className="build" /> Build</span><span><i className="locked" /> Locked</span></div>
              </div>

              <div className="roadmap-strip">
                {phases.map((phase, i) => <div className="phase-card" key={phase.level}><span>0{i + 1}</span><div><b>{phase.title}</b><small>{phase.items.length} nodes</small></div></div>)}
              </div>

              <ReactFlow
                nodes={graph.nodes}
                edges={graph.edges}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.22, maxZoom: 1.05 }}
                minZoom={0.65}
                maxZoom={1.05}
                zoomOnScroll={false}
                zoomOnPinch={false}
                zoomOnDoubleClick={false}
                panOnScroll={true}
                onNodeClick={(_, node) => setSelectedId(node.id)}
                onPaneClick={() => setSelectedId(null)}
              >
                <Background gap={28} size={1} />
                <MiniMap pannable={false} zoomable={false} />
              </ReactFlow>
            </>
          )}
        </section>

        <aside className={`details ${selected ? "open" : ""}`}>
          {selected ? (
            <div className="detail-content">
              <div className="detail-head"><div><div className="section-kicker">NODE INTELLIGENCE</div><h2>{selected.title}</h2></div><span className={`status-tag ${selected.status}`}>{selected.status === "complete" ? "KNOWN" : selected.status === "locked" ? "LOCKED" : "BUILD"}</span></div>
              {selected.description && <p className="detail-description">{selected.description}</p>}

              <div className="detail-metrics">
                <div><small>TYPE</small><b>{selected.type || "Skill"}</b></div>
                <div><small>EFFORT</small><b>{selected.estimated_hours ? `${selected.estimated_hours}h` : "—"}</b></div>
              </div>

              {selected.prerequisites?.length > 0 && <div className="detail-section"><div className="detail-label">PREREQUISITES</div><div className="detail-list">{selected.prerequisites.map((p) => <div className="list-row" key={p}><span className="list-dot" />{p}</div>)}</div></div>}
              {selected.projects?.length > 0 && <div className="detail-section"><div className="detail-label">PROOF OF SKILL</div>{selected.projects.map((p) => <div className="project-card" key={p}><span>PROJECT</span><b>{p}</b></div>)}</div>}
              {selected.interview_questions?.length > 0 && <div className="detail-section"><div className="detail-label">INTERVIEW SIGNAL</div><div className="question-card">{selected.interview_questions.map((q) => <div key={q}>“{q}”</div>)}</div></div>}

              <button className="forge-btn detail-action" disabled={selected.status === "complete"} onClick={() => markKnown(selected)}>{selected.status === "complete" ? "✓ ALREADY KNOWN" : "I ALREADY KNOW THIS  →"}</button>
            </div>
          ) : (
            <div className="detail-empty"><div className="empty-icon">+</div><div className="section-kicker">NODE INTELLIGENCE</div><h3>Explore the roadmap</h3><p>Select any node to see its role in the path, prerequisites, estimated effort, proof-of-skill projects and interview signals.</p><div className="roadmap-summary"><div><b>{weeks}</b><span>est. weeks</span></div><div><b>{totalHours}h</b><span>skill effort</span></div></div></div>
          )}
        </aside>
      </main>
    </div>
  );
}
