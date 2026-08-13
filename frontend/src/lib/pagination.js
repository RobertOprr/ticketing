// Returns the page numbers to render for a numbered pagination control,
// e.g. [1, '…', 4, 5, 6, '…', 10] — collapses long ranges around the
// current page instead of listing every page.
export function getPageNumbers(current, totalPages, siblingCount = 1) {
  const totalNumbers = siblingCount * 2 + 5
  if (totalPages <= totalNumbers) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const leftSibling = Math.max(current - siblingCount, 1)
  const rightSibling = Math.min(current + siblingCount, totalPages)
  const showLeftGap = leftSibling > 2
  const showRightGap = rightSibling < totalPages - 1

  const pages = [1]
  if (showLeftGap) pages.push('…')
  for (let p = Math.max(leftSibling, 2); p <= Math.min(rightSibling, totalPages - 1); p++) {
    pages.push(p)
  }
  if (showRightGap) pages.push('…')
  pages.push(totalPages)

  return pages
}
