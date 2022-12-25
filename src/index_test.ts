
import { parse } from "https://deno.land/std@0.170.0/flags/mod.ts";


let postRequestCount = 0;
let patchRequestCount = 0;
let getRequestCount = 0;
let smallGetRequestCount = 0;

const array: string[] = [];
let arrayIndex = 0;
array[1000000] = "";
let testStep = 0;


const flags = parse(Deno.args, {
    string: ["address", "concurrent", "key", "time"],
});
const concurrent = Number(flags.concurrent);
const time = Number(flags.time) * 1000.0;


const body = `{
    "email": "email@example.com",
    "nonsense": "hello",
    "nickname": "Player",
    "password": "testpassword",
    "items": {
      "money": 5,
      "gem": 1000,
      "stamina": 100
    },
    "heroes": [
      {
        "name": "John",
        "lv": "25",
        "details": {
          "portrait": "none",
          "slv": 7
        }
      },
      {
        "name": "Lisa",
        "lv": 30,
        "details": {
          "portrait": "none",
          "slv": 7
        }
      }
    ]
  }`;
const patchBody = `{
    "nickname":"NewPlayerName",
    "achievements": {
        "gold_digger": true,
        "serial_killer" :true
    },
    "heroes": [
      {
        "name": "Ben",
        "lv": "45",
        "details": {
          "portrait": "none",
          "slv": 7
        }
      },
      {
        "name": "Rook",
        "lv": 60,
        "details": {
          "portrait": "none",
          "slv": 7
        }
      },
      {
        "name": "Zoe",
        "lv": 60,
        "details": {
          "portrait": "none",
          "slv": 7
        }
      },
      {
        "name": "Allan",
        "lv": 60,
        "details": {
          "portrait": "none",
          "slv": 7
        }
      }
    ]
  }`;
const ql = `{ heroes {details}, items }`;

const headers = new Headers();
headers.set("Content-Type", "application/json; charset=utf-8");
headers.set("key", flags.key ? flags.key : "");


async function postRequest() {
    while (testStep === 0) {
        const uuid = crypto.randomUUID();
        await fetch(`${flags.address}/${uuid}`, { headers: headers, method: 'POST', body: body });
        array[postRequestCount] = uuid;
        postRequestCount++;
    }
}


async function patchRequest() {
    while (testStep === 1) {
        let uuid = array[arrayIndex];
        if (typeof uuid === "undefined") {
            console.log('Exceeded all POST requests, relooping PATCH.');
            uuid = array[0];
            arrayIndex = 0;
        }
        const res = await fetch(`${flags.address}/${uuid}`, { headers: headers, method: 'PATCH', body: patchBody });
        if (res.status != 200) {
            console.error(`${uuid} returns ${res.status}`);
        }
        patchRequestCount++;
        arrayIndex++;
    }
}


async function getRequest() {
    while (testStep === 2) {
        let uuid = array[arrayIndex];
        if (typeof uuid === "undefined") {
            console.log('Exceeded all POST requests, relooping GET.');
            uuid = array[0];
            arrayIndex = 0;
        }
        const res = await fetch(`${flags.address}/${uuid}`, { headers: headers, method: 'GET', });
        if (res.status != 200) {
          console.error(`${uuid} returns ${res.status}`);
        }
        getRequestCount++;
        arrayIndex++;
    }
}


async function smallGetRequest() {
    while (testStep === 3) {
        let uuid = array[arrayIndex];
        if (typeof uuid === "undefined") {
            console.log('Exceeded all POST requests, relooping small GET.');
            uuid = array[0];
            arrayIndex = 0;
        }
        const res = await fetch(`${flags.address}/${uuid}`, { headers: headers, method: 'GET', });
        if (res.status != 200) {
          console.error(`${uuid} returns ${res.status}`);
        }
        smallGetRequestCount++;
        arrayIndex++;
    }
}

function runTest() {
    // deno-lint-ignore ban-types
    let func: Function;
    switch (testStep) {
        case 0:
            func = postRequest;
            break;
        case 1:
            func = patchRequest;
            break;
        case 2:
            headers.set('ql', ql);
            func = getRequest;
            break;
        case 3:
            headers.delete('ql');
            func = smallGetRequest;
            break;
        default:
            console.log(`POST average: ${postRequestCount * 1000 / time} req/s`);
            console.log(`PATCH avereage: ${patchRequestCount * 1000 / time} req/s`);
            console.log(`GET average:  ${getRequestCount * 1000 / time} req/s`);
            console.log(`Small GET average: ${smallGetRequestCount * 1000 / time} req/s`);
            Deno.exit(0);
    }
    console.log(`Testing ${testStep}...`);
    for (let x = 0; x < concurrent; x++) {
        func();
    }
    setTimeout(() => {
        testStep++;
        runTest();
    }, time);
}


runTest();
