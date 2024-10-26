<script setup lang="ts">
import SystemInfo from '@components/SystemInfo.vue';
import titleManager from '@util/titleManager';
import ServerVue from '@components/Server.vue';
import { useServers } from '@stores/servers';
import IconVue from '@components/Icon.vue';
import { useUser } from '@stores/user';
import { Server } from '@share/Server';
import events from '@util/event';
import { confirmModal, requestModal, showInfoBox } from '@util/modal';
import Modal from '@components/Modal.vue';
import { useRouter } from 'vue-router';
import TextInput from '@components/TextInput.vue';
import TextField from '@components/TextField.vue';
import { hasServerPermission } from '@share/Permission';
import { useWS } from '@stores/ws';
let ws = useWS();
let router = useRouter();
titleManager.setTitle("Editor");
let servers = useServers();
let user = useUser();

import { ref } from "vue";

let listnr1: any = null;
let listnr2: any = null;
let listnr3: any = null;

let selected = ref("dashboard");
async function select(name: string) {
    selected.value = name;

    // Attach to server
    if (!attached.value && selected.value.startsWith("server-")) {
        let resp = await sendRequest("attachToServer", {_id: getServer(selected.value)._id}).catch(err => {
            router.push("/manage")
            return err;
        })
            server.value = resp.server;
            titleManager.setTitle(`${resp.server.name} console`)
            console.log("Attached to", resp.server.name);
            if(resp.lastLogs) logs.value = resp.lastLogs;
            attached.value = true;
            // Scroll to bottom
            setTimeout(() => { // there has to be a better way to do this, but this is what ill do and it works
            serverTextArea.value?.scrollTo(0, serverTextArea.value?.scrollHeight);
            }, 50);
            servers.statuses[getServer(selected.value)._id] = {status: resp.status}
        loadingServerFromAPI.value = false;
    }
    if (selected.value.startsWith("server-")) {
        if (listnr1) {
            listnr1 = null;
        }
        if (listnr2) {
            listnr2 = null;
        }
        if (listnr3) {
            listnr3 = null;
        }
        logs.value = [];
        unmountAborter.abort();
        listnr1 = ws.listenForEvent("serverOutput-" + getServer(selected.value)._id, (data: any) => {
            n++;
            let thisID = n;
            ignoreNextScroll.value = true;
            logs.value.push(data.data);
            if(!autoScrollInterrupted.value) serverTextArea.value?.scrollTo(0, serverTextArea.value?.scrollHeight);
            while(logs.value.length > 100) logs.value.shift();
            setTimeout(() => {
                if (thisID == n) ignoreNextScroll.value = false;
            }, 250);
        }, unmountAborter.signal);
        listnr2 = ws.listenForEvent("serverExited-" + getServer(selected.value)._id, (data: any) => {
            logs.value.push("Server exited with code " + data.code + "\n");
        }, unmountAborter.signal);
        listnr3 = ws.listenForEvent("serverErrored-" + getServer(selected.value)._id, (data: any) => {
            logs.value.push("Server errored: " + data.error + "\n");
        }, unmountAborter.signal);
    }
}

import { onUnmounted, onMounted, Ref, computed } from 'vue';
import type { RequestResponses } from '@share/Requests';
type PacketType = RequestResponses["systemInformation"]
import { hasPermission} from '@share/Permission';
import sendRequest from '../util/request';
import * as chartjs from "chart.js";
let intervalID: any = -1;
onUnmounted(() => {
    clearInterval(intervalID);
});
let info: Ref<PacketType | null> = ref() as Ref<PacketType | null>;
async function getAndSetInfo() {
    if (typeof user.user?.username == "string") { // logged in
        if(!hasPermission(user.user, "performance.view")) return;
        info.value = await sendRequest("systemInformation");
    }
}
let perf = computed(() => info.value?.performance);
getAndSetInfo();

let chart: chartjs.Chart | null = null;

chartjs.registry.add(chartjs.LinearScale);
chartjs.registry.add(chartjs.LineController);
chartjs.registry.add(chartjs.CategoryScale);
chartjs.registry.add(chartjs.PointElement);
chartjs.registry.add(chartjs.LineElement);

type chartDataType = {
    labels: String[],
    datasets: [{
        label: String,
        data: any[],
        borderColor: String,
        tension: Number
    }]
}

const chartData: chartDataType = {
    labels: [new Date().toLocaleTimeString(),new Date().toLocaleTimeString(),new Date().toLocaleTimeString(),new Date().toLocaleTimeString(),new Date().toLocaleTimeString(),new Date().toLocaleTimeString(),new Date().toLocaleTimeString(),new Date().toLocaleTimeString(),new Date().toLocaleTimeString(),new Date().toLocaleTimeString()],
    datasets: [{
        label: 'Load (1m)',
        data: [0,0,0,0,0,0,0,0,0,0],
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
    }]
};

const chartOptions = {
    responsive: true,
    animation: false,
    font: "Ubuntu Mono Regular",
    // animation: {
    //     duration: 2000,
    //     easing: 'linear'
    // },
    scales: {
        y: {
            beginAtZero: true,
            // min: 0,
            // max: 100
        }
    }
};

const updateChart = () => {
    if (chart && perf.value?.load) {
        const currentTime = new Date().toLocaleTimeString();
        chartData.labels.push(currentTime);
        chartData.datasets[0].data.push(perf.value.load[0]);

        if (chartData.labels.length > 10) {
            chartData.labels.shift();
            chartData.datasets[0].data.shift();
        }

        chart.update();
    }
};
function mountCall() {
    // FIXME: THIS IS A MASSIVE HACK, FIX THIS LATER
    setTimeout(() => {
        const ctx = document.getElementById('loadChart') as HTMLCanvasElement;
        chart = new chartjs.Chart(ctx, {
            type: 'line',
            data: chartData as any,
            options: chartOptions as any
        });
        if (ctx) {
            let context = ctx.getContext("2d") as CanvasRenderingContext2D;
            context.font = '16px Arial';
            context.fillStyle = '#888888';
            context.textAlign = 'right';
            context.fillStyle = 'rgba(0, 0, 0, 0.8)';
            context.fillRect(ctx.width - 60, 10, 45, 30);
            context.fillStyle = '#888888';
            context.fillText('Load', ctx.width - 20, 30);
        }
        intervalID = setInterval(async () => {
            if (!user.hasPermission("performance.view")) {
                info.value = null;
                return;
            }
            await getAndSetInfo();
            updateChart();
            if (ctx) {
                let context = ctx.getContext("2d") as CanvasRenderingContext2D;
                context.font = '16px Arial';
                context.fillStyle = '#888888';
                context.textAlign = 'right';
                context.fillStyle = 'rgba(0, 0, 0, 0.8)';
                context.fillRect(ctx.width - 60, 10, 45, 30);
                context.fillStyle = '#888888';
                context.fillText('Load', ctx.width - 20, 30);
            }
        }, 1000);
    }, 10);
}
function unmountCall() {
    clearInterval(intervalID);
}
onMounted(() => {
    mountCall();
});

// SERVER EDITING
let server = ref<Server | null>(null);
let serverStatuses = servers.statuses;

async function renameServer(newName: string, name: string) {
    if(newName) {
        server.value = (await sendRequest("setServerOption", {id: name, name: newName})).server;
        servers.updateServer(server.value);
        events.emit("createNotification", `Server name changed to '${newName}'`)
    }
}
async function changeMemory(newMem: string, name: string) {
    if(newMem && !isNaN(parseInt(newMem))) {
        server.value = (await sendRequest("setServerOption", {id: name, mem: parseInt(newMem)})).server;
        servers.updateServer(server.value);
        events.emit("createNotification", `Server memory changed to '${newMem}'`)
    }
}
async function changeJVMArgs(newJVMArgs: string, name: string) {
    if(typeof newJVMArgs == "string") {
        server.value = (await sendRequest("setServerOption", {id: name, jvmArgs: newJVMArgs})).server;
        servers.updateServer(server.value);
        events.emit("createNotification", `Server JVM arguments changed!`)
    }
}
async function changeVersion(newVersion: string, name: string) {
    if(newVersion) {
        server.value = (await sendRequest("setServerOption", {id: name, version: newVersion})).server;
        events.emit("createNotification", `Server version changed to '${newVersion}'`)
        servers.updateServer(server.value);
    }
}
async function changeSoftware(newSoftware: string, name: string) {
    if(newSoftware) {
        server.value = (await sendRequest("setServerOption", {id: name, software: newSoftware})).server;
        events.emit("createNotification", `Server software changed to '${newSoftware}'`)
        servers.updateServer(server.value);
    }
}
async function changePort(newPort: string, name: string) {
    if(newPort) {
        server.value = (await sendRequest("setServerOption", {id: name, port: newPort})).server;
        events.emit("createNotification", `Server port changed to '${newPort}'`)
        servers.updateServer(server.value);
    }
}
async function removeUser(user: string, name: string) {
    if(server?.value?.allowedUsers?.length == 1) return events.emit("createNotification", "You cannot remove the last user from a server. Please add another user first.");
    if(!await confirmModal("Remove access?", `Are you sure you want to remove ${user} from the server?`)) return;
    let resp = await sendRequest("setServerOption", {
        id: name,
        allowedUsers: {
            action: "remove",
            user: user
        }
    });
    servers.updateServer(resp.server);
    server.value = resp.server;
}
let showAddUserModal = ref(false);
async function addUser() {
    showAddUserModal.value = true;
}

async function addUserByID(id: string, name: string) {
    let resp = await sendRequest("setServerOption", {
        id: name,
        allowedUsers: {
            action: "add",
            user: id
        }
    })
    server.value = resp.server;
    servers.updateServer(resp.server);
}

// let notAddedUsers = computed(() => {
//     return allUsers.value.filter(u => !server.value?.allowedUsers.some(a => a.user == u._id));
// })

async function deleteServer(name: string) {
    if((await requestModal({
        title: `Delete '${server.value?.name}'?`,
        description: `Are you sure you want to delete '${server.value?.name}'?\n `,
        confirmButtonType: "CONFIRM",
        grayNo: true,
        reversedButtonColors: true,
        whiteLabels: true
    })).type == "YES") {
        await sendRequest("deleteServer", {
            id: name
        });
        await showInfoBox(`Server '${server.value?.name}' deleted.`, "For security reasons, you will need to delete the server folder manually.\nThe folder is located at " + server.value?.path + ".");
        router.push("/manage");
        if(server.value) servers.removeServerFromCache(server.value);
    }
}

async function changeAutoStart(name: string) {
    server.value = (await sendRequest("setServerOption", {
        id: name,
        autoStart: !server.value?.autoStart
    })).server;
    events.emit("createNotification", `Server auto start ${server.value.autoStart ? "enabled" : "disabled"}`);
    servers.updateServer(server.value);
}
async function changeAutoRestart(name: string) {
    server.value = (await sendRequest("setServerOption", {
        id: name,
        autoRestart: !server.value?.autoRestart
    })).server;
    events.emit("createNotification", `Server auto restart ${server.value.autoRestart ? "enabled" : "disabled"}`);
    servers.updateServer(server.value);
}
async function changeUseJVMArgs(name: string) {
    server.value = (await sendRequest("setServerOption", {
        id: name,
        useCustomJVMArgs: !server.value?.useCustomJVMArgs
    })).server;
    events.emit("createNotification", `Server custom JVM args ${server.value.useCustomJVMArgs ? "enabled" : "disabled"}`);
    servers.updateServer(server.value);
}

function getServer(selected: string): Server {
    let res = servers.servers.find(x => 'server-'+x.name == selected);
    server.value = res ?? null;
    return server.value as Server;
}

function isRunning(selected: string) {
    if (!server.value?.name) return false;
    let serverStatus = serverStatuses[server.value.name];
    if (!serverStatus) return false;
    return serverStatus.status == "running";
}

// Console widget
let showConsole = ref<boolean>(false);
function openConsole() {
    events.emit("createNotification", `You can use ESC to exit, or the close button in the top right corner!`);
    showConsole.value = true;
}

let kd_listnr: any = null;

onMounted(() => {
    kd_listnr = document.addEventListener('keydown', (e) => {
        if (e.key == 'Escape' && showConsole.value) {
            showConsole.value = false;
        }
    });
});
onUnmounted(() => {
    document.removeEventListener('keydown', kd_listnr);
});
let loadingServerFromAPI = ref(false);
let logs: Ref<String[]> = ref([]);
let attached = ref(false);
loadingServerFromAPI.value = true;
let unmountAborter = new AbortController();
let n = 0;
let autoScrollInterrupted = ref(false);
let ignoreNextScroll = ref(false);
function startServer() {
    sendRequest("startServer", {id: getServer(selected.value)._id})
    logs.value = [];
}
async function stopServer() {
    if(await confirmModal("Stop server", "Are you sure you want to stop the server? Unsaved data will be saved.", true, true, true)) await sendRequest("stopServer", {id: getServer(selected.value)._id})
}
async function killServer() {
    if(await confirmModal("Kill server", "Are you sure you want to KILL this server? All unsaved data will be GONE.", true, true, true)) await sendRequest("killServer", {id: getServer(selected.value)._id})
}
onUnmounted(() => {
    sendRequest("detachFromServer", {id: getServer(selected.value)._id});
    unmountAborter.abort();
});
let consoleInput = ref("");
function sendCommand() {
    sendRequest("writeToConsole", {
        id: getServer(selected.value)._id,
        command: consoleInput.value
    })
    consoleInput.value = "";
}
let lastScroll = ref(0);
let serverTextArea = ref(null as any as HTMLTextAreaElement);
function onScrolled() {
    if(lastScroll.value > (serverTextArea.value?.scrollTop || 0)) {
        autoScrollInterrupted.value = true;
    }
    lastScroll.value = serverTextArea.value?.scrollTop;
    if(!autoScrollInterrupted.value) serverTextArea.value?.scrollTo(0, serverTextArea.value?.scrollHeight);
    if(ignoreNextScroll.value) return;
    if(serverTextArea.value?.scrollTop + serverTextArea.value?.clientHeight >= serverTextArea.value?.scrollHeight - 10) {
        autoScrollInterrupted.value = false;
    } else {
        autoScrollInterrupted.value = true;
    }
}
</script>

<template>
    <div class="editor" v-if="user.getExperiments()['editor']">
        <div class="editor-content">
            <div class="editor-sidebar">
            <p class="label">Utilities</p>
            <div :class="'server' + (selected == 'dashboard' ? ' selected' : '')" @click="select('dashboard');unmountCall();mountCall();"><div class="server-text"><IconVue name="dashboard" class="icon"/><span>Dashboard</span></div></div>
            <p class="label">Servers</p>
            <p v-if="servers.servers.length == 0" class="not-found">No servers found!</p>
            <div v-for="server of servers.servers.slice().sort((a, b) => a.name.localeCompare(b.name))" :class="'server' + (selected == ('server-'+server.name) ? ' selected' : '')" @click="select('server-'+server.name);unmountCall();mountCall();"><div class="server-text"><IconVue name="server" class="icon"/><span>{{ server.name }}</span></div></div>
            </div>
            <div class="editor-view">
                <div class="warn"><IconVue name="warning" class="icon"/>This is EXTREMELY experimental. Expect bugs.</div>
                <div class="editor-page" v-if="selected == 'dashboard'">
                    <div class="editor-page-dashboard">
                        <h1>BurgerPanel Dashboard</h1>
                        <div class="infos">
                            <div class="system-info">
                                <h2>System information</h2>
                                <div v-if="perf != null">
                                    <p v-if="perf.load"><b>Load:</b> 1m: {{ perf?.load[0] }} 5m: {{ perf.load[1] }} 15m: {{ perf.load[2] }}</p>
                                    <p v-if="perf.platform == 'win32'">Load is unavailable since this server is hosted on Windows.</p>
                                    <p v-else-if="!user.hasPermission('performance.load')">You do not have permission to view load data.</p>
                                    <p v-if="perf.mem"><b>Server RAM:</b> {{ perf?.mem?.percentage }}%</p>
                                    <p v-else>You do not have permission to see RAM data.</p>
                                    <p v-if="perf.platform"><b>Platform:</b> {{ perf.platform }}</p>
                                    <p v-else>You do not have permission to view the platform.</p>
                                </div>
                                <div v-else-if="!user.hasPermission('performance.view')">
                                    You do not have permission to view performance data
                                </div>
                                <div v-else>
                                    Loading performance data...
                                </div>
                                <br/>
                                <p v-if="typeof info?.general.serverAmount == 'number'">This instance is hosting {{ info.general.serverAmount }} server{{ info.general.serverAmount == 1 ? '' : 's' }}</p><br/>
                                <template v-if="typeof info?.general.clients == 'object'">
                                    Currently connected:
                                    <ul>
                                        <li v-for="client of info.general.clients" style="margin-left:15px"><template v-if="typeof client?.username == 'string'">{{ client.username }}</template><template v-else><i>[Not logged in]</i></template></li>
                                    </ul>
                                </template>
                            </div>
                            <div class="system-info">
                                <canvas id="loadChart" width="400" height="200"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="editor-page" v-if="selected.startsWith('server-')">
                    <div class="editor-page-dashboard">
                        <h1><IconVue name="server"/>{{ selected.split(/^server-/)[1] }}</h1>
                        <p>This page will have a lot more things than it has now! This is highly work in progress.</p>
                        <div class="editor-page-settings">
                            <p>Server name: <TextInput :default="getServer(selected).name" @set="(a: any) => {renameServer(a, getServer(selected)._id)}" :force-disabled="!user.hasServerPermission(getServer(selected), 'set.name')" /></p>
                            <p>Server path: {{ getServer(selected).path }} (Read only)</p>
                            <p>Memory (MB): <TextInput :default="getServer(selected).mem.toString()" @set="(a: any) => {changeMemory(a, getServer(selected)._id)}" :force-disabled="!user.hasServerPermission(getServer(selected), 'set.mem')" /></p>
                            <div class="mempadder"></div>
                            <p>JVM Arguments: <TextField :default="getServer(selected).jvmArgs" @set="(a: any) => {changeJVMArgs(a, getServer(selected)._id)}" :force-disabled="!user.hasServerPermission(getServer(selected), 'set.jvmArgs')" /></p>
                            <p>Version: <TextInput :default="getServer(selected).version" @set="(a: any) => {changeVersion(a, getServer(selected)._id)}" :force-disabled="!user.hasServerPermission(getServer(selected), 'set.version') || isRunning(selected)" /><span class="red-text" v-if="isRunning(selected)">Server is running!</span></p>
                            <p>Software: <TextInput :default="getServer(selected).software" @set="(a: any) => {changeSoftware(a, getServer(selected)._id)}" :force-disabled="!user.hasServerPermission(getServer(selected), 'set.software') || isRunning(selected)" /><span class="red-text" v-if="isRunning(selected)">Server is running!</span></p>
                            <p>Port: <TextInput :default="getServer(selected).port.toString()" @set="(a: any) => {changePort(a, getServer(selected)._id)}" :force-disabled="!user.hasServerPermission(getServer(selected), 'set.port') || isRunning(selected)" /><span class="red-text" v-if="isRunning(selected)">Server is running!</span></p>
                            <div class="auto">
                            <p>Auto start: {{ getServer(selected).autoStart ? "Yes" : "No" }} <button @click="changeAutoStart(getServer(selected)._id)" :disabled="!user.hasServerPermission(getServer(selected), 'set.autostart')">Change</button></p>
                            <p>Auto restart: {{ getServer(selected).autoRestart ? "Yes" : "No" }} <button @click="changeAutoRestart(getServer(selected)._id)" :disabled="!user.hasServerPermission(getServer(selected), 'set.autorestart')">Change</button></p>
                            <p>Use Custom JVM args: {{ getServer(selected).useCustomJVMArgs ? "Yes" : "No" }} <button @click="changeUseJVMArgs(getServer(selected)._id)" :disabled="!user.hasServerPermission(getServer(selected), 'set.usejvmargs')">Change</button></p></div>
                        </div>
                        <div class="editor-page-widgets">
                            <div class="editor-page-widget" @click="openConsole">
                                <h1>Console</h1>
                                <img src="/editor-console.png" />
                            </div>
                            <a :href="'/manage/server/'+getServer(selected)._id+'/edit/files'"><div class="editor-page-widget">
                                <h1>Files</h1>
                                <img src="/editor-files.png" />
                            </div></a>
                        </div>
                        <div class="editor-page-console" v-if="showConsole">
                            <div style="float:right;cursor:pointer;" class="close" @click="showConsole = false">×</div>
                            <div v-if="server" class="console">
                                <textarea readonly ref="serverTextArea" class="console-area" @scroll="onScrolled">{{ logs.join("") }}</textarea>
                                <div class="console-input" v-if="hasServerPermission(user.user, server, 'console.write')"><input type="text" class="console-input-input" v-model="consoleInput" placeholder="Write here..." @keyup.enter="sendCommand" /><button class="console-input-button" @click="sendCommand"><span class="console-input-button-span"><IconVue name="send"/><p>Send</p></span></button></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="editor warn-notenabled" v-else>
        <p>The editor experiment isn't enabled. Ask the administrator to enable it in experiments.yml</p>
        <p>You can get this specific experiment mostly working via changing the editor value in your session storage, but any custom API endpoints for the editor will not work.</p>
    </div>
</template>

<style scoped lang="scss">
.console {
    width: 100vw;
    height: calc(100vh - 71px);
    display: flex;
    flex-direction: column;
    .console-header {
        display: block;
    }
    .console-buttons {
        display: inline-block;
        .button {
            display: inline-block;
        }
        .button button {
            border-radius: 0px;
        }
        .button:first-of-type button {
            border-radius: 5px 0px 0px 5px;
        }
        .button:last-of-type button {
            border-radius: 0px 5px 5px 0px;
        }
    }
    .console-area {
        display: flex;
        margin: 0px 20px;
        margin-top: 20px;
    }
    .console-input {
        display: flex;
        flex-direction: row;
        width: calc(100% - 40px);
        height: 40px;
        margin: 20px;
        margin-top: 0px;
        border: none;
        display: flex;
        color: white;
        input {
            border-radius: 0px 0px 0px 5px;
            background-color: #0e0e0e;
            border: 1px solid #302e2c;
            border-right: none;
            width: 100%;
        }
    }
    textarea {
        display: block;
        height: 100%;
        padding: 10px;
        margin-top: 5px;
        background-color: #0e0e0e;
        color: #e8dc8d;
        border: 1px solid #302e2c;
        border-radius: 7px 7px 0px 0px;
        border-bottom: none;
        overflow-y: scroll;
        outline: none;
        resize: none;
    }
    .console-input-button {
        display: flex;
        vertical-align: middle;
        justify-content: center;
        align-items: center;
        height: 40px;
        padding: 0px 20px;
        text-align: center;
        border: 1px solid #302e2c;
        border-left: none;
        border-radius: 0px 0px 5px 0px;
        background-color: #0e0e0e;
        color: white;
        margin-right: 0px;
    }
    .console-input-input:focus {
        background-color: #1e1e1e;
        outline: none;
    }
    .console-input-button:hover {
        background-color: #1e1e1e;
    }
    .console-input-button-span {
        /* Center the text in the button */
        display: flex;
        vertical-align: middle;
        flex-direction: row;
        p {
            margin-left: 12px;
            font-size: 16px;
        }
    }
}
.editor {
    display: block;
    height: calc(100vh - 51px);
    width: 100vw;
    background-color: #131313;
}
.editor-content {
    display: flex;
    flex-direction: row;
    vertical-align: middle;
    align-items: center;
    justify-content: center;
}
.editor-sidebar {
    display: inline-flex;
    flex-direction: column;
    background-color: #151515;
    border-right: 1px solid #282828;
    width: 300px;
    height: calc(100vh - 51px);
    overflow-y: auto;
    .not-found {
        text-align: center;
        color: #aaaaaa;
        margin-top: 10px;
        font-style: italic;
        width: 100%;
    }
}
.editor-view {
    display: inline-flex;
    vertical-align: top;
    flex-direction: column;
    width: 100%;
    height: calc(100vh - 51px);
}
.editor-page {
    display: flex;
}

.editor-page {
    display: flex;
    justify-content: center;
    align-items: center;
    vertical-align: middle;
    height: 100%;
    width: 100%;
    overflow-y: auto;
}

.editor-page-dashboard {
    display: flex;
    flex-direction: column;
    align-items: left;
    justify-content: left;
    width: 100%;
    height: calc(100% - 81px);
    margin: 20px;
    padding: 20px;
    background-color: #181818;
    border-radius: 5px;
    border: 1px solid #222222;
    h1 {
        font-weight: 400;
        font-size: 24px;
    }
    h2 {
        font-weight: 400;
        font-size: 20px;
        margin-bottom: 10px;
    }
    .infos {
        display: flex;
        flex-direction: row;
        align-items: left;
        justify-content: left;
    }
    .system-info {
        margin: 10px 0px;
        border: 1px solid #333333;
        padding: 5px 10px;
        width: fit-content;
    }
}

div.server {
    display: flex;
    flex-direction: row;
    vertical-align: middle;
    justify-content: left;
    padding: 8px 15px;
    background-color: #88888800;
    height: fit-content;
    width: calc(100% - 30px);
    cursor: pointer;
    transition: all .1s ease-in-out;
    .server-text {
        display: flex;
        width: fit-content;
        text-align: left;
    }
    &:hover {
        background-color: #88888880;
    }
    &.selected {
        background-color: #88888860;
    }
}
.warn {
    display: flex;
    width: 100%;
    padding: 10px 20px;
    background-color: #ffaa5c20;
    color: #ffaa5c;
    height: fit-content;
}
.warn-notenabled {
    display: flex;
    flex-direction: column;
    font-size: 20px;
    width: 100%;
    padding: 10px 20px;
    background-color: #ffaa5c20;
    color: #ffaa5c;
    height: fit-content;
}
.label {
    display: block;
    margin-left: 15px;
    color: #888888;
    margin-top: 10px;
    margin-bottom: 5px;
}

.editor-page-settings {
    p {
        margin-top: 5px;
    }
}

.editor-page-console {
    width: 100%;
    height: calc(100% - 51px);
    top: 51px;
    left: 0px;
    display: block;
    position: fixed;
    background-color: #00000080;
    z-index: 10;
    animation: fadeIn 0.1s ease-in-out;
    backdrop-filter: blur(0px);
    @keyframes fadeIn {
        0% {
            opacity: 0;
            backdrop-filter: blur(0px);
        }
        100% {
            opacity: 1;
            backdrop-filter: blur(10px);
        }
    }
    animation-fill-mode: forwards;
    .close {
        display: flex;
        vertical-align: middle;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        position: absolute;
        top: 0;
        right: 0;
        margin-top: 8px;
        margin-right: 8px;
        padding: 5px;
        border-radius: 5px;
        cursor: pointer;
        user-select: none;
        font-size: 32px;
        transition: all .05s ease-in-out;
        line-height: 8px;
        padding-bottom: 10px;
        &:hover {
            background-color: #282828;
        }
    }
}

.editor-page-dashboard {
    .editor-page-widgets {
        a {
            color: white;
            text-decoration: none;
        }
        display: flex;
        .editor-page-widget {
            display: flex;
            width: fit-content;
            height: fit-content;
            border-radius: 15px;
            max-width: 300px;
            margin: 10px;
            padding: 0;
            background: #1a1a1a;
            border: 1px solid #333333;
            cursor: pointer;
            transition: all 0.1s ease-in-out;
            flex-direction: column;
            position: relative;
            h1 {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                text-align: center;
                width: 100%;
                margin: 0;
                z-index: 1;
                font-size: 24px;
            }
            img {
                width: 100%;
                height: auto;
                border-radius: 15px;
            }
            &:hover {
                background: #1d1d1d;
                border-color: #444444;
            }
            img {
                filter: blur(2px);
                mask-image: linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%);
                -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%);
            }
        }
    }
}
</style>

<style lang="scss">
.icon {
    margin-right: 10px;
}
.warn > .icon > * {
    --fill: #ffaa5c;
    margin-right: 5px;
}
.editor-page-dashboard {
    h1 {
        i {
            margin-right: 10px;
        }
    }
}
</style>