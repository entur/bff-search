#!/bin/bash
# set -e

# if [ $# -eq 0 ]; then
#     echo "Remember to specify an environment: dev, terraform, nordic-dev, staging, beta or prod"
#     exit 1
# fi

echo "Clearing any previous build files"
rm -rf typeDeclarations

echo "Compiling TypeScript"
tsc -p tsconfig.json --declaration --declarationDir "typeDeclarations"

echo "Packaging the type declarations into an archive file"
tar -czf "typeDeclarations.tar.gz" typeDeclarations/

#echo "Populating environment variables for $1"
#npm run populate-env-vars "$1"


# /*

#     echo "Uploading type declarations to bucket"
#     if [[ $ENV = "nordic-dev" ]]; then
#         PROJECT="ent-client-nordic-dev"
#     elif [[ $ENV = "terraform" ]]; then
#         PROJECT="ent-selvbet-terraform-dev"
#     else
#         PROJECT="entur-$ENV"
#     fi

#     gsutil cp typeDeclarations.tar.gz "gs://$PROJECT-bff-search-types/"
# */