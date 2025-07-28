/*
Pinch gesture detector for Safari Web Extension
Detects pinch inward gestures and shows the toolbar popup
*/

// Polyfill for browser API
if (typeof browser === "undefined") {
    var browser = chrome;
}

// Centralized logging for pinch detector
const PinchLogger = {
    enabled: true,
    log: function(message, ...args) {
        if (this.enabled) console.log('[TL;Pinch Detector]', message, ...args);
    },
    error: function(message, ...args) {
        console.error('[TL;Pinch Detector]', message, ...args);
    }
};

class PinchDetector {
    constructor() {
        PinchLogger.log("PinchDetector initialized");
        this.initialDistance = 0;
        this.currentDistance = 0;
        this.isPinching = false;
        this.pinchThreshold = 0.7; // Threshold for detecting pinch inward (70% of initial distance)
        this.defaultZoom = 1;
        this.init();
    }
    
    getPageZoom() {
        // Most browsers support window.visualViewport.scale, fallback to 1 if not available
        return (window.visualViewport && window.visualViewport.scale) ? window.visualViewport.scale : 1;
    }
    
    init() {
        // Add touch event listeners
        document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
    }
    
    calculateDistance(touch1, touch2) {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    getSelectedText() {
        const selection = window.getSelection();
        if (selection && selection.toString().trim()) {
            return selection.toString().trim();
        }
        return null;
    }
    
    handleTouchStart(event) {
        if (event.touches.length === 2 && this.getPageZoom() === this.defaultZoom) {
            this.isPinching = true;
            this.initialDistance = this.calculateDistance(event.touches[0], event.touches[1]);
            this.currentDistance = this.initialDistance;
        }
    }
    
    handleTouchMove(event) {
        if (this.isPinching && event.touches.length === 2) {
            this.currentDistance = this.calculateDistance(event.touches[0], event.touches[1]);
        }
    }
    
    handleTouchEnd(event) {
        if (this.isPinching) {
            // Check if this was a pinch inward gesture
            const pinchRatio = this.currentDistance / this.initialDistance;
            if (pinchRatio < this.pinchThreshold) {
                // Pinch inward detected - block default and show toolbar popup
                event.preventDefault && event.preventDefault();
                this.showToolbarPopup();
            }
            // Otherwise, allow pinch-out (zoom out) to proceed normally
            this.isPinching = false;
            this.initialDistance = 0;
            this.currentDistance = 0;
        }
    }
    
    showToolbarPopup() {
        // Get selected text if any
        const selectedText = this.getSelectedText();
        PinchLogger.log("Pinch detected!", {
            url: window.location.href,
            title: document.title,
            hasSelectedText: !!selectedText
        });
        
        // Send message to background script to show the actual toolbar popup
        try {
            browser.runtime.sendMessage({ 
                type: "show_toolbar_popup",
                url: window.location.href,
                title: document.title,
                selectedText: selectedText
            });
        } catch (e) {
            PinchLogger.error("Failed to send show_toolbar_popup message:", e);
        }
    }
}

// Initialize the pinch detector when the content script loads
PinchLogger.log('Initializing PinchDetector...');

// Wait for document to be ready if needed
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        PinchLogger.log('DOM Content Loaded - creating PinchDetector');
        new PinchDetector();
    });
} else {
    PinchLogger.log('Document already ready - creating PinchDetector');
    new PinchDetector();
} 