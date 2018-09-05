import { fromPouchResult } from './jsonapi'
describe('jsonapi', () => {
  it('should return a response understandable by cozy-client', () => {
    const res = {
      rows: [
        {
          id: 1,
          doc: {
            _id: 1,
            name: 'Bart'
          }
        },
        {
          id: 2,
          doc: {
            _id: 2,
            name: 'Lisa'
          }
        },
        {
          id: 3,
          doc: {
            _id: 3,
            name: 'Marge'
          }
        }
      ]
    }
    const normalized = fromPouchResult(res, true, 'io.cozy.simpsons')
    expect(normalized.data[0].name).toBe('Bart')
    expect(normalized.data[0].id).toBe(1)
    expect(normalized.data[0]._id).toBe(1)
    expect(normalized.data[0]._type).toBe('io.cozy.simpsons')

    expect(normalized.data[1].name).toBe('Lisa')
    expect(normalized.data[1].id).toBe(2)
    expect(normalized.data[1]._id).toBe(2)

    expect(normalized.data[2].name).toBe('Marge')
    expect(normalized.data[2].id).toBe(3)
    expect(normalized.data[2]._id).toBe(3)
  })
})
