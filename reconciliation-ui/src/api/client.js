import axios from "axios";

const api = axios.create({ baseURL: "/api/v1" });

export const getDashboard = () => api.get("/dashboard/summary").then(r => r.data);
export const getResults = () => api.get("/reconciliation/results").then(r => r.data);
export const getFailed = () => api.get("/reconciliation/failed").then(r => r.data);
export const runReconciliation = (claimIds = null) =>
  api.post("/reconciliation/run", claimIds ? { claim_ids: claimIds } : {}).then(r => r.data);
export const retryBatch = (batchId) =>
  api.post("/batch/retry", { batch_id: batchId }).then(r => r.data);
export const previewStatement = (file, type = "pdf") => {
  const form = new FormData();
  form.append("file", file);
  form.append("type", type);
  return api.post("/statements/preview", form, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then(r => r.data);
};

export const uploadStatement = (file, type, claimId = null) => {
  const form = new FormData();
  form.append("file", file);
  form.append("type", type);
  if (claimId) form.append("claim_id", claimId);
  return api.post("/statements/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then(r => r.data);
};
