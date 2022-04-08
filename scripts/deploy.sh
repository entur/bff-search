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

function deploy {
    ENV="${1:-dev}"

    if ! [[ "$ENV" =~ ^(dev|nordic-dev|staging|prod|beta)$ ]]; then
        echo -e "🙈 Invalid ENV: $ENV\n"
        exit 1
    fi

    if [[ $ENV = "nordic-dev" ]]; then
        PROJECT="ent-client-nordic-dev"
    else
        PROJECT="entur-$ENV"
    fi

    echo " 🧵  Linting ..."
    npm run lint

    echo " 🚢 Deploying BFF Search to $ENV ..."
    npm run build $ENV && gcloud app deploy app-$ENV.yaml --project=$PROJECT --quiet

    echo " 💬 Posting message to Slack ..."
    slack_message $ENV
}

function slack_message {
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

    curl -X POST \
        --data-urlencode "payload={\"channel\": \"#team-app-build\", \"username\": \"BFF Search deployed to $ENV\", \"text\": \"\`$USER\` deployed *BFF Search* to :$ENV: from branch \`$BRANCH\` $COMMIT_MSG\", \"icon_emoji\": \":mag:\"}" \
        "$ENTUR_DEPLOY_SLACK_WEBHOOK"
}

ENV_ARGS="${@:-dev}"
for ENV_ARG in $ENV_ARGS
do
    deploy "$ENV_ARG"
done
