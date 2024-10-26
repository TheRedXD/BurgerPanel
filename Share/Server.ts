import { ServerPermissions } from "./Permission";
export const allowedSoftwares = ["purpur", "paper", "vanilla", "fabric", "quilt"] as const;
export type AllowedSoftware = typeof allowedSoftwares[number];
export interface Server {
    _id: string;
    name: string;
    path: string;
    mem: number;
    allowedUsers: {
        user: string;
        permissions: ServerPermissions[];
    }[];
    version: string;
    software: AllowedSoftware;
    port: number;
    autoStart: boolean;
    autoRestart: boolean;
    jvmArgs: string;
    useCustomJVMArgs: boolean;
}

export type ServerStatus = "running" | "stopping" | "stopped" | "unknown";
export type ServerStatuses = {
    [id: string]: {
        status: ServerStatus;
    }
}
// allowed mime types from file editor
export const allowedMimeTypes = ["text/plain", "application/json", "application/json5", "text/yaml", "text/properties", "text/mcfunction", "text/mcmeta", "text/markdown"];
// bypassed mime type blocks, direct paths
export const allowedFileNames = ["/server.properties"];