import { describe, expect, it } from 'vitest'
import { getPageNumbers } from './pagination'

describe('getPageNumbers', () => {
  it('lists every page when the total is small', () => {
    expect(getPageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('collapses the range around the current page with ellipses', () => {
    expect(getPageNumbers(6, 10)).toEqual([1, '…', 5, 6, 7, '…', 10])
  })

  it('omits the left ellipsis when the current page is near the start', () => {
    expect(getPageNumbers(1, 10)).toEqual([1, 2, '…', 10])
  })

  it('omits the right ellipsis when the current page is near the end', () => {
    expect(getPageNumbers(10, 10)).toEqual([1, '…', 9, 10])
  })

  it('handles a single page', () => {
    expect(getPageNumbers(1, 1)).toEqual([1])
  })
})
