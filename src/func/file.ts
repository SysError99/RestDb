import { crypto } from "https://deno.land/std@0.170.0/crypto/mod.ts";
import { encode as base64urlEncode } from "https://deno.land/std@0.170.0/encoding/base64url.ts";
import { decode as msgpackDecode, encode as msgpackEncode } from "https://esm.sh/@msgpack/msgpack@2.8.0";
import xxhash from "https://esm.sh/xxhash-wasm@1.0.2/esm/xxhash-wasm.js";


const hasher = await xxhash();


function later(delay: number): Promise<void> {
    return new Promise(function (resolve) {
        setTimeout(resolve, delay);
    });
}


// async function convertToFilePath(urlPathname: string): Promise<string> {
//     return "./data/" + base64urlEncode(
//         await crypto.subtle.digest(
//             'SHA-1',
//             new TextEncoder().encode(urlPathname),
//         )
//     ) + ".bin";
// }


function convertToFilePath(urlPathname: string) {
    return hasher.h64ToString(urlPathname);
}


export async function deleteFile(urlPathname: string): Promise<void> {
    await Deno.remove(convertToFilePath(urlPathname));
}


export async function fileExists(urlPathname: string): Promise<boolean> {
    try {
        await Deno.stat(convertToFilePath(urlPathname));
        return true;
    } catch (e) {
        if (e instanceof Deno.errors.NotFound) {
            return false;
        }
        throw e;
    }
}


export async function readFile(urlPathname: string): Promise<unknown> {
    try {
        return msgpackDecode(
            await Deno.readFile(
                convertToFilePath(urlPathname),
            ),
        );
    } catch (e) {
        if (e.name == "RangeError") {
            await later(Math.random());
            return await readFile(urlPathname);
        }
        throw e;
    }
}


export async function writeFile(urlPathname: string, object: unknown, createIfNotExist = true, preventOverwrite = false): Promise<void> {
    await Deno.writeFile(
        convertToFilePath(urlPathname),
        msgpackEncode(object),
        {
            create: createIfNotExist,
            createNew: preventOverwrite,
        }
    );
}
