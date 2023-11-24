#!/bin/bash

set -e

# Install
# curl -L https://raw.githubusercontent.com/apigee/apigeecli/main/downloadLatest.sh | sh -
# Download existing
# /Users/joakim/.apigeecli/bin/apigeecli apis fetch --name client-search --rev 3 --org ent-apigee-shr-001 --default-token
# Upload new revision
# /Users/joakim/.apigeecli/bin/apigeecli apis create bundle --name client-search --proxy-folder ./apiproxy --org ent-apigee-shr-001 --default-token


function deploy {
    ENV="${1:-dev}"

    if ! [[ "$ENV" =~ ^(dev|staging|prod)$ ]]; then
        echo -e " 🙈 Invalid ENV: $ENV\n"
        exit 1
    fi

    APIGEECLI=$HOME/.apigeecli/bin/apigeecli
    if ! command_exists $APIGEECLI; then
        echo "Installing apigeecli...\n"
        curl -L https://raw.githubusercontent.com/apigee/apigeecli/main/downloadLatest.sh | sh -
    fi

    if ! command_exists jq; then
        echo "Brew installing jq..."
        brew install jq
    fi

    if [[ "$ENV" == "dev" ]]; then
        echo " 📝 Uploading new revision to Apigee dev ..."
        APIGEEREVISION=$($APIGEECLI apis create bundle --name client-search --proxy-folder api/client-search/apiproxy --org ent-apigee-shr-001 --default-token | jq '.revision | tonumber')

        echo "Deploying revision $APIGEEREVISION to dev"
        $APIGEECLI apis deploy --name client-search --env env-dev --rev $APIGEEREVISION --ovr --org ent-apigee-shr-001 --default-token

    else
        echo " SETTING APIGEE REVISION"
        APIGEEREVISION=$(/Users/joakim/.apigeecli/bin/apigeecli apis listdeploy --name client-search --org ent-apigee-shr-001 --default-token | jq '.deployments[] | select(.environment |contains("dev")) |.revision | tonumber')

        if [[ "$ENV" == "staging" ]]; then
            echo " 📝 Deploying revision $APIGEEREVISION to Apigee stage ..."
            $APIGEECLI apis deploy --name client-search --env env-prd --rev $APIGEEREVISION --ovr --org ent-apigee-shr-001 --default-token
        elif [[ "$ENV" == "prod" ]]; then
            echo " 📝 Deploying revision $APIGEEREVISION to Apigee prod ..."
            $APIGEECLI apis deploy --name client-search --env env-prd --rev $APIGEEREVISION --ovr --org ent-apigee-shr-001 --default-token
        fi
    fi

    echo -e "\n 🎉 Revision $APIGEEREVISION successfully deployed to $ENV!"
    echo -e "\n 📋 Status: https://apigee.com/platform/entur/proxies/client-search/overview/$APIGEEREVISION"
}

function command_exists {
    command -v $1 >/dev/null 2>&1;
}

ENV_ARGS="${@:-dev}"
for ENV_ARG in $ENV_ARGS
do
    deploy "$ENV_ARG"
done
