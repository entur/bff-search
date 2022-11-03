#!/bin/bash
set -e

# Run transpile in a forked process
npm run transpile -- --watch &

# Remember to have "yq" installed. 
# This should have been done more dynamically
export ENVIRONMENT=$(yq e '.env_variables.ENVIRONMENT' ./app-${1:-dev}.yaml) 
export TRANSIT_HOST_OTP2=$(yq e '.env_variables.TRANSIT_HOST_OTP2' ./app-${1:-dev}.yaml) 
export PARTNER_AUDIENCE=$(yq e '.env_variables.PARTNER_AUDIENCE' ./app-${1:-dev}.yaml) 
export PARTNER_HOST=$(yq e '.env_variables.PARTNER_HOST' ./app-${1:-dev}.yaml) 

# yq -o=props '.env_variables' ./app-${1:-dev}.yaml | sed 's/ = /=/' | while read line; do
#     echo "test1"
#     export $line
# done

# echo "test1"
# echo $TRANSIT_HOST_OTP2
# echo $2
# echo "test2"


sleep 12
if [ "$2" == "--inspect" ]; then
    ./node_modules/.bin/nodemon --inspect --watch dist ./dist/server.js
else
    ./node_modules/.bin/nodemon --watch dist ./dist/server.js
fi

# # trap ctrl-c so that we can cleanup forked processes
trap onexit INT
function onexit() {
    kill -9 $TRANSPILE_PID
    kill -9 $ENVIRONMENT_PID
    exit 0
}

