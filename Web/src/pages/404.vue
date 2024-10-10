<script setup lang="ts">
import { useRouter } from 'vue-router';
import titleManager from '@util/titleManager';

let router = useRouter();
titleManager.setTitle("404 Not Found");
</script>

<template>
    <div>
        <h1>Whoops! A 404 occured.</h1>
        <p>The page at <code>{{ router.currentRoute.value.path }}</code> was not found.</p>
        <RouterLink :to="{name: 'Home'}">Go home</RouterLink>
    </div>
</template>

<style scoped>
    div {
        background-color: #202020;
        border: 1px solid #383838;
        align-items: center;
        text-align: center;
        margin: auto;
        width: fit-content;
        padding: 20px;
        border-radius: 5px;
        -webkit-box-shadow: 0px 0px 25px 0px rgba(0,0,0,0.25);
        -moz-box-shadow: 0px 0px 25px 0px rgba(0,0,0,0.25);
        box-shadow: 0px 0px 25px 0px rgba(0,0,0,0.25);
    }
    h1 {
        font-size: 32px;
        margin-bottom: 20px;
    }
    p {
        font-size: 20px;
        margin-bottom: 15px;
    }
    a {
        text-decoration: none;
        font-size: 20px;
        display: flexbox;
        color: #888888;
        padding: 5px 10px;
        border-radius: 5px;
        transition: all .1s ease-in-out;
    }
    a:hover {
        background-color: #ffffff10;
    }
    code {
        background-color: #1a1919;
        border-radius: 6px;
    }
</style>
