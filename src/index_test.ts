
import { parse } from "https://deno.land/std@0.170.0/flags/mod.ts";


let getRequestCount = 0;
let postPatchRequestCount = 0;
const array: string[] = [];
let testStep = 0;
array[1000000] = "";
let arrayIndex = 0;


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


async function postPatchRequest() {
    while (testStep === 0) {
        const uuid = crypto.randomUUID();
        await fetch(`${flags.address}/${uuid}`, { headers: headers, method: 'POST', body: body });
        fetch(`${flags.address}/${uuid}`, { headers: headers, method: 'PATCH', body: patchBody });
        array[postPatchRequestCount] = uuid;
        postPatchRequestCount++;
    }
}


async function getRequest() {
    while (testStep === 1) {
        let uuid = array[arrayIndex];
        if (typeof uuid === "undefined") {
            uuid = array[0];
            arrayIndex = 0;
        }
        await fetch(`${flags.address}/${uuid}`, { headers: headers, method: 'GET', });
        getRequestCount++;
        arrayIndex++;
    }
}

function runTest() {
    // deno-lint-ignore ban-types
    let func: Function;
    switch (testStep) {
        case 0:
            func = postPatchRequest;
            break;
        case 1:
            headers.set('ql', ql);
            func = getRequest;
            break;
        default:
            console.log(`POST+PATCH average: ${postPatchRequestCount * 1000 / time} req/s`);
            console.log(`GET average ${getRequestCount * 1000 / time} req/s`);
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
