import { parse, stringify } from "yaml";
import fs from "fs";

export function defaultExperiments() {
    return stringify(parse(`
        # This is the editor experiment. This will enable an editor with a lot of various features, similar
        # to an average code editor, except it's not a full code editor and is specifically for BurgerPanel.
        editor: false
    `));
}

export function getExperimentValues() {
    if (!fs.existsSync("./experiments.yml")) {
        fs.writeFileSync("./experiments.yml", defaultExperiments());
    }
    let experimentsYamlFile = fs.readFileSync("./experiments.yml");
    return parse(experimentsYamlFile.toString());
}

export default {
    defaultExperiments,
    getExperimentValues
}