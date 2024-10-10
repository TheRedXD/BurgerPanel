<script setup lang="ts">
import {
    computed,
    onMounted,
    onUnmounted,
    provide,
    Ref,
    ref,
    watch,
} from "vue";
import { getActivePinia, Pinia, Store, storeToRefs } from "pinia";
import { RouteLocationNormalized, useRouter } from "vue-router";

import type { AuthS2C } from "@share/Auth";
import type { RequestResponses } from "@share/Requests";
import { User } from "@share/User";

import "./style.css";
import Navbar from "@components/Navbar.vue";
import Modal from "@components/Modal.vue";

import titleManager from "@util/titleManager";
import { apiUrl } from "@util/api";
import { showInfoBox } from "@util/modal";
import event from "@util/event";

import { useServers } from "@stores/servers";
import { useUser } from "@stores/user";
import { useWS } from "@stores/ws";

const ws = useWS();
let router = useRouter();
let events = ref(event);
ws.listenOnce("reload", () => {
    location.reload();
});
let unmountAborter = new AbortController();
ws.listenOnce("gotoURL", (data) => {
    if (data.to.startsWith("javascript:")) return;
    location.href = data.to;
});
let notifications = ref([] as string[]);
let notificationQueue: string[] = [];
function createNotification(text: string) {
    if (notifications.value.length != 0) return notificationQueue.push(text);
    notifications.value.push(text);
    setTimeout(() => {
        notifications.value = [];
        let nextNotification = notificationQueue.shift();
        if (nextNotification && nextNotification != text) {
            setTimeout(createNotification, 250, nextNotification);
        }
    }, 5000);
}
const user = useUser();
let triggerUnmountPromise: (value: unknown) => void;
let unmountPromise = new Promise((r) => (triggerUnmountPromise = r));
ws.listenForEvent("gotoURLRouter", (data) => {
    router.push(data.to);
});
let loadingPlugins = ref(false);
let afterEachList = [] as (() => void)[];
interface ExtendedPinia extends Pinia {
    _s: Map<string, Store>;
}
let pluginEssentials = {
    addAfterEach(cb: () => void) {
        afterEachList.push(cb);
    },
    currentRoute() {
        return router.currentRoute.value;
    },
    getStores() {
        let p = getActivePinia() as ExtendedPinia;
        return p._s;
    },
    getRouter() {
        return router;
    },
    ws() {
        return ws;
    },
};
ws.listenOnce("loadPlugins", async (d) => {
    loadingPlugins.value = true;
    console.time("load plugins");
    await Promise.allSettled(
        [...new Array(d.l)].map(async (_, i) => {
            let imported = await import(
                /* @vite-ignore */ apiUrl +
                    "/api/plugin/" +
                    i.toString() +
                    ".js"
            );
            new imported.default(pluginEssentials);
        }),
    );
    console.timeEnd("load plugins");
});
ws.listenForEvent("getClientState", (_data) => {
    ws.sendRequestIgnoredType("currentClientState", {
        shouldHideMainContent: shouldHideMainContent.value,
        showLoginScreen: showLoginScreen.value,
        user: user.user,
        currentRoute: router.currentRoute.value,
        hasToken:
            token.value != "" ||
            router.currentRoute.value.query.useToken ||
            (typeof localStorage.getItem("token") == "string" &&
                localStorage.getItem("token") != ""),
        location: {
            href: location.href,
            search: location.search,
            pathname: location.pathname,
        },
    });
});
ws.listenForEvent("tokenUpdated", (data) => {
    console.log(`Token updated`);
    if (data.resetToken) localStorage.removeItem("token");
    else localStorage.setItem("token", data.newToken);
});
events.value.on("createNotification", createNotification, unmountPromise);
provide("events", events);
let servers = useServers();
ws.listenForEvent(
    "serverStatusUpdate",
    (d) => {
        servers.statuses[d.server] = { status: d.status };
    },
    unmountAborter.signal,
);
let queuedPackets: any[] = [];

provide("API_URL", apiUrl);
// Connect with WS
provide("ws", ws);
let lastID = ref(null) as Ref<string | null>;

onMounted(() => {
    ws.create();
    if (
        location.protocol == "http:" &&
        !localStorage.getItem("ignore-unsecure-connection") &&
        import.meta.env.PROD
    ) {
        showInfoBox(
            "HTTP Warning",
            "You are connecting over HTTP. Traffic will not be encrypted! You are recommended to use HTTPS for the best security.\n\nYou will not be shown this warning again.",
        );
        localStorage.setItem("ignore-unsecure-connection", "1");
    }
});
onUnmounted(() => {
    triggerUnmountPromise(null); // this is so stupid
    unmountAborter.abort();
});

let token = ref("");

ws.listenForEvent(
    "logout",
    () => {
        showLoginScreen.value = true;
    },
    unmountAborter.signal,
);
let users = ref(new Map<string, User>());
provide("users", users);

let loginMsg = ref("");
const userRefs = storeToRefs(user);
watch(userRefs.failedLogin, (newVal) => {
    if (newVal) {
        showLoginScreen.value = true;
    }
});
ws.listenForEvent(
    "loginFailed",
    (data: AuthS2C) => {
        console.log("Login failed: " + data.message);
        loginMsg.value = data.message as string;
        showLoginScreen.value = true;
    },
    unmountAborter.signal,
);
ws.listenForEvent(
    "yourUserEdited",
    (newUser) => {
        user.user = newUser.user;
    },
    unmountAborter.signal,
);
let showLoginScreen = ref(false);
function gotoSetup(_currentRoute?: RouteLocationNormalized) {
    let currentRoute = _currentRoute ?? router.currentRoute.value;
    if (currentRoute.name == "userSetup") return;
    let shouldHaveCB = currentRoute.name
        ? currentRoute.name.toString() != "userSetup"
        : true;
    router.push({
        name: "userSetup",
        query: {
            cb: shouldHaveCB ? currentRoute.fullPath : undefined,
        },
    });
}
router.afterEach((guardTo, guardFrom) => {
    afterEachList.forEach((cb) => cb());
    if (guardTo.path != guardFrom.path) {
        if (
            typeof guardTo.meta.title == "string" &&
            guardTo.meta?.setTitle !== false
        )
            titleManager.setTitle(guardTo.meta.title);
        else titleManager.resetTitle();
    }
});
router.beforeEach(async (guard, fromGuard) => {
    if (guard.name != "userSetup" && user.user?.setupPending) {
        gotoSetup(guard);
        return false;
    }
    // Logs in with the token provided in the ?useToken= query
    if (guard.query.useToken) {
        console.log("Using token from query.");
        if (user.user) {
            console.log("Already logged in, ignoring token.");
            return true;
        }
        console.log("Checking if connected...");
        console.time();
        if (!ws.connected) await ws.awaitEvent("__connected");
        console.timeEnd();
        console.log("Readystate is", ws.ws?.readyState);
        console.log("Connected, logging in...");
        showLoginScreen.value = false;
        try {
            user.loginToken(guard.query.useToken as string);
        } catch {
            showLoginScreen.value = true;
        }
        console.log("Token used, removing from query.");
        router.push({
            path: guard.path,
            hash: guard.hash,
            query: { ...guard.query, useToken: undefined },
        });
        console.log("DONE");
    }
});

user.$subscribe((_, newUser) => {
    if (newUser.user?.setupPending) {
        setTimeout(() => gotoSetup(), 100); // stupid hack
    }
});
let usingTokenLogin = ref(false);
let loginUsername = ref("");
let loginPassword = ref("");
ws.listenForEvent(
    "__connected",
    async () => {
        user.resetUser();
        try {
            if (await user.autoLogin()) return;
        } catch {}
        showLoginScreen.value = true;
    },
    unmountAborter.signal,
);
let hideMainContentMsg = computed(() => {
    if (!ws.connected)
        return `Connecting to server...${ws.connectAttempt != 1 ? ` (attempt ${ws.connectAttempt})` : ""}`;
    if (
        user.user?.setupPending &&
        router.currentRoute.value.name != "userSetup"
    )
        return "Redirecting to user setup";
});
let shouldHideMainContent = computed(
    () => typeof hideMainContentMsg.value == "string",
);
async function login() {
    try {
        if (usingTokenLogin.value) await user.loginToken(token.value);
        else
            await user.loginUsernamePass(
                loginUsername.value,
                loginPassword.value,
            );
    } catch (err) {
        loginMsg.value = err + "";
    }
}
</script>

<template>
    <Navbar />
    <Modal :__is-default-modal="true" />
    <div class="login">
        <div id="login-div" v-if="shouldHideMainContent">
            {{ hideMainContentMsg }}
        </div>
        <div v-else-if="user.user">
            <RouterView v-slot="{ Component }">
                <template v-if="Component">
                    <Suspense>
                        <!-- main content -->
                        <component
                            :is="Component"
                            v-if="!shouldHideMainContent"
                        ></component>
                        <!-- loading state -->
                        <template #fallback>
                            <div id="login-div">
                                Loading '{{
                                    router.currentRoute.value.meta.title ??
                                    router.currentRoute.value.name ??
                                    router.currentRoute.value.path
                                }}'...
                            </div>
                        </template>
                    </Suspense>
                </template>
            </RouterView>
            <div class="notification" v-for="notification in notifications">
                {{ notification }}
            </div>
        </div>
        <div v-else id="login-div">
            <div class="section">
                <form @submit.prevent="login()" v-if="!user.user && showLoginScreen">
                    <h1>Login</h1>
                    <br />
                    <div v-if="usingTokenLogin">
                        <input
                            type="password"
                            placeholder="Token"
                            v-model="token"
                            class="login-token-input"
                        />
                    </div>
                    <div v-else>
                        <input
                            type="text"
                            placeholder="Username"
                            id="username"
                            v-model="loginUsername"
                        />
                        <input
                            type="password"
                            placeholder="Password"
                            id="password"
                            v-model="loginPassword"
                        />
                    </div>
                    <p v-if="loginMsg" class="loginmsg">{{ loginMsg }}</p>
                    <button type="submit">Login</button>
                    <br />
                    <a href="#" @click.prevent="usingTokenLogin = !usingTokenLogin"
                        >Log in with
                        {{
                            usingTokenLogin ? "username and password" : "token"
                        }}
                        instead</a
                    >
                </form>
                <p v-else class="logging-in">Logging in...</p>
            </div>
            <div class="section">
                <h3 class="desc-title">What is BurgerPanel?</h3>
                <p class="desc">BurgerPanel is an easy to use and setup, simple Minecraft server management panel, built by TheBlueBurger. It is built using TypeScript, Vite and Vue! Licensed under AGPLv3.</p>
            </div>
        </div>
    </div>
</template>
<style scoped lang="scss">
.desc-title {
    text-align: left;
    color: #ffffff;
    font-weight: 400;
}
.desc {
    max-width: 300px;
    text-align: left;
    margin-top: 10px;
    color: #dddddd;
    font-weight: 400;
}
.section {
    width: 100%;
    max-width: 270px;
}
.section:first-of-type {
    padding-right: 30px;
    border-right: 1px solid #3a3a3a;
    margin-right: 30px;
}
.loginmsg {
    display: block;
    width: calc(100% - 10px);
    margin: 10px 0px;
    padding: 5px;
    color: #ffaa5c;
    background-color: #ffaa5c10;
    border-radius: 5px;
}
.login {
    display: flex;
    width: 100vw;
    height: calc(100vh - 51px);
    vertical-align: middle;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background:
		  conic-gradient(at 10% 50%,#0000 75%,#181818 0),
		  conic-gradient(at 10% 50%,#0000 75%,#181818 0) calc(1*32px) calc(3*32px),
		  conic-gradient(at 10% 50%,#0000 75%,#181818 0) calc(2*32px) calc(1*32px),
		  conic-gradient(at 10% 50%,#0000 75%,#181818 0) calc(3*32px) calc(4*32px),
		  conic-gradient(at 10% 50%,#0000 75%,#181818 0) calc(4*32px) calc(2*32px),
		  conic-gradient(at 50% 10%,#0000 75%,#181818 0) 0 calc(4*32px),
		  conic-gradient(at 50% 10%,#0000 75%,#181818 0) calc(1*32px) calc(2*32px),
		  conic-gradient(at 50% 10%,#0000 75%,#181818 0) calc(2*32px) 0,
		  conic-gradient(at 50% 10%,#0000 75%,#181818 0) calc(3*32px) calc(3*32px),
		  conic-gradient(at 50% 10%,#0000 75%,#181818 0) calc(4*32px) calc(1*32px),
		  #1b1b1b;
	background-size: 160px 160px;
}
#login-div {
    display: flex;
    flex-direction: row;
    background-color: #202020;
    border: 1px solid #282828;
    margin: auto;
    width: 100%;
    max-width: fit-content;
    padding: 10px 20px;
    border-radius: 5px;
    -webkit-box-shadow: 0px 0px 25px 0px rgba(0,0,0,0.25);
    -moz-box-shadow: 0px 0px 25px 0px rgba(0,0,0,0.25);
    box-shadow: 0px 0px 25px 0px rgba(0,0,0,0.25);
    h1 {
        font-weight: 400;
        font-size: 28px;
        color: #dddddd;
    }
    input {
        display: flex;
        margin: auto;
        margin-bottom: 5px;
        padding: 8px 15px;
        border-radius: 5px;
        max-width: 250px;
        width: calc(100% - 40px);
        border: 1px solid #282828;
        outline: 1px solid transparent;
        &:focus {
            outline: 1px solid #383838;
        }
        & {
            &::-webkit-credentials-auto-fill-button {
                background-color: #303030;
            }
            &:-webkit-autofill,
            &:-webkit-autofill:hover,
            &:-webkit-autofill:focus,
            &:-webkit-autofill:active {
                -webkit-box-shadow: 0 0 0 30px #484830 inset !important;
                -webkit-text-fill-color: #fff !important;
            }
        }
    }
    button {
        color: #dddddd;
        width: calc(100% - 10px);
        padding: 8px 15px;
        border-radius: 5px;
        font-size: 16px;
        margin-bottom: 10px;
    }
    a {
        display: block;
        color: #888888;
        margin-bottom: 5px;
        transition: all .05s ease-in-out;
        &:hover {
            color: #aaaaaa;
        }
    }
    .section {
        display: block;
    }
}
</style>
