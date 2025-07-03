// Magic Item Previewer Content Script with Sorting
;(function () {
	'use strict'

	let popup = null
	let currentHoveredLink = null
	let popupTimeout = null
	let sortState = {
		rarity: 'none', // 'none', 'asc', 'desc'
		price: 'none', // 'none', 'asc', 'desc'
	}

	const rarityOrder = { C: 1, U: 2, R: 3, V: 4, L: 5, A: 6 }

	// Create popup element
	function createPopup() {
		if (popup) return popup

		popup = document.createElement('div')
		popup.id = 'magic-item-popup'
		popup.innerHTML = `
            <div class="popup-header">
                <span class="popup-title">Loading...</span>
                <button class="popup-close">&times;</button>
            </div>
            <div class="popup-content">
                <iframe src="" frameborder="0"></iframe>
            </div>
        `

		document.body.appendChild(popup)

		// Add close button functionality
		popup.querySelector('.popup-close').addEventListener('click', hidePopup)

		// Hide popup when mouse leaves the popup area
		popup.addEventListener('mouseleave', function () {
			hidePopup()
		})

		return popup
	}

	// Show popup at cursor position
	function showPopup(link, x, y) {
		const popup = createPopup()
		const iframe = popup.querySelector('iframe')
		const title = popup.querySelector('.popup-title')

		// Extract item name from link text
		const itemName = link.textContent.trim()
		title.textContent = itemName

		// Set iframe source
		iframe.src = link.href

		// Position popup on the right 50% of the screen
		const popupWidth = window.innerWidth * 0.5
		const popupHeight = window.innerHeight * 0.9

		popup.style.width = popupWidth + 'px'
		popup.style.height = popupHeight + 'px'
		popup.style.left = window.innerWidth * 0.5 + 'px'
		popup.style.top = (window.innerHeight - popupHeight) / 2 + 'px'

		// Show popup
		popup.classList.add('visible')

		// Hide popup when iframe loads and add some basic styling
		iframe.addEventListener('load', function () {
			try {
				// Try to style the iframe content to remove navigation elements
				const iframeDoc = iframe.contentDocument || iframe.contentWindow.document
				const style = iframeDoc.createElement('style')
				style.textContent = `
                    .navbar, .footer, .sidebar, .breadcrumb, .nav-tabs { display: none !important; }
                    body { margin: 0; padding: 10px; }
                    .container { max-width: 100%; }
                `
				iframeDoc.head.appendChild(style)

				// Scroll to the title element
				const titleElement = iframeDoc.querySelector('.titlemain h1')
				if (titleElement) {
					titleElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
				}
			} catch (e) {
				// Cross-origin restrictions prevent styling and scrolling, but popup will still work
				console.error('Cannot access iframe content due to cross-origin restrictions:', e)
			}
		})
	}

	// Hide popup
	function hidePopup() {
		if (popup) {
			popup.classList.remove('visible')
			// Clear iframe src to stop loading
			const iframe = popup.querySelector('iframe')
			if (iframe) {
				iframe.src = ''
			}
		}
		currentHoveredLink = null
		if (popupTimeout) {
			clearTimeout(popupTimeout)
			popupTimeout = null
		}
	}

	// Check if link is a magic item or spell link
	function isPreviewableLink(link) {
		return link.href && (link.href.includes('/magicitems/magic-item?id=') || link.href.includes('/spells/spell?spellid='))
	}

	// Parse price from text (e.g., "1,000 gp" -> 1000)
	function parsePrice(priceText) {
		if (!priceText) return 0
		// Remove commas and extract number
		const match = priceText.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
		return match ? parseFloat(match[1]) : 0
	}

	// Add sort buttons to header
	function addSortButtons() {
		const headerRow = document.querySelector('.flexheadrow.row0')
		if (!headerRow || headerRow.hasAttribute('data-sort-added')) return

		headerRow.setAttribute('data-sort-added', 'true')

		// Add sort button to rarity column
		const rarityCol = headerRow.querySelector('.col2.miheadRare')
		if (rarityCol) {
			const sortBtn = document.createElement('button')
			sortBtn.className = 'sort-btn'
			sortBtn.innerHTML = '↕'
			sortBtn.title = 'Sort by rarity'
			sortBtn.addEventListener('click', () => sortByRarity())
			rarityCol.appendChild(sortBtn)
		}

		// Add sort button to value column
		const valueCol = headerRow.querySelector('.col5')
		if (valueCol) {
			const sortBtn = document.createElement('button')
			sortBtn.className = 'sort-btn'
			sortBtn.innerHTML = '↕'
			sortBtn.title = 'Sort by price'
			sortBtn.addEventListener('click', () => sortByPrice())
			valueCol.appendChild(sortBtn)
		}

		// Add CSS for sort buttons
		if (!document.getElementById('sort-button-styles')) {
			const style = document.createElement('style')
			style.id = 'sort-button-styles'
			style.textContent = `
				.sort-btn {
					background: none;
					border: none;
					color: #666;
					cursor: pointer;
					font-size: 12px;
					margin-left: 5px;
					padding: 2px 4px;
					border-radius: 3px;
					transition: all 0.2s;
				}
				.sort-btn:hover {
					background: #f0f0f0;
					color: #333;
				}
				.sort-btn.asc {
					color: #007bff;
				}
				.sort-btn.desc {
					color: #dc3545;
				}
				.sort-btn.asc::after {
					content: ' ↑';
				}
				.sort-btn.desc::after {
					content: ' ↓';
				}
			`
			document.head.appendChild(style)
		}
	}

	// Sort by rarity
	function sortByRarity() {
		const container = document.querySelector('.flexheadrow.row0').parentElement
		const rows = Array.from(container.querySelectorAll('.contentrow'))

		// Cycle through sort states
		if (sortState.rarity === 'none') {
			sortState.rarity = 'asc'
		} else if (sortState.rarity === 'asc') {
			sortState.rarity = 'desc'
		} else {
			sortState.rarity = 'none'
		}

		// Reset price sort
		sortState.price = 'none'
		updateSortButtons()

		if (sortState.rarity === 'none') {
			// Restore original order (by row class number)
			rows.sort((a, b) => {
				const aNum = parseInt(a.className.match(/row(\d+)/)?.[1] || '0')
				const bNum = parseInt(b.className.match(/row(\d+)/)?.[1] || '0')
				return aNum - bNum
			})
		} else {
			rows.sort((a, b) => {
				const aRarity =
					a
						.querySelector('.col2.flexcol.colRare')
						?.textContent?.trim()
						?.replace(/Rarity:\s*/, '') || ''
				const bRarity =
					b
						.querySelector('.col2.flexcol.colRare')
						?.textContent?.trim()
						?.replace(/Rarity:\s*/, '') || ''

				const aOrder = rarityOrder[aRarity] || 999
				const bOrder = rarityOrder[bRarity] || 999

				return sortState.rarity === 'asc' ? aOrder - bOrder : bOrder - aOrder
			})
		}

		// Reorder DOM elements
		rows.forEach((row) => container.appendChild(row))
	}

	// Sort by price
	function sortByPrice() {
		const container = document.querySelector('.flexheadrow.row0').parentElement
		const rows = Array.from(container.querySelectorAll('.contentrow'))

		// Cycle through sort states
		if (sortState.price === 'none') {
			sortState.price = 'asc'
		} else if (sortState.price === 'asc') {
			sortState.price = 'desc'
		} else {
			sortState.price = 'none'
		}

		// Reset rarity sort
		sortState.rarity = 'none'
		updateSortButtons()

		if (sortState.price === 'none') {
			// Restore original order (by row class number)
			rows.sort((a, b) => {
				const aNum = parseInt(a.className.match(/row(\d+)/)?.[1] || '0')
				const bNum = parseInt(b.className.match(/row(\d+)/)?.[1] || '0')
				return aNum - bNum
			})
		} else {
			rows.sort((a, b) => {
				const aPriceText =
					a
						.querySelector('.col5.flexcol.colmod')
						?.textContent?.trim()
						?.replace(/Value:\s*/, '') || '0'
				const bPriceText =
					b
						.querySelector('.col5.flexcol.colmod')
						?.textContent?.trim()
						?.replace(/Value:\s*/, '') || '0'

				const aPrice = parsePrice(aPriceText)
				const bPrice = parsePrice(bPriceText)

				return sortState.price === 'asc' ? aPrice - bPrice : bPrice - aPrice
			})
		}

		// Reorder DOM elements
		rows.forEach((row) => container.appendChild(row))
	}

	// Update sort button appearances
	function updateSortButtons() {
		const rarityBtn = document.querySelector('.col2.miheadRare .sort-btn')
		const priceBtn = document.querySelector('.col5 .sort-btn')

		if (rarityBtn) {
			rarityBtn.className = 'sort-btn ' + (sortState.rarity === 'none' ? '' : sortState.rarity)
		}
		if (priceBtn) {
			priceBtn.className = 'sort-btn ' + (sortState.price === 'none' ? '' : sortState.price)
		}
	}

	// Add event listeners to previewable links
	function addLinkListeners() {
		// Find all magic item links in the content rows
		const magicItemLinks = document.querySelectorAll('.contentrow a[href*="/magicitems/magic-item?id="]')

		// Find all spell links in spell name divs
		const spellLinks = document.querySelectorAll('.spellnamelink a[href*="/spells/spell?spellid="]')

		// Combine both sets of links
		const allLinks = [...magicItemLinks, ...spellLinks]

		allLinks.forEach((link) => {
			if (link && !link.hasAttribute('data-popup-listener')) {
				link.setAttribute('data-popup-listener', 'true')

				link.addEventListener('mouseenter', function (e) {
					currentHoveredLink = this
					// Small delay to prevent popup from showing on quick mouse movements
					popupTimeout = setTimeout(() => {
						if (currentHoveredLink === this) {
							showPopup(this, e.clientX, e.clientY)
						}
					}, 300)
				})

				// Don't hide popup when leaving the link - let the popup handle it
				link.addEventListener('mouseleave', function (e) {
					// Check if mouse is moving toward the popup
					if (popup && popup.classList.contains('visible')) {
						// Give a small delay to allow mouse to reach popup
						setTimeout(() => {
							if (popup && !popup.matches(':hover')) {
								hidePopup()
							}
						}, 100)
					} else {
						hidePopup()
					}
				})
			}
		})
	}

	// Initialize sorting functionality
	function initializeSorting() {
		addSortButtons()
		addLinkListeners()
	}

	// Hide popup when clicking outside or pressing escape
	document.addEventListener('click', function (e) {
		if (popup && !popup.contains(e.target) && !e.target.closest('.contentrow a, .spellnamelink a')) {
			hidePopup()
		}
	})

	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape') {
			hidePopup()
		}
	})

	// Initialize when page loads
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initializeSorting)
	} else {
		initializeSorting()
	}

	// Watch for dynamically added content
	const observer = new MutationObserver(function (mutations) {
		mutations.forEach(function (mutation) {
			if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
				initializeSorting()
			}
		})
	})

	observer.observe(document.body, {
		childList: true,
		subtree: true,
	})
})()
