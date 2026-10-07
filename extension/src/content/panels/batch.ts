// Batch flow for Thingiverse Likes/Collections, Printables Collections, and Cults3D creator
// creations. MakerWorld collections use the guided flow in makerworldCollection.ts.

import type { BatchEntriesResult, ImportJob } from "../../shared/api";
import { ctx } from "../context";
import { api, escapeHtml, sleep } from "../runtime";
import { isPanelMounted, onPanelAction, panelQueryAll, renderPanel } from "../shell";
import { errorHtml, statusHtml, successHtml } from "./results";
import { loadingModelsPhrases, renderFunStatus } from "./funStatus";

type BatchKey = "thingiverse:likes" | "thingiverse:collection" | "printables:collection" | "cults3d:creations";

const BATCH_ENDPOINTS: Record<BatchKey, { entries: string; start: string; idField: string }> = {
  "thingiverse:likes": {
    entries: "/import/thingiverse-likes/entries",
    start: "/import/thingiverse-likes",
    idField: "thing_ids",
  },
  "thingiverse:collection": {
    entries: "/import/thingiverse-collection/entries",
    start: "/import/thingiverse-collection",
    idField: "thing_ids",
  },
  "printables:collection": {
    entries: "/import/printables-collection/entries",
    start: "/import/printables-collection",
    idField: "model_ids",
  },
  "cults3d:creations": {
    entries: "/import/cults3d-creations/entries",
    start: "/import/cults3d-creations",
    idField: "model_ids",
  },
};

function endpoints() {
  const { provider, type } = ctx().classification;
  const config = BATCH_ENDPOINTS[`${provider}:${type}` as BatchKey];
  if (!config) throw new Error(`Batch import isn't supported for ${provider} ${type}`);
  return config;
}

export async function loadBatchEntries(): Promise<void> {
  renderFunStatus(loadingModelsPhrases(ctx().classification.provider));
  let result: BatchEntriesResult;
  try {
    result = await api<BatchEntriesResult>("POST", endpoints().entries, { url: ctx().url });
  } catch (err) {
    renderPanel(errorHtml(err));
    return;
  }
  const rows = result.entries
    .map(
      (entry) => `
        <label class="tg-entry${entry.already_imported ? " tg-entry--imported" : ""}">
          <input type="checkbox" class="tg-entry__checkbox" value="${escapeHtml(entry.design_id)}" ${entry.already_imported ? "" : "checked"} />
          <span class="tg-entry__name">${escapeHtml(entry.title || entry.design_id)}</span>
          ${entry.already_imported ? '<span class="tg-badge">already imported</span>' : ""}
        </label>
      `,
    )
    .join("");
  renderPanel(`
    <div class="tg-title">${escapeHtml(result.title || "Import models")}</div>
    <div class="tg-hint">${result.entries.length} models found${result.truncated ? " (more available on the site)" : ""}</div>
    <div class="tg-entries">${rows}</div>
    <button class="tg-btn" type="button" data-action="import">Import selected</button>
  `);
  onPanelAction("import", () => void runBatchImport());
}

async function runBatchImport(): Promise<void> {
  const ids = panelQueryAll<HTMLInputElement>(".tg-entry__checkbox:checked").map((el) => el.value);
  if (!ids.length) return;
  const { url, instanceUrl } = ctx();
  const { start, idField } = endpoints();
  renderPanel(statusHtml("Starting import…"));
  try {
    const { job_id } = await api<{ job_id: string }>("POST", start, { url, [idField]: ids });
    await pollJobWithProgress(job_id, instanceUrl);
  } catch (err) {
    renderPanel(errorHtml(err));
  }
}

async function pollJobWithProgress(jobId: string, instanceUrl: string): Promise<void> {
  for (;;) {
    // The panel is gone; the job keeps running server-side.
    if (!isPanelMounted()) return;
    const job = await api<ImportJob>("GET", `/import/jobs/${jobId}`);
    if (!isPanelMounted()) return;
    if (job.status === "RUNNING") {
      renderPanel(statusHtml(`Importing ${job.processed} of ${job.total}…`));
      await sleep(1000);
      continue;
    }
    if (job.status === "ERROR") {
      renderPanel(errorHtml(new Error(job.error_message || "Import failed")));
      return;
    }
    const link = job.result_print_id ? `${instanceUrl}/models/${job.result_print_id}` : `${instanceUrl}/models`;
    renderPanel(successHtml(link, `Imported ${job.imported} of ${job.total}.`));
    return;
  }
}
