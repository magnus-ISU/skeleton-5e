// Magic Item Previewer Content Script with Sorting and URL Shop List Editing
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

	// Shop list management
	let shopList = {
		excluded: new Set(), // Set of item IDs to exclude
		priceOverrides: new Map(), // Map of item ID to custom price
		customItems: new Map(), // Map of custom item ID to item data
	}

	// Immediately parse any shop list data present in the current URL so the page reflects it from the very start
	parseShopListFromURL()

	// URL parameter handling
	function parseShopListFromURL() {
		const urlParams = new URLSearchParams(window.location.search)

		// Parse excluded items
		const excluded = urlParams.get('excluded')
		if (excluded) {
			shopList.excluded = new Set(excluded.split(',').filter((id) => id.trim()))
		}

		// Parse price overrides
		const prices = urlParams.get('prices')
		if (prices) {
			prices.split(',').forEach((pair) => {
				const [id, price] = pair.split(':')
				if (id && price) {
					shopList.priceOverrides.set(id.trim(), price.trim())
				}
			})
		}

		// Parse custom items
		const custom = urlParams.get('custom')
		if (custom) {
			try {
				const customData = JSON.parse(decodeURIComponent(custom))
				shopList.customItems = new Map(Object.entries(customData))
			} catch (e) {
				console.error('Error parsing custom items:', e)
			}
		}
	}

	function updateURL() {
		const urlParams = new URLSearchParams(window.location.search)

		// Update excluded items
		if (shopList.excluded.size > 0) {
			urlParams.set('excluded', Array.from(shopList.excluded).join(','))
		} else {
			urlParams.delete('excluded')
		}

		// Update price overrides
		if (shopList.priceOverrides.size > 0) {
			const priceStrings = Array.from(shopList.priceOverrides.entries()).map(([id, price]) => `${id}:${price}`)
			urlParams.set('prices', priceStrings.join(','))
		} else {
			urlParams.delete('prices')
		}

		// Update custom items
		if (shopList.customItems.size > 0) {
			const customData = Object.fromEntries(shopList.customItems)
			urlParams.set('custom', encodeURIComponent(JSON.stringify(customData)))
		} else {
			urlParams.delete('custom')
		}

		// Update URL without refreshing
		const newURL = `${window.location.pathname}?${urlParams.toString()}`
		window.history.replaceState({}, '', newURL)
	}

	// Extract item ID from various sources
	function getItemId(element) {
		// Try to find item ID from link href
		const link = element.querySelector('a[href*="/magicitems/magic-item?id="]')
		if (link) {
			const match = link.href.match(/id=(\d+)/)
			return match ? match[1] : null
		}

		// Try to find from data attributes or other sources
		const dataId = element.getAttribute('data-item-id')
		if (dataId) return dataId

		// Generate ID from item name as fallback
		const nameElement = element.querySelector('a')
		if (nameElement) {
			return nameElement.textContent
				.trim()
				.replace(/[^a-zA-Z0-9]/g, '_')
				.toLowerCase()
		}

		return null
	}

	// Create editable price element
	function makeEditablePrice(priceElement, itemId) {
		if (priceElement.hasAttribute('data-editable')) return

		priceElement.setAttribute('data-editable', 'true')
		priceElement.style.cursor = 'pointer'
		priceElement.style.borderBottom = '1px dashed #ccc'
		priceElement.title = 'Click to edit price'

		priceElement.addEventListener('click', function (e) {
			e.preventDefault()
			e.stopPropagation()

			const currentPrice = this.textContent.trim().replace(/Value:\s*/, '')
			const input = document.createElement('input')
			input.type = 'text'
			input.value = currentPrice
			input.style.cssText = `
				width: 100%;
				padding: 2px;
				border: 1px solid #007bff;
				border-radius: 3px;
				font-size: inherit;
				font-family: inherit;
			`

			const savePrice = () => {
				const newPrice = input.value.trim()
				if (newPrice === '' || newPrice === '0' || newPrice === '0 gp') {
					// Remove price override or mark as excluded
					shopList.priceOverrides.delete(itemId)
					this.textContent = 'Value: -'
					this.style.textDecoration = 'line-through'
					this.style.opacity = '0.6'
				} else {
					// Set new price
					shopList.priceOverrides.set(itemId, newPrice)
					this.textContent = `Value: ${newPrice}`
					this.style.textDecoration = 'none'
					this.style.opacity = '1'
				}

				this.style.display = 'block'
				input.remove()
				updateURL()
			}

			input.addEventListener('keydown', function (e) {
				if (e.key === 'Enter') {
					savePrice()
				} else if (e.key === 'Escape') {
					this.style.display = 'block'
					input.remove()
				}
			})

			input.addEventListener('blur', savePrice)

			this.style.display = 'none'
			this.parentNode.insertBefore(input, this.nextSibling)
			input.focus()
			input.select()
		})
	}

	// Add exclude button to items
	function addExcludeButton(row, itemId) {
		if (row.querySelector('.exclude-btn')) return

		const excludeBtn = document.createElement('button')
		excludeBtn.className = 'exclude-btn'
		excludeBtn.innerHTML = shopList.excluded.has(itemId) ? '✓' : '✗'
		excludeBtn.title = shopList.excluded.has(itemId) ? 'Include item' : 'Exclude item'
		excludeBtn.style.cssText = `
			background: ${shopList.excluded.has(itemId) ? '#28a745' : '#dc3545'};
			color: white;
			border: none;
			border-radius: 3px;
			padding: 2px 6px;
			cursor: pointer;
			font-size: 10px;
			margin-left: 5px;
			transition: all 0.2s;
		`

		excludeBtn.addEventListener('click', function (e) {
			e.preventDefault()
			e.stopPropagation()

			if (shopList.excluded.has(itemId)) {
				shopList.excluded.delete(itemId)
				this.innerHTML = '✗'
				this.title = 'Exclude item'
				this.style.background = '#dc3545'
				row.style.opacity = '1'
				row.style.filter = 'none'
			} else {
				shopList.excluded.add(itemId)
				this.innerHTML = '✓'
				this.title = 'Include item'
				this.style.background = '#28a745'
				row.style.opacity = '0.5'
				row.style.filter = 'grayscale(100%)'
			}

			updateURL()
		})

		// Add to first column
		const firstCol = row.querySelector('.flexcol')
		if (firstCol) {
			firstCol.appendChild(excludeBtn)
		}

		// Apply excluded styling if needed
		if (shopList.excluded.has(itemId)) {
			row.style.opacity = '0.5'
			row.style.filter = 'grayscale(100%)'
		}
	}

	// Add custom item functionality
	function addCustomItemButton() {
		if (document.querySelector('.add-custom-item-btn')) return

		const container = document.querySelector('.flexheadrow.row0')?.parentElement
		if (!container) return

		const buttonContainer = document.createElement('div')
		buttonContainer.style.cssText = `
			padding: 10px;
			text-align: center;
			border-top: 2px solid #007bff;
			background: #f8f9fa;
			margin-top: 10px;
		`

		const addBtn = document.createElement('button')
		addBtn.className = 'add-custom-item-btn'
		addBtn.innerHTML = '+ Add Custom Item'
		addBtn.style.cssText = `
			background: #007bff;
			color: white;
			border: none;
			border-radius: 5px;
			padding: 8px 16px;
			cursor: pointer;
			font-size: 14px;
			transition: all 0.2s;
		`

		addBtn.addEventListener('mouseover', function () {
			this.style.background = '#0056b3'
		})

		addBtn.addEventListener('mouseout', function () {
			this.style.background = '#007bff'
		})

		addBtn.addEventListener('click', function () {
			showCustomItemDialog()
		})

		buttonContainer.appendChild(addBtn)
		container.appendChild(buttonContainer)
	}

	// Custom item dialog
	function showCustomItemDialog() {
		const dialog = document.createElement('div')
		dialog.style.cssText = `
			position: fixed;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			background: white;
			border: 2px solid #007bff;
			border-radius: 8px;
			padding: 20px;
			box-shadow: 0 4px 20px rgba(0,0,0,0.3);
			z-index: 10000;
			max-width: 500px;
			width: 90%;
		`

		dialog.innerHTML = `
			<h3 style="margin-top: 0; color: #007bff;">Add Custom Item</h3>
			<div style="margin-bottom: 10px;">
				<label style="display: block; margin-bottom: 5px; font-weight: bold;">Item Name:</label>
				<input type="text" id="custom-name" style="width: 100%; padding: 5px; border: 1px solid #ddd; border-radius: 3px;">
			</div>
			<div style="margin-bottom: 10px;">
				<label style="display: block; margin-bottom: 5px; font-weight: bold;">Rarity:</label>
				<select id="custom-rarity" style="width: 100%; padding: 5px; border: 1px solid #ddd; border-radius: 3px;">
					<option value="C">Common</option>
					<option value="U">Uncommon</option>
					<option value="R">Rare</option>
					<option value="V">Very Rare</option>
					<option value="L">Legendary</option>
					<option value="A">Artifact</option>
				</select>
			</div>
			<div style="margin-bottom: 10px;">
				<label style="display: block; margin-bottom: 5px; font-weight: bold;">Price:</label>
				<input type="text" id="custom-price" placeholder="e.g., 1,000 gp" style="width: 100%; padding: 5px; border: 1px solid #ddd; border-radius: 3px;">
			</div>
			<div style="margin-bottom: 15px;">
				<label style="display: block; margin-bottom: 5px; font-weight: bold;">Description:</label>
				<textarea id="custom-description" rows="4" style="width: 100%; padding: 5px; border: 1px solid #ddd; border-radius: 3px; resize: vertical;"></textarea>
			</div>
			<div style="text-align: right;">
				<button id="custom-cancel" style="background: #6c757d; color: white; border: none; border-radius: 3px; padding: 8px 16px; margin-right: 10px; cursor: pointer;">Cancel</button>
				<button id="custom-save" style="background: #28a745; color: white; border: none; border-radius: 3px; padding: 8px 16px; cursor: pointer;">Add Item</button>
			</div>
		`

		document.body.appendChild(dialog)

		// Focus on name input
		document.getElementById('custom-name').focus()

		// Handle cancel
		document.getElementById('custom-cancel').addEventListener('click', function () {
			dialog.remove()
		})

		// Handle save
		document.getElementById('custom-save').addEventListener('click', function () {
			const name = document.getElementById('custom-name').value.trim()
			const rarity = document.getElementById('custom-rarity').value
			const price = document.getElementById('custom-price').value.trim()
			const description = document.getElementById('custom-description').value.trim()

			if (!name) {
				alert('Please enter an item name')
				return
			}

			const customId = 'custom_' + Date.now()
			const customItem = {
				name,
				rarity,
				price: price || '0 gp',
				description,
				id: customId,
			}

			shopList.customItems.set(customId, customItem)
			updateURL()
			addCustomItemToList(customItem)
			dialog.remove()
		})

		// Close on escape
		document.addEventListener('keydown', function escapeHandler(e) {
			if (e.key === 'Escape') {
				dialog.remove()
				document.removeEventListener('keydown', escapeHandler)
			}
		})
	}

	// Add custom item to the list
	function addCustomItemToList(item) {
		const container = document.querySelector('.flexheadrow.row0')?.parentElement
		if (!container) return

		const customRow = document.createElement('div')
		customRow.className = 'contentrow custom-item'
		customRow.style.cssText = `
			border: 2px solid #007bff;
			border-radius: 5px;
			margin: 5px 0;
			background: #f8f9fa;
		`

		customRow.innerHTML = `
			<div class="flexcol col1">
				<div class="custom-item-name" style="font-weight: bold; color: #007bff;">${item.name}</div>
				<button class="delete-custom-btn" style="background: #dc3545; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer; font-size: 10px; margin-top: 5px;">Delete</button>
			</div>
			<div class="flexcol col2 colRare">
				<div>Rarity: ${item.rarity}</div>
			</div>
			<div class="flexcol col3"></div>
			<div class="flexcol col4"></div>
			<div class="flexcol col5 colmod custom-price" style="cursor: pointer; border-bottom: 1px dashed #ccc;" title="Click to edit price">
				Value: ${item.price}
			</div>
		`

		// Add before the button container
		const buttonContainer = container.querySelector('.add-custom-item-btn')?.parentElement
		if (buttonContainer) {
			container.insertBefore(customRow, buttonContainer)
		} else {
			container.appendChild(customRow)
		}

		// Add delete functionality
		customRow.querySelector('.delete-custom-btn').addEventListener('click', function () {
			if (confirm('Delete this custom item?')) {
				shopList.customItems.delete(item.id)
				updateURL()
				customRow.remove()
			}
		})

		// Make price editable
		makeEditablePrice(customRow.querySelector('.custom-price'), item.id)

		// Add custom popup functionality
		const nameElement = customRow.querySelector('.custom-item-name')
		nameElement.addEventListener('mouseenter', function (e) {
			showCustomItemPopup(item, e.clientX, e.clientY)
		})

		nameElement.addEventListener('mouseleave', function () {
			hidePopup()
		})
	}

	// Show popup for custom items
	function showCustomItemPopup(item, x, y) {
		const popup = createPopup()
		const title = popup.querySelector('.popup-title')
		const content = popup.querySelector('.popup-content')

		title.textContent = item.name

		// Create custom content instead of iframe
		content.innerHTML = `
			<div style="padding: 20px; font-family: Arial, sans-serif;">
				<h1 style="color: #007bff; margin-bottom: 10px;">${item.name}</h1>
				<div style="margin-bottom: 10px;">
					<strong>Rarity:</strong> ${item.rarity}
				</div>
				<div style="margin-bottom: 10px;">
					<strong>Value:</strong> ${item.price}
				</div>
				<div style="margin-bottom: 10px;">
					<strong>Description:</strong>
				</div>
				<div style="background: #f8f9fa; padding: 10px; border-radius: 5px; border-left: 4px solid #007bff;">
					${item.description.replace(/\n/g, '<br>') || 'No description provided.'}
				</div>
			</div>
		`

		// Position popup
		const popupWidth = window.innerWidth * 0.5
		const popupHeight = window.innerHeight * 0.9

		popup.style.width = popupWidth + 'px'
		popup.style.height = popupHeight + 'px'
		popup.style.left = window.innerWidth * 0.5 + 'px'
		popup.style.top = (window.innerHeight - popupHeight) / 2 + 'px'

		popup.classList.add('visible')
	}

	// Apply shop list modifications to existing items
	function applyShopListModifications() {
		const rows = document.querySelectorAll('.contentrow')

		rows.forEach((row) => {
			const itemId = getItemId(row)
			if (!itemId) return

			// Add exclude button
			addExcludeButton(row, itemId)

			// Make price editable
			const priceElement = row.querySelector('.col5.flexcol.colmod')
			if (priceElement) {
				makeEditablePrice(priceElement, itemId)

				// Apply price override if exists
				if (shopList.priceOverrides.has(itemId)) {
					const newPrice = shopList.priceOverrides.get(itemId)
					priceElement.textContent = `Value: ${newPrice}`
				}
			}
		})

		// Add custom items
		shopList.customItems.forEach((item) => {
			addCustomItemToList(item)
		})
	}

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

		// Add CSS for sort buttons and new functionality
		if (!document.getElementById('shop-editor-styles')) {
			const style = document.createElement('style')
			style.id = 'shop-editor-styles'
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
				
				#magic-item-popup {
					position: fixed;
					background: white;
					border: 2px solid #007bff;
					border-radius: 8px;
					box-shadow: 0 4px 20px rgba(0,0,0,0.3);
					z-index: 9999;
					opacity: 0;
					transform: scale(0.9);
					transition: all 0.2s ease;
					pointer-events: none;
				}
				
				#magic-item-popup.visible {
					opacity: 1;
					transform: scale(1);
					pointer-events: auto;
				}
				
				#magic-item-popup .popup-header {
					background: #007bff;
					color: white;
					padding: 10px;
					border-radius: 6px 6px 0 0;
					display: flex;
					justify-content: space-between;
					align-items: center;
				}
				
				#magic-item-popup .popup-close {
					background: none;
					border: none;
					color: white;
					font-size: 18px;
					cursor: pointer;
					padding: 0;
					width: 24px;
					height: 24px;
					display: flex;
					align-items: center;
					justify-content: center;
				}
				
				#magic-item-popup .popup-content {
					height: calc(100% - 60px);
					overflow: hidden;
				}
				
				#magic-item-popup iframe {
					width: 100%;
					height: 100%;
					border: none;
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
		// Make sure we always work with the latest data encoded in the URL
		parseShopListFromURL()

		// Apply exclusions, price overrides, and render any custom items that were already present in the URL
		applyShopListModifications()

		// Ensure UI affordance for adding new custom items is present
		addCustomItemButton()

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
