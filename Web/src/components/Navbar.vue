<script setup lang="ts">
import { useUser } from '../stores/user';
import IconVue from './Icon.vue';
let user = useUser();
</script>

<template>
    <div id="navbar">
        <RouterLink to="/" class="no-text-dec"><div id="title-div"><div id="inner-title-div"><p id="title">Burgerpanel</p></div></div></RouterLink>
        <div v-if="user.user" class="loggedin-only">
            <span class="item link"><RouterLink to="/manage">Servers</RouterLink></span>
            <span class="item link" v-if="user.hasPermission('settings.read') || user.hasPermission('users.view')"><RouterLink to="/settings">Settings</RouterLink></span>
            <span class="item link"><RouterLink to="/about">About</RouterLink></span>
            <span class="item link" v-if="user.getExperiments()['editor']"><RouterLink to="/editor">Editor</RouterLink></span>
            <span id="user" class="item">
                <div id="inner-user">
                    <RouterLink :to="{ name: 'MyUser' }" style="color: white; text-decoration: none;">{{ user.user?.username }}</RouterLink>
                </div>
            </span>
            <button @click="user.logout" id="logout-btn"><IconVue name="logout" class="logout-btn-icon"/></button>
        </div>
    </div>
</template>

<style scoped>
    #navbar::-webkit-scrollbar {
        display: none;
    }
    #navbar {
        background-color: #1d1c1c;
        width: 100%;
        margin-top: 0;
        height: 50px;
        display: flex;
        align-items: center;
        overflow: scroll;
        scrollbar-width: none;
        border-bottom: 1px solid #232323;
    }
    #title {
        color: white;
        font-size: 30px;
        cursor: pointer;
        padding-left: 10px;
        display: block;
        position: relative;
        top: calc(50% - 15px);
    }
    #inner-title-div {
        height: 100%;
    }
    #title-div {
        display: inline-block;
        height: 50px;
    }
    .no-text-dec {
        text-decoration: none;
        color: white;
    }
    .link > * {
        color: white;
        font-size: 20px;
        padding-left: 25px;
        cursor: pointer;
        text-decoration: none;
    }
    #user {
        margin-left: auto;
        margin-right: 10px;
    }
    .loggedin-only {
        width: 100%;
        margin-top: 0;
        height: 50px;
        display: flex;
        align-items: center;
    }
    #logout-btn {
        margin-left: 1px;
        width: 50px;
        height: 50px;
        border-radius: 0px;
        border: none;
        background-color: transparent;
        &:hover {
            background-color: #4b4a4aa0;
        }
    }
    #inner-user {
        margin-left: 25px;
    }
</style>