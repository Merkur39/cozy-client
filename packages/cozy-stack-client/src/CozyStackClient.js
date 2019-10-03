import AppCollection, { APPS_DOCTYPE } from './AppCollection'
import AppToken from './AppToken'
import DocumentCollection from './DocumentCollection'
import FileCollection from './FileCollection'
import JobCollection, { JOBS_DOCTYPE } from './JobCollection'
import KonnectorCollection, { KONNECTORS_DOCTYPE } from './KonnectorCollection'
import SharingCollection from './SharingCollection'
import PermissionCollection from './PermissionCollection'
import TriggerCollection, { TRIGGERS_DOCTYPE } from './TriggerCollection'
import getIconURL from './getIconURL'
import logDeprecate from './logDeprecate'
import errors from './errors'

const normalizeUri = uri => {
  if (uri === null) return null
  while (uri[uri.length - 1] === '/') {
    uri = uri.slice(0, -1)
  }
  return uri
}

/**
 * Main API against the `cozy-stack` server.
 */
class CozyStackClient {
  constructor(options) {
    const opts = { ...options }
    const { token, uri = '' } = opts
    this.options = opts
    this.setUri(uri)
    this.setToken(token)

    this.konnectors = new KonnectorCollection(this)
    this.jobs = new JobCollection(this)
  }

  /**
   * Creates a {@link DocumentCollection} instance.
   *
   * @param  {String} doctype The collection doctype.
   * @return {DocumentCollection}
   */
  collection(doctype) {
    if (!doctype) {
      throw new Error('CozyStackClient.collection() called without a doctype')
    }
    switch (doctype) {
      case APPS_DOCTYPE:
        return new AppCollection(this)
      case KONNECTORS_DOCTYPE:
        return new KonnectorCollection(this)
      case 'io.cozy.files':
        return new FileCollection(doctype, this)
      case 'io.cozy.sharings':
        return new SharingCollection(doctype, this)
      case 'io.cozy.permissions':
        return new PermissionCollection(doctype, this)
      case TRIGGERS_DOCTYPE:
        return new TriggerCollection(this)
      case JOBS_DOCTYPE:
        return new JobCollection(this)
      default:
        return new DocumentCollection(doctype, this)
    }
  }

  /**
   * Fetches an endpoint in an authorized way.
   *
   * @param  {String} method The HTTP method.
   * @param  {String} path The URI.
   * @param  {Object} body The payload.
   * @param  {Object} options
   * @return {Object}
   * @throws {FetchError}
   */
  async fetch(method, path, body, opts = {}) {
    const options = { ...opts }
    options.method = method
    const headers = (options.headers = { ...opts.headers })

    if (method !== 'GET' && method !== 'HEAD' && body !== undefined) {
      if (headers['Content-Type']) {
        options.body = body
      }
    }

    if (!headers.Authorization) {
      headers.Authorization = this.getAuthorizationHeader()
    }

    // the option credentials:include tells fetch to include the cookies in the
    // request even for cross-origin requests
    options.credentials = 'include'

    return fetch(this.fullpath(path), options).catch(err => {
      this.checkForRevocation(err)
      throw err
    })
  }

  checkForRevocation(err) {
    if (err.message && errors.CLIENT_NOT_FOUND.test(err.message)) {
      this.onRevocationChange(true)
    }
  }

  onRevocationChange(state) {
    if (this.options && this.options.onRevocationChange) {
      this.options.onRevocationChange(state)
    }
  }

  /**
   * Retrieves a new app token by refreshing the currently used token.
   * @throws {Error} The client should already have an access token to use this function
   * @throws {Error} The client couldn't fetch a new token
   * @returns {Promise} A promise that resolves with a new AccessToken object
   */
  async refreshToken() {
    if (!this.token) throw new Error('Cannot refresh an empty token')

    const options = {
      method: 'GET',
      credentials: 'include'
    }

    if (!global.document) {
      throw new Error('Not in a web context, cannot refresh token')
    }

    const response = await fetch('/', options)

    if (!response.ok) {
      throw new Error(
        "couldn't fetch a new token - response " + response.statusCode
      )
    }
    const html = await response.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    if (!doc) {
      throw Error("couldn't fetch a new token - doc is not html")
    }
    const appNode = doc.querySelector('div[role="application"]')
    if (!appNode) {
      throw Error("couldn't fetch a new token - no div[role=application]")
    }
    const cozyToken = appNode.dataset.cozyToken
    if (!cozyToken) {
      throw Error(
        "couldn't fetch a new token -- missing data-cozy-token attribute"
      )
    }
    const newToken = new AppToken(cozyToken)
    if (this.onTokenRefresh && typeof this.onTokenRefresh === 'function') {
      this.onTokenRefresh(newToken)
    }
    return newToken
  }

  /**
   * Fetches JSON in an authorized way.
   *
   * @param  {String} method The HTTP method.
   * @param  {String} path The URI.
   * @param  {Object} body The payload.
   * @param  {Object} options
   * @return {Object}
   * @throws {FetchError}
   */
  async fetchJSON(method, path, body, options = {}) {
    try {
      return await this.fetchJSONWithCurrentToken(method, path, body, options)
    } catch (e) {
      if (errors.EXPIRED_TOKEN.test(e.message)) {
        let token
        try {
          token = await this.refreshToken()
        } catch (refreshError) {
          throw e
        }
        this.setToken(token)
        return await this.fetchJSONWithCurrentToken(method, path, body, options)
      } else {
        throw e
      }
    }
  }

  async fetchJSONWithCurrentToken(method, path, body, options = {}) {
    const headers = (options.headers = options.headers || {})

    headers['Accept'] = 'application/json'

    if (method !== 'GET' && method !== 'HEAD' && body !== undefined) {
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json'
        body = JSON.stringify(body)
      }
    }

    const resp = await this.fetch(method, path, body, options)
    const contentType = resp.headers.get('content-type')
    const isJson = contentType && contentType.indexOf('json') >= 0
    const data = await (isJson ? resp.json() : resp.text())
    if (resp.ok) {
      return data
    }
    throw new FetchError(resp, data)
  }

  fullpath(path) {
    if (path.startsWith('http')) {
      return path
    } else {
      return this.uri + path
    }
  }

  getAuthorizationHeader() {
    return this.token ? this.token.toAuthHeader() : null
  }

  setCredentials(token) {
    logDeprecate(
      'CozyStackClient::setCredentials is deprecated, use CozyStackClient::setToken'
    )
    return this.setToken(token)
  }

  getCredentials() {
    logDeprecate(
      'CozyStackClient::getCredentials is deprecated, use CozyStackClient::getAuthorizationHeader'
    )
    return this.getAuthorizationHeader()
  }

  setToken(token) {
    this.token = token ? new AppToken(token) : null
    if (token) {
      this.onRevocationChange(false)
    }
  }

  /**
   * Get the access token string, being an oauth token or an app token
   * @return {string} token
   */
  getAccessToken() {
    return this.token && this.token.getAccessToken()
  }

  setUri(uri) {
    this.uri = normalizeUri(uri)
  }

  getIconURL(opts) {
    return getIconURL(this, opts)
  }
}

export class FetchError extends Error {
  constructor(response, reason) {
    super()
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
    // WARN We have to hardcode this because babel doesn't play nice when extending Error
    this.name = 'FetchError'
    this.response = response
    this.url = response.url
    this.status = response.status
    this.reason = reason

    Object.defineProperty(this, 'message', {
      value:
        reason.message ||
        (typeof reason === 'string' ? reason : JSON.stringify(reason))
    })
  }
}

export default CozyStackClient
