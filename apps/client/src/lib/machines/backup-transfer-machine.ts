import { BackupTransferMachine } from "@mai/machines";

import { RuntimeClient } from "../runtime-client.ts";

export const backupTransferMachine =
  BackupTransferMachine.makeBackupTransferMachine(RuntimeClient);
