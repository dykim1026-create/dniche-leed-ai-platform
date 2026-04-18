async function getBackendStatus() {
  try {
    const res = await fetch("http://backend:8000/health", {
      cache: "no-store"
    });
    if (!res.ok) {
      return "backend error";
    }
    const data = await res.json();
    return data.status;
  } catch {
    return "backend unreachable";
  }
}

export default async function HomePage() {
  const backendStatus = await getBackendStatus();

  return (
    <main>
      <h1>Dniche LEED AI Platform</h1>
      <p>Frontend is running.</p>
      <p>Backend status: <strong>{backendStatus}</strong></p>

      <hr />

      <h2>Next Step</h2>
      <p>After this basic app works, we will add:</p>
      <ul>
        <li>project creation</li>
        <li>document upload</li>
        <li>LEED review agent</li>
      </ul>
    </main>
  );
}
