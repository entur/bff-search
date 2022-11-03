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

if [ -z "$ENTUR_DEPLOY_SLACK_WEBHOOK" ] ; then
 echo
 echo "👮‍♀️ Stop there! Could not find the Slack webhook URL. Please make sure this variable is exported:"
 echo
 echo "$ENTUR_DEPLOY_SLACK_WEBHOOK"
 echo
 exit 1
fi

# Run transpile in a forked process
npm run transpile -- --watch &

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

