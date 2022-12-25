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
        const res = e.data as WorkerResponse;
        const uid = res.uid ? res.uid : "";
        if (!uid) return;
        if (messagePromises.has(uid)) {
            // deno-lint-ignore ban-types
            const resolve = messagePromises.get(uid) as Function;
            resolve(res);
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
    const res: WorkerResponse = await new Promise((resolve) => {
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
        log(req.method + " " + pathname);
        messagePromises.set(uid, resolve);
        workers[workerIndex].postMessage(message);
        workerIndex++;
        if (workerIndex == workersLength) {
            workerIndex = 0;
        }
    });
    if (res.json) {
        const response = new Response(JSON.stringify(res.json), { status: res.status });
        response.headers.set("Content-Type", "application/json; charset=utf-8");
        return response;
    }
    return new Response(res.text, { status: res.status });
}


if (config.tlsOptions.enabled) {
    serveTls(handler, { certFile: config.tlsOptions.certFilePath, keyFile: config.tlsOptions.keyFilePath });
} else {
    serve(handler, { port: 5405 });
}
