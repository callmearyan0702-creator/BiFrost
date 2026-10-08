const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await response.text();

  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }

  if (!response.ok) {
    throw new Error(
      data?.detail ||
      data?.message ||
      `Request failed with status ${response.status}`
    );
  }

  return data;
}

export async function generateRoadmap(payload) {
  return request("/api/roadmap/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateRoadmap(payload) {
  return request("/api/roadmap/update", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}