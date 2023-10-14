import Websocket from "ws";
import { EventEmitter, once } from "events";
import url from 'node:url';
import path from 'node:path';
import fs from "node:fs";
import {spawn} from "node:child_process";
import getPortByName from "./getPort";
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
interface OurWebsocketClient extends WebSocket {
    json: (d) => void,
    req: (n, d) => Promise<any>
}
function searchRecursively(folder: string = __dirname) {
    let allFiles: string[] = [];
    let inCurrentFolder = fs.readdirSync(folder);
    for(let file of inCurrentFolder) {
        let statData = fs.statSync(path.join(folder, file));
        if(statData.isDirectory()) allFiles = [...allFiles, ...searchRecursively(path.join(folder, file)).map(f => `${file}/${f}`)];
        else allFiles.push(file);
    }
    return allFiles;
}
export default new class TestUtil {
    testName: string;
    port: number;
    constructor() {
        let testThing = Error().stack?.split("\n").find(a => a.includes(".test.ts"))?.split(":")[0];
        this.testName = testThing?.split("/Server/test/")[testThing?.split("/Server/test/").length-1] ?? "";
        if(this.testName == "") throw new Error("cant get test name");
        this.port = getPortByName(this.testName);
    }
    async start() {
        try {
            fs.rmdirSync(path.join(__dirname, "..", "test-context", this.port.toString()));
        } catch {}
        try {
            fs.mkdirSync(path.join(__dirname, "..", "test-context"));
        } catch {}
        fs.mkdirSync(path.join(__dirname, "..", "test-context", this.port.toString()));
        let newProcess = spawn("node", ["burgerpanel.mjs"], {
            cwd: path.join(__dirname, "..", "_build"),
            env: {
                PORT: this.port.toString(),
                DB: `json:${this.getDataPath()}`
            }
        });
        fs.writeFileSync(path.join(__dirname, "..", "test-context", this.port.toString(), "pid.txt"), (newProcess.pid ?? -1).toString());
        let timeout = setTimeout(() => {
            newProcess.kill("SIGKILL");
            console.error(`Didn't listen fast enough`);
            process.exit(1);
        }, 10_000);
        console.log(`starting ${this.testName} at port ${this.port}`)
        await new Promise((r) => {
            newProcess.stdout.on("data", m => {
                console.log(`${this.testName} | ${m.toString()}`);
                if(m.toString().includes(`port ${this.port}`)) {
                    clearTimeout(timeout);
                    r(1);
                }
            });
        });
    }
    getDataPath() {
        return path.join(__dirname, "..", "test-context", this.port.toString(), "data.json");
    }
    getData() {
        return JSON.parse(fs.readFileSync(this.getDataPath()).toString());
    }
    async getClient(authenticated: boolean = false): Promise<OurWebsocketClient> {
        let ws = new Websocket("ws://localhost:" + this.port);
        let triggerOnOpen: (value: unknown) => void = () => {};
        let onopen = new Promise((res) => triggerOnOpen = res);
        ws.addEventListener("open", () => {
            triggerOnOpen(undefined);
        });
        await onopen;
        let c = ws as any as OurWebsocketClient;
        c.json = d => c.send(JSON.stringify(d));
        let i = 0;
        let emitter = new EventEmitter();
        ws.addEventListener("message", msg => {
            let json = JSON.parse(msg.data.toString());
            if(typeof json.r == "number") {
                emitter.emit(json.r.toString(), json);
            }
        });
        c.req = (n, d) => {
            return new Promise(async (res, rej) => {
                let thisI = i++;
                c.json({
                    r: thisI,
                    n,
                    d
                });
                let [resp] = await once(emitter, thisI.toString());
                if(!resp.e) return res(resp.d);
                rej(resp.e);
            });
        }
        if(authenticated) {
            await c.req("auth", {token: this.getFullUser().token});
        }
        return c;
    }
    getFullUser() {
        return this.getData().User.find(u => u.permissions.includes("full"));
    }
    async getNewUserClient(username: string) {
        let adminClient = await this.getClient(true);
        let user = await adminClient.req("createUser", {username});
        let token = (await adminClient.req("getUserToken", {id: user.user._id}));
        let newClient = await this.getClient();
        await newClient.req("auth", {
            token: token.token
        });
        return newClient;
    }
}
