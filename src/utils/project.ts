import { ENVIRONMENT } from '../config'

export const getProjectId = (): string => {
    if (ENVIRONMENT === 'staging') {
        return 'ent-enturapp-tst'
    } else if (ENVIRONMENT === 'beta') {
        return 'ent-enturbeta-prd'
    } else if (ENVIRONMENT === 'prod') {
        return 'entur-prod'
    } else {
        return 'ent-enturapp-dev'
    }
}
