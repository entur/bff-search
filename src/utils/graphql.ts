function minifiyGraphqlQuery(query: string): string {
    return encodeURIComponent(query.trim().replace(/\s+/g, ' '))
}
function minifiyGraphqlVariables(variables: { [key: string]: any }): string {
    return encodeURIComponent(JSON.stringify(variables))
}

export function buildShamashLink(host: string, query: string, variables?: { [key: string]: any }): string {
    const minifiedQuery = minifiyGraphqlQuery(query)
    let url = `${host}?query=${minifiedQuery}`

    if (variables) {
        const minifiedVariables = minifiyGraphqlVariables(variables)
        url += `&variables=${minifiedVariables}`
    }

    return url
}
