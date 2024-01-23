#!/bin/bash

set -e

function deploy {
    ENV="${1:-dev}"

    if ! [[ "$ENV" =~ ^(dev|staging|prod)$ ]]; then
        echo -e " 🙈 Invalid ENV: $ENV\n"
        if [[ "$ENV" == "beta" ]]; then
            echo -e " Were you trying to deploy to beta? Beta is automatically deployed together with prod\n"
        fi
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

        echo "Deploying revision $APIGEEREVISION to dev ..."
        $APIGEECLI apis deploy --name client-search --env env-dev --rev $APIGEEREVISION --ovr --org ent-apigee-shr-001 --default-token

    else
        echo
        echo "Looking up revision that is currently deployed to dev. To deploy a different version deploy it to dev first"
        APIGEEREVISION=$($APIGEECLI apis listdeploy --name client-search --org ent-apigee-shr-001 --default-token | jq '.deployments[] | select(.environment |contains("dev")) |.revision | tonumber')

        echo
        echo "The current revision in dev is $APIGEEREVISION, are you sure you want to deploy it to $ENV?"
        echo
        read -rp "Type 'yes' to confirm: " SHOULD_DEPLOY
        if [[ "$SHOULD_DEPLOY" == "yes" ]]; then
            echo
            echo "You're brave! Deploy will go ahead"
            echo
        else
            echo "Deploy aborted"
            exit
        fi

        if [[ "$ENV" == "staging" ]]; then
            echo " 📝 Deploying revision $APIGEEREVISION to Apigee stage ..."
            $APIGEECLI apis deploy --name client-search --env env-tst --rev $APIGEEREVISION --ovr --org ent-apigee-shr-001 --default-token
        elif [[ "$ENV" == "prod" ]]; then
            echo " 📝 Deploying revision $APIGEEREVISION to Apigee prod ..."
            $APIGEECLI apis deploy --name client-search --env env-prd --rev $APIGEEREVISION --ovr --org ent-apigee-shr-001 --default-token
        fi
    fi

    echo -e "\n 🎉 Revision $APIGEEREVISION successfully deployed to $ENV!"
    echo -e "\n 📋 Status: https://console.cloud.google.com/apigee/proxies/client-search/overview?project=ent-apigee-shr-001"
}

function command_exists {
    command -v $1 >/dev/null 2>&1;
}

ENV_ARGS="${@:-dev}"
for ENV_ARG in $ENV_ARGS
do
    deploy "$ENV_ARG"
done
