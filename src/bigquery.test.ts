import { buildInsertQuery } from './bigquery'

describe('buildInsertQuery', () => {
    it('should stringify strings', () => {
        expect(buildInsertQuery('cheeses', { cheese: 'camembert' })).toBe(
            `INSERT INTO \`cheeses\` (cheese) VALUES ("camembert")`,
        )
    })
    it('should not stringify numbers', () => {
        expect(buildInsertQuery('cheeses', { quantity: 42 })).toBe(
            `INSERT INTO \`cheeses\` (quantity) VALUES (42)`,
        )
    })
    it('should not stringify booleans', () => {
        expect(buildInsertQuery('cheeses', { isGood: true })).toBe(
            `INSERT INTO \`cheeses\` (isGood) VALUES (true)`,
        )
    })
    it('should join multiple fields with comma', () => {
        expect(
            buildInsertQuery('cheeses', { name: 'camembert', quantity: 42 }),
        ).toBe(
            `INSERT INTO \`cheeses\` (name, quantity) VALUES ("camembert", 42)`,
        )
    })
    it('should treat undefined values as null value', () => {
        expect(buildInsertQuery('cheeses', { nothing: undefined })).toBe(
            `INSERT INTO \`cheeses\` (nothing) VALUES (null)`,
        )
        expect(
            buildInsertQuery('cheeses', { name: 'brie', nothing: undefined }),
        ).toBe(`INSERT INTO \`cheeses\` (name, nothing) VALUES ("brie", null)`)
    })
    it('should throw an error if no data', () => {
        expect(() => buildInsertQuery('cheeses', {})).toThrowError(/empty data/)
    })
})
