"use client";

import { FormEvent, useEffect, useState } from "react";

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

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";

function getPreview(text: string | null, limit = 240) {
  if (!text) return "-";
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingProject, setSubmittingProject] = useState(false);
  const [submittingDocument, setSubmittingDocument] = useState(false);
  const [parsingDocumentId, setParsingDocumentId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");

  async function loadProjects() {
    const res = await fetch(`${API_BASE_URL}/projects`);
    if (!res.ok) {
      throw new Error("Failed to load projects");
    }
    const data = await res.json();
    setProjects(data);

    if (data.length > 0 && !selectedProjectId) {
      setSelectedProjectId(String(data[0].id));
    }
  }

  async function loadHealth() {
    const res = await fetch(`${API_BASE_URL}/health`);
    if (!res.ok) {
      throw new Error("Failed to load health status");
    }
    const data = await res.json();
    setHealth(data);
  }

  async function loadDocuments(projectId: string) {
    if (!projectId) {
      setDocuments([]);
      return;
    }

    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/documents`);
    if (!res.ok) {
      throw new Error("Failed to load documents");
    }
    const data = await res.json();
    setDocuments(data);
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
      loadDocuments(selectedProjectId).catch((err) => {
        setError("Failed to load documents.");
        console.error(err);
      });
    }
  }, [selectedProjectId]);

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
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null
        })
      });

      if (!res.ok) {
        throw new Error("Failed to create project");
      }

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

      const res = await fetch(
        `${API_BASE_URL}/projects/${selectedProjectId}/documents`,
        {
          method: "POST",
          body: formData
        }
      );

      if (!res.ok) {
        throw new Error("Failed to upload document");
      }

      setSelectedFile(null);
      const fileInput = document.getElementById("documentFile") as HTMLInputElement | null;
      if (fileInput) {
        fileInput.value = "";
      }

      setUploadMessage("Document uploaded successfully.");
      await loadDocuments(selectedProjectId);
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

      if (!res.ok) {
        throw new Error("Failed to parse document");
      }

      if (selectedProjectId) {
        await loadDocuments(selectedProjectId);
      }
    } catch (err) {
      setUploadMessage("Failed to parse document.");
      console.error(err);
    } finally {
      setParsingDocumentId(null);
    }
  }

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto" }}>
      <h1>Dniche LEED AI Platform</h1>
      <p>Create projects, upload documents, and parse supported files.</p>

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
    </main>
  );
}
