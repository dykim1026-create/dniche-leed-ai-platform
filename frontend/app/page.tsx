"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Project = {
  id: number;
  name: string;
  description: string | null;
};

type DocumentItem = {
  id: number;
  project_id: number;
  original_filename: string;
  stored_filename: string;
  file_path: string;
  content_type: string | null;
  file_size: number;
  parse_status: string;
  parse_message: string | null;
  extracted_text: string | null;
  uploaded_at: string;
  parsed_at: string | null;
};

type HealthResponse = {
  app_status: string;
  db_status: string;
};

type ReviewEvidenceItem = {
  document_id: number;
  original_filename: string;
  keyword: string;
  snippet: string;
};

type CorrectiveAction = {
  discipline: string;
  priority: string;
  action: string;
  reason: string;
};

type ReviewFinding = {
  topic_id: string;
  topic_name: string;
  status: string;
  score: number;
  max_score: number;
  progress_percent: number;
  evidence_count: number;
  searched_keywords: string[];
  recommendation: string;
  evidences: ReviewEvidenceItem[];
  corrective_actions: CorrectiveAction[];
};

type Agent1Review = {
  project_id: number;
  project_name: string;
  overall_status: string;
  overall_score: number;
  overall_max_score: number;
  overall_progress_percent: number;
  reviewed_document_count: number;
  parsed_document_count: number;
  findings: ReviewFinding[];
};

type EnergyFinding = {
  readiness_item_id: string;
  readiness_item_name: string;
  status: string;
  score: number;
  max_score: number;
  progress_percent: number;
  evidence_count: number;
  searched_keywords: string[];
  summary: string;
  missing_inputs: string[];
  evidences: ReviewEvidenceItem[];
  corrective_actions: CorrectiveAction[];
};

type Agent2EnergyReview = {
  project_id: number;
  project_name: string;
  overall_status: string;
  overall_score: number;
  overall_max_score: number;
  overall_progress_percent: number;
  reviewed_document_count: number;
  parsed_document_count: number;
  findings: EnergyFinding[];
};

type CarbonFinding = {
  carbon_item_id: string;
  carbon_item_name: string;
  status: string;
  score: number;
  max_score: number;
  progress_percent: number;
  evidence_count: number;
  searched_keywords: string[];
  summary: string;
  missing_inputs: string[];
  decarbonization_actions: string[];
  evidences: ReviewEvidenceItem[];
  corrective_actions: CorrectiveAction[];
};

type Agent3CarbonReview = {
  project_id: number;
  project_name: string;
  overall_status: string;
  overall_score: number;
  overall_max_score: number;
  overall_progress_percent: number;
  reviewed_document_count: number;
  parsed_document_count: number;
  findings: CarbonFinding[];
};

type LeedScoringFinding = {
  category_id: string;
  category_name: string;
  status: string;
  estimated_points: number;
  max_points: number;
  progress_percent: number;
  evidence_count: number;
  searched_keywords: string[];
  review_note: string;
  required_documents: string[];
  missing_documents: string[];
  evidences: ReviewEvidenceItem[];
  corrective_actions: CorrectiveAction[];
};

type Agent4LeedScoring = {
  project_id: number;
  project_name: string;
  overall_status: string;
  estimated_points: number;
  total_possible_points: number;
  overall_progress_percent: number;
  estimated_certification_band: string;
  target_certification: string;
  method_note: string;
  reviewed_document_count: number;
  parsed_document_count: number;
  findings: LeedScoringFinding[];
};

type CostImpactFinding = {
  cost_item_id: string;
  cost_item_name: string;
  status: string;
  cost_impact_level: string;
  estimated_cost_min_pct: number;
  estimated_cost_max_pct: number;
  progress_percent: number;
  evidence_count: number;
  searched_keywords: string[];
  summary: string;
  assumptions: string[];
  cost_drivers: string[];
  evidences: ReviewEvidenceItem[];
  corrective_actions: CorrectiveAction[];
};

type Agent5CostImpact = {
  project_id: number;
  project_name: string;
  overall_status: string;
  estimated_total_min_pct: number;
  estimated_total_max_pct: number;
  overall_progress_percent: number;
  method_note: string;
  reviewed_document_count: number;
  parsed_document_count: number;
  findings: CostImpactFinding[];
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";

function getPreview(text: string | null, limit = 240) {
  if (!text) return "-";
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: 12,
        border: "1px solid #ccc",
        borderRadius: 999,
        overflow: "hidden",
        background: "#f5f5f5"
      }}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          height: "100%",
          background: "#222"
        }}
      />
    </div>
  );
}

function getStatusBadgeStyle(status: string): React.CSSProperties {
  if ([
    "evidence_found",
    "good_initial_coverage",
    "ready",
    "ready_for_simulation",
    "ready_for_carbon_assessment",
    "good_documentation_readiness",
    "good_cost_visibility"
  ].includes(status)) {
    return {
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: 999,
      background: "#e8f7ee",
      border: "1px solid #96d5ab",
      color: "#1f6b3a",
      fontWeight: 600
    };
  }

  if ([
    "limited_evidence",
    "partial_coverage",
    "partial",
    "partial_readiness",
    "partial_documentation_readiness",
    "partial_cost_visibility"
  ].includes(status)) {
    return {
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: 999,
      background: "#fff7e6",
      border: "1px solid #f0c36d",
      color: "#8a5a00",
      fontWeight: 600
    };
  }

  if ([
    "no_evidence",
    "insufficient_evidence",
    "insufficient_documents",
    "missing",
    "not_ready",
    "insufficient_documentation",
    "low_cost_visibility"
  ].includes(status)) {
    return {
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: 999,
      background: "#fdecec",
      border: "1px solid #ef9a9a",
      color: "#a12626",
      fontWeight: 600
    };
  }

  return {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    background: "#f2f2f2",
    border: "1px solid #ccc",
    color: "#333",
    fontWeight: 600
  };
}

function getPriorityBadgeStyle(priority: string): React.CSSProperties {
  if (priority === "high") {
    return {
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: 999,
      background: "#fdecec",
      border: "1px solid #ef9a9a",
      color: "#a12626",
      fontWeight: 600
    };
  }

  if (priority === "medium") {
    return {
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: 999,
      background: "#fff7e6",
      border: "1px solid #f0c36d",
      color: "#8a5a00",
      fontWeight: 600
    };
  }

  if (priority === "low") {
    return {
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: 999,
      background: "#e8f7ee",
      border: "1px solid #96d5ab",
      color: "#1f6b3a",
      fontWeight: 600
    };
  }

  return {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    background: "#f2f2f2",
    border: "1px solid #ccc",
    color: "#333",
    fontWeight: 600
  };
}

function getCostLevelBadgeStyle(level: string): React.CSSProperties {
  if (level === "high") {
    return {
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: 999,
      background: "#fdecec",
      border: "1px solid #ef9a9a",
      color: "#a12626",
      fontWeight: 600
    };
  }
  if (level === "medium") {
    return {
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: 999,
      background: "#fff7e6",
      border: "1px solid #f0c36d",
      color: "#8a5a00",
      fontWeight: 600
    };
  }
  return {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    background: "#e8f7ee",
    border: "1px solid #96d5ab",
    color: "#1f6b3a",
    fontWeight: 600
  };
}

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [agent1Review, setAgent1Review] = useState<Agent1Review | null>(null);
  const [agent2Review, setAgent2Review] = useState<Agent2EnergyReview | null>(null);
  const [agent3Review, setAgent3Review] = useState<Agent3CarbonReview | null>(null);
  const [agent4Review, setAgent4Review] = useState<Agent4LeedScoring | null>(null);
  const [agent5Review, setAgent5Review] = useState<Agent5CostImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingProject, setSubmittingProject] = useState(false);
  const [submittingDocument, setSubmittingDocument] = useState(false);
  const [parsingDocumentId, setParsingDocumentId] = useState<number | null>(null);
  const [runningAgent1, setRunningAgent1] = useState(false);
  const [runningAgent2, setRunningAgent2] = useState(false);
  const [runningAgent3, setRunningAgent3] = useState(false);
  const [runningAgent4, setRunningAgent4] = useState(false);
  const [runningAgent5, setRunningAgent5] = useState(false);
  const [topicStatusFilter, setTopicStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [error, setError] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");

  async function loadProjects() {
    const res = await fetch(`${API_BASE_URL}/projects`);
    if (!res.ok) throw new Error("Failed to load projects");
    const data = await res.json();
    setProjects(data);

    if (data.length > 0 && !selectedProjectId) {
      setSelectedProjectId(String(data[0].id));
    }
  }

  async function loadHealth() {
    const res = await fetch(`${API_BASE_URL}/health`);
    if (!res.ok) throw new Error("Failed to load health status");
    const data = await res.json();
    setHealth(data);
  }

  async function loadDocuments(projectId: string) {
    if (!projectId) {
      setDocuments([]);
      return;
    }
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/documents`);
    if (!res.ok) throw new Error("Failed to load documents");
    const data = await res.json();
    setDocuments(data);
  }

  async function loadAgent1Review(projectId: string) {
    if (!projectId) {
      setAgent1Review(null);
      return;
    }
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/agent1/review`);
    if (!res.ok) throw new Error("Failed to load Agent 1 review");
    setAgent1Review(await res.json());
  }

  async function loadAgent2Review(projectId: string) {
    if (!projectId) {
      setAgent2Review(null);
      return;
    }
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/agent2/energy-review`);
    if (!res.ok) throw new Error("Failed to load Agent 2 review");
    setAgent2Review(await res.json());
  }

  async function loadAgent3Review(projectId: string) {
    if (!projectId) {
      setAgent3Review(null);
      return;
    }
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/agent3/carbon-review`);
    if (!res.ok) throw new Error("Failed to load Agent 3 review");
    setAgent3Review(await res.json());
  }

  async function loadAgent4Review(projectId: string) {
    if (!projectId) {
      setAgent4Review(null);
      return;
    }
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/agent4/leed-scoring`);
    if (!res.ok) throw new Error("Failed to load Agent 4 review");
    setAgent4Review(await res.json());
  }

  async function loadAgent5Review(projectId: string) {
    if (!projectId) {
      setAgent5Review(null);
      return;
    }
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/agent5/cost-impact`);
    if (!res.ok) throw new Error("Failed to load Agent 5 review");
    setAgent5Review(await res.json());
  }

  useEffect(() => {
    async function initialize() {
      try {
        setLoading(true);
        setError("");
        await Promise.all([loadHealth(), loadProjects()]);
      } catch (err) {
        setError("Failed to connect to backend API.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    initialize();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadDocuments(selectedProjectId).catch(console.error);
      loadAgent1Review(selectedProjectId).catch(console.error);
      loadAgent2Review(selectedProjectId).catch(console.error);
      loadAgent3Review(selectedProjectId).catch(console.error);
      loadAgent4Review(selectedProjectId).catch(console.error);
      loadAgent5Review(selectedProjectId).catch(console.error);
    } else {
      setDocuments([]);
      setAgent1Review(null);
      setAgent2Review(null);
      setAgent3Review(null);
      setAgent4Review(null);
      setAgent5Review(null);
    }
  }, [selectedProjectId]);

  const filteredFindings = useMemo(() => {
    if (!agent1Review) return [];
    return agent1Review.findings.filter((finding) => {
      const statusMatch =
        topicStatusFilter === "all" || finding.status === topicStatusFilter;
      const priorityMatch =
        priorityFilter === "all" ||
        finding.corrective_actions.some((action) => action.priority === priorityFilter);
      return statusMatch && priorityMatch;
    });
  }, [agent1Review, topicStatusFilter, priorityFilter]);

  async function handleProjectSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!name.trim()) {
      setError("Project name is required.");
      return;
    }

    try {
      setSubmittingProject(true);
      setError("");

      const res = await fetch(`${API_BASE_URL}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null
        })
      });

      if (!res.ok) throw new Error("Failed to create project");

      const newProject = await res.json();
      setName("");
      setDescription("");
      await loadProjects();
      setSelectedProjectId(String(newProject.id));
    } catch (err) {
      setError("Failed to create project.");
      console.error(err);
    } finally {
      setSubmittingProject(false);
    }
  }

  async function handleDocumentSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedProjectId) {
      setUploadMessage("Please select a project first.");
      return;
    }

    if (!selectedFile) {
      setUploadMessage("Please choose a file to upload.");
      return;
    }

    try {
      setSubmittingDocument(true);
      setUploadMessage("");

      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch(`${API_BASE_URL}/projects/${selectedProjectId}/documents`, {
        method: "POST",
        body: formData
      });

      if (!res.ok) throw new Error("Failed to upload document");

      setSelectedFile(null);
      const fileInput = document.getElementById("documentFile") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";

      setUploadMessage("Document uploaded successfully.");
      await loadDocuments(selectedProjectId);
      await loadAgent1Review(selectedProjectId);
      await loadAgent2Review(selectedProjectId);
      await loadAgent3Review(selectedProjectId);
      await loadAgent4Review(selectedProjectId);
      await loadAgent5Review(selectedProjectId);
    } catch (err) {
      setUploadMessage("Failed to upload document.");
      console.error(err);
    } finally {
      setSubmittingDocument(false);
    }
  }

  async function handleParseDocument(documentId: number) {
    try {
      setParsingDocumentId(documentId);
      setUploadMessage("");

      const res = await fetch(`${API_BASE_URL}/documents/${documentId}/parse`, {
        method: "POST"
      });

      if (!res.ok) throw new Error("Failed to parse document");

      if (selectedProjectId) {
        await loadDocuments(selectedProjectId);
        await loadAgent1Review(selectedProjectId);
        await loadAgent2Review(selectedProjectId);
        await loadAgent3Review(selectedProjectId);
        await loadAgent4Review(selectedProjectId);
        await loadAgent5Review(selectedProjectId);
      }
    } catch (err) {
      setUploadMessage("Failed to parse document.");
      console.error(err);
    } finally {
      setParsingDocumentId(null);
    }
  }

  async function handleRunAgent1() {
    if (!selectedProjectId) return;
    try {
      setRunningAgent1(true);
      await loadAgent1Review(selectedProjectId);
    } finally {
      setRunningAgent1(false);
    }
  }

  async function handleRunAgent2() {
    if (!selectedProjectId) return;
    try {
      setRunningAgent2(true);
      await loadAgent2Review(selectedProjectId);
    } finally {
      setRunningAgent2(false);
    }
  }

  async function handleRunAgent3() {
    if (!selectedProjectId) return;
    try {
      setRunningAgent3(true);
      await loadAgent3Review(selectedProjectId);
    } finally {
      setRunningAgent3(false);
    }
  }

  async function handleRunAgent4() {
    if (!selectedProjectId) return;
    try {
      setRunningAgent4(true);
      await loadAgent4Review(selectedProjectId);
    } finally {
      setRunningAgent4(false);
    }
  }

  async function handleRunAgent5() {
    if (!selectedProjectId) return;
    try {
      setRunningAgent5(true);
      await loadAgent5Review(selectedProjectId);
    } finally {
      setRunningAgent5(false);
    }
  }

  function handleExportCsv() {
    if (!selectedProjectId) return;
    window.open(`${API_BASE_URL}/projects/${selectedProjectId}/agent1/export.csv`, "_blank");
  }

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto" }}>
      <h1>Dniche LEED AI Platform</h1>
      <p>Create projects, upload documents, parse files, and review multi-agent findings.</p>

      <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8, marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>System Status</h2>
        {loading ? (
          <p>Loading status...</p>
        ) : health ? (
          <>
            <p>App status: <strong>{health.app_status}</strong></p>
            <p>Database status: <strong>{health.db_status}</strong></p>
          </>
        ) : (
          <p>Status unavailable</p>
        )}
      </div>

      <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8, marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>Create Project</h2>
        <form onSubmit={handleProjectSubmit} style={{ display: "grid", gap: 12 }}>
          <div>
            <label htmlFor="name" style={{ display: "block", marginBottom: 6 }}>Project name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Diriyah Residential Block A"
              style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
            />
          </div>

          <div>
            <label htmlFor="description" style={{ display: "block", marginBottom: 6 }}>Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional project description"
              rows={4}
              style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
            />
          </div>

          <button
            type="submit"
            disabled={submittingProject}
            style={{ padding: "10px 16px", borderRadius: 6, border: "1px solid #222", background: "#fff", cursor: "pointer", width: "fit-content" }}
          >
            {submittingProject ? "Creating..." : "Create Project"}
          </button>
        </form>
      </div>

      <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8, marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>Upload Document</h2>
        <form onSubmit={handleDocumentSubmit} style={{ display: "grid", gap: 12 }}>
          <div>
            <label htmlFor="projectSelect" style={{ display: "block", marginBottom: 6 }}>Select project</label>
            <select
              id="projectSelect"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
            >
              <option value="">-- Select a project --</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="documentFile" style={{ display: "block", marginBottom: 6 }}>Choose file</label>
            <input
              id="documentFile"
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setSelectedFile(file);
              }}
            />
          </div>

          <button
            type="submit"
            disabled={submittingDocument}
            style={{ padding: "10px 16px", borderRadius: 6, border: "1px solid #222", background: "#fff", cursor: "pointer", width: "fit-content" }}
          >
            {submittingDocument ? "Uploading..." : "Upload Document"}
          </button>

          {uploadMessage ? <p>{uploadMessage}</p> : null}
        </form>
      </div>

      <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8, marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>Documents for Selected Project</h2>

        {!selectedProjectId ? (
          <p>Select a project to view documents.</p>
        ) : documents.length === 0 ? (
          <p>No documents uploaded yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 0" }}>ID</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 0" }}>Filename</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 0" }}>Type</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 0" }}>Status</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 0" }}>Message</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 0" }}>Preview</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 0" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td style={{ padding: "10px 0", verticalAlign: "top" }}>{doc.id}</td>
                  <td style={{ padding: "10px 0", verticalAlign: "top" }}>{doc.original_filename}</td>
                  <td style={{ padding: "10px 0", verticalAlign: "top" }}>{doc.content_type || "-"}</td>
                  <td style={{ padding: "10px 0", verticalAlign: "top" }}>{doc.parse_status}</td>
                  <td style={{ padding: "10px 0", verticalAlign: "top", maxWidth: 220 }}>{doc.parse_message || "-"}</td>
                  <td style={{ padding: "10px 0", verticalAlign: "top", maxWidth: 340, whiteSpace: "pre-wrap" }}>
                    {getPreview(doc.extracted_text)}
                  </td>
                  <td style={{ padding: "10px 0", verticalAlign: "top" }}>
                    <button
                      type="button"
                      onClick={() => handleParseDocument(doc.id)}
                      disabled={parsingDocumentId === doc.id}
                      style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #222", background: "#fff", cursor: "pointer" }}
                    >
                      {parsingDocumentId === doc.id ? "Parsing..." : "Parse"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>Agent 1 Review</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!selectedProjectId}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #222", background: "#fff", cursor: "pointer" }}
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={handleRunAgent1}
              disabled={!selectedProjectId || runningAgent1}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #222", background: "#fff", cursor: "pointer" }}
            >
              {runningAgent1 ? "Refreshing..." : "Run Agent 1 Review"}
            </button>
          </div>
        </div>

        {!selectedProjectId ? (
          <p style={{ marginTop: 16 }}>Select a project first.</p>
        ) : !agent1Review ? (
          <p style={{ marginTop: 16 }}>No review data yet.</p>
        ) : (
          <div style={{ marginTop: 16 }}>
            <p>Project: <strong>{agent1Review.project_name}</strong></p>
            <p>Overall status: <span style={getStatusBadgeStyle(agent1Review.overall_status)}>{agent1Review.overall_status}</span></p>
            <p>Overall score: <strong>{agent1Review.overall_score} / {agent1Review.overall_max_score}</strong></p>
            <div style={{ marginBottom: 12 }}>
              <ProgressBar value={agent1Review.overall_progress_percent} />
            </div>
            <p>Overall progress: <strong>{agent1Review.overall_progress_percent}%</strong></p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
                marginTop: 20,
                marginBottom: 20
              }}
            >
              <div>
                <label style={{ display: "block", marginBottom: 6 }}>Filter by topic status</label>
                <select
                  value={topicStatusFilter}
                  onChange={(e) => setTopicStatusFilter(e.target.value)}
                  style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
                >
                  <option value="all">All statuses</option>
                  <option value="no_evidence">No evidence</option>
                  <option value="limited_evidence">Limited evidence</option>
                  <option value="evidence_found">Evidence found</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 6 }}>Filter by priority</label>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
                >
                  <option value="all">All priorities</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              {filteredFindings.map((finding) => (
                <div key={finding.topic_id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <h3 style={{ marginTop: 0, marginBottom: 0 }}>{finding.topic_name}</h3>
                    <span style={getStatusBadgeStyle(finding.status)}>{finding.status}</span>
                  </div>
                  <p style={{ marginTop: 12 }}>Score: <strong>{finding.score} / {finding.max_score}</strong></p>
                  <div style={{ marginBottom: 12 }}>
                    <ProgressBar value={finding.progress_percent} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>Agent 2 Energy Review</h2>
          <button
            type="button"
            onClick={handleRunAgent2}
            disabled={!selectedProjectId || runningAgent2}
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #222", background: "#fff", cursor: "pointer" }}
          >
            {runningAgent2 ? "Refreshing..." : "Run Agent 2 Review"}
          </button>
        </div>
        {agent2Review && (
          <div style={{ marginTop: 16 }}>
            <p>Project: <strong>{agent2Review.project_name}</strong></p>
            <p>Overall status: <span style={getStatusBadgeStyle(agent2Review.overall_status)}>{agent2Review.overall_status}</span></p>
            <p>Overall score: <strong>{agent2Review.overall_score} / {agent2Review.overall_max_score}</strong></p>
            <div style={{ marginBottom: 12 }}>
              <ProgressBar value={agent2Review.overall_progress_percent} />
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>Agent 3 Carbon Review</h2>
          <button
            type="button"
            onClick={handleRunAgent3}
            disabled={!selectedProjectId || runningAgent3}
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #222", background: "#fff", cursor: "pointer" }}
          >
            {runningAgent3 ? "Refreshing..." : "Run Agent 3 Review"}
          </button>
        </div>
        {agent3Review && (
          <div style={{ marginTop: 16 }}>
            <p>Project: <strong>{agent3Review.project_name}</strong></p>
            <p>Overall status: <span style={getStatusBadgeStyle(agent3Review.overall_status)}>{agent3Review.overall_status}</span></p>
            <p>Overall score: <strong>{agent3Review.overall_score} / {agent3Review.overall_max_score}</strong></p>
            <div style={{ marginBottom: 12 }}>
              <ProgressBar value={agent3Review.overall_progress_percent} />
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>Agent 4 LEED Scoring & Documentation</h2>
          <button
            type="button"
            onClick={handleRunAgent4}
            disabled={!selectedProjectId || runningAgent4}
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #222", background: "#fff", cursor: "pointer" }}
          >
            {runningAgent4 ? "Refreshing..." : "Run Agent 4 Review"}
          </button>
        </div>
        {agent4Review && (
          <div style={{ marginTop: 16 }}>
            <p>Project: <strong>{agent4Review.project_name}</strong></p>
            <p>Overall status: <span style={getStatusBadgeStyle(agent4Review.overall_status)}>{agent4Review.overall_status}</span></p>
            <p>Estimated points: <strong>{agent4Review.estimated_points} / {agent4Review.total_possible_points}</strong></p>
            <div style={{ marginBottom: 12 }}>
              <ProgressBar value={agent4Review.overall_progress_percent} />
            </div>
            <p>Estimated certification band: <strong>{agent4Review.estimated_certification_band}</strong></p>
          </div>
        )}
      </div>

      <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>Agent 5 Cost Impact</h2>
          <button
            type="button"
            onClick={handleRunAgent5}
            disabled={!selectedProjectId || runningAgent5}
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #222", background: "#fff", cursor: "pointer" }}
          >
            {runningAgent5 ? "Refreshing..." : "Run Agent 5 Review"}
          </button>
        </div>

        {!selectedProjectId ? (
          <p style={{ marginTop: 16 }}>Select a project first.</p>
        ) : !agent5Review ? (
          <p style={{ marginTop: 16 }}>No cost impact data yet.</p>
        ) : (
          <div style={{ marginTop: 16 }}>
            <p>Project: <strong>{agent5Review.project_name}</strong></p>
            <p>Overall status: <span style={getStatusBadgeStyle(agent5Review.overall_status)}>{agent5Review.overall_status}</span></p>
            <p>
              Estimated total premium range: <strong>{agent5Review.estimated_total_min_pct}% - {agent5Review.estimated_total_max_pct}%</strong>
            </p>
            <div style={{ marginBottom: 12 }}>
              <ProgressBar value={agent5Review.overall_progress_percent} />
            </div>
            <p>Overall progress: <strong>{agent5Review.overall_progress_percent}%</strong></p>
            <p>{agent5Review.method_note}</p>

            <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
              {agent5Review.findings.map((finding) => (
                <div key={finding.cost_item_id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <h3 style={{ marginTop: 0, marginBottom: 0 }}>{finding.cost_item_name}</h3>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={getStatusBadgeStyle(finding.status)}>{finding.status}</span>
                      <span style={getCostLevelBadgeStyle(finding.cost_impact_level)}>{finding.cost_impact_level}</span>
                    </div>
                  </div>

                  <p style={{ marginTop: 12 }}>{finding.summary}</p>
                  <p>
                    Estimated premium range: <strong>{finding.estimated_cost_min_pct}% - {finding.estimated_cost_max_pct}%</strong>
                  </p>
                  <div style={{ marginBottom: 12 }}>
                    <ProgressBar value={finding.progress_percent} />
                  </div>
                  <p>Evidence count: <strong>{finding.evidence_count}</strong></p>
                  <p>Searched keywords: {finding.searched_keywords.join(", ")}</p>

                  <div style={{ marginTop: 12 }}>
                    <strong>Assumptions</strong>
                    <ul style={{ marginTop: 8 }}>
                      {finding.assumptions.map((item, index) => (
                        <li key={`${finding.cost_item_id}-assumption-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <strong>Cost Drivers</strong>
                    <ul style={{ marginTop: 8 }}>
                      {finding.cost_drivers.map((item, index) => (
                        <li key={`${finding.cost_item_id}-driver-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <strong>Corrective Actions by Discipline</strong>
                    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 0" }}>Discipline</th>
                          <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 0" }}>Priority</th>
                          <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 0" }}>Action</th>
                          <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 0" }}>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {finding.corrective_actions.map((action, index) => (
                          <tr key={`${finding.cost_item_id}-action-${index}`}>
                            <td style={{ padding: "10px 0", verticalAlign: "top" }}>{action.discipline}</td>
                            <td style={{ padding: "10px 0", verticalAlign: "top" }}>
                              <span style={getPriorityBadgeStyle(action.priority)}>{action.priority}</span>
                            </td>
                            <td style={{ padding: "10px 0", verticalAlign: "top" }}>{action.action}</td>
                            <td style={{ padding: "10px 0", verticalAlign: "top" }}>{action.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <strong>Evidence</strong>
                    {finding.evidences.length === 0 ? (
                      <p>No evidence found.</p>
                    ) : (
                      <ul style={{ marginTop: 8 }}>
                        {finding.evidences.map((evidence, index) => (
                          <li key={`${finding.cost_item_id}-${index}`} style={{ marginBottom: 10 }}>
                            <div>
                              <strong>{evidence.original_filename}</strong> — keyword: <strong>{evidence.keyword}</strong>
                            </div>
                            <div style={{ whiteSpace: "pre-wrap" }}>{evidence.snippet}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
