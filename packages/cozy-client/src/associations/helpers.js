import Association from './Association'
import pick from 'lodash/pick'
import pickBy from 'lodash/pickBy'

export const pickTypeAndId = x => pick(x, '_type', '_id')
const applyHelper = (fn, objOrArr) =>
  Array.isArray(objOrArr) ? objOrArr.map(fn) : fn(objOrArr)

export const responseToRelationship = response =>
  pickBy({
    data: applyHelper(pickTypeAndId, response.data),
    meta: response.meta,
    next: response.next,
    skip: response.skip
  })
