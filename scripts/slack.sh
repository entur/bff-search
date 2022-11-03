#!/bin/bash

set -e

if [ -z "$ENTUR_DEPLOY_SLACK_WEBHOOK" ] ; then
 echo
 echo "👮‍♀️ Stop there! Could not find the Slack webhook URL. Please make sure this variable is exported:"
 echo
 echo "  ENTUR_DEPLOY_SLACK_WEBHOOK"
 echo
 exit 1
fi

ENV=$1
BRANCH="$(git symbolic-ref HEAD 2>/dev/null)" ||
BRANCH="(unnamed branch)"
BRANCH=${BRANCH##refs/heads/}

COMMIT="$(git rev-parse --short HEAD)"

if [[ $(git diff --stat) != '' ]]; then
    COMMIT_MSG="(\`$COMMIT\` DIRTY :poop:)"
else
    COMMIT_MSG="(\`$COMMIT\`)"
fi

if [[ $ENV = "prod" ]]; then
    SLACK_CHANNEL="#team-app-prodrelease"
else
    SLACK_CHANNEL="#team-app-build"
fi

curl -X POST \
    --data-urlencode "payload={\"channel\": \"$SLACK_CHANNEL\", \"username\": \"BFF Search deployed to $ENV\", \"text\": \"\`$USER\` deployed *BFF Search* to :$ENV: from branch \`$BRANCH\` $COMMIT_MSG\", \"icon_emoji\": \":mag:\"}" \
    "$ENTUR_DEPLOY_SLACK_WEBHOOK"