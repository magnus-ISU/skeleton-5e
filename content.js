// Magic Item Previewer Content Script
;(function () {
	'use strict'

	let popup = null
	let currentHoveredLink = null
	let popupTimeout = null

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
				console.log('Cannot style iframe content due to cross-origin restrictions')
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

	// Add event listeners to previewable links
	function addLinkListeners() {
		// Find all magic item links in the content rows
		const contentRows = document.querySelectorAll('.contentrow')
		// Find all spell links
		const spellLinks = document.querySelectorAll('.spellnamelink a[href*="/spells/spell?spellid="]')

		// Combine both sets of links
		const allLinks = [
			...Array.from(contentRows)
				.map((row) => row.querySelector('a[href*="/magicitems/magic-item?id="]'))
				.filter(Boolean),
			...Array.from(spellLinks),
		]

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
		document.addEventListener('DOMContentLoaded', addLinkListeners)
	} else {
		addLinkListeners()
	}

	// Watch for dynamically added content
	const observer = new MutationObserver(function (mutations) {
		mutations.forEach(function (mutation) {
			if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
				addLinkListeners()
			}
		})
	})

	observer.observe(document.body, {
		childList: true,
		subtree: true,
	})
})()
