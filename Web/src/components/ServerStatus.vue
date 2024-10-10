<script setup lang="ts">
import { computed, Ref } from 'vue';
import { useServers } from '../stores/servers';
import { ServerStatus } from '@share/Server';
let props = defineProps({
    server: {
        type: String,
        required: true
    }
});
let servers = useServers();
let status: Ref<ServerStatus> = computed(() => {
    return servers.statuses[props.server]?.status || "unknown";
});
let statusText = computed(() => {
    return status.value.charAt(0).toUpperCase() + status.value.slice(1);
})
</script>

<template>
    <span class="container">
        <span :class="{
            dot: true,
            red: status == 'stopped',
            green: status == 'running',
            yellow: (status as any == 'starting' || status == 'stopping'),
            gray: status == 'unknown'
        }">
            <span class="text"><span class="point">{{ status == 'stopped' ? "×" : ( status == 'running' ? "•" : ( (status as any == 'starting' || status == 'stopping') ? "↻" : "·" ) ) }}</span>{{ statusText }}</span>
        </span>
    </span>
</template>

<style scoped>
.dot {
    border-radius: 6px;
    display: inline-block;
    padding: 2px 8px;
    .text .point {
        margin-right: 5px;
    }
}
.green {
    background-color: #23A24Ed0;
}
.red {
    background-color: #CD4242d0;
}
.yellow {
    background-color: #DE9D3Bd0;
}
.gray {
    background-color: #737373d0;
}
.text {
    text-align: center;
    vertical-align: middle;
}
.container {
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
</style>