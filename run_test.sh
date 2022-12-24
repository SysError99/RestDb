#!/bin/bash
deno run --allow-run --allow-net src/index_test.ts --address=$1 --concurrent=$2 --time=$3 --key=$4
