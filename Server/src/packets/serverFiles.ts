import { OurClient, Packet, ServerPacketResponse, requestDownload, requestUpload } from "../index.js";
import { servers, users } from "../db.js";
import { hasServerPermission } from "../util/permission.js";
import fs from "node:fs/promises";
import { createWriteStream, createReadStream } from "node:fs";
import path from "node:path";
import mime from "mime-types";
import tar from "tar-fs";
import gunzip from "gunzip-maybe";
import zlib from "node:zlib";
import { allowedFileNames, allowedMimeTypes } from "../../../Share/Server.js";
import { Request } from "../../../Share/Requests.js";
import logger, { LogLevel } from "../logger.js";
import todo from "../util/todo.js";
import { getSetting } from "../config.js";

export default class ServerFiles extends Packet {
    name: Request = "serverFiles";
    requiresAuth: boolean = true;
    async handle(client: OurClient, data: any): ServerPacketResponse<"serverFiles"> {
        let server = await servers.findById(data.id);
        if(!server || !hasServerPermission(client.data.auth.user, server?.toJSON(), "serverfiles.read")) return "No perm"; //very bad!!!!
        // Make sure the user doesnt do anything spooky
        if(!data.path || typeof data.path != "string") return;
        if(data.path.includes("..")) return; // just in case
        let pathToCheck = path.join(server.path, data.path);
        if(!pathToCheck.startsWith(server.path)) return;
        // Lastly check if it actually exists
        let found = false;
        try {
            await fs.stat(pathToCheck);
            found = true;
        } catch {
            if(data.action != "upload" && data.action != "new") return "Invalid path"; // very spooky
        }
        // We should be safe now
        switch(data.action) {
            case "files":
                let files = await fs.readdir(pathToCheck);
                return {
                    files: (await Promise.allSettled(files.map(async f => {
                        return {
                            name: f,
                            folder: (await fs.stat(path.join(pathToCheck, f))).isDirectory()
                        }
                    }))).filter(e => e.status == "fulfilled")
                    // @ts-ignore I understand I shouldn't do this, but it is garantueed to exist and I use ?. just in case
                    .map(e => e?.value),
                    type: "filelist"
                }
            case "read":
                let statData = await fs.stat(pathToCheck);
                if(!statData.isFile()) return "how about you give me a actual file before opening"; // spooky
                if(statData.size > 320_000) {
                    return "File is over size limit (320kb)"
                }
                let mimeData = mime.lookup(pathToCheck);
                if(!allowedMimeTypes.includes(mimeData.toString()) && !allowedFileNames.includes(data.path) && !await getSetting("bypassFileTypeLimitations")) {
                    return "Disallowed type!"
                }
                logger.log(`${client.data.auth.user?.username} is reading ${data.path} in ${server.name}`, "server.file.read", LogLevel.INFO);
                let fileData = await fs.readFile(pathToCheck, "utf-8");
                return {
                    fileData,
                    type: "data"
                }
            case "write":
                if(!hasServerPermission(client.data.auth.user, server.toJSON(), "serverfiles.write")) return "No permission";
                let writeStatData = await fs.stat(pathToCheck);
                if(writeStatData.size > 320_000) {
                    return "File is over size limit (320kb)"
                }
                let writeMimeData = mime.lookup(pathToCheck);
                if(!allowedMimeTypes.includes(writeMimeData.toString()) && !allowedFileNames.includes(data.path) && !await getSetting("bypassFileTypeLimitations")) {
                    return "Disallowed type!"
                }
                if(typeof data.data != "string") return "Missing data";
                if(data.data.length > 320_000) return "Too big!!!";
                logger.log(`${client.data.auth.user?.username} is updating ${data.path} in ${server.name}. Size: ${writeStatData.size} -> ${data.data.length}`, "server.file.write");
                await fs.writeFile(pathToCheck, data.data);
                return {
                    fileData: data.data,
                    type: "edit-success"
                }
            case "delete":
                if(!hasServerPermission(client.data.auth.user, server.toJSON(), "serverfiles.delete")) return "No permission";
                let deleteFileStat = await fs.stat(pathToCheck);
                if (deleteFileStat.isDirectory()) {
                    if ((await fs.readdir(pathToCheck)).length != 0 && !hasServerPermission(client.data.auth.user, server.toJSON(), "serverfiles.recursivedeletion")) return "No permission to delete a non-empty directory";
                    logger.log(`${client.data.auth.user?.username} is deleting directory ${data.path} in ${server.name}`, 'server.file.delete');
                    await fs.rmdir(pathToCheck, {recursive: true});
                    return {
                        type: "delete-success"
                    }
                } else if (!deleteFileStat.isFile()) return;
                logger.log(`${client.data.auth.user?.username} is deleting ${data.path} in ${server.name}`, 'server.file.delete');
                await fs.unlink(pathToCheck);
                return {
                    type: "delete-success"
                }
            case "upload":
                if(!hasServerPermission(client.data.auth.user, server.toJSON(), "serverfiles.upload")) return "no permission to upload";
                let id = requestUpload(pathToCheck);
                logger.log(`${client.data.auth.user?.username} is uploading ${data.path} to ${server.name} with upload ID '${id}'`, "server.file.upload");
                return {
                    type: "uploadConfirm",
                    id
                }
            case "download":
                if(!hasServerPermission(client.data.auth.user, server.toJSON(), "serverfiles.download")) return "no permission to download";
                let downloadID = requestDownload(pathToCheck);
                logger.log(`${client.data.auth.user?.username} is downloading ${data.path} in ${server.name}`, "server.file.download");
                return {
                    type: "downloadConfirm",
                    id: downloadID
                }
            case "new":
                if(found) return "Already exists!";
                if(!hasServerPermission(client.data.auth.user, server.toJSON(), "serverfiles.new")) return "no permission to create new files";
                logger.log(`${client.data.auth.user?.username} is creating ${data.path} in ${server.name}`, "server.file.write");
                switch(data.type) {
                    case "folder":
                        await fs.mkdir(pathToCheck)
                        break;
                    case "file":
                        (await fs.open(pathToCheck, "a")).close();
                        break;
                    default:
                        return "invalid type";
                }
                break;
            case "move":
                if(!hasServerPermission(client.data.auth.user, server.toJSON(), "serverfiles.rename")) return "no permission to rename";
                let moveToPath = path.join(server.path, data.to);
                if(!moveToPath.startsWith(server.path)) return "Very bad!";
                logger.log(`${client.data.auth.user?.username} is moving ${data.path} to ${moveToPath}`, "server.file.move");
                try {
                    await fs.rename(pathToCheck, moveToPath)
                } catch(err) {
                    return `Failed to move: ${err}`
                }
                return {type: "moveSuccess"}
            case "archive":
                if (!hasServerPermission(client.data.auth.user, server.toJSON(), "serverfiles.archive")) return "No permission to create archives!";
                if (typeof data.path != "string") return "Path not provided or invalid";
                if (typeof data.folder_name != "string") return "Folder name not provided or invalid";
                if (typeof data.file_name != "string") return "File name not provided or invalid";
                if (typeof data.download != "boolean") data.download = false;
                return await new Promise((res) => {
                    try {
                        if (data.download) {
                            // TODO: Implement instant download without writing to FS
                            res(todo(`Instant download is not implemented for packet ${this.name}!`));
                        } else {
                            let folderPath = path.join(server.path, data.path, data.folder_name);
                            let createToPath = path.join(server.path, data.path, data.file_name);
                            let pack = tar.pack(folderPath);
                            let gzip_stream = zlib.createGzip();
                            let wstr = createWriteStream(createToPath);
                            pack.pipe(gzip_stream).pipe(wstr);
                            wstr.on("finish", () => {
                                logger.log(`${client.data.auth.user?.username} created archive ${data.file_name} from ${data.folder_name} in ${server.name}`, "server.file.archive");
                                res({ type: "archiveSuccess" });
                            });
                        }
                    } catch (err) {
                        res(`Failed to archive: ${err}`);
                    }
                });
                break;
            case "extract":
                if (!hasServerPermission(client.data.auth.user, server.toJSON(), "serverfiles.extract")) return "No permission to extract archives!";
                if (typeof data.path != "string") return "Path not provided or invalid";
                if (typeof data.file_name != "string") return "File name not provided or invalid";
                return await new Promise((res) => {
                    try {
                        let filePath = path.join(server.path, data.path, data.file_name);
                        if (data.file_name.endsWith(".tar.gz")) {
                            let extractPath = path.join(server.path, data.path);
                            let rstr = createReadStream(filePath);
                            let xtr = tar.extract(extractPath);
                            let gun = gunzip();
                            rstr.pipe(gun).pipe(xtr);
                            logger.log(`${client.data.auth.user?.username} is extracting archive ${data.file_name} to ${data.path} in ${server.name}`, "server.file.extract");
                            gun.on("finish", () => {
                                logger.log(`${client.data.auth.user?.username} extracted archive ${data.file_name} to ${data.path} in ${server.name}`, "server.file.extract");
                                res({ type: "extractSuccess" });
                            });
                        } else if (filePath.endsWith(".zip")) {
                            // TODO: Implement unzipping
                            res(todo(`Unzipping is not implemented for packet ${this.name}!`));
                        } else {
                            res(`Unsupported file type of file ${data.file_name}`);
                        }
                    } catch (err) {
                        res(`Failed to extract: ${err}`);
                    }
                });
                break;
        }
    }
}
