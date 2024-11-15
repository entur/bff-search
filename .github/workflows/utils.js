export function calculateEnvironment(inputs) {
    if (inputs.environment) {
        return JSON.parse(inputs.environment)
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
}
