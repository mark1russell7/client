/**
 * The procedures of `@procedures/ios-backup`: `iosBackup.find`, `iosBackup.file` and
 * `iosBackup.messages`. Each one reads files and changes nothing.
 */

import { createProcedure, zodAdapter, type AnyProcedure, type FsRootRules } from "@procedures/client";
import { z } from "zod";
import {
  IosBackupError,
  defaultBackupRoots,
  findBackupFile,
  findLatestBackup,
  listBackups,
  readMessages,
  type BackupFolder,
  type BackupMessage,
} from "./backup.js";

/** The procedures read files and change nothing. A copy in a temporary folder is deleted after the read. */
const READS_FILES = { reads: ["fs"], writes: [] };

/**
 * The rule of the procedures under a root of the files (roadmap R33, tracker item O36): a root
 * refuses them. The default backups are in the home folder. The procedure follows a linked backup
 * folder, and the names of the files in a backup come from the data of `Manifest.db`.
 */
const REFUSED_UNDER_A_ROOT: FsRootRules = {
  refuse: "the default backups are in the home folder, a linked backup folder is followed, and the names of the files come from the data of Manifest.db",
};

const rootsField = z
  .array(z.string().min(1))
  .optional()
  .describe("The folders that hold the backup folders (default: the MobileSync folders of Windows and macOS)");
const backupField = z.string().min(1).optional().describe("The backup folder (default: the newest backup in the roots)");
const timeField = z.string().refine((value) => !Number.isNaN(Date.parse(value)), { message: "Use an ISO 8601 time" });

const BackupFolderSchema = z.object({ path: z.string(), modifiedAt: z.string() });

/** This function gives the backup folder of the input, or the newest backup in the roots. */
async function resolveBackup(input: { backup?: string | undefined; roots?: string[] | undefined }): Promise<string> {
  if (input.backup !== undefined) return input.backup;
  const roots = input.roots ?? defaultBackupRoots();
  const latest = await findLatestBackup(roots);
  if (latest === undefined) {
    throw new IosBackupError("no-backup", `No iPhone backup in ${roots.join(", ")}. Make a backup without encryption first.`);
  }
  return latest;
}

// iosBackup.find

const FindInputSchema = z.object({ roots: rootsField });
type FindInput = z.infer<typeof FindInputSchema>;

interface FindOutput {
  /** The newest backup folder, when there is one. */
  latest?: BackupFolder | undefined;
  /** All the backup folders, the newest first. */
  backups: BackupFolder[];
  /** The folders that the call examined. */
  roots: string[];
}
const FindOutputSchema = z.object({
  latest: BackupFolderSchema.optional(),
  backups: z.array(BackupFolderSchema),
  roots: z.array(z.string()),
});

export const iosBackupFindProcedure: AnyProcedure = createProcedure()
  .path(["iosBackup", "find"])
  .input(zodAdapter<FindInput>(FindInputSchema))
  .output(zodAdapter<FindOutput>(FindOutputSchema))
  .meta({
    description: "Find the iPhone backups (MobileSync) on this computer, the newest first",
    args: [],
    output: "json",
    effects: READS_FILES,
    fsRoot: REFUSED_UNDER_A_ROOT,
  })
  .handler(async (input: FindInput): Promise<FindOutput> => {
    const roots = input.roots ?? defaultBackupRoots();
    const backups = await listBackups(roots);
    const latest = backups[0];
    return { ...(latest === undefined ? {} : { latest }), backups, roots };
  })
  .build() as AnyProcedure;

// iosBackup.file

const FileInputSchema = z.object({
  domain: z.string().min(1).describe("The domain of the file in Manifest.db, for example HomeDomain"),
  relativePath: z.string().min(1).describe("The relative path of the file in its domain, for example Library/SMS/sms.db"),
  backup: backupField,
  roots: rootsField,
});
type FileInput = z.infer<typeof FileInputSchema>;

interface FileOutput {
  /** The backup folder. */
  backup: string;
  /** True when Manifest.db lists the file. */
  found: boolean;
  /** The ID of the file in Manifest.db. */
  fileId?: string | undefined;
  /** The path of the file in the backup folder. */
  path?: string | undefined;
}
const FileOutputSchema = z.object({
  backup: z.string(),
  found: z.boolean(),
  fileId: z.string().optional(),
  path: z.string().optional(),
});

export const iosBackupFileProcedure: AnyProcedure = createProcedure()
  .path(["iosBackup", "file"])
  .input(zodAdapter<FileInput>(FileInputSchema))
  .output(zodAdapter<FileOutput>(FileOutputSchema))
  .meta({
    description: "Find a file of an iPhone backup by its domain and relative path in Manifest.db",
    args: ["domain", "relativePath"],
    output: "json",
    effects: READS_FILES,
    fsRoot: REFUSED_UNDER_A_ROOT,
  })
  .handler(async (input: FileInput): Promise<FileOutput> => {
    const backup = await resolveBackup(input);
    const file = await findBackupFile(backup, input.domain, input.relativePath);
    return file === undefined ? { backup, found: false } : { backup, found: true, ...file };
  })
  .build() as AnyProcedure;

// iosBackup.messages

const MessagesInputSchema = z.object({
  backup: backupField,
  roots: rootsField,
  since: timeField.optional().describe("Only the messages at this time or after it (ISO 8601)"),
  until: timeField.optional().describe("Only the messages before this time (ISO 8601)"),
  limit: z.number().int().positive().optional().describe("Only the newest messages, at most this number"),
});
type MessagesInput = z.infer<typeof MessagesInputSchema>;

interface MessagesOutput {
  /** The backup folder. */
  backup: string;
  /** The messages, in time order. */
  messages: BackupMessage[];
}
const MessageSchema = z.object({
  guid: z.string(),
  date: z.string(),
  text: z.string(),
  is_from_me: z.boolean(),
  handle: z.string().optional(),
  service: z.string().optional(),
  chat_id: z.string().optional(),
  chat_name: z.string().optional(),
  from_attributed_body: z.boolean().optional(),
});
const MessagesOutputSchema = z.object({ backup: z.string(), messages: z.array(MessageSchema) });

export const iosBackupMessagesProcedure: AnyProcedure = createProcedure()
  .path(["iosBackup", "messages"])
  .input(zodAdapter<MessagesInput>(MessagesInputSchema))
  .output(zodAdapter<MessagesOutput>(MessagesOutputSchema))
  .meta({
    description: "Read the messages (iMessage and SMS) of an iPhone backup, in time order",
    args: [],
    output: "json",
    effects: READS_FILES,
    fsRoot: REFUSED_UNDER_A_ROOT,
  })
  .handler(async (input: MessagesInput): Promise<MessagesOutput> => {
    const backup = await resolveBackup(input);
    const messages = await readMessages(backup, { since: input.since, until: input.until, limit: input.limit });
    return { backup, messages };
  })
  .build() as AnyProcedure;

export const iosBackupProcedures: AnyProcedure[] = [iosBackupFindProcedure, iosBackupFileProcedure, iosBackupMessagesProcedure];
