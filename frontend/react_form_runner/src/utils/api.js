// Get backend URL from environment variable, fallback to localhost:8001
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';
const API_BASE = `${BACKEND_URL}/api/forms`;
export const UPLOAD_API_BASE = `${BACKEND_URL}/api`;
export const BACKEND_BASE = BACKEND_URL;

export async function fetchForms() {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error(`Failed to load forms: ${res.statusText}`);
  return res.json();
}

export async function fetchForm(formId) {
  const res = await fetch(`${API_BASE}/${formId}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error(`Form "${formId}" not found`);
    throw new Error(`Failed to load form: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchSubmissions(formId) {
  const res = await fetch(`${API_BASE}/${formId}/submissions`);
  if (!res.ok) throw new Error(`Failed to load submissions: ${res.statusText}`);
  return res.json();
}

export async function submitForm(formId, submission) {
  const res = await fetch(`${API_BASE}/${formId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(submission)
  });
  if (!res.ok) throw new Error(`Failed to submit: ${res.statusText}`);
  return res.json();
}

export async function deleteSubmission(formId, submissionId) {
  const res = await fetch(`${API_BASE}/${formId}/submissions/${submissionId}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error(`Failed to delete: ${res.statusText}`);
  return res.json();
}

export async function setBaseline(formId, submissionId, isBaseline) {
  const res = await fetch(`${API_BASE}/${formId}/submissions/${submissionId}/baseline?is_baseline=${isBaseline}`, {
    method: 'PUT'
  });
  if (!res.ok) throw new Error(`Failed to set baseline: ${res.statusText}`);
  return res.json();
}

export async function fetchBaselineSubmission(formId) {
  const res = await fetch(`${API_BASE}/${formId}/submissions?baseline=true`);
  if (!res.ok) return null;
  const submissions = await res.json();
  return submissions.length > 0 ? submissions[0] : null;
}
