import { Request } from "../../../Share/Requests.js";
import { OurClient, Packet, ServerPacketResponse } from "../index.js";
import experiments from "../util/experiments.js";

export default class Experiment extends Packet {
    name: Request = "experiment";
    requiresAuth: boolean = true;
    async handle(client: OurClient, data: any): ServerPacketResponse<"experiment"> {
        let value = false;
        if (typeof data == "string") {
            let name = data as string;
            let values = experiments.getExperimentValues();
            if (typeof values[name] == "boolean") {
                value = values[name];
            }
        } else if (typeof data == "object" && !Array.isArray(data)) {
            if (typeof data.type == "string") {
                if (data.type == "list" || data.type == "info") {
                    if (data.type == "info") {
                        if (typeof data.name == "string") {
                            let name = data.name as string;
                            let values = experiments.getExperimentValues();
                            if (typeof values[name] == "boolean") {
                                value = values[name];
                            }
                        }
                    } else {
                        return {
                            type: "experiment",
                            name: data,
                            value: experiments.getExperimentValues()
                        }
                    }
                }
            }
        }
        return {
            type: "experiment",
            name: data,
            value: value
        }
    }
}