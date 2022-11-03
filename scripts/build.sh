#!/bin/bash

echo "Clearing any previous build files"
rm -rf typeDeclarations

echo "Compiling TypeScript"
tsc -p tsconfig.json --declaration --declarationDir "typeDeclarations"

echo "Packaging the type declarations into an archive file"
tar -czf "typeDeclarations.tar.gz" typeDeclarations/