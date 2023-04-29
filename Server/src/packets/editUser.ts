import { OurClient, Packet, clients } from "../index.js";
import { makeToken, users } from "../db.js";
import { hasPermission, isValidPermissionString, Permission } from "../../../Share/Permission.js";
import filterUserData from "../util/filterUserData.js";
import { User } from "../../../Share/User.js";
import logger, { LogLevel } from "../logger.js";
import makeHash from "../util/makeHash.js";

export default class EditUser extends Packet {
    name: string = "editUser";
    requiresAuth: boolean = true;
    permission: Permission = "users.view"; // each action will require a different perm
    async handle(client: OurClient, data: any) {
        let action = data.action;
        if (!data.id) return; // it sends it as user, should be .id
        let user = await users.findById(data.id).exec();
        if(!user) return;
        switch (action) {
            case "setPermission":
                if (!hasPermission(client.data.auth.user, "users.permissions.write")) {
                    client.json({
                        success: false,
                        emitEvent: true,
                        emits: ["editUser-" + data.id],
                        message: "No permission to use that action!"
                    });
                    // illegal!!!!
                    return;
                }
                let permission = data.permission; //Gonna make frontend not allow you to edit perms you dont have access to
                let value = data.value;
                if (!isValidPermissionString(permission)) return; // crab

                // make sure that the user has access to give that permission, otherwise they can give other users full access lol
                if (!hasPermission(client.data.auth.user, permission)) {
                    client.json({
                        success: false,
                        emitEvent: true,
                        emits: ["editUser-" + data.id],
                        message: "No permission to give that permission!"
                    });
                    return;
                }
                if(typeof value != "boolean" || typeof permission != "string") return;
                if (value && permission) {
                    await logger.log(`${client.data.auth.user?.username} is giving the permission ${permission} to ${user.username}`, "user.permission.change", LogLevel.WARNING)
                    if (!user?.permissions.includes(permission)) {
                        // Add the permission
                        user?.permissions.push(permission);

                        client.json({ success: true, emitEvent: true, emits: ["editUser-" + data.id], user: filterUserData(user?.toJSON()) });
                    } else {
                        client.json({
                            success: false,
                            emitEvent: true,
                            emits: ["editUser-" + data.id],
                            message: "User has this permission already!"
                        });
                    }
                } else if (!value && permission) {
                    await logger.log(`${client.data.auth.user?.username} is removing the permission ${permission} from ${user.username}`, "user.permission.change", LogLevel.WARNING)
                    if (!user?.permissions.includes(permission)) {
                        client.json({
                            success: false,
                            emitEvent: true,
                            emits: ["editUser-" + data.id],
                            message: "User does not have this permission!!"
                        });
                    } else {
                        user.permissions = user.permissions.filter(perm => perm != permission);
                        client.json({ success: true, emitEvent: true, emits: ["editUser-" + data.id], user: filterUserData(user?.toJSON()) });
                    }
                }
                this.sendUserUpdated(user.toJSON());
                break;
            case "changePassword":
                if(client.data.auth.user?._id != user._id.toHexString() && !hasPermission(client.data.auth.user, "users.password.change")) {
                    client.json({
                        success: false,
                        emitEvent: true,
                        emits: ["editUser-" + data.id],
                        message: "You do not have permission to edit this user's password"
                    });
                    return;
                }
                let newPassword = data.password;
                if(typeof newPassword != "string") return;
                if(newPassword.length < 6) {
                    client.json({
                        success: false,
                        emitEvent: true,
                        emits: ["editUser-" + data.id],
                        message: "Too insecure!"
                    });
                    return;
                }
                let hashedPassword = makeHash(newPassword);
                if(hashedPassword == user.password) {
                    client.json({
                        success: false,
                        emitEvent: true,
                        emits: ["editUser-" + data.id],
                        message: "That is already the password!"
                    });
                    return;
                }
                logger.log(`${client.data.auth.user?.username} is changing the password of ${user.username}!`, "user.password.changed", LogLevel.INFO);
                user.password = hashedPassword;
                await user.save();
                client.json({
                    success: true,
                    emitEvent: true,
                    emits: ["editUser-" + data.id],
                    message: "Password has been set!"
                });
                this.sendUserUpdated(user.toJSON());
                break;
            case "changeUsername":
                if (user._id.toString() != client.data.auth.user?._id && !hasPermission(client.data.auth.user, "users.username.change"))
                    return client.json({ // should emitEvent be by default do u think its almsot always used
                        // TODO: do that
                        success: false,
                        emitEvent: true,
                        emits: ["editUser-" + data.id],
                        message: "You do not have permission to edit the username!" //Its impossible to edit someone else through the official client
                    });
                    
                    if (typeof data.username != "string")
                        return;
                    
                    logger.log(`${client.data.auth.user?.username} is changing the username of ${user.username} to ${data.username}!`, "user.username.changed", LogLevel.INFO);
                    
                    user.username = data.username;
                    await user.save();
                    
                    this.sendUserUpdated(user.toJSON());
                    client.json({
                        success: true,
                        emitEvent: true,
                        emits: ["editUser-" + data.id],
                        message: "Username changed!"
                    });
                break;
            case "finishSetup":
                if (user._id.toHexString() != client.data.auth.user?._id)
                    return;
                
                if (!user.setupPending)
                    return;
                    
                if (typeof client.data.auth.user?.password != "string") {
                    client.json({
                        success: false,
                        emitEvent: true,
                        emits: ["editUser-" + data.id],
                        message: "Set a password first!"
                    });
                    return;
                }
                user.setupPending = false;
                user.save();
                logger.log(`${client.data.auth.user?.username} finished setup!`, "user.username.changed", LogLevel.INFO);
                this.sendUserUpdated(user.toJSON());
                client.json({
                    success: true,
                    emitEvent: true,
                    emits: ["editUser-" + data.id],
                    message: "Setup finished!"
                });
                break;
            
            case "resetToken":
                if (client.data.auth.user?._id != user._id.toHexString() && !hasPermission(client.data.auth.user, "users.token.reset")) return;
                logger.log(`${client.data.auth.user?.username} is resetting the token of ${user.username}`, "user.token.reset")
                user.token = makeToken();
                await user.save();
                //Ig brb eat
                // brb eat too lol
                clients.filter(c => c.data.auth.user?._id == client.data.auth.user?._id).forEach(cl => {
                    if(cl != client) cl.close();
                });
                client.json({
                    success: true,
                    emitEvent: true,
                    emits: ["editUser-" + data.id],
                    newToken: user.token
                });
                break;

        }
        user?.save();
    }
    sendUserUpdated(user: User | undefined) {
        if(!user) return;
        user._id = user._id.toString();
        clients.forEach(c => {
            if (c.data.auth.user?._id == user._id) {
                c.data.auth.user = user; // i think i know whats happening but what!?!? ill attach my debugger
                c.json({
                    type: "yourUserEdited",
                    user: user,
                    emitEvent: true
                });
            }
        });
    }
}