#!/bin/bash
set -e

if [ $# -eq 0 ]; then
    echo "Remember to specify an environment: dev, staging, beta or prod"
    exit 1
fi


echo "Clearing any previous build files"
rm -rf dist typeDeclarations

echo "Compiling TypeScript"
tsc

echo "Packaging the type declarations into an archive file"
tar -czf "typeDeclarations.tar.gz" typeDeclarations/

echo "Uploading type declarations to bucket"
gsutil cp typeDeclarations.tar.gz "gs://entur-replacelegtest-bff-search-types/"

echo "Populating environment variables for $1"
npm run populate-env-vars "$1"
