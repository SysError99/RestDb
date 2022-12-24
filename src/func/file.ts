import { crypto } from "https://deno.land/std@0.170.0/crypto/mod.ts";
import { encode as base64urlEncode } from "https://deno.land/std@0.170.0/encoding/base64url.ts";
import { decode as msgpackDecode, encode as msgpackEncode } from "https://esm.sh/@msgpack/msgpack@2.8.0";


const pathMap1 = new Map();
const pathMap2 = new Map();
const pathMap3 = new Map();
const pathMap4 = new Map();
const pathMap5 = new Map();
const pathMap6 = new Map();
const pathMap7 = new Map();
const pathMap8 = new Map();
const maxPathMap = 1000000;
const maxPathMapPart = Math.floor(maxPathMap / 8);
const pathMaps = [
    pathMap1,
    pathMap2,
    pathMap3,
    pathMap4,
    pathMap5,
    pathMap6,
    pathMap7,
    pathMap8,
];
const pathMapCounts = [
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
    if (pathMap1.has(urlPathname)) {
        return pathMap1.get(urlPathname);
    }
    if (pathMap2.has(urlPathname)) {
        return pathMap2.get(urlPathname);
    }
    if (pathMap3.has(urlPathname)) {
        return pathMap3.get(urlPathname);
    }
    if (pathMap4.has(urlPathname)) {
        return pathMap4.get(urlPathname);
    }
    if (pathMap5.has(urlPathname)) {
        return pathMap5.get(urlPathname);
    }
    if (pathMap6.has(urlPathname)) {
        return pathMap6.get(urlPathname);
    }
    if (pathMap7.has(urlPathname)) {
        return pathMap7.get(urlPathname);
    }
    if (pathMap8.has(urlPathname)) {
        return pathMap8.get(urlPathname);
    }
    const p = "./data/" + base64urlEncode(
        await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(urlPathname),
        )
    ) + ".bin";
    while (true) {
        const rand = Math.floor(Math.random() * pathMaps.length);
        const pathMap = pathMaps[rand]
        if (pathMapCounts[rand] > maxPathMapPart ) {
            pathMapCounts[rand] = 0;
            pathMap.clear();
        }
        pathMap.set(urlPathname, p);
        pathMapCounts[rand]++;
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
