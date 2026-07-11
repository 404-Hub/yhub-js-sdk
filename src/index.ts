export { AuthClient } from './auth.js'
export type { AuthCredentials, AuthResult, Registration, TokenStore, YhubUser } from './auth.js'
export { YhubClient, SDK_VERSION } from './client.js'
export type { YhubClientOptions, YhubMeta } from './client.js'
export { Collection, DatabaseClient } from './db.js'
export type { ListOptions, RecordId, YhubRecord } from './db.js'
export { YhubError } from './error.js'
export { FeatureNamespace } from './feature.js'

import { YhubClient } from './client.js'

export const yhub = new YhubClient()
export default yhub
