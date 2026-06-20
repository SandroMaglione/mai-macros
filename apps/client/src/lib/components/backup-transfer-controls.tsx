import { useSelector } from "@xstate/react";
import { AlertTriangle, Download, Loader2, Upload } from "lucide-react";
import { useRef } from "react";

import {
  type BackupTransferActorRef,
  type BackupTransferSnapshot,
} from "../machines/backup-transfer-machine.ts";
import { type BackupExportMetadata } from "../services/backup-export-metadata.ts";

export type BackupTransferMode = "full" | "importOnly";

const backupPanelClassName =
  "grid gap-3 rounded-lg border border-[#29292d] bg-[#161618] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]";
const backupFieldClassName =
  "min-h-10 w-full rounded-md border border-[#37373b] bg-[#111113] px-3 text-sm font-bold text-[#f0f0f2] outline-none transition placeholder:text-[#77777e] focus:border-[#ff5a51] focus:ring-2 focus:ring-[#ff5a51]/25 disabled:cursor-not-allowed disabled:opacity-50";
export function BackupTransferControls({
  actor,
  mode,
}: {
  readonly actor: BackupTransferActorRef;
  readonly mode: BackupTransferMode;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const snapshot = useSelector(actor, (state): BackupTransferSnapshot => state);
  const isExporting = snapshot.matches("Exporting");
  const isImporting = snapshot.matches("Importing");
  const isLoading = snapshot.matches("Loading");
  const disabled = isLoading || isExporting || isImporting;
  const showExport = mode === "full";
  const { backupName, errorMessage, lastExport, successMessage } =
    snapshot.context;

  return (
    <section className={backupPanelClassName} aria-label="Backups">
      <div className="grid gap-1">
        <h2 className="text-sm font-black uppercase leading-tight tracking-normal text-[#aaaab1]">
          Backup
        </h2>
        {showExport ? (
          <p className="text-xs font-bold leading-tight text-[#77777e]">
            Format v1 / database v3 / dated JSON
          </p>
        ) : null}
      </div>

      {showExport ? (
        <BackupExportRecency isLoading={isLoading} metadata={lastExport} />
      ) : null}

      {showExport ? (
        <label className="grid min-w-0 gap-1.5 text-sm font-black leading-tight text-[#d9d9de]">
          Name
          <input
            autoComplete="off"
            className={backupFieldClassName}
            disabled={disabled}
            onChange={(event) => {
              actor.send({
                type: "changeBackupName",
                backupName: event.currentTarget.value,
              });
            }}
            placeholder="Mai backup"
            value={backupName}
          />
        </label>
      ) : null}

      <input
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.item(0) ?? null;

          event.currentTarget.value = "";

          if (file === null) {
            return;
          }

          actor.send({
            type: "importFile",
            file,
          });
        }}
        ref={inputRef}
        type="file"
      />

      <div className={showExport ? "grid grid-cols-2 gap-2" : "grid gap-2"}>
        {showExport ? (
          <button
            className="btn-primary"
            disabled={disabled}
            onClick={() => {
              actor.send({ type: "export" });
            }}
            type="button"
          >
            {isExporting ? (
              <Loader2
                aria-hidden="true"
                className="animate-spin"
                size={17}
                strokeWidth={3}
              />
            ) : (
              <Download aria-hidden="true" size={17} strokeWidth={3} />
            )}
            Export
          </button>
        ) : null}
        <button
          className={showExport ? "btn-secondary-danger" : "btn-primary"}
          disabled={disabled}
          onClick={() => {
            inputRef.current?.click();
          }}
          type="button"
        >
          <Upload aria-hidden="true" size={17} strokeWidth={3} />
          Import
        </button>
      </div>

      {errorMessage === null ? null : (
        <div
          className="flex min-w-0 items-start gap-2 rounded-md border border-[#74322f] bg-[#201717] p-3 text-sm font-bold leading-snug text-[#ff8f88]"
          role="alert"
        >
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 shrink-0"
            size={17}
            strokeWidth={3}
          />
          <p className="min-w-0">{errorMessage}</p>
        </div>
      )}

      {successMessage === null ? null : (
        <p className="rounded-md border border-[#26492f] bg-[#132017] p-3 text-sm font-bold leading-snug text-[#8be09a]">
          {successMessage}
        </p>
      )}

      {isImporting ? (
        <div
          className="fixed inset-0 z-70 grid place-items-center bg-black/85 px-5 text-center backdrop-blur-sm"
          role="alert"
        >
          <div className="grid max-w-[320px] justify-items-center gap-3">
            <Loader2
              aria-hidden="true"
              className="animate-spin text-[#ff5a51]"
              size={34}
              strokeWidth={3}
            />
            <div className="grid gap-1">
              <p className="text-lg font-black leading-tight text-[#f0f0f2]">
                Importing backup
              </p>
              <p className="text-sm font-bold leading-snug text-[#aaaab1]">
                Replacing this device's current Mai data.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function BackupExportRecency({
  isLoading,
  metadata,
}: {
  readonly isLoading: boolean;
  readonly metadata: BackupExportMetadata | null;
}) {
  if (isLoading) {
    return (
      <p className="rounded-md border border-[#343438] bg-[#111113] p-3 text-xs font-bold leading-snug text-[#aaaab1]">
        Checking latest export on this device.
      </p>
    );
  }

  if (metadata === null) {
    return (
      <p className="rounded-md border border-[#343438] bg-[#111113] p-3 text-xs font-bold leading-snug text-[#aaaab1]">
        No successful export on this device yet.
      </p>
    );
  }

  const exportedAt = new Date(metadata.exportedAtIso);
  const totalRecords =
    metadata.counts.dailyLogs +
    metadata.counts.foods +
    metadata.counts.mealEntries +
    metadata.counts.plans;
  const loggedDaysText =
    metadata.latestDateKey === undefined
      ? "No logged days included."
      : metadata.earliestDateKey === metadata.latestDateKey ||
          metadata.earliestDateKey === undefined
        ? `Included logged day ${metadata.latestDateKey}.`
        : `Included logged days ${metadata.earliestDateKey} through ${metadata.latestDateKey}.`;

  return (
    <p className="rounded-md border border-[#343438] bg-[#111113] p-3 text-xs font-bold leading-snug text-[#aaaab1]">
      Last export {exportedAt.toLocaleString()}. {loggedDaysText} {totalRecords}{" "}
      records saved.
    </p>
  );
}
