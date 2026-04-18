"use client";

import { FormEvent, useEffect, useState } from "react";

type Project = {
  id: number;
  name: string;
  description: string | null;
};

type HealthResponse = {
  app_status: string;
  db_status: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function loadProjects() {
    const res = await fetch(`${API_BASE_URL}/projects`);
    if (!res.ok) {
      throw new Error("Failed to load projects");
    }
    const data = await res.json();
    setProjects(data);
  }

  async function loadHealth() {
    const res = await fetch(`${API_BASE_URL}/health`);
    if (!res.ok) {
      throw new Error("Failed to load health status");
    }
    const data = await res.json();
    setHealth(data);
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

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!name.trim()) {
      setError("Project name is required.");
      return;
    }

    try {
      setSubmitting(true);
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

      setName("");
      setDescription("");
      await loadProjects();
    } catch (err) {
      setError("Failed to create project.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto" }}>
      <h1>Dniche LEED AI Platform</h1>
      <p>Create and manage LEED assessment projects.</p>

      <div
        style={{
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 8,
          marginBottom: 24
        }}
      >
        <h2 style={{ marginTop: 0 }}>System Status</h2>
        {loading ? (
          <p>Loading status...</p>
        ) : health ? (
          <>
            <p>
              App status: <strong>{health.app_status}</strong>
            </p>
            <p>
              Database status: <strong>{health.db_status}</strong>
            </p>
          </>
        ) : (
          <p>Status unavailable</p>
        )}
      </div>

      <div
        style={{
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 8,
          marginBottom: 24
        }}
      >
        <h2 style={{ marginTop: 0 }}>Create Project</h2>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <div>
            <label htmlFor="name" style={{ display: "block", marginBottom: 6 }}>
              Project name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Diriyah Residential Block A"
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 6
              }}
            />
          </div>

          <div>
            <label
              htmlFor="description"
              style={{ display: "block", marginBottom: 6 }}
            >
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional project description"
              rows={4}
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 6
              }}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "10px 16px",
              borderRadius: 6,
              border: "1px solid #222",
              background: "#fff",
              cursor: "pointer",
              width: "fit-content"
            }}
          >
            {submitting ? "Creating..." : "Create Project"}
          </button>
        </form>
      </div>

      <div
        style={{
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 8
        }}
      >
        <h2 style={{ marginTop: 0 }}>Project List</h2>

        {error ? (
          <p style={{ color: "crimson" }}>{error}</p>
        ) : loading ? (
          <p>Loading projects...</p>
        ) : projects.length === 0 ? (
          <p>No projects yet.</p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse"
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px 0"
                  }}
                >
                  ID
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px 0"
                  }}
                >
                  Name
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px 0"
                  }}
                >
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td style={{ padding: "10px 0" }}>{project.id}</td>
                  <td style={{ padding: "10px 0" }}>{project.name}</td>
                  <td style={{ padding: "10px 0" }}>
                    {project.description || "-"}
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
