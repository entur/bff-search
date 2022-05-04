#!/bin/bash

set -e

function deploy {
    ENV="${1:-dev}"

    if ! [[ "$ENV" =~ ^(dev|staging|prod)$ ]]; then
        echo -e " 🙈 Invalid ENV: $ENV\n"
        exit 1
    fi

    read -rp " 😺 Apigee user: " APIGEEUSER
    echo "🔑 Get Temporary Apigee password from url https://entur-norway.login.apigee.com/passcode  - log in with SSO"
    read -rsp " 🔑 Apigee password: " APIGEEPASSWORD

    APIGEETOKEN=$(curl -H "Content-Type: application/x-www-form-urlencoded;charset=utf-8" -H "accept: application/json;charset=utf-8" -H "Authorization: Basic ZWRnZWNsaTplZGdlY2xpc2VjcmV0" -X POST https://entur-norway.login.apigee.com/oauth/token -s -d "grant_type=password&response_type=token&passcode=${APIGEEPASSWORD}" | jq -r '.access_token')
    echo -e "Token er satt til $APIGEETOKEN"

    if ! command_exists jq; then
        echo "Brew installing jq..."
        brew install jq
    fi

    if [[ "$ENV" == "dev" ]]; then
        echo " 📝 Deploying new revision to Apigee dev ..."
        apigeetool deployproxy -V -o entur -e dev -n client-search -d api/client-search -t $APIGEETOKEN
    fi

    echo " SETTING APIGEE REVISION"
    APIGEEREVISION=apigeetool listdeployments -V -u $APIGEEUSER -t $APIGEETOKEN -o entur -n client-search -j | jq '.deployments[] | select(.environment |contains("dev")) |.revision'

    if [[ "$ENV" == "staging" ]]; then
        echo " 📝 Deploying revision $APIGEEREVISION to Apigee stage ..."
        apigeetool deployExistingRevision -V -t $APIGEETOKEN -o entur -e stage -n client-search -r $APIGEEREVISION 
    elif [[ "$ENV" == "prod" ]]; then
        echo " 📝 Deploying revision $APIGEEREVISION to Apigee prod ..."
        apigeetool deployExistingRevision -V -t $APIGEETOKEN -o entur -e prod -n client-search -r $APIGEEREVISION
    fi

    echo -e "\n 🎉 Revision $APIGEEREVISION successfully deployed to $ENV!"
    echo -e "\n 📋 Status: https://apigee.com/platform/entur/proxies/client-search/overview/$APIGEEREVISION"

    slack_message $ENV $APIGEEREVISION
}

function command_exists {
    command -v $1 >/dev/null 2>&1;
}

function slack_message {
    ENV=$1
    VERSION=$2
    BRANCH="$(git symbolic-ref HEAD 2>/dev/null)" ||
    BRANCH="(unnamed branch)"
    BRANCH=${BRANCH##refs/heads/}

    COMMIT="$(git rev-parse --short HEAD)"

    curl -X POST \
        --data-urlencode "payload={\"channel\": \"#team-app-build\", \"username\": \"BFF Search endpoints deployed to Apigee $ENV\", \"text\": \"\`$USER\` deployed version *$VERSION* of *BFF Search* endpoints to Apigee :$ENV: from branch \`$BRANCH\` (\`$COMMIT\`)\", \"icon_emoji\": \":mag:\"}" \
        https://hooks.slack.com/services/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
}

ENV_ARGS="${@:-dev}"
for ENV_ARG in $ENV_ARGS
do
    deploy "$ENV_ARG"
done
