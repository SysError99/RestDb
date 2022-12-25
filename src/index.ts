import { crypto } from "https://deno.land/std@0.170.0/crypto/mod.ts";
import { serve, serveTls } from "https://deno.land/std@0.165.0/http/server.ts";
import { readFile } from "./func/file.ts";
import { log } from "./func/log.ts";
import { WorkerMessage, WorkerResponse } from "./index.types.ts";


const defaultConfig = {
    password: "password",
    workers: 2,
    tlsOptions: {
        enabled: false,
        certFilePath: "",
        keyFilePath: "",
    },
};


type ConfigOptions = typeof defaultConfig;


type IoOptions = {
    createIfNotExist: boolean,
    preventOverwrite: boolean,
};


let config: ConfigOptions;


try {
    config = JSON.parse(Deno.readTextFileSync("./conf.json")) as ConfigOptions;
} catch (e) {
    if (e.name === "NotFound") {
        Deno.writeTextFileSync('./conf.json', JSON.stringify(defaultConfig, null, "\t"));
        log("Generated new config file, please shut down a server and reconfig.");
        throw 0;
    }
    throw e;
}


// function hashToNumber (str: string): number {
//     let hash = 0, i, chr;
//     if (str.length === 0) return hash;
//     for (i = 0; i < str.length; i++) {
//         chr = str.charCodeAt(i);
//         hash = ((hash << 5) - hash) + chr;
//         hash |= 0; // Convert to 32bit integer
//     }
//     return hash;
// }


async function translateArrayIndex(urlPathname: string): Promise<string> {
    if (urlPathname.includes("::")) { // Array query
        let urlPathnamePart = urlPathname.split("/");
        urlPathnamePart = urlPathnamePart.slice(1, urlPathnamePart.length);
        let query = "";
        for (let i = 0; i < urlPathnamePart.length; i++) {
            const part = urlPathnamePart[i].split("::");
            const currentPart = `/${part[0]}`;
            if (part.length === 2) {
                const index = await readFile(query + currentPart) as string[];
                const uid = index[Number(part[1])];
                urlPathnamePart[i] = part[0] + "/" + uid;
                query += `/${uid}`;
                continue;
            }
            query += currentPart;
        }
        return "/" + urlPathnamePart.join("/");
    }
    return urlPathname;
}


function getWorker() {
    return new Worker(new URL("./index.worker.ts", import.meta.url), { type: "module", });
}


const messagePromises = new Map();
const workers: Worker[] = [];
let workerIndex = 0;


for (let i = 0; i < config.workers; i++) {
    const worker = getWorker();
    worker.onmessage = (e) => {
        const wRes = e.data as WorkerResponse;
        const uid = wRes.uid ? wRes.uid : "";
        if (!uid) return;
        if (messagePromises.has(uid)) {
            // deno-lint-ignore ban-types
            const resolve = messagePromises.get(uid) as Function;
            resolve(wRes);
        }
    };
    workers.push(worker);
    workerIndex++;
}


const workersLength = workerIndex;
workerIndex = 0;


async function handler(req: Request): Promise<Response> {
    if (!req.headers.has("key")) {
        return new Response("Unauthorised.", { status: 403 });
    }
    if (req.headers.get("key") !== config.password) {
        return new Response("Unknown key.", { status: 403 });
    }
    const url = new URL(req.url);
    const pathname = await translateArrayIndex(url.pathname);
    const body = req.method !== "GET" ? await req.json() as Record<string, unknown> : {}
    const wRes: WorkerResponse = await new Promise((resolve) => {
        const uid = crypto.randomUUID();
        const message: WorkerMessage = {
            uid: uid,
            pathname: pathname,
            method: req.method,
            ql: req.headers.has("ql") ?
                req.headers.get("ql") as string
                : "",
            body: body,
        };
        messagePromises.set(uid, resolve);
        // workers[hashToNumber(workersLength)].postMessage(message);
        workers[workerIndex].postMessage(message);
        workerIndex++;
        if (workerIndex == workersLength) {
            workerIndex = 0;
        }
    });
    if (wRes.json) {
        const response = new Response(JSON.stringify(wRes.json), { status: wRes.status });
        response.headers.set("Content-Type", "application/json; charset=utf-8");
        return response;
    }
    return new Response(wRes.text, { status: wRes.status });
}


if (config.tlsOptions.enabled) {
    serveTls(handler, { certFile: config.tlsOptions.certFilePath, keyFile: config.tlsOptions.keyFilePath });
} else {
    serve(handler, { port: 5405 });
}
