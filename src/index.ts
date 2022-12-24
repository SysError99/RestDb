import { crypto } from "https://deno.land/std@0.170.0/crypto/mod.ts";
import { serve, serveTls } from "https://deno.land/std@0.165.0/http/server.ts";
import { deleteFile, fileExists, readFile, writeFile } from "./func/file.ts";
import { log } from "./func/log.ts";
import { graphQlQueryToJson } from "https://esm.sh/graphql-query-to-json@2.0.1";


const defaultConfig = {
    password: "password",
    tlsOptions: {
        enabled: false,
        certFilePath: "",
        keyFilePath: "",      
    },
};


class NotAllowedError extends Error {
}


class NotFoundError extends Error {
    path: string;
    constructor(path: string) {
        super();
        this.path = path;
    }
}


type ConfigOptions = typeof defaultConfig;


type IoOptions = {
    createIfNotExist: boolean,
    preventOverwrite: boolean,
};


let config: ConfigOptions;

try {
    config = JSON.parse(Deno.readTextFileSync("./conf/conf.json")) as ConfigOptions;
} catch (e) {
    if (e.name === "NotFound") {
        Deno.writeTextFileSync('./config.json', JSON.stringify(defaultConfig, null, "\t"));
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


async function deleteField(urlPathname: string, ql: Record<string, unknown>): Promise<void> {
    try {
        const data = await readFile(urlPathname);
        if (Array.isArray(data)) {
            const index = data as string[];
            for (const i in index) {
                const uid = index[i];
                await deleteField(`${urlPathname}/${uid}`, ql);
            }
        } else if (typeof data === "object") {
            const object = data as Record<string, unknown>;
            for (const key in ql) {
                const keyWithSymbol = `@${key}`;
                if (typeof object[keyWithSymbol] === "object") {
                    const childQlKey = ql[key];
                    const childUrlPathname = `${urlPathname}/${key}`;
                    if (typeof childQlKey === "object") {
                        await deleteField(
                            childUrlPathname,
                            childQlKey as Record<string, unknown>
                        );
                    } else {
                        await deleteObject(childUrlPathname);
                    }
                    delete object[keyWithSymbol];
                } else {
                    delete object[key];
                }
            }
            await writeFile(urlPathname, object, false, false);
        }
    } catch (e) {
        if (e.name === "NotFound")
            throw new NotFoundError(urlPathname);
        throw e;
    }
}


async function deleteObject(urlPathname: string, startPoint = false) {
    if (startPoint) {
        const urlPathnameSplit = urlPathname.split("/");
        const deepUrlPathname = urlPathnameSplit[urlPathnameSplit.length - 1];
        if (deepUrlPathname[0] === "$") {
            if (typeof urlPathnameSplit[urlPathnameSplit.length - 2] === "string") {
                const indexUrlPathname = urlPathnameSplit.slice(0, urlPathnameSplit.length - 1).join("/");
                try {
                    const index = await readFile(indexUrlPathname) as string[];
                    await writeFile(
                        indexUrlPathname,
                        index.filter((value) => value !== deepUrlPathname),
                        false,
                        false
                    );
                } catch (e) {
                    if (e.name === "NotFound") {
                        throw new NotFoundError(indexUrlPathname);
                    }
                    console.error(e);
                }
            }
        }
    }
    try {
        const data = await readFile(urlPathname);
        if (Array.isArray(data)) {
            const index = data as string[];
            for (const i in index) {
                const uid = index[i];
                await deleteObject(`${urlPathname}/${uid}`);
            }
        } else if (typeof data === "object") {
            const object = data as Record<string, unknown>;
            for (const key in object) {
                if (typeof object[key] === "object" && key[0] === "@") {
                    await deleteObject(`${urlPathname}/${key.slice(1, key.length)}`);
                }
            }
        }
        await deleteFile(urlPathname);
    } catch (e) {
        if (e.name === "NotFound")
            throw new NotFoundError(urlPathname);
        throw e;
    }
}


async function readAsObject(urlPathname: string, ql: Record<string, unknown>): Promise<unknown | Record<string, unknown>> {
    try {
        const data = await readFile(urlPathname);
        if (Array.isArray(data)) {
            const array: unknown[] = [];
            const index = data as string[];
            for (const i in index) {
                const uid = index[i];
                array.push(await readAsObject(`${urlPathname}/${uid}`, ql));
            }
            return array;
        } else if (typeof data === "object") {
            const object = data as Record<string, unknown>;
            for (const key in ql) {
                const keyWithSymbol = `@${key}`;
                if (typeof object[keyWithSymbol] === "object") {
                    object[key] = await readAsObject(
                        `${urlPathname}/${key}`,
                        typeof ql[key] === "object" ?
                            ql[key] as Record<string, unknown>
                            : {}
                    );
                    delete object[keyWithSymbol];
                }
            }
            return object;
        } else {
            return data;
        }
    } catch (e) {
        if (e.name === "NotFound")
            throw new NotFoundError(urlPathname);
        throw e;
    }
}


async function writeObject(urlPathname: string, object: Record<string, unknown>, options: IoOptions) {
    const { createIfNotExist, preventOverwrite } = options;
    options.createIfNotExist = true;
    if (!await fileExists(urlPathname)) {
        if (!createIfNotExist) {
            throw new NotFoundError(urlPathname);
        }
    } else if (preventOverwrite) {
        throw new NotAllowedError();
    } else {
        object = { ...await readFile(urlPathname) as Record<string, unknown>, ...object };
    }
    for (const key in object) {
        if (key[0] === "@") continue;
        const ref = object[key] as unknown;
        switch (typeof ref) {
            case "object": {
                if (Array.isArray(ref)) {
                    if (typeof ref[0] === "object") { // Array of object
                        let index: string[] = [];
                        const objArray = ref as Record<string, unknown>[];
                        try {
                            index = await readFile(`${urlPathname}/${key}`) as string[];
                        } catch (e) {
                            if (e.name !== "NotFound") {
                                console.error(e);
                            }
                        }
                        objArray.forEach(async (value) => {
                            const uid = "$" + crypto.randomUUID();
                            index.push(uid);
                            try {
                                await writeObject(`${urlPathname}/${key}/${uid}`, value, options);
                            } catch (e) {
                                log(`Trying to write at '${urlPathname}/${uid}', but encoutnered an exception: ${JSON.stringify(e)}`);
                            }
                        });
                        await writeFile(`${urlPathname}/${key}`, index, true, preventOverwrite);
                        object[`@${key}`] = [];
                    }
                } else {
                    await writeObject(
                        `${urlPathname}/${key}`,
                        ref as Record<string, unknown>,
                        options,
                    );
                    object[`@${key}`] = {};
                }
                delete object[key];
            } break;
        }
    }
    await writeFile(urlPathname, object, createIfNotExist, preventOverwrite);
}


async function handler(req: Request): Promise<Response> {
    if (!req.headers.has("key")) {
        return new Response("Unauthorised.", { status: 403 });
    }
    if (req.headers.get("key") !== config.password) {
        return new Response("Unknown key.", { status: 403 });
    }
    const ql = req.headers.has("ql") ?
        (graphQlQueryToJson(req.headers.get("ql") as string) as Record<string, unknown>)["query"] as Record<string, unknown>
        : {};
    const url = new URL(req.url);
    const pathname = await translateArrayIndex(url.pathname);
    log(req.method + " " + url.pathname);
    switch (req.method) {
        case "GET":
            if (url.pathname === "/") {
                return new Response("Illegal massive GET.", { status: 405 });
            }
            try {
                const res = new Response(
                    JSON.stringify(
                        await readAsObject(pathname, ql)
                    ),
                );
                res.headers.set("Content-Type", "application/json; charset=utf-8");
                return res;
            } catch (e) {
                if (e instanceof NotFoundError) {
                    return new Response(`'${e.path}' not found.`, { status: 404 });
                }
                console.error(e);
            }
            break;
        case "POST":
            try {
                await writeObject(pathname, await req.json(), { createIfNotExist: true, preventOverwrite: true, });
                return new Response("Successfully added!", { status: 201 });
            } catch (e) {
                if (e instanceof NotAllowedError) {
                    return new Response("Illegal POST operation.", { status: 405 });
                }
                console.error(e);
            }
            break;
        case "PUT":
            return new Response("PUT is too dangerous to be implemented.", { status: 405 });
        case "PATCH":
            try {
                await writeObject(pathname, await req.json(), { createIfNotExist: false, preventOverwrite: false, });
                return new Response("Successfully updated!", { status: 200 });
            } catch (e) {
                if (e instanceof NotFoundError) {
                    return new Response(`'${e.path}' not found.`, { status: 404 });
                }
                console.error(e);
            }
            break;
        case "DELETE":
            try {
                if (Object.keys(ql).length > 0) {
                    await deleteField(pathname, ql);
                } else {
                    await deleteObject(pathname, true);
                }
                return new Response("Successfully deleted collection!");
            } catch (e) {
                if (e instanceof NotFoundError) {
                    return new Response(`'${e.path}' not found.`, { status: 404 });
                }
                console.error(e);
            }
    }
    return new Response("Internal server error.", { status: 500 });
}


if (config.tlsOptions.enabled) {
    serveTls(handler, { certFile: config.tlsOptions.certFilePath, keyFile: config.tlsOptions.keyFilePath });
} else {
    serve(handler, { port: 5405 });
}
