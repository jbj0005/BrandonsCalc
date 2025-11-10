/**
 * Keyboard Shortcuts Registry
 *
 * Centralizes all keyboard interaction handlers in the application.
 */

import { Feature } from './types';

export const keyboardFeatures: Feature[] = [
  {
    id: 'keyboard-esc-modal',
    name: 'ESC to Close Modal',
    description: 'Closes modals when ESC key is pressed (configurable per modal).',
    category: 'keyboard',
    location: [
      { file: 'src/ui/components/Modal.tsx', lines: '46-54, 76', function: 'ESC handler useEffect' },
    ],
    dependencies: [],
    triggers: ['ESC key pressed while modal is open'],
    effects: ['Closes modal if closeOnEsc=true'],
    config: {},
  },

  {
    id: 'keyboard-esc-dropdown',
    name: 'ESC to Close Dropdown',
    description: 'Closes dropdown menus when ESC key is pressed.',
    category: 'keyboard',
    location: [
      { file: 'src/ui/components/Dropdown.tsx', lines: '63-72', function: 'ESC handler' },
      { file: 'src/ui/components/UserProfileDropdown.tsx', lines: '83-95', function: 'ESC handler' },
    ],
    dependencies: [],
    triggers: ['ESC key pressed while dropdown is open'],
    effects: ['Closes dropdown'],
    config: {},
  },

  {
    id: 'keyboard-slider-arrows',
    name: 'Arrow Keys for Slider',
    description: 'Arrow keys adjust slider value when hovering. Left/Down decrease, Right/Up increase.',
    category: 'keyboard',
    location: [
      { file: 'src/ui/components/EnhancedSlider.tsx', lines: '109-136', function: 'Keyboard handler' },
    ],
    dependencies: [],
    triggers: ['Arrow keys pressed while hovering over slider'],
    effects: ['Adjusts slider value by step amount', 'Updates tooltip position'],
    config: { delay: 0 },
    debugging: [
      {
        issue: 'Arrow keys not working',
        solution: 'Must hover over slider first. Check isHovering state.',
      },
    ],
  },

  {
    id: 'keyboard-enter-submit',
    name: 'Enter to Submit Forms',
    description: 'Submit forms when Enter key is pressed in input fields.',
    category: 'keyboard',
    location: [
      { file: 'src/ui/components/AuthModal.tsx', lines: 'Form onSubmit handlers' },
    ],
    dependencies: [],
    triggers: ['Enter key in form input'],
    effects: ['Submits form'],
    config: {},
  },

  {
    id: 'keyboard-tab-navigation',
    name: 'Tab Navigation in Modals',
    description: 'Tab and Shift+Tab navigate between focusable elements. Focus is trapped within modal.',
    category: 'keyboard',
    location: [
      { file: 'src/ui/components/Modal.tsx', lines: '95-131', function: 'Focus trap' },
    ],
    dependencies: [],
    triggers: ['Tab or Shift+Tab in modal'],
    effects: ['Moves focus to next/previous element', 'Wraps at boundaries'],
    config: {},
  },
];

export function getKeyboardFeature(id: string): Feature | undefined {
  return keyboardFeatures.find((f) => f.id === id);
}
