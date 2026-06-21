import { makeBackupTransferMachine } from "@mai/machines/backups";

import { RuntimeClient } from "../runtime-client.ts";

export {
  type BackupTransferActorRef,
  type BackupTransferEvent,
  type BackupTransferImportedEvent,
  type BackupTransferResult,
  type BackupTransferSnapshot,
} from "@mai/machines/backups";

export const backupTransferMachine = makeBackupTransferMachine(RuntimeClient);
