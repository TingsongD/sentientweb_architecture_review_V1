/**
 * Sentient Commerce - Mouse Tracker
 * Tracks mouse position and detects elements user is hovering over
 * Provides context about user interest for AI conversations
 */

(function () {
  'use strict';

  /**
   * MouseTracker Class
   * Tracks mouse hover events on relevant elements
   */
  class MouseTracker {
    constructor() {
      this.hoverHistory = [];
      this.maxHistory = 10;
      this.lastHoveredElement = null;
      this.throttleDelay = 200; // ms
      this.lastThrottleTime = 0;
      this.isInitialized = false;
      
      // Selectors for elements we care about
      this.relevantSelectors = {
        price: [
          '.price',
          '[data-price]',
          '.product-price',
          '.price__container',
          '.price-item',
          '.money',
          '[class*="price"]'
        ],
        product: [
          '[data-product-id]',
          '[data-product]',
          '.product-card',
          '.product-item',
          'a[href*="/products/"]',
          '.product__title',
          '.product-title'
        ],
        variant: [
          '[data-option]',
          '.variant-selector',
          '.option-selector',
          '[name*="option"]',
          '.swatch',
          '.product-form__input',
          '[class*="variant"]',
          '[class*="size"]',
          '[class*="color"]'
        ],
        addToCart: [
          'button[type="submit"][name="add"]',
          '[data-add-to-cart]',
          '.add-to-cart',
          '.product-form__submit',
          'form[action*="/cart/add"] button',
          '[class*="add-to-cart"]',
          '.btn-add-to-cart'
        ],
        image: [
          '.product-media img',
          '[data-product-image]',
          '.product__media img',
          '.product-single__photo',
          '.product-featured-media',
          '[class*="product-image"]'
        ],
        review: [
          '.review',
          '[data-review]',
          '.spr-review',
          '.jdgm-rev',
          '.yotpo-review',
          '[class*="review"]',
          '.star-rating',
          '.rating'
        ],
        quantity: [
          '[name="quantity"]',
          '.quantity-selector',
          '.quantity-input',
          '[data-quantity]',
          '[class*="quantity"]'
        ],
        description: [
          '.product__description',
          '.product-description',
          '[data-product-description]',
          '.product-single__description'
        ]
      };

      console.log('[Sentient Mouse Tracker] Initialized');
    }

    /**
     * Start tracking mouse movements
     */
    init() {
      if (this.isInitialized) return;
      
      document.addEventListener('mousemove', this.handleMouseMove.bind(this), { passive: true });
      this.isInitialized = true;
      console.log('[Sentient Mouse Tracker] Mouse tracking started');
    }

    /**
     * Stop tracking (cleanup)
     */
    destroy() {
      document.removeEventListener('mousemove', this.handleMouseMove.bind(this));
      this.isInitialized = false;
    }

    /**
     * Handle mouse move event (throttled)
     */
    handleMouseMove(event) {
      const now = Date.now();
      
      // Throttle to reduce performance impact
      if (now - this.lastThrottleTime < this.throttleDelay) {
        return;
      }
      this.lastThrottleTime = now;

      // Get element under cursor
      const element = document.elementFromPoint(event.clientX, event.clientY);
      if (!element) return;

      // Skip if same element as before
      if (element === this.lastHoveredElement) return;
      this.lastHoveredElement = element;

      // Check if element matches any relevant selectors
      const context = this.extractContext(element);
      if (context) {
        this.addToHistory(context);
      }
    }

    /**
     * Extract context from element based on what type it is
     */
    extractContext(element) {
      // Check each category of selectors
      for (const [type, selectors] of Object.entries(this.relevantSelectors)) {
        for (const selector of selectors) {
          // Check if element matches selector or has an ancestor that matches
          const matchedElement = element.matches(selector) 
            ? element 
            : element.closest(selector);
          
          if (matchedElement) {
            return this.buildContext(type, matchedElement);
          }
        }
      }
      return null;
    }

    /**
     * Build context object based on element type
     */
    buildContext(type, element) {
      const context = {
        type,
        timestamp: Date.now(),
        element: element.tagName.toLowerCase(),
      };

      switch (type) {
        case 'price':
          context.value = this.extractPrice(element);
          context.description = `Price: ${context.value}`;
          break;

        case 'product':
          context.productId = this.extractProductId(element);
          context.productTitle = this.extractProductTitle(element);
          context.description = `Product: ${context.productTitle || context.productId || 'Unknown'}`;
          break;

        case 'variant':
          context.optionName = this.extractOptionName(element);
          context.optionValue = this.extractOptionValue(element);
          context.description = `${context.optionName || 'Option'}: ${context.optionValue || 'checking options'}`;
          break;

        case 'addToCart':
          context.description = 'Add to Cart button';
          break;

        case 'image':
          context.altText = element.alt || element.getAttribute('data-alt') || '';
          context.description = `Product image${context.altText ? `: ${context.altText}` : ''}`;
          break;

        case 'review':
          context.rating = this.extractRating(element);
          context.description = context.rating 
            ? `Reviews (${context.rating} stars)` 
            : 'Customer reviews section';
          break;

        case 'quantity':
          context.currentValue = element.value || '1';
          context.description = `Quantity selector (${context.currentValue})`;
          break;

        case 'description':
          context.description = 'Product description';
          break;

        default:
          context.description = `${type} element`;
      }

      // Truncate all string fields to match validation schema limits
      if (context.element && context.element.length > 200) {
        context.element = context.element.substring(0, 197) + '...';
      }
      if (context.description && context.description.length > 500) {
        context.description = context.description.substring(0, 497) + '...';
      }
      if (context.value && context.value.length > 300) {
        context.value = context.value.substring(0, 297) + '...';
      }
      if (context.productId && context.productId.length > 300) {
        context.productId = context.productId.substring(0, 297) + '...';
      }
      if (context.productTitle && context.productTitle.length > 300) {
        context.productTitle = context.productTitle.substring(0, 297) + '...';
      }
      if (context.optionName && context.optionName.length > 200) {
        context.optionName = context.optionName.substring(0, 197) + '...';
      }
      if (context.optionValue && context.optionValue.length > 200) {
        context.optionValue = context.optionValue.substring(0, 197) + '...';
      }

      return context;
    }

    /**
     * Extract price from element
     */
    extractPrice(element) {
      // Get text content and clean it
      let text = element.textContent || '';
      
      // Try to find price pattern
      const priceMatch = text.match(/[\$\£\€]?\s*[\d,]+\.?\d*/);
      if (priceMatch) {
        return priceMatch[0].trim();
      }
      
      // Check data attributes
      if (element.dataset.price) {
        return element.dataset.price;
      }
      
      return text.trim().substring(0, 20);
    }

    /**
     * Extract product ID from element
     */
    extractProductId(element) {
      // Check data attributes
      if (element.dataset.productId) return element.dataset.productId;
      if (element.dataset.product) return element.dataset.product;
      
      // Check href for product slug
      const href = element.href || element.closest('a')?.href || '';
      const productMatch = href.match(/\/products\/([^/?]+)/);
      if (productMatch) {
        return productMatch[1];
      }
      
      return null;
    }

    /**
     * Extract product title from element
     */
    extractProductTitle(element) {
      // Check for title in various places
      const titleElement = element.querySelector('.product__title, .product-title, h1, h2, h3');
      if (titleElement) {
        return titleElement.textContent.trim().substring(0, 50);
      }
      
      // Check alt text on images
      const img = element.querySelector('img');
      if (img?.alt) {
        return img.alt.substring(0, 50);
      }
      
      // Check link title
      const link = element.closest('a');
      if (link?.title) {
        return link.title.substring(0, 50);
      }
      
      return null;
    }

    /**
     * Extract option name (e.g., "Size", "Color")
     */
    extractOptionName(element) {
      // Check label
      const label = element.closest('label') || element.previousElementSibling;
      if (label?.textContent) {
        return label.textContent.replace(/[:\*]/g, '').trim();
      }
      
      // Check name attribute
      if (element.name) {
        return element.name.replace(/option\d?/i, '').replace(/[_-]/g, ' ').trim() || 'Option';
      }
      
      // Check data attributes
      if (element.dataset.optionName) return element.dataset.optionName;
      if (element.dataset.option) return element.dataset.option;
      
      return null;
    }

    /**
     * Extract option value (e.g., "Large", "Blue")
     */
    extractOptionValue(element) {
      // Check value attribute
      if (element.value) return element.value;
      
      // Check selected option
      if (element.tagName === 'SELECT' && element.selectedOptions[0]) {
        return element.selectedOptions[0].textContent.trim();
      }
      
      // Check text content
      const text = element.textContent?.trim();
      if (text && text.length < 30) {
        return text;
      }
      
      // Check data attributes
      if (element.dataset.value) return element.dataset.value;
      if (element.dataset.optionValue) return element.dataset.optionValue;
      
      return null;
    }

    /**
     * Extract rating from review element
     */
    extractRating(element) {
      // Check data attributes
      if (element.dataset.rating) return element.dataset.rating;
      
      // Check aria-label
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) {
        const ratingMatch = ariaLabel.match(/(\d+\.?\d*)\s*(out of|\/)\s*5/i);
        if (ratingMatch) return ratingMatch[1];
      }
      
      // Count filled stars
      const filledStars = element.querySelectorAll('.star-filled, .spr-icon-star, [class*="star-full"]');
      if (filledStars.length > 0) {
        return filledStars.length.toString();
      }
      
      return null;
    }

    /**
     * Add context to history
     */
    addToHistory(context) {
      // Avoid duplicate consecutive entries of same type
      const lastEntry = this.hoverHistory[this.hoverHistory.length - 1];
      if (lastEntry && lastEntry.type === context.type && lastEntry.description === context.description) {
        return;
      }

      this.hoverHistory.push(context);
      
      // Keep only last N entries
      if (this.hoverHistory.length > this.maxHistory) {
        this.hoverHistory.shift();
      }

      console.log('[Sentient Mouse Tracker] Hover recorded:', context.description);
    }

    /**
     * Get recent hover history for AI context
     */
    getRecentHovers() {
      return [...this.hoverHistory];
    }

    /**
     * Get hover summary as readable text
     */
    getHoverSummary() {
      if (this.hoverHistory.length === 0) {
        return null;
      }

      // Group by type and create summary
      const types = {};
      this.hoverHistory.forEach(entry => {
        if (!types[entry.type]) {
          types[entry.type] = [];
        }
        types[entry.type].push(entry.description);
      });

      const summaries = [];
      for (const [type, descriptions] of Object.entries(types)) {
        // Get unique descriptions
        const unique = [...new Set(descriptions)];
        summaries.push(...unique);
      }

      return summaries.join(', ');
    }

    /**
     * Clear history
     */
    clearHistory() {
      this.hoverHistory = [];
    }

    /**
     * Check if user showed interest in a specific type
     */
    hasInterestIn(type) {
      return this.hoverHistory.some(entry => entry.type === type);
    }

    /**
     * Get time since last interaction
     */
    getTimeSinceLastHover() {
      if (this.hoverHistory.length === 0) return null;
      return Date.now() - this.hoverHistory[this.hoverHistory.length - 1].timestamp;
    }
  }

  // Create and expose global instance
  window.SentientMouseTracker = new MouseTracker();
  
  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.SentientMouseTracker.init();
    });
  } else {
    window.SentientMouseTracker.init();
  }

})();

