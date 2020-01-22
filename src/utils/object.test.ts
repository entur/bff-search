import { clean } from './object'

describe('clean', () => {
    it('should not alter already clean object', () => {
        const object = {
            age: 4,
            altitude: 0,
            boo: false,
            emptyString: '',
            name: 'Boaty McBoatface',
            notMuch: null,
        }
        expect(clean(object)).toEqual(object)
    })

    it('should remove undefined fields', () => {
        expect(clean({
            age: 4,
            name: 'Boaty McBoatface',
            notMuch: null,
            undef: undefined,
        })).toEqual({
            age: 4,
            name: 'Boaty McBoatface',
            notMuch: null,
        })
    })
})
