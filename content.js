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

		// Position popup near cursor
		popup.style.left = Math.min(x + 10, window.innerWidth - 420) + 'px'
		popup.style.top = Math.min(y + 10, window.innerHeight - 320) + 'px'

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
			} catch (e) {
				// Cross-origin restrictions prevent styling, but popup will still work
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

	// Check if link is a magic item link
	function isMagicItemLink(link) {
		return link.href && link.href.includes('/magicitems/magic-item?id=')
	}

	// Add event listeners to magic item links
	function addLinkListeners() {
		// Find all magic item links in the content rows
		const contentRows = document.querySelectorAll('.contentrow')

		contentRows.forEach((row) => {
			const link = row.querySelector('a[href*="/magicitems/magic-item?id="]')
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

				link.addEventListener('mouseleave', function () {
					if (currentHoveredLink === this) {
						hidePopup()
					}
				})

				// Update popup position on mouse move
				link.addEventListener('mousemove', function (e) {
					if (popup && popup.classList.contains('visible') && currentHoveredLink === this) {
						popup.style.left = Math.min(e.clientX + 10, window.innerWidth - 420) + 'px'
						popup.style.top = Math.min(e.clientY + 10, window.innerHeight - 320) + 'px'
					}
				})
			}
		})
	}

	// Hide popup when clicking outside or pressing escape
	document.addEventListener('click', function (e) {
		if (popup && !popup.contains(e.target) && !e.target.closest('.contentrow a')) {
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
