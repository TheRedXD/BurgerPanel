<script setup lang="ts">
import TextInput from '@components/TextInput.vue';
import event from '@util/event';
import sendRequest from '@util/request';
import { confirmModal } from '@util/modal';
import { useUser } from '@stores/user';

const user = useUser();

async function resetToken() {
    if (!await confirmModal("Reset your token?", "Sure? All sessions except this one will be logged out. Auto-login will break for other sessions."))
        return;
    let resp = await sendRequest("editUser", {
        id: user.user?._id,
        action: "resetToken",
    });
    if(resp?.token) localStorage.setItem("token", resp.token);
    event.emit("createNotification", "Your token has been reset!");
}

async function setUsername(newName: string) {
    await sendRequest("editUser", {
        id: user.user?._id,
        action: "changeUsername",
        username: newName
    })
    event.emit("createNotification", "Your name has been changed!");
}

async function changePassword(password: string) {
    await sendRequest("editUser", {
        id: user.user?._id,
        action: "changePassword",
        password
    })
    event.emit("createNotification", "Your password has been changed!");
} // copy pasted from usersetup
// it does that already
</script>
<template>
    <div class="container">
        <h1>Account Settings</h1>
        <p>Welcome, {{ user.user?.username || "[unknown username]" }}!</p>
        <TextInput @set="setUsername" :default="user.user?.username || ''" placeholder="Username"></TextInput>
        <br/>
        <TextInput :default="''" :password="true" @set="changePassword" placeholder="Password"></TextInput>
        <br/>
        <div class="btns"><button @click="resetToken">Reset token</button><button @click="user.logout">Logout</button></div>
    </div>
</template>

<style scoped>

h1 {
    margin-bottom: 10px;
    text-align: center;
}

p {
    margin-bottom: 10px;
}

h3 {
    margin-bottom: 10px;
    color: #b7b7b7;
}

h2 {
    margin-bottom: 10px;
}

h2, h3, .btns {
    text-align: center;
    justify-content: center;
    align-self: center;
    align-items: center;
}

.container {
    display: block;
    margin: 20px;
    padding: 20px;
    border: 1px solid #333030;
    border-radius: 10px;
    /* background-color: #201f1f; */
    background-color: #1a1a1a;
    -webkit-box-shadow: 0px 0px 25px 0px rgba(0,0,0,0.25);
    -moz-box-shadow: 0px 0px 25px 0px rgba(0,0,0,0.25);
    box-shadow: 0px 0px 25px 0px rgba(0,0,0,0.25);
}

br {
    margin: 10px;
}

button {
    margin-top: 5px;
    margin-right: 5px;
}
</style>
<style>
input {
    margin-bottom: 5px;
    border-radius: 5px;
}
</style>