<script setup lang="ts">
import { Ref, ref, watch } from 'vue';
import { useServers } from '@stores/servers';
import TextInput from '@components/TextInput.vue';
import sendRequest from '@util/request';
import { ModrinthPluginResult, Plugin as MRPlugin, Version as MRVersion } from '@share/Plugin';
import Modal from '@components/Modal.vue';
import { showInfoBox } from '@util/modal';
import dompurify from "dompurify"
import { parse as markedParse } from 'marked';
import titleManager from '@util/titleManager';
function parseMDSecurely(dirtyText: string) {
    return dompurify.sanitize(markedParse(dirtyText) as string);
}
let props = defineProps({
    server: {
        type: String,
        required: true
    }
})
let servers = useServers();
let query: string = "";
let loading = ref(false);
let server = ref(await servers.getServerByID(props.server));
titleManager.setTitle("Download plugins in " + server.value.name);
let hits: Ref<ModrinthPluginResult[] | undefined> = ref();
async function search() {
    loading.value = true;
    let resp = await sendRequest("plugins", {
        type: "search",
        query,
        server: props.server
    });
    loading.value = false;
    if(resp.type != "searchResults") return;
    hits.value = resp.results;
}
search();
let viewingPlugin: Ref<string | undefined> = ref(); // slug
let viewingPluginInfo: Ref<MRPlugin | undefined> = ref();
let versions: Ref<MRVersion[] | undefined> = ref();
    async function viewPluginInfo(slug: string) {
    viewingPluginInfo.value = undefined;
    viewingPlugin.value = slug;
    versions.value = undefined;
    let resp = await sendRequest("plugins", {
        type: "details",
        slug,
        server: props.server
    });
    if(resp.type != "pluginDetails") return;
    viewingPluginInfo.value = resp.details;
}
async function getVersions(slug: string) {
    let resp = await sendRequest("plugins", {
        type: "versions",
        slug,
        server: props.server
    });
    if(resp.type != "pluginVersions") return;
    versions.value = resp.versions;
}
let showImages = ref(false);
function openModrinth(slug: string) {
    window.open("https://modrinth.com/plugin/" + slug)
}
let selectedVersion: Ref<string | undefined> = ref();
let showChangelog = ref(false);
watch(selectedVersion, () => {
    showChangelog.value = false;
});
async function downloadPlugin(version: MRVersion, hash: string, pluginName: string, filename: string) {
    viewingPlugin.value = undefined;
    await sendRequest("plugins", {
        type: "download",
        version: version.id,
        server: props.server,
        hash
    });
    showInfoBox("Install success!", `The ${server.value.software == "fabric" ? "mod" : "plugin"} ${pluginName} with version ${version.name} (${filename}) has been successfully installed to ${server.value.name}\nYou may need a server restart for the ${server.value.software == "fabric" ? "mod" : "plugin"} to be loaded.`)
}
</script>

<template>
    <div class="downloader">
        <div id="head">
            <h1>{{server.software == "fabric" ? "Mod" : "Plugin"}} downloader for: <span>{{ server.name }}</span></h1>
            <form @submit.prevent="search">
                <TextInput default="" :modal-mode="true" :initial-editing="true" @set="q => query = q" :placeholder="'Search for ' + (server.software == 'fabric' ? 'mods' : 'plugins') + '...'" />
            </form>
            <RouterLink :to="{
                name: 'editServer',
                params: {
                    server: props.server
                }
            }"><button>Back to server page</button></RouterLink>
            <h3 v-if="loading" class="loading">Loading plugins...</h3>
            <div v-if="hits?.length == 0 && !loading" class="nothing-found">
                Nothing found :&#40; If the mod is not on modrinth, you can install it manually through the <RouterLink :to="{name: 'serverFiles', params: {
                  server: props.server
                }}">Files</RouterLink> page.
                <!-- gaming -->
            </div>
        </div>
        <div class="hits">
            <div v-for="plugin of hits" class="hit" @click="viewPluginInfo(plugin.slug)" :key="plugin.project_id">
                <div :style="{display: 'flex'}">
                    <img :src="plugin.icon_url" v-if="plugin.icon_url">
                    <h2 class="plugin-title">{{ plugin.title }}</h2>
                </div>
                <p class="plugin-desc">{{ plugin.description }}</p>
            </div>
        </div>
        <br/>
        <Modal :button-type="''" v-if="viewingPlugin" @close-btn-clicked="viewingPlugin = ''" :custom-max-width="1300" :hide-scrollbar="true" class="modal">
            <div v-if="viewingPluginInfo" class="modaldata">
                <div :style="{display: 'flex'}">
                    <img :src="viewingPluginInfo.icon_url" v-if="viewingPluginInfo.icon_url">
                    <div class="plugin-modal-title" @click="openModrinth(viewingPluginInfo.slug)">
                        <h2>{{ viewingPluginInfo.title }}</h2>
                        <p style="font-size: 0.5rem;">Click to open in Modrinth</p>
                    </div>
                </div>
                <br>
                <div class="plugin-modal-content">
                    <!-- <a :href="'https://modrinth.com/plugin/' + viewingPluginInfo.slug" target="_blank" :style="{color: '#00da72'}">
                        <button>Open in Modrinth</button>
                    </a> -->
                    <pre class="plugin-modal-desc">{{ viewingPluginInfo.description }}</pre>
                    <h3 v-if="viewingPluginInfo.source_url || viewingPluginInfo.wiki_url">Links</h3>
                    <a v-if="viewingPluginInfo.source_url" :href="viewingPluginInfo.source_url" target="_blank"><p>Source Code</p></a>
                    <a v-if="viewingPluginInfo.wiki_url" :href="viewingPluginInfo.wiki_url" target="_blank"><p>Wiki</p></a>
                    <button @click="getVersions(viewingPluginInfo.slug)" v-if="!versions">Download</button>
                    <div v-if="versions" v-for="version of versions">
                        <button @click="selectedVersion == version.id ? selectedVersion = undefined : selectedVersion = version.id">{{ version.name }}</button>
                        <div class="selected-version" v-if="selectedVersion == version.id">
                            <div class="box">
                                <h3>{{ version.name }}</h3>
                                <p>Released at {{ new Date(version.date_published).toLocaleString() }}</p>
                                <br/>
                                <h4>Files</h4>
                                <div v-for="file of version.files">
                                    <button @click="downloadPlugin(version, file.hashes.sha512, viewingPluginInfo.title, file.filename)">{{ file.filename }}</button>
                                </div>
                                <button v-if="!showChangelog" @click="showChangelog = true">Show changelog</button>
                                <h2 v-if="showChangelog">Changelog</h2>
                                <div class="md-plugin-modal changelog" v-if="showChangelog" v-html="parseMDSecurely(version.changelog)"></div>
                            </div>
                            <br/>
                        </div>
                    </div>
                    <div v-html="parseMDSecurely(viewingPluginInfo.body)" class="md-plugin-modal" />
                    <br v-if="viewingPluginInfo.gallery.length != 0"/>
                    <button @click.prevent="showImages = !showImages" href="#" v-if="viewingPluginInfo.gallery.length != 0">{{ showImages ? "Hide" : "Show" }} images</button>
                    <div v-for="img of viewingPluginInfo.gallery" v-if="showImages">
                        <br>
                        <pre>{{ img.title }}</pre>
                        <img :src="img.url" class="gallery-img">
                    </div>
                </div>
            </div>
            <div v-else>
                Loading '{{ viewingPlugin }}'...
            </div>
        </Modal>
    </div>
</template>

<style scoped lang="scss">
.nothing-found {
    margin-top: 10px;
    margin-left: 5px;
}
.loading {
    margin: 10px 0px;
    font-weight: 400;
}
.downloader {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 51px);
    overflow-y: auto;
    width: calc(100vw - 40px);
}
.hits {
    overflow-y: auto;
    height: 100%;
    margin-bottom: 25px;
}
#head {
    padding: 20px;
    h1 {
        margin-bottom: 10px;
        font-weight: 400;
        span {
            color: #888888;
        }
    }
    button {
        border-radius: 5px;
        padding: 8px 15px;
        margin-top: 5px;
    }
}/*.modaldata > div > div > img {
    width: 500px;
    margin-right: 25px !important;
    margin-left: 25px !important;
    margin: 0 auto;
    display: flex;
}*/
.box {
    border:#585858 1px solid;
    padding: 10px;
    border-radius: 10px;
    max-width: fit-content;
}
.gallery-img {
    max-width:500px;
    max-height: 500px;
}
.changelog {
    margin-left: 10px;
}

.plugin-modal-title {
    display: flex;
    justify-content: center;
    flex-direction: column;
}
.plugin-modal-title:hover {
    color: rgb(146, 146, 146);
    cursor: pointer;
}

.plugin-modal-title:active {
    color: rgb(107, 107, 107);
}
.plugin-modal-desc {
    white-space: pre-line;
}

.modaldata > div > img {
    height: 50px;
    width: 50px;
    margin-right: 10px;
}
.modaldata > a {
    margin-top: 10px;
}
.modaldata > div > img {
    border-radius: 12px;
}
.modaldata::-webkit-scrollbar {
    display: none;
}
.plugin-modal-content {
    margin: 0px 20px 0px 20px;
}

.hit {
    cursor: pointer;
    width: 95vw;
    display: block;
    margin: 0 auto;
    align-items: center;
    border-radius: 10px;
    background-color: #222222;
    border: 1px solid #2a2a2a;
    margin-top: 10px;
    padding: 10px;
    transition: all .05s ease-in-out;
    &:hover {
        background-color: #282828;
    }
}

.hit > div >  h2 {
    margin-left: 10px;
}
.hit > div > img {
    width:50px;
    border-radius: 12px;
}

.plugin-title {
    display: flex;
    justify-content: center;
    align-items: center;
}

.plugin-desc {
    margin-left: 5px;
    margin-top: 10px;
}
* {
    text-decoration: none;
}
</style>
<style lang="scss">
.md-plugin-modal img {
    max-width: 500px;
    max-height: 500px;
}
.md-plugin-modal::-webkit-scrollbar {
    display: none;
}

#head {
    input {
        padding: 8px 15px;
        border-radius: 5px;
    }
}
a {
    color: #888888;
    margin-bottom: 5px;
    transition: all .05s ease-in-out;
    &:hover {
        color: #aaaaaa;
    }
}
img {
    border-radius: 5px;
    border: 1px solid #2a2a2a;
}
</style>
