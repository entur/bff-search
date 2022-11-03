#!/bin/bash
set -e

# Run transpile in a forked process
npm run transpile -- --watch &

ENV=${1:-dev}

# Remember to have "yq" installed. 
while read variable ; do
     export $(sed 's/ = /=/' <<< $variable)
done < <(yq -o=props '.env_variables' ./app-${ENV}.yaml)

echo $ENVIRONMENT

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

