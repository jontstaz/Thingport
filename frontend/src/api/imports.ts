import { authHeaders } from "../utils/auth";
import { apiBase, readErrorMessage, UnauthorizedError } from "./client";
import type { Print } from "./prints";

export type ImportInspectInfo = {
  filename: string;
  mime: string;
  is_zip: boolean;
};

export type ZipEntryInfo = {
  path: string;
  size: number;
};

export type ImportCollectionEntry = {
  design_id: string;
  title: string;
  cover: string | null;
  already_imported: boolean;
};

export type ImportCollectionEntriesResult = {
  title: string | null;
  total: number;
  truncated: boolean;
  entries: ImportCollectionEntry[];
};

export type ImportJobType = "COLLECTION" | "ZIP" | "PROFILES" | "LINKS";

export type MakerworldProfileScope = "url" | "designer" | "all";
// PAUSED: a link queue waiting to be started from the admin import queue.
export type ImportJobStatus = "RUNNING" | "DONE" | "ERROR" | "PAUSED";

/** Polled by ImportJobContext until status leaves RUNNING. */
export type ImportJob = {
  id: string;
  type: ImportJobType;
  status: ImportJobStatus;
  source_url: string;
  source_label: string | null;
  provider: string | null;
  total: number;
  processed: number;
  imported: number;
  already_in_library: number;
  failed_count: number;
  error_message: string | null;
  result_collection_id: string | null;
  // Set when the job created exactly one Print, so the UI can open it.
  result_print_id: string | null;
};

/** One queued link of a LINKS job. Polled alongside the job to show the queue's detail. */
export type ImportJobItem = {
  id: string;
  url: string;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  attempts: number;
  error_message: string | null;
  /** Set on links sent from the extension's "Add to the queue". */
  title: string | null;
  collection_id: string | null;
  scope: MakerworldProfileScope | null;
};

type ImportLinkPayload = {
  url: string;
  title?: string;
  notes?: string;
  tags?: string[];
  category_id?: string;
  filename?: string;
  makerworld_cookie?: string;
  // Solved captcha, checked and consumed by whichever request starts the import.
  captcha_id?: string;
  captcha_answer?: string;
};

/** "profile_added": an existing MakerWorld model gained another profile's file. */
export type ImportOutcome = "created" | "profile_added" | "already_imported";

/** The print was created without any files (e.g. a paid Cults3D model not yet purchased). */
export type ImportPrintResult = Print & { import_outcome?: ImportOutcome; files_pending?: boolean };

export const importsApi = {
  fromLink: async (payload: ImportLinkPayload): Promise<ImportPrintResult> => {
    const res = await fetch(`${apiBase()}/import`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      let message = "Import failed";
      try {
        const data = await res.json();
        if (typeof data?.detail === "string") message = data.detail;
      } catch {}
      throw new Error(message);
    }
    return res.json();
  },

  inspectLink: async (payload: ImportLinkPayload): Promise<ImportInspectInfo> => {
    const res = await fetch(`${apiBase()}/import/inspect`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, "Inspect failed");
      throw new Error(message);
    }
    return res.json();
  },

  listZipEntries: async (payload: ImportLinkPayload): Promise<{ filename: string; entries: ZipEntryInfo[] }> => {
    const res = await fetch(`${apiBase()}/import/zip/entries`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, "Zip listing failed");
      throw new Error(message);
    }
    return res.json();
  },

  /** Returns immediately; ImportJobContext polls the job. */
  zipFromLink: async (payload: ImportLinkPayload & { entries: string[] }): Promise<{ job_id: string }> => {
    const res = await fetch(`${apiBase()}/import/zip`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, "Zip import failed");
      throw new Error(message);
    }
    return res.json();
  },

  listCollectionEntries: async (payload: ImportLinkPayload): Promise<ImportCollectionEntriesResult> => {
    const res = await fetch(`${apiBase()}/import/collection/entries`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, "Could not load collection");
      throw new Error(message);
    }
    return res.json();
  },

  /** ("url" is a plain fromLink import.) */
  fromMakerworldProfiles: async (
    payload: ImportLinkPayload & { scope: Exclude<MakerworldProfileScope, "url"> },
  ): Promise<{ job_id: string }> => {
    const res = await fetch(`${apiBase()}/import/makerworld-profiles`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) throw new Error(await readErrorMessage(res, "Import failed"));
    return res.json();
  },

  /** Returns immediately; ImportJobContext polls the job. A pasted list of links, imported one at
   *  a time; what fails can be rerun with retryImportJob. */
  fromLinks: async (
    payload: Omit<ImportLinkPayload, "url"> & { urls: string[]; scope?: MakerworldProfileScope },
  ): Promise<{ job_id: string }> => {
    const res = await fetch(`${apiBase()}/import/links`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) throw new Error(await readErrorMessage(res, "Import failed"));
    return res.json();
  },

  /** Reruns just a link-list job's failed links. */
  retryImportJob: async (jobId: string): Promise<{ job_id: string }> => {
    const res = await fetch(`${apiBase()}/import/jobs/${jobId}/retry`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) throw new Error(await readErrorMessage(res, "Retry failed"));
    return res.json();
  },

  /** Returns immediately; ImportJobContext polls the job. */
  fromCollection: async (payload: ImportLinkPayload & { design_ids: string[] }): Promise<{ job_id: string }> => {
    const res = await fetch(`${apiBase()}/import/collection`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, "Collection import failed");
      throw new Error(message);
    }
    return res.json();
  },

  listThingiverseLikesEntries: async (payload: ImportLinkPayload): Promise<ImportCollectionEntriesResult> => {
    const res = await fetch(`${apiBase()}/import/thingiverse-likes/entries`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, "Could not load this user's likes");
      throw new Error(message);
    }
    return res.json();
  },

  /** Returns immediately; ImportJobContext polls the job. */
  fromThingiverseLikes: async (payload: ImportLinkPayload & { thing_ids: string[] }): Promise<{ job_id: string }> => {
    const res = await fetch(`${apiBase()}/import/thingiverse-likes`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, "Thingiverse Likes import failed");
      throw new Error(message);
    }
    return res.json();
  },

  listThingiverseCollectionEntries: async (payload: ImportLinkPayload): Promise<ImportCollectionEntriesResult> => {
    const res = await fetch(`${apiBase()}/import/thingiverse-collection/entries`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, "Could not load this collection");
      throw new Error(message);
    }
    return res.json();
  },

  /** Returns immediately; ImportJobContext polls the job. */
  fromThingiverseCollection: async (
    payload: ImportLinkPayload & { thing_ids: string[] },
  ): Promise<{ job_id: string }> => {
    const res = await fetch(`${apiBase()}/import/thingiverse-collection`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, "Thingiverse Collection import failed");
      throw new Error(message);
    }
    return res.json();
  },

  listPrintablesCollectionEntries: async (payload: ImportLinkPayload): Promise<ImportCollectionEntriesResult> => {
    const res = await fetch(`${apiBase()}/import/printables-collection/entries`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, "Could not load this collection");
      throw new Error(message);
    }
    return res.json();
  },

  /** Returns immediately; ImportJobContext polls the job. */
  fromPrintablesCollection: async (
    payload: ImportLinkPayload & { model_ids: string[] },
  ): Promise<{ job_id: string }> => {
    const res = await fetch(`${apiBase()}/import/printables-collection`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, "Printables Collection import failed");
      throw new Error(message);
    }
    return res.json();
  },

  listCults3dCreationsEntries: async (payload: ImportLinkPayload): Promise<ImportCollectionEntriesResult> => {
    const res = await fetch(`${apiBase()}/import/cults3d-creations/entries`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, "Could not load this creator's models");
      throw new Error(message);
    }
    return res.json();
  },

  /** Returns immediately; ImportJobContext polls the job. */
  fromCults3dCreations: async (
    payload: ImportLinkPayload & { model_ids: string[] },
  ): Promise<{ job_id: string }> => {
    const res = await fetch(`${apiBase()}/import/cults3d-creations`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, "Cults3D creator import failed");
      throw new Error(message);
    }
    return res.json();
  },

  getActiveImportJob: async (): Promise<ImportJob | null> => {
    const res = await fetch(`${apiBase()}/import/jobs/active`, { headers: authHeaders() });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to check for an active import"));
    return res.json();
  },

  getImportJob: async (jobId: string): Promise<ImportJob> => {
    const res = await fetch(`${apiBase()}/import/jobs/${jobId}`, { headers: authHeaders() });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to load import progress"));
    return res.json();
  },

  /** Per-link state of a queue job, for the progress bar's detail view. */
  getImportJobItems: async (jobId: string): Promise<ImportJobItem[]> => {
    const res = await fetch(`${apiBase()}/import/jobs/${jobId}/items`, { headers: authHeaders() });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to load the import queue"));
    return res.json();
  },
};
