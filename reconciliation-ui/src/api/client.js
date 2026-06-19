import axios from "axios";

const api = axios.create({ baseURL: "/api/v1" });

// Dashboard
export const getDashboard = (months = 0) =>
  api.get("/dashboard/summary", { params: months > 0 ? { months } : {} }).then(r => r.data);

// Reconciliation
export const getResults = () => api.get("/reconciliation/results").then(r => r.data);
export const getFailed  = () => api.get("/reconciliation/failed").then(r => r.data);
export const runReconciliation = (claimIds = null) =>
  api.post("/reconciliation/run", claimIds ? { claim_ids: claimIds } : {}).then(r => r.data);

// Retry
export const retryBatch = (batchId) =>
  api.post("/batch/retry", { batch_id: batchId }).then(r => r.data);

// FHIR claims (server-side pagination)
export const getClaims = (params = {}) =>
  api.get("/claims/", { params }).then(r => r.data);
export const getHospitals = () =>
  api.get("/claims/hospitals/").then(r => r.data);
export const fetchFHIRClaims = (months = 3) =>
  api.post("/claims/fetch", { months }).then(r => r.data);

// Batch listing & creation
export const getBatches = () => api.get("/batch/").then(r => r.data);
export const getBatchDetail = (id) => api.get(`/batch/${id}/`).then(r => r.data);
export const autoCreateBatches = (batchSize = 15, submitNow = false) =>
  api.post("/batch/auto-create", { batch_size: batchSize, submit_now: submitNow }).then(r => r.data);
export const createBatches = (claimIds, batchSize = null, submitNow = true) =>
  api.post("/batch/create", {
    claim_ids:  claimIds,
    batch_size: batchSize || undefined,
    submit_now: submitNow,
  }).then(r => r.data);

// Bank statement
export const previewStatement = (file, type = "pdf") => {
  const form = new FormData();
  form.append("file", file);
  form.append("type", type);
  return api.post("/statements/preview", form, { headers: { "Content-Type": "multipart/form-data" } }).then(r => r.data);
};
export const uploadStatement = (file, type, claimId = null) => {
  const form = new FormData();
  form.append("file", file);
  form.append("type", type);
  if (claimId) form.append("claim_id", claimId);
  return api.post("/statements/upload", form, { headers: { "Content-Type": "multipart/form-data" } }).then(r => r.data);
};

// Payment Queue
export const getQueue    = () => api.get("/queue/").then(r => r.data);
export const enqueueBatches = (batchIds, scheduledAt) =>
  api.post("/queue/add", { batch_ids: batchIds, scheduled_at: scheduledAt }).then(r => r.data);
export const executeQueue = () => api.post("/queue/execute").then(r => r.data);
export const cancelQueueEntry = (id) => api.post(`/queue/${id}/cancel`).then(r => r.data);
export const moveQueueEntry   = (id, direction) => api.post(`/queue/${id}/move`, { direction }).then(r => r.data);

// Operations Center (enterprise)
export const getOpsSummary  = () => api.get("/ops/summary").then(r => r.data);
export const getOpsActivity = () => api.get("/ops/activity").then(r => r.data);

// Claim timeline & exceptions (enterprise)
export const getClaimTimeline = (id) => api.get(`/claim/${id}/timeline`).then(r => r.data);
export const getExceptions    = (type = "") =>
  api.get("/exceptions/", { params: type ? { type } : {} }).then(r => r.data);
