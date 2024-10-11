<script setup lang="ts">
import SystemInfo from '@components/SystemInfo.vue';
import titleManager from '@util/titleManager';
import Server from '@components/Server.vue';
import { useServers } from '@stores/servers';
import IconVue from '@components/Icon.vue';
import { useUser } from '@stores/user';
titleManager.setTitle("Editor");
let servers = useServers();
let user = useUser();

import { ref } from "vue";

let selected = ref("dashboard");
function select(name: string) {
    selected.value = name;
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
</script>

<template>
    <div class="editor" v-if="user.getExperiments()['editor']">
        <div class="editor-content">
            <div class="editor-sidebar">
            <p class="label">Utilities</p>
            <div :class="'server' + (selected == 'dashboard' ? ' selected' : '')" @click="select('dashboard');unmountCall();mountCall();"><div class="server-text"><IconVue name="dashboard" class="icon"/><span>Dashboard</span></div></div>
            <p class="label">Servers</p>
            <p v-if="servers.servers.length == 0" class="not-found">No servers found!</p>
                <div v-for="server of servers.servers" :class="'server' + (selected == ('server-'+server.name) ? ' selected' : '')" @click="select('server-'+server.name);unmountCall();mountCall();"><div class="server-text"><IconVue name="server" class="icon"/><span>{{ server.name }}</span></div></div>
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
                        Server {{ selected.split(/^server-/)[1] }}
                        <p>Work in progress. A lot of things will be added here!</p>
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
.editor {
    display: block;
    height: calc(100vh - 50px);
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
    height: calc(100vh - 50px);
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
    height: calc(100vh - 50px);
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
}

.editor-page-dashboard {
    display: flex;
    flex-direction: column;
    align-items: left;
    justify-content: left;
    width: 100%;
    height: calc(100% - 80px);
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
</style>

<style lang="scss">
.icon {
    margin-right: 10px;
}
.warn > .icon > * {
    --fill: #ffaa5c;
    margin-right: 5px;
}
</style>