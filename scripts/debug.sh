#!/bin/bash
set -e

ENV=${1}

if [[ $ENV == '' ]]; then
 echo
 echo "✋ Remember to specify environment to run, e.g dev, staging, beta, prod or nordicdev and terraform"
 echo
 echo "ex. npm run debug staging"
 echo
 exit 1
fi

TRANSPILE_PID=$! 

# Run transpile in a forked process
npm run transpile -- --watch &

if ! command -v yq &> /dev/null
then
    echo "Remember to have 'yq' installed."
    exit
fi
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
    exit 0
}

