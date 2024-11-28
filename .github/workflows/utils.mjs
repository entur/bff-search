export function calculateEnvironment(inputs) {
    if (inputs.environment) {
        return JSON.parse(inputs.environment).map((gcp) => ({
            gcp,
            gha: getGhaEnvironment(gcp),
        }))
    }

    return Object.entries({
        dev: inputs.deployToDev,
        int: inputs.deployToInt,
        staging: inputs.deployToStaging,
        beta: inputs.deployToBeta,
        prod: inputs.deployToProd,
    })
        .map(([env, include]) => (include ? env : undefined))
        .filter(Boolean)
        .map((gcp) => ({
            gcp,
            gha: getGhaEnvironment(gcp),
        }))
}

// We need to follow the platform naming convention for our GitHub environments to be able to use
// workload identity federation instead of service account keys for gcp/firebase actions. However,
// as we have five environments and platform only three, we have to map dev and prod to int and beta
// (the credentials work across the gcp environments).
function getGhaEnvironment(gcpEnvironment) {
    if (gcpEnvironment === 'dev' || gcpEnvironment === 'int') {
        return 'dev'
    } else if (gcpEnvironment === 'prod' || gcpEnvironment === 'beta') {
        return 'prd'
    } else {
        // staging
        return 'tst'
    }
}
