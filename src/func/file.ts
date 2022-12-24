import { crypto } from "https://deno.land/std@0.170.0/crypto/mod.ts";
import { encode as base64urlEncode } from "https://deno.land/std@0.170.0/encoding/base64url.ts";
import { decode as msgpackDecode, encode as msgpackEncode } from "https://esm.sh/@msgpack/msgpack@2.8.0";


const cachedPath1 = new Map();
const cachedPath2 = new Map();
const cachedPath3 = new Map();
const cachedPath4 = new Map();
const cachedPath5 = new Map();
const cachedPath6 = new Map();
const cachedPath7 = new Map();
const cachedPath8 = new Map();
const maxPathMap = 1000000;
const maxPathMapPart = Math.floor(maxPathMap / 8);
const cachedPaths = [
    cachedPath1,
    cachedPath2,
    cachedPath3,
    cachedPath4,
    cachedPath5,
    cachedPath6,
    cachedPath7,
    cachedPath8,
];
const cachedPathCounts = [
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
]


async function convertToFilePath(urlPathname: string): Promise<string> {
    if (cachedPath1.has(urlPathname)) {
        return cachedPath1.get(urlPathname);
    }
    if (cachedPath2.has(urlPathname)) {
        return cachedPath2.get(urlPathname);
    }
    if (cachedPath3.has(urlPathname)) {
        return cachedPath3.get(urlPathname);
    }
    if (cachedPath4.has(urlPathname)) {
        return cachedPath4.get(urlPathname);
    }
    if (cachedPath5.has(urlPathname)) {
        return cachedPath5.get(urlPathname);
    }
    if (cachedPath6.has(urlPathname)) {
        return cachedPath6.get(urlPathname);
    }
    if (cachedPath7.has(urlPathname)) {
        return cachedPath7.get(urlPathname);
    }
    if (cachedPath8.has(urlPathname)) {
        return cachedPath8.get(urlPathname);
    }
    const p = "./data/" + base64urlEncode(
        await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(urlPathname),
        )
    ) + ".bin";
    while (true) {
        const rand = Math.floor(Math.random() * cachedPaths.length);
        const cachedPath = cachedPaths[rand]
        if (cachedPathCounts[rand] > maxPathMapPart ) {
            cachedPathCounts[rand] = 0;
            cachedPath.clear();
        }
        cachedPath.set(urlPathname, p);
        cachedPathCounts[rand]++;
        break;
    }
    return p;
}


export async function deleteFile(urlPathname: string): Promise<void> {
    await Deno.remove(await convertToFilePath(urlPathname));
}


export async function fileExists(urlPathname: string): Promise<boolean> {
    try {
        await Deno.stat(await convertToFilePath(urlPathname));
        return true;
    } catch (e) {
        if (e instanceof Deno.errors.NotFound) {
            return false;
        }
        throw e;
    }
}


export async function readFile(urlPathname: string): Promise<unknown> {
    return msgpackDecode(
        await Deno.readFile(
            await convertToFilePath(urlPathname)
        )
    );
}


export async function writeFile(urlPathname: string, object: unknown, createIfNotExist = true, preventOverwrite = false): Promise<void> {
    await Deno.writeFile(
        await convertToFilePath(urlPathname),
        msgpackEncode(object),
        {
            create: createIfNotExist,
            createNew: preventOverwrite,
        }
    );
}
