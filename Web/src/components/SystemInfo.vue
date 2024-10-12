<script setup lang="ts">
import { onUnmounted, onMounted, Ref, ref, computed, watchEffect } from 'vue';
import type { RequestResponses } from '@share/Requests';
type PacketType = RequestResponses["systemInformation"]
import { hasPermission} from '@share/Permission';
import { useUser } from '../stores/user';
import sendRequest from '../util/request';
import * as chartjs from "chart.js";
let user = useUser();
let intervalID: any = -1;
onUnmounted(() => {
    clearInterval(intervalID);
});
let info: Ref<PacketType | null> = ref() as Ref<PacketType | null>;

let chart: chartjs.Chart | null = null;

chartjs.registry.add(chartjs.LinearScale);
chartjs.registry.add(chartjs.LineController);
chartjs.registry.add(chartjs.CategoryScale);
chartjs.registry.add(chartjs.PointElement);
chartjs.registry.add(chartjs.LineElement);

async function getAndSetInfo() {
    if (typeof user.user?.username == "string") { // logged in
        if(!hasPermission(user.user, "performance.view")) return;
        info.value = await sendRequest("systemInformation");
    }
}
let perf = computed(() => info.value?.performance);
getAndSetInfo();

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
onMounted(() => {
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
        if(!user.hasPermission("performance.view")) {
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
});
</script>
<template>
    <div class="box">
        <div class="section">
            <h1>Performance</h1>
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
            <canvas id="loadChart" width="400" height="200"></canvas>
        </div>
        <div class="section">
            <h1>General Information</h1>
            <p v-if="typeof info?.general.serverAmount == 'number'">This instance is hosting {{ info.general.serverAmount }} server{{ info.general.serverAmount == 1 ? '' : 's' }}</p>
            <template v-if="typeof info?.general.clients == 'object'">
                Currently connected:
                <ul>
                    <li v-for="client of info.general.clients" style="margin-left:15px"><template v-if="typeof client?.username == 'string'">{{ client.username }}</template><template v-else><i>[Not logged in]</i></template></li>
                </ul>
            </template>
        </div>
    </div>
</template>

<style scoped>
    .box {
        display: flex;
        border: 1px #333030 solid;
        background-color: #201f1f;
        border-radius:10px;
        padding: 10px 15px;
        width: fit-content;
        margin: 0 auto;
        canvas {
            margin-top: 20px;
        }
        .section:first-of-type {
            margin-right: 20px;
            padding-right: 20px;
            border-right: 1px solid #383838;
        }
        -webkit-box-shadow: 0px 0px 25px 0px rgba(0,0,0,0.25);
        -moz-box-shadow: 0px 0px 25px 0px rgba(0,0,0,0.25);
        box-shadow: 0px 0px 25px 0px rgba(0,0,0,0.25);
    }
    h1 {
        margin-bottom: 10px;
    }
    p {
        margin-bottom: 5px;
    }
</style>
