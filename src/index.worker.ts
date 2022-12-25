/// <reference lib="webworker" />
import { crypto } from "https://deno.land/std@0.170.0/crypto/mod.ts";
import { deleteFile, fileExists, readFile, writeFile } from "./func/file.ts";
import { log } from "./func/log.ts";
import { graphQlQueryToJson } from "https://esm.sh/graphql-query-to-json@2.0.1";
import { WorkerMessage, WorkerResponse } from "./index.types.ts";


declare const self: DedicatedWorkerGlobalScope;


class NotAllowedError extends Error {
}


class NotFoundError extends Error {
    path: string;
    constructor(path: string) {
        super();
        this.path = path;
    }
}


type IoOptions = {
    createIfNotExist: boolean,
    preventOverwrite: boolean,
};


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


async function handler(req: WorkerMessage): Promise<WorkerResponse> {
    const ql = req.ql ?
        (graphQlQueryToJson(req.ql) as Record<string, unknown>)["query"] as Record<string, unknown>
        : {};
    const pathname = req.pathname;
    switch (req.method) {
        case "GET":
            if (pathname === "/") {
                return {
                    status: 405,
                    text: "Illegal massive GET."
                };
            }
            try {
                return {
                    status: 200,
                    json: await readAsObject(pathname, ql) as Record<string, unknown>,
                };
            } catch (e) {
                if (e instanceof NotFoundError) {
                    return {
                        status: 404,
                        text: `'${e.path}' not found.`,
                    };
                }
                console.error(e);
            }
            break;
        case "POST":
            try {
                await writeObject(pathname, req.body, { createIfNotExist: true, preventOverwrite: true, });
                return {
                    status: 201,
                    text: "Successfully added!",
                };
            } catch (e) {
                if (e instanceof NotAllowedError) {
                    return {
                        status: 405,
                        text: "Illegal POST operation.",
                    };
                }
                console.error(e);
            }
            break;
        case "PUT":
            return {
                status: 405, 
                text: "PUT is too dangerous to be implemented.",
            };
        case "PATCH":
            try {
                await writeObject(pathname, await req.body, { createIfNotExist: false, preventOverwrite: false, });
                return {
                    status: 200,
                    text: "Successfully updated!",
                };
            } catch (e) {
                if (e instanceof NotFoundError) {
                    return {
                        status: 404,
                        text: `'${e.path}' not found.`,
                    };
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
                return {
                    status: 200,
                    text: "Successfully deleted collection!",
                };
            } catch (e) {
                if (e instanceof NotFoundError) {
                    return {
                        status: 404,
                        text: `'${e.path}' not found.`,
                    };
                }
                console.error(e);
            }
    }
    return {
        status: 500,
        text: "Internal server error.",
    }
}


self.onmessage = async (e) => {
    const req = e.data as WorkerMessage;
    const uid = req.uid;
    const res = await handler(req);
    res.uid = uid;
    self.postMessage(res);
};
