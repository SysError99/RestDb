import { crypto } from "https://deno.land/std@0.170.0/crypto/mod.ts";
import { encode as base64urlEncode } from "https://deno.land/std@0.170.0/encoding/base64url.ts";
import { decode as msgpackDecode, encode as msgpackEncode } from "https://esm.sh/@msgpack/msgpack@2.8.0";


const pathMap = new Map();


async function convertToFilePath(urlPathname: string): Promise<string> {
    if (pathMap.has(urlPathname)) {
        return pathMap.get(urlPathname);
    }
    const p = "./data/" + base64urlEncode(
        await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(urlPathname),
        )
    ) + ".bin";
    pathMap.set(urlPathname, p);
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
