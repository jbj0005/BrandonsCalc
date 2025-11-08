// src/features/calculator/slider-manager.ts

import { useCalculatorStore } from '@/core/state';
import type { SliderConfig, SliderChangeEvent } from '@/types';

/**
 * Slider Manager
 * Handles centered sliders with visual feedback for value changes
 */
export class SliderManager {
  private sliders: Map<string, SliderConfig> = new Map();
  private tooltips: Map<string, HTMLElement> = new Map();
  private updateTimer: NodeJS.Timeout | null = null;
  
  /**
   * Initialize sliders with configuration
   */
  public initialize(configs: Array<{ id: string; originalValue: number }>): void {
    
    configs.forEach(config => {
      const element = document.getElementById(config.id) as HTMLInputElement;
      
      if (!element) {
        return;
      }
      
      // Calculate min/max based on original value
      const originalValue = config.originalValue || 0;
      const min = this.calculateMin(config.id, originalValue);
      const max = this.calculateMax(config.id, originalValue);
      
      // Create slider config
      const sliderConfig: SliderConfig = {
        id: config.id,
        element,
        originalValue,
        currentValue: originalValue,
        min,
        max
      };
      
      // Set up the slider
      this.setupSlider(sliderConfig);
      
      // Store configuration
      this.sliders.set(config.id, sliderConfig);
    });
  }
  
  /**
   * Calculate minimum value for slider
   */
  private calculateMin(sliderId: string, originalValue: number): number {
    switch (sliderId) {
      case 'quickSliderSalePrice':
        // Allow reducing sale price by up to 20%
        return originalValue * 0.8;
        
      case 'quickSliderCashDown':
        // Cash down can go to 0
        return 0;
        
      case 'quickSliderTradeAllowance':
        // Trade can be reduced by 50%
        return originalValue * 0.5;
        
      case 'quickSliderTradePayoff':
        // Payoff can be reduced by 30%
        return originalValue * 0.7;
        
      default:
        return originalValue * 0.5;
    }
  }
  
  /**
   * Calculate maximum value for slider
   */
  private calculateMax(sliderId: string, originalValue: number): number {
    switch (sliderId) {
      case 'quickSliderSalePrice':
        // Allow increasing sale price by up to 20%
        return originalValue * 1.2;
        
      case 'quickSliderCashDown':
        // Cash down can go up to 50% of sale price
        const salePrice = useCalculatorStore.getState().salePrice || originalValue * 2;
        return salePrice * 0.5;
        
      case 'quickSliderTradeAllowance':
        // Trade can be increased by 50%
        return originalValue * 1.5;
        
      case 'quickSliderTradePayoff':
        // Payoff can be increased by 30%
        return originalValue * 1.3;
        
      default:
        return originalValue * 1.5;
    }
  }
  
  /**
   * Setup individual slider
   */
  private setupSlider(config: SliderConfig): void {
    const { element, originalValue, min, max } = config;
    
    if (!element) return;
    
    // Set slider attributes
    element.type = 'range';
    element.min = String(min);
    element.max = String(max);
    element.value = String(originalValue);
    element.step = this.getSliderStep(config.id);
    
    // Add CSS classes
    element.classList.add('quick-slider');
    
    // Set CSS custom properties for visual feedback
    this.updateSliderVisuals(element, originalValue, min, max);
    
    // Create center indicator
    this.createCenterIndicator(element);
    
    // Create tooltip
    const tooltip = this.createTooltip(element);
    this.tooltips.set(config.id, tooltip);
    
    // Add event listeners
    element.addEventListener('input', (e) => this.handleSliderInput(config, e));
    element.addEventListener('change', (e) => this.handleSliderChange(config, e));
    element.addEventListener('mousemove', (e) => this.updateTooltipPosition(config, e));
    element.addEventListener('mouseenter', () => this.showTooltip(config));
    element.addEventListener('mouseleave', () => this.hideTooltip(config));
    element.addEventListener('touchstart', () => this.showTooltip(config));
    element.addEventListener('touchend', () => this.hideTooltip(config));
    
    // Add double-click to reset
    element.addEventListener('dblclick', () => this.resetSlider(config));
  }
  
  /**
   * Get slider step value
   */
  private getSliderStep(sliderId: string): string {
    switch (sliderId) {
      case 'quickSliderSalePrice':
        return '100';
      case 'quickSliderCashDown':
        return '100';
      case 'quickSliderTradeAllowance':
        return '100';
      case 'quickSliderTradePayoff':
        return '100';
      default:
        return '1';
    }
  }
  
  /**
   * Create center indicator
   */
  private createCenterIndicator(element: HTMLInputElement): void {
    // Remove existing indicator
    const existingIndicator = element.parentElement?.querySelector('.slider-center-indicator');
    if (existingIndicator) {
      existingIndicator.remove();
    }
    
    // Create new indicator
    const indicator = document.createElement('div');
    indicator.className = 'slider-center-indicator';
    indicator.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 2px;
      height: 20px;
      background: var(--primary-start, #3b82f6);
      pointer-events: none;
      z-index: 1;
      opacity: 0.7;
    `;
    
    // Ensure parent has relative positioning
    if (element.parentElement) {
      element.parentElement.style.position = 'relative';
      element.parentElement.appendChild(indicator);
    }
  }
  
  /**
   * Create tooltip element
   */
  private createTooltip(element: HTMLInputElement): HTMLElement {
    const tooltip = document.createElement('div');
    tooltip.className = 'slider-tooltip';
    tooltip.style.cssText = `
      position: absolute;
      bottom: calc(100% + 10px);
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
      z-index: 1000;
    `;
    
    // Add arrow
    const arrow = document.createElement('div');
    arrow.style.cssText = `
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 6px solid rgba(0, 0, 0, 0.9);
    `;
    tooltip.appendChild(arrow);
    
    // Add to parent
    if (element.parentElement) {
      element.parentElement.appendChild(tooltip);
    }
    
    return tooltip;
  }
  
  /**
   * Update slider visual feedback
   */
  private updateSliderVisuals(
    element: HTMLInputElement,
    currentValue: number,
    min: number,
    max: number
  ): void {
    const originalValue = this.sliders.get(element.id)?.originalValue || currentValue;
    const range = max - min;
    const centerPosition = ((originalValue - min) / range) * 100;
    const currentPosition = ((currentValue - min) / range) * 100;
    
    // Calculate fill positions
    let fillStart: number, fillEnd: number;
    
    if (currentValue < originalValue) {
      fillStart = currentPosition;
      fillEnd = centerPosition;
    } else if (currentValue > originalValue) {
      fillStart = centerPosition;
      fillEnd = currentPosition;
    } else {
      fillStart = centerPosition;
      fillEnd = centerPosition;
    }
    
    // Set CSS variables
    element.style.setProperty('--fill-start', `${fillStart}%`);
    element.style.setProperty('--fill-end', `${fillEnd}%`);
    element.style.setProperty('--center-position', `${centerPosition}%`);
    
    // Set color based on direction
    if (currentValue < originalValue) {
      element.style.setProperty('--primary-start', '#10b981'); // Green for savings
      element.style.setProperty('--primary-end', '#059669');
    } else if (currentValue > originalValue) {
      element.style.setProperty('--primary-start', '#ef4444'); // Red for increases
      element.style.setProperty('--primary-end', '#dc2626');
    } else {
      element.style.setProperty('--primary-start', '#3b82f6'); // Blue for neutral
      element.style.setProperty('--primary-end', '#2563eb');
    }
  }
  
  /**
   * Handle slider input (while dragging)
   */
  private handleSliderInput(config: SliderConfig, event: Event): void {
    const element = event.target as HTMLInputElement;
    const value = parseFloat(element.value);
    
    // Update config
    config.currentValue = value;
    
    // Update visuals
    this.updateSliderVisuals(element, value, config.min, config.max);
    
    // Update tooltip
    this.updateTooltip(config);
    
    // Throttle updates
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    
    this.updateTimer = setTimeout(() => {
      this.dispatchSliderEvent(config);
    }, 100);
  }
  
  /**
   * Handle slider change (on release)
   */
  private handleSliderChange(config: SliderConfig, event: Event): void {
    const element = event.target as HTMLInputElement;
    const value = parseFloat(element.value);
    
    // Update config
    config.currentValue = value;
    
    // Clear any pending updates
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    
    // Dispatch event immediately
    this.dispatchSliderEvent(config);
    
    // Update store
    this.updateStore(config);
    
    // Show feedback
    this.showValueFeedback(config);
  }
  
  /**
   * Dispatch slider change event
   */
  private dispatchSliderEvent(config: SliderConfig): void {
    const delta = config.currentValue - config.originalValue;
    const percentage = (delta / config.originalValue) * 100;
    
    const event: SliderChangeEvent = {
      id: config.id,
      value: config.currentValue,
      delta,
      percentage
    };
    
    window.dispatchEvent(new CustomEvent('slider-changed', { detail: event }));
  }
  
  /**
   * Update calculator store
   */
  private updateStore(config: SliderConfig): void {
    const store = useCalculatorStore.getState();
    
    switch (config.id) {
      case 'quickSliderSalePrice':
        store.setSalePrice(config.currentValue);
        break;
        
      case 'quickSliderCashDown':
        store.setCashDown(config.currentValue);
        break;
        
      case 'quickSliderTradeAllowance':
        store.setTradeValue(config.currentValue);
        break;
        
      case 'quickSliderTradePayoff':
        store.setTradePayoff(config.currentValue);
        break;
    }
  }
  
  /**
   * Show value feedback animation
   */
  private showValueFeedback(config: SliderConfig): void {
    const element = config.element;
    if (!element) return;
    
    // Create feedback element
    const feedback = document.createElement('div');
    feedback.className = 'slider-feedback';
    
    const delta = config.currentValue - config.originalValue;
    const isIncrease = delta > 0;
    const isDecrease = delta < 0;
    
    feedback.textContent = isIncrease ? `+$${Math.abs(delta).toFixed(0)}` :
                          isDecrease ? `-$${Math.abs(delta).toFixed(0)}` :
                          'Original';
    
    feedback.style.cssText = `
      position: absolute;
      top: -30px;
      left: 50%;
      transform: translateX(-50%);
      background: ${isIncrease ? '#ef4444' : isDecrease ? '#10b981' : '#3b82f6'};
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      opacity: 1;
      transition: all 0.3s;
      pointer-events: none;
      z-index: 1001;
    `;
    
    if (element.parentElement) {
      element.parentElement.appendChild(feedback);
      
      // Animate out
      setTimeout(() => {
        feedback.style.opacity = '0';
        feedback.style.transform = 'translateX(-50%) translateY(-10px)';
        
        setTimeout(() => {
          feedback.remove();
        }, 300);
      }, 1000);
    }
  }
  
  /**
   * Update tooltip content
   */
  private updateTooltip(config: SliderConfig): void {
    const tooltip = this.tooltips.get(config.id);
    if (!tooltip) return;
    
    const delta = config.currentValue - config.originalValue;
    const percentage = (delta / config.originalValue) * 100;
    
    let text = '';
    
    switch (config.id) {
      case 'quickSliderSalePrice':
        text = `Sale Price: $${config.currentValue.toFixed(0)}`;
        break;
        
      case 'quickSliderCashDown':
        text = `Down Payment: $${config.currentValue.toFixed(0)}`;
        break;
        
      case 'quickSliderTradeAllowance':
        text = `Trade Value: $${config.currentValue.toFixed(0)}`;
        break;
        
      case 'quickSliderTradePayoff':
        text = `Trade Payoff: $${config.currentValue.toFixed(0)}`;
        break;
    }
    
    if (delta !== 0) {
      const sign = delta > 0 ? '+' : '';
      text += ` (${sign}${percentage.toFixed(1)}%)`;
    }
    
    // Update only the text content, not the arrow
    const textNode = tooltip.firstChild;
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      textNode.textContent = text;
    } else {
      tooltip.insertBefore(document.createTextNode(text), tooltip.firstChild);
    }
  }
  
  /**
   * Update tooltip position
   */
  private updateTooltipPosition(config: SliderConfig, event: MouseEvent): void {
    const tooltip = this.tooltips.get(config.id);
    const element = config.element;
    
    if (!tooltip || !element) return;
    
    const rect = element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    
    tooltip.style.left = `${percentage}%`;
  }
  
  /**
   * Show tooltip
   */
  private showTooltip(config: SliderConfig): void {
    const tooltip = this.tooltips.get(config.id);
    if (tooltip) {
      this.updateTooltip(config);
      tooltip.style.opacity = '1';
    }
  }
  
  /**
   * Hide tooltip
   */
  private hideTooltip(config: SliderConfig): void {
    const tooltip = this.tooltips.get(config.id);
    if (tooltip) {
      tooltip.style.opacity = '0';
    }
  }
  
  /**
   * Reset slider to original value
   */
  public resetSlider(config: SliderConfig): void {
    if (!config.element) return;
    
    config.currentValue = config.originalValue;
    config.element.value = String(config.originalValue);
    
    this.updateSliderVisuals(
      config.element,
      config.originalValue,
      config.min,
      config.max
    );
    
    this.dispatchSliderEvent(config);
    this.updateStore(config);
    
    // Show reset feedback
    const feedback = document.createElement('div');
    feedback.textContent = 'Reset';
    feedback.style.cssText = `
      position: absolute;
      top: -30px;
      left: 50%;
      transform: translateX(-50%);
      background: #3b82f6;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      opacity: 1;
      transition: all 0.3s;
      pointer-events: none;
    `;
    
    if (config.element.parentElement) {
      config.element.parentElement.appendChild(feedback);
      
      setTimeout(() => {
        feedback.style.opacity = '0';
        setTimeout(() => feedback.remove(), 300);
      }, 800);
    }
  }
  
  /**
   * Reset all sliders
   */
  public resetAll(): void {
    this.sliders.forEach(config => this.resetSlider(config));
  }
  
  /**
   * Update slider value programmatically
   */
  public updateSliderValue(sliderId: string, value: number): void {
    const config = this.sliders.get(sliderId);
    
    if (config && config.element) {
      config.currentValue = value;
      config.element.value = String(value);
      
      this.updateSliderVisuals(
        config.element,
        value,
        config.min,
        config.max
      );
      
      this.dispatchSliderEvent(config);
      this.updateStore(config);
    }
  }
  
  /**
   * Destroy all sliders
   */
  public destroy(): void {
    // Remove all tooltips
    this.tooltips.forEach(tooltip => tooltip.remove());
    this.tooltips.clear();
    
    // Remove all center indicators
    document.querySelectorAll('.slider-center-indicator').forEach(el => el.remove());
    
    // Clear sliders
    this.sliders.clear();
    
    // Clear timer
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
  }
}

// Export singleton instance
export const sliderManager = new SliderManager();
