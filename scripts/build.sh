# #!/bin/bash
# set -e

# if [ $# -eq 0 ]; then
#     echo "Remember to specify an environment: dev, terraform, nordic-dev, staging, beta or prod"
#     exit 1
# fi

# echo "Compiling TypeScript"
# tsc -p tsconfig.json

# echo "Populating environment variables for $1"
# npm run populate-env-vars "$1"
