import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { useNavigate } from "react-router-dom";
import { importsApi, type ImportJob } from "../../api/imports";
import { UnauthorizedError } from "../../api/client";

type StartCollectionImportPayload = Parameters<typeof importsApi.fromCollection>[0];
type StartZipImportPayload = Parameters<typeof importsApi.zipFromLink>[0];
type StartThingiverseLikesImportPayload = Parameters<typeof importsApi.fromThingiverseLikes>[0];
type StartThingiverseCollectionImportPayload = Parameters<typeof importsApi.fromThingiverseCollection>[0];
type StartPrintablesCollectionImportPayload = Parameters<typeof importsApi.fromPrintablesCollection>[0];
type StartCults3dCreationsImportPayload = Parameters<typeof importsApi.fromCults3dCreations>[0];
type StartMakerworldProfilesImportPayload = Parameters<typeof importsApi.fromMakerworldProfiles>[0];
type StartLinksImportPayload = Parameters<typeof importsApi.fromLinks>[0];

type ImportJobContextValue = {
  /** Non-null while a batch import runs; drives the progress bar and disables importing. */
  activeJob: ImportJob | null;
  isImporting: boolean;
  startCollectionImport: (payload: StartCollectionImportPayload) => Promise<void>;
  startZipImport: (payload: StartZipImportPayload) => Promise<void>;
  startThingiverseLikesImport: (payload: StartThingiverseLikesImportPayload) => Promise<void>;
  startThingiverseCollectionImport: (payload: StartThingiverseCollectionImportPayload) => Promise<void>;
  startPrintablesCollectionImport: (payload: StartPrintablesCollectionImportPayload) => Promise<void>;
  startCults3dCreationsImport: (payload: StartCults3dCreationsImportPayload) => Promise<void>;
  startMakerworldProfilesImport: (payload: StartMakerworldProfilesImportPayload) => Promise<void>;
  startLinksImport: (payload: StartLinksImportPayload) => Promise<void>;
  /** Reruns the links that failed on the finished job shown in the progress bar. */
  retryJob: () => Promise<void>;
  dismissJob: () => void;
};

const ImportJobContext = createContext<ImportJobContextValue | null>(null);

const POLL_INTERVAL_MS = 1000;

export function ImportJobProvider({
  onUnauthorized,
  onJobCompleted,
  children,
}: {
  onUnauthorized?: () => void;
  onJobCompleted?: () => void;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const [activeJob, setActiveJob] = useState<ImportJob | null>(null);
  const pollRef = useRef<number | null>(null);
  const onJobCompletedRef = useRef(onJobCompleted);
  onJobCompletedRef.current = onJobCompleted;

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollJob = useCallback(
    async (jobId: string) => {
      try {
        const job = await importsApi.getImportJob(jobId);
        if (job.status === "RUNNING") {
          setActiveJob(job);
          return;
        }
        stopPolling();
        // Paused from the admin import queue: nothing finished, so don't navigate anywhere.
        if (job.status === "PAUSED") {
          setActiveJob(null);
          return;
        }
        onJobCompletedRef.current?.();
        // A link queue with failures stays on screen so they can be retried or dismissed.
        if (job.type === "LINKS" && (job.failed_count > 0 || job.status === "ERROR")) {
          setActiveJob(job);
          return;
        }
        setActiveJob(null);
        // One resulting print opens its details page; more go to the models grid; none stays put.
        if (job.status === "DONE") {
          if (job.result_print_id) {
            navigate(`/models/${job.result_print_id}`);
          } else if (job.imported + job.already_in_library > 1) {
            // Dedup hits count as results too.
            navigate("/models");
          }
        }
      } catch (err) {
        stopPolling();
        setActiveJob(null);
        if (err instanceof UnauthorizedError) onUnauthorized?.();
      }
    },
    [onUnauthorized, stopPolling, navigate],
  );

  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling();
      pollRef.current = window.setInterval(() => {
        void pollJob(jobId);
      }, POLL_INTERVAL_MS);
    },
    [pollJob, stopPolling],
  );

  useEffect(() => {
    (async () => {
      try {
        const job = await importsApi.getActiveImportJob();
        if (job && job.status === "RUNNING") {
          setActiveJob(job);
          startPolling(job.id);
        }
      } catch (err) {
        if (err instanceof UnauthorizedError) onUnauthorized?.();
      }
    })();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCollectionImport = useCallback(
    async (payload: StartCollectionImportPayload) => {
      const { job_id } = await importsApi.fromCollection(payload);
      const job = await importsApi.getImportJob(job_id);
      setActiveJob(job);
      startPolling(job_id);
    },
    [startPolling],
  );

  const startZipImport = useCallback(
    async (payload: StartZipImportPayload) => {
      const { job_id } = await importsApi.zipFromLink(payload);
      const job = await importsApi.getImportJob(job_id);
      setActiveJob(job);
      startPolling(job_id);
    },
    [startPolling],
  );

  const startThingiverseLikesImport = useCallback(
    async (payload: StartThingiverseLikesImportPayload) => {
      const { job_id } = await importsApi.fromThingiverseLikes(payload);
      const job = await importsApi.getImportJob(job_id);
      setActiveJob(job);
      startPolling(job_id);
    },
    [startPolling],
  );

  const startThingiverseCollectionImport = useCallback(
    async (payload: StartThingiverseCollectionImportPayload) => {
      const { job_id } = await importsApi.fromThingiverseCollection(payload);
      const job = await importsApi.getImportJob(job_id);
      setActiveJob(job);
      startPolling(job_id);
    },
    [startPolling],
  );

  const startPrintablesCollectionImport = useCallback(
    async (payload: StartPrintablesCollectionImportPayload) => {
      const { job_id } = await importsApi.fromPrintablesCollection(payload);
      const job = await importsApi.getImportJob(job_id);
      setActiveJob(job);
      startPolling(job_id);
    },
    [startPolling],
  );

  const startCults3dCreationsImport = useCallback(
    async (payload: StartCults3dCreationsImportPayload) => {
      const { job_id } = await importsApi.fromCults3dCreations(payload);
      const job = await importsApi.getImportJob(job_id);
      setActiveJob(job);
      startPolling(job_id);
    },
    [startPolling],
  );

  const startMakerworldProfilesImport = useCallback(
    async (payload: StartMakerworldProfilesImportPayload) => {
      const { job_id } = await importsApi.fromMakerworldProfiles(payload);
      const job = await importsApi.getImportJob(job_id);
      setActiveJob(job);
      startPolling(job_id);
    },
    [startPolling],
  );

  const startLinksImport = useCallback(
    async (payload: StartLinksImportPayload) => {
      const { job_id } = await importsApi.fromLinks(payload);
      const job = await importsApi.getImportJob(job_id);
      setActiveJob(job);
      startPolling(job_id);
    },
    [startPolling],
  );

  const retryJob = useCallback(async () => {
    if (!activeJob) return;
    const { job_id } = await importsApi.retryImportJob(activeJob.id);
    const job = await importsApi.getImportJob(job_id);
    setActiveJob(job);
    startPolling(job_id);
  }, [activeJob, startPolling]);

  const dismissJob = useCallback(() => {
    stopPolling();
    setActiveJob(null);
  }, [stopPolling]);

  const value = useMemo(
    () => ({
      activeJob,
      isImporting: activeJob !== null,
      startCollectionImport,
      startZipImport,
      startThingiverseLikesImport,
      startThingiverseCollectionImport,
      startPrintablesCollectionImport,
      startCults3dCreationsImport,
      startMakerworldProfilesImport,
      startLinksImport,
      retryJob,
      dismissJob,
    }),
    [
      activeJob,
      startCollectionImport,
      startZipImport,
      startThingiverseLikesImport,
      startThingiverseCollectionImport,
      startPrintablesCollectionImport,
      startCults3dCreationsImport,
      startMakerworldProfilesImport,
      startLinksImport,
      retryJob,
      dismissJob,
    ],
  );

  return <ImportJobContext.Provider value={value}>{children}</ImportJobContext.Provider>;
}

export function useImportJob() {
  const ctx = useContext(ImportJobContext);
  if (!ctx) throw new Error("useImportJob must be used within an ImportJobProvider");
  return ctx;
}
